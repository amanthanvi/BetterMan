import re
from pathlib import Path

import httpx
from fastapi import FastAPI

from app.security.headers import SecurityHeadersMiddleware
from app.web.spa_static import SPAStaticFiles


async def test_csp_nonce_is_set_and_injected(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text(
        "<!doctype html><html><head><style>body{color:red}</style></head>"
        "<body><div id='root'></div><script src='/assets/app.js'></script></body></html>",
        encoding="utf-8",
    )

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(SecurityHeadersMiddleware, env="prod")
    app.mount("/", SPAStaticFiles(directory=str(tmp_path)), name="spa")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/")

    assert res.status_code == 200

    csp = res.headers.get("content-security-policy")
    assert csp
    assert "unsafe-inline" not in csp

    m = re.search(r"nonce-([^'\\s;]+)", csp)
    assert m
    nonce = m.group(1)

    body = res.text
    assert f'nonce="{nonce}"' in body
