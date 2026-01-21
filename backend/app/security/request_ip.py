from __future__ import annotations

import ipaddress
from functools import lru_cache

from fastapi import Request


Network = ipaddress.IPv4Network | ipaddress.IPv6Network


@lru_cache(maxsize=32)
def _parse_trusted_proxy_cidrs(raw: str) -> tuple[Network, ...]:
    parts = [p.strip() for p in raw.split(",")]
    out: list[Network] = []
    for part in parts:
        if not part:
            continue
        out.append(ipaddress.ip_network(part, strict=False))
    return tuple(out)


def _is_trusted_proxy(*, request: Request, peer_ip: str) -> bool:
    settings = getattr(request.app.state, "settings", None)
    raw = getattr(settings, "trusted_proxy_cidrs", "") if settings is not None else ""
    if not isinstance(raw, str) or not raw.strip():
        return False
    try:
        networks = _parse_trusted_proxy_cidrs(raw.strip())
        ip = ipaddress.ip_address(peer_ip)
    except ValueError:
        return False
    return any(ip in net for net in networks)


def get_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        peer_ip = request.client.host
        if _is_trusted_proxy(request=request, peer_ip=peer_ip):
            xff = request.headers.get("x-forwarded-for")
            if xff:
                first = xff.split(",")[0].strip()
                if first:
                    try:
                        ipaddress.ip_address(first)
                        return first
                    except ValueError:
                        return peer_ip
        return peer_ip

    return "unknown"
