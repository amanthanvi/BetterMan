from __future__ import annotations

import re
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.responses import HTMLResponse
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

_FINGERPRINTED_ASSET_RE = re.compile(r"^assets/.+-[A-Za-z0-9]{8,}\\.[A-Za-z0-9]+$")
_SCRIPT_TAG_RE = re.compile(r"<script(?![^>]*\\snonce=)", flags=re.IGNORECASE)
_STYLE_TAG_RE = re.compile(r"<style(?![^>]*\\snonce=)", flags=re.IGNORECASE)


class SPAStaticFiles(StaticFiles):
    def __init__(self, *, directory: str, index: str = "index.html"):
        super().__init__(directory=directory, html=True, check_dir=False)
        self._index_path = Path(directory) / index

    def _index_response(self, scope: Scope) -> HTMLResponse:
        html = self._index_path.read_text(encoding="utf-8")
        nonce = scope.get("csp_nonce") or (scope.get("state") or {}).get("csp_nonce")
        if nonce:
            html = _SCRIPT_TAG_RE.sub(f'<script nonce="{nonce}"', html)
            html = _STYLE_TAG_RE.sub(f'<style nonce="{nonce}"', html)

        res = HTMLResponse(html)
        res.headers.setdefault("Cache-Control", "no-cache")
        return res

    async def get_response(self, path: str, scope: Scope):  # type: ignore[override]
        if path.startswith("api/"):
            return await super().get_response(path, scope)

        if path in {"", ".", "index.html"} and self._index_path.exists():
            return self._index_response(scope)

        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise

            if "." in path:
                raise

            if self._index_path.exists():
                return self._index_response(scope)

            raise

        if _FINGERPRINTED_ASSET_RE.match(path):
            response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        elif path in {"", ".", "index.html"}:
            response.headers.setdefault("Cache-Control", "no-cache")
        else:
            response.headers.setdefault("Cache-Control", "public, max-age=300")

        return response
