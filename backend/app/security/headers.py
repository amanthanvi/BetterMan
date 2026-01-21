from __future__ import annotations

import secrets

from starlette.types import ASGIApp, Message, Receive, Scope, Send


def generate_csp_nonce() -> str:
    # CSP nonces should be unpredictable; URL-safe base64 is acceptable here.
    return secrets.token_urlsafe(16)


def build_csp(
    *,
    nonce: str,
    upgrade_insecure_requests: bool = False,
    script_src_extra: tuple[str, ...] = (),
    connect_src_extra: tuple[str, ...] = (),
) -> str:
    # Keep this strict: no inline scripts, no external CDNs.
    script_src = ["'self'", f"'nonce-{nonce}'", *script_src_extra]
    connect_src = ["'self'", *connect_src_extra]

    directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        f"script-src {' '.join(script_src)}",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        f"connect-src {' '.join(connect_src)}",
    ]
    if upgrade_insecure_requests:
        directives.append("upgrade-insecure-requests")
    return "; ".join(directives)


def _setdefault_header(headers: list[tuple[bytes, bytes]], key: bytes, value: bytes) -> None:
    key_lower = key.lower()
    for k, _v in headers:
        if k.lower() == key_lower:
            return

    headers.append((key, value))


def _get_header(headers: list[tuple[bytes, bytes]], key: bytes) -> bytes | None:
    key_lower = key.lower()
    for k, v in headers:
        if k.lower() == key_lower:
            return v

    return None


class SecurityHeadersMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        env: str,
        csp_enabled: bool = True,
        csp_script_src_extra: tuple[str, ...] = (),
        csp_connect_src_extra: tuple[str, ...] = (),
    ):
        self._app = app
        self._env = env
        self._csp_enabled = csp_enabled
        self._csp_script_src_extra = csp_script_src_extra
        self._csp_connect_src_extra = csp_connect_src_extra

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        nonce: str | None = None
        if self._csp_enabled:
            nonce = generate_csp_nonce()
            scope["csp_nonce"] = nonce
            scope.setdefault("state", {})["csp_nonce"] = nonce

        async def send_wrapper(message: Message) -> None:
            if message["type"] != "http.response.start":
                await send(message)
                return

            headers = message.setdefault("headers", [])

            _setdefault_header(headers, b"x-content-type-options", b"nosniff")
            _setdefault_header(headers, b"referrer-policy", b"strict-origin-when-cross-origin")
            _setdefault_header(headers, b"x-frame-options", b"DENY")
            _setdefault_header(
                headers,
                b"permissions-policy",
                b"camera=(), microphone=(), geolocation=(), payment=()",
            )

            if self._env == "prod":
                _setdefault_header(
                    headers,
                    b"strict-transport-security",
                    b"max-age=31536000; includeSubDomains",
                )

            content_type = _get_header(headers, b"content-type") or b""
            path = scope.get("path", "")
            if (
                nonce is not None
                and b"text/html" in content_type
                and not path.startswith(("/docs", "/redoc", "/openapi"))
            ):
                _setdefault_header(
                    headers,
                    b"content-security-policy",
                    build_csp(
                        nonce=nonce,
                        upgrade_insecure_requests=self._env == "prod",
                        script_src_extra=self._csp_script_src_extra,
                        connect_src_extra=self._csp_connect_src_extra,
                    ).encode("utf-8"),
                )

            await send(message)

        await self._app(scope, receive, send_wrapper)
