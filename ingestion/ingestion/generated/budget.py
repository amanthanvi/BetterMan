"""Budget governor: keep generation inside OpenCode Go's usage windows.

Go limits DeepSeek V4.1 Flash to $16 per 5 hours, $40 per week and $80 per
month. The governor checks rolling windows, which is conservative for any
alignment Go uses. It also limits requests per minute and avoids Go's
weekday peak hours, when tokens cost twice as much. Every request is written
to a checkpoint file, so a monthly pass can stop at a cap and resume in a
later run.
"""

from __future__ import annotations

import json
import math
import os
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

HOUR = 3600.0
DAY = 24 * HOUR
# (name, seconds, Go cap in USD) for DeepSeek V4.1 Flash on the Go plan.
GO_WINDOWS: tuple[tuple[str, float, float], ...] = (
    ("5h", 5 * HOUR, 16.0),
    ("7d", 7 * DAY, 40.0),
    ("30d", 30 * DAY, 80.0),
)
# Go prices per 1M tokens: input, output, cached input. Peak is 2x.
OFF_PEAK_PRICES = (0.15, 0.60, 0.003)
PEAK_MULTIPLIER = 2.0
# 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday.
PEAK_HOURS = ((1, 4), (6, 10))
CHECKPOINT_VERSION = 1
# Bounds applied to a loaded checkpoint.
MAX_LEDGER_ENTRIES = 500_000
MAX_ENTRY_USD = 1.0
MAX_PAUSE_SECONDS = 7 * DAY


def is_peak(moment: datetime) -> bool:
    moment = moment.astimezone(UTC)
    return moment.weekday() < 5 and any(start <= moment.hour < end for start, end in PEAK_HOURS)


def next_off_peak(moment: datetime) -> datetime:
    probe = moment.astimezone(UTC)
    while is_peak(probe):
        probe = (probe + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    return probe


def token_cost(
    prompt_tokens: int, completion_tokens: int, cached_tokens: int = 0, *, peak: bool = False
) -> float:
    price_in, price_out, price_cached = OFF_PEAK_PRICES
    uncached = max(0, prompt_tokens - cached_tokens)
    cost = (
        uncached * price_in + cached_tokens * price_cached + completion_tokens * price_out
    ) / 1e6
    return cost * (PEAK_MULTIPLIER if peak else 1.0)


@dataclass(frozen=True)
class BudgetConfig:
    # Share of each Go cap this job may use; the rest is left for other work.
    fraction: float = 0.5
    requests_per_minute: int = 20
    off_peak_only: bool = True
    # Waits up to this long in-process; longer waits pause the run.
    max_wait_seconds: float = 900.0
    # Hard ceiling for one run, independent of the windows.
    run_cap_usd: float | None = None
    windows: tuple[tuple[str, float, float], ...] = GO_WINDOWS

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> BudgetConfig:
        env = os.environ if env is None else env

        def number(name: str, default: float) -> float:
            raw = env.get(name)
            return float(raw) if raw not in (None, "") else default

        fraction = number("BETTERMAN_GEN_BUDGET_FRACTION", 0.5)
        if not 0 < fraction <= 1:
            raise ValueError("BETTERMAN_GEN_BUDGET_FRACTION must be in (0, 1]")
        run_cap = env.get("BETTERMAN_GEN_RUN_CAP_USD")
        return cls(
            fraction=fraction,
            requests_per_minute=max(1, int(number("BETTERMAN_GEN_RPM", 20))),
            off_peak_only=env.get("BETTERMAN_GEN_ALLOW_PEAK") != "1",
            max_wait_seconds=number("BETTERMAN_GEN_MAX_WAIT_SECONDS", 900),
            run_cap_usd=float(run_cap) if run_cap else None,
        )


class BudgetPaused(RuntimeError):
    def __init__(self, reason: str, resume_at: float) -> None:
        if resume_at == float("inf"):
            when = "the next run"
        else:
            when = datetime.fromtimestamp(resume_at, UTC).isoformat(timespec="seconds")
        super().__init__(f"generation paused: {reason}; resume after {when}")
        self.reason = reason
        self.resume_at = resume_at


@dataclass
class Checkpoint:
    """Ledger of spend plus run counters. Written atomically after every request."""

    path: Path | None
    ledger: list[list[float]] = field(default_factory=list)  # [timestamp, usd]
    paused_until: float = 0.0
    totals: dict[str, float] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path | None, *, now: float | None = None) -> Checkpoint:
        if path is None or not path.exists():
            return cls(path=path)
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") != CHECKPOINT_VERSION:
            raise ValueError(f"unsupported checkpoint version in {path}")
        # The file crosses workflow runs; keep only plausible values.
        now = time.time() if now is None else now
        ledger = []
        for entry in data.get("ledger", [])[:MAX_LEDGER_ENTRIES]:
            ts, usd = float(entry[0]), float(entry[1])
            if math.isfinite(ts) and math.isfinite(usd) and 0 <= usd <= MAX_ENTRY_USD:
                ledger.append([min(ts, now), usd])
        paused = float(data.get("pausedUntil", 0))
        paused = min(paused, now + MAX_PAUSE_SECONDS) if math.isfinite(paused) else 0.0
        return cls(
            path=path,
            ledger=ledger,
            paused_until=max(0.0, paused),
            totals={k: float(v) for k, v in data.get("totals", {}).items() if isinstance(k, str)},
        )

    def save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(
                {
                    "version": CHECKPOINT_VERSION,
                    "ledger": self.ledger,
                    "pausedUntil": self.paused_until,
                    "totals": self.totals,
                },
                indent=1,
            ),
            encoding="utf-8",
        )
        tmp.replace(self.path)

    def add(self, key: str, amount: float = 1) -> None:
        self.totals[key] = self.totals.get(key, 0) + amount


class BudgetGovernor:
    def __init__(
        self,
        config: BudgetConfig,
        checkpoint: Checkpoint,
        *,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.config = config
        self.checkpoint = checkpoint
        self._clock = clock
        self._sleep = sleep
        self._requests: list[float] = []
        self.run_spend = 0.0
        # Estimates of requests in flight, so concurrent workers cannot
        # together overshoot a window. One lock serializes the bookkeeping.
        self._reserved = 0.0
        self._lock = threading.RLock()

    def _spent(self, now: float, seconds: float) -> list[list[float]]:
        return [entry for entry in self.checkpoint.ledger if entry[0] > now - seconds]

    def check(self, estimate_usd: float) -> tuple[str, float] | None:
        """None to proceed, or (reason, resume timestamp)."""
        now = self._clock()
        if self.checkpoint.paused_until > now:
            return "provider usage limit", self.checkpoint.paused_until
        pending = estimate_usd + self._reserved
        cap = self.config.run_cap_usd
        if cap is not None and self.run_spend + pending > cap:
            return "run cap reached", float("inf")
        if self.config.off_peak_only:
            moment = datetime.fromtimestamp(now, UTC)
            if is_peak(moment):
                return "peak hours", next_off_peak(moment).timestamp()
        for name, seconds, go_cap in self.config.windows:
            limit = go_cap * self.config.fraction
            if estimate_usd > limit:
                return f"{name} window is smaller than one request", float("inf")
            entries = sorted(self._spent(now, seconds))
            total = sum(usd for _, usd in entries)
            if total + pending <= limit:
                continue
            # Resume when enough of the oldest spend leaves the window.
            for ts, usd in entries:
                total -= usd
                if total + pending <= limit:
                    return f"{name} budget", ts + seconds
            # Only requests still in flight are in the way; they finish soon.
            return f"{name} budget", now + 1.0
        recent = [ts for ts in self._requests if ts > now - 60]
        self._requests = recent
        if len(recent) >= self.config.requests_per_minute:
            return "requests per minute", recent[0] + 60
        return None

    def acquire(self, estimate_usd: float) -> None:
        """Block until a request of this cost fits, or raise BudgetPaused.

        The estimate stays reserved until `record` releases it. The lock is
        not held while sleeping, so other workers can record meanwhile.
        """
        while True:
            with self._lock:
                blocked = self.check(estimate_usd)
                if blocked is None:
                    self._requests.append(self._clock())
                    self._reserved += estimate_usd
                    return
                reason, resume_at = blocked
                wait = resume_at - self._clock()
                if wait > self.config.max_wait_seconds:
                    self.checkpoint.save()
                    raise BudgetPaused(reason, resume_at)
            self._sleep(max(wait, 0.01))

    def record(self, usd: float, *, reserved: float = 0.0) -> None:
        with self._lock:
            now = self._clock()
            self._reserved = max(0.0, self._reserved - reserved)
            self.run_spend += usd
            horizon = max(seconds for _, seconds, _ in self.config.windows)
            self.checkpoint.ledger = [e for e in self.checkpoint.ledger if e[0] > now - horizon]
            self.checkpoint.ledger.append([now, usd])
            self.checkpoint.add("usd", usd)
            self.checkpoint.add("requests")
            self.checkpoint.save()

    def provider_limit(self, *, cooldown_seconds: float = HOUR) -> BudgetPaused:
        """The provider refused for quota. Stop and resume after a cooldown."""
        with self._lock:
            resume_at = max(self.checkpoint.paused_until, self._clock() + cooldown_seconds)
            self.checkpoint.paused_until = resume_at
            self.checkpoint.save()
            return BudgetPaused("provider usage limit", resume_at)

    def cost(self, prompt_tokens: int, completion_tokens: int, cached_tokens: int = 0) -> float:
        peak = is_peak(datetime.fromtimestamp(self._clock(), UTC))
        return token_cost(prompt_tokens, completion_tokens, cached_tokens, peak=peak)
