from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from ingestion.generated.budget import (
    HOUR,
    BudgetConfig,
    BudgetGovernor,
    BudgetPaused,
    Checkpoint,
    is_peak,
    next_off_peak,
    token_cost,
)

# A Saturday, so peak hours never apply unless a test moves the clock.
SATURDAY = datetime(2026, 10, 31, 12, tzinfo=UTC).timestamp()


class Clock:
    def __init__(self, now: float = SATURDAY) -> None:
        self.now = now
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def governor(tmp_path: Path | None = None, clock: Clock | None = None, **config) -> BudgetGovernor:
    clock = clock or Clock()
    checkpoint = Checkpoint.load(tmp_path / "checkpoint.json" if tmp_path else None)
    return BudgetGovernor(BudgetConfig(**config), checkpoint, clock=clock, sleep=clock.sleep)


def test_token_cost_uses_go_prices_and_doubles_at_peak():
    assert token_cost(1_000_000, 0) == pytest.approx(0.15)
    assert token_cost(0, 1_000_000) == pytest.approx(0.60)
    assert token_cost(1_000_000, 0, 1_000_000) == pytest.approx(0.003)
    assert token_cost(1000, 400, peak=True) == pytest.approx(2 * token_cost(1000, 400))


def test_peak_hours():
    assert is_peak(datetime(2026, 10, 27, 2, tzinfo=UTC))  # Tuesday 02:00
    assert is_peak(datetime(2026, 10, 27, 9, 59, tzinfo=UTC))
    assert not is_peak(datetime(2026, 10, 27, 4, tzinfo=UTC))
    assert not is_peak(datetime(2026, 10, 31, 2, tzinfo=UTC))  # Saturday
    assert next_off_peak(datetime(2026, 10, 27, 6, 30, tzinfo=UTC)) == datetime(
        2026, 10, 27, 10, tzinfo=UTC
    )


def test_five_hour_window_pauses_and_resumes(tmp_path: Path):
    clock = Clock()
    gov = governor(tmp_path, clock, fraction=0.5, max_wait_seconds=60)
    # $8 is the 5h share. Spend $7.50 now and $0.40 an hour later.
    gov.acquire(7.5)
    gov.record(7.5, reserved=7.5)
    clock.now += HOUR
    gov.acquire(0.4)
    gov.record(0.4, reserved=0.4)
    with pytest.raises(BudgetPaused) as paused:
        gov.acquire(0.2)
    assert paused.value.reason == "5h budget"
    assert paused.value.resume_at == pytest.approx(SATURDAY + 5 * HOUR)

    # A later run loads the ledger and resumes once the first spend ages out.
    clock.now = SATURDAY + 5 * HOUR + 1
    resumed = governor(tmp_path, clock, fraction=0.5)
    resumed.acquire(0.2)


def test_weekly_and_monthly_windows_also_apply():
    clock = Clock()
    gov = governor(None, clock, fraction=1.0, max_wait_seconds=0)
    for day in range(3):
        clock.now = SATURDAY + day * 6 * HOUR
        gov.record(15.0)
    clock.now = SATURDAY + 18 * HOUR
    with pytest.raises(BudgetPaused) as paused:
        gov.acquire(1.0)
    assert paused.value.reason == "7d budget"
    gov.checkpoint.ledger = [[SATURDAY - day * 86400, 10.0] for day in range(8, 16)]
    with pytest.raises(BudgetPaused, match="30d budget"):
        gov.acquire(1.0)


def test_requests_in_flight_count_until_recorded():
    gov = governor(None, Clock(), fraction=0.5, max_wait_seconds=0)
    gov.acquire(5.0)
    with pytest.raises(BudgetPaused, match="5h budget"):
        gov.acquire(5.0)
    gov.record(0.5, reserved=5.0)
    gov.acquire(5.0)


def test_short_waits_sleep_in_process():
    clock = Clock()
    gov = governor(None, clock, requests_per_minute=2, max_wait_seconds=120)
    for _ in range(3):
        gov.acquire(0.001)
    assert clock.sleeps == [pytest.approx(60)]


def test_peak_hours_pause_unless_allowed():
    clock = Clock(datetime(2026, 10, 27, 6, tzinfo=UTC).timestamp())
    with pytest.raises(BudgetPaused, match="peak hours"):
        governor(None, clock).acquire(0.001)
    governor(None, clock, off_peak_only=False).acquire(0.001)


def test_run_cap_and_provider_limit(tmp_path: Path):
    clock = Clock()
    gov = governor(tmp_path, clock, run_cap_usd=1.0)
    gov.record(0.99)
    with pytest.raises(BudgetPaused, match="run cap reached; resume after the next run"):
        gov.acquire(0.02)
    paused = gov.provider_limit()
    assert paused.resume_at == SATURDAY + HOUR
    reloaded = governor(tmp_path, clock)
    with pytest.raises(BudgetPaused, match="provider usage limit"):
        reloaded.acquire(0.001)


def test_checkpoint_persists_ledger_and_totals(tmp_path: Path):
    gov = governor(tmp_path)
    gov.record(0.25)
    gov.record(0.5)
    loaded = Checkpoint.load(tmp_path / "checkpoint.json")
    assert [usd for _, usd in loaded.ledger] == [0.25, 0.5]
    assert loaded.totals == {"usd": 0.75, "requests": 2}
    (tmp_path / "checkpoint.json").write_text('{"version": 99}', encoding="utf-8")
    with pytest.raises(ValueError):
        Checkpoint.load(tmp_path / "checkpoint.json")


def test_config_from_env():
    config = BudgetConfig.from_env(
        {
            "BETTERMAN_GEN_BUDGET_FRACTION": "0.25",
            "BETTERMAN_GEN_RPM": "5",
            "BETTERMAN_GEN_ALLOW_PEAK": "1",
        }
    )
    assert (config.fraction, config.requests_per_minute, config.off_peak_only) == (0.25, 5, False)
    with pytest.raises(ValueError):
        BudgetConfig.from_env({"BETTERMAN_GEN_BUDGET_FRACTION": "2"})


def test_loaded_checkpoint_is_clamped(tmp_path: Path):
    path = tmp_path / "checkpoint.json"
    path.write_text(
        '{"version": 1, "pausedUntil": 1e30, '
        '"ledger": [[1e30, 0.1], [100, -5], [100, 1e9], [100, "NaN"], [200, 0.25]]}',
        encoding="utf-8",
    )
    loaded = Checkpoint.load(path, now=SATURDAY)
    assert loaded.paused_until == SATURDAY + 7 * 86400
    assert loaded.ledger == [[SATURDAY, 0.1], [200.0, 0.25]]
