from __future__ import annotations

from time import perf_counter

from starlette.responses import Response


def mark() -> float:
    return perf_counter()


def elapsed_ms(start: float) -> float:
    return (perf_counter() - start) * 1000.0


def format_server_timing(metrics: list[tuple[str, float]]) -> str:
    return ", ".join(f"{name};dur={duration_ms:.1f}" for name, duration_ms in metrics)


def attach_server_timing(response: Response, metrics: list[tuple[str, float]]) -> None:
    if not metrics:
        return
    response.headers["Server-Timing"] = format_server_timing(metrics)
