from __future__ import annotations

import re
from pathlib import Path

from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

_FINGERPRINTED_ASSET_RE = re.compile(r"^assets/.+-[A-Za-z0-9]{8,}\\.[A-Za-z0-9]+$")


class SPAStaticFiles(StaticFiles):
    def __init__(self, *, directory: str, index: str = "index.html"):
        super().__init__(directory=directory, html=True, check_dir=False)
        self._index_path = Path(directory) / index

    async def get_response(self, path: str, scope: Scope):  # type: ignore[override]
        if path.startswith("api/"):
            return await super().get_response(path, scope)

        response = await super().get_response(path, scope)
        if response.status_code != 404:
            if _FINGERPRINTED_ASSET_RE.match(path):
                response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
            elif path in {"", "index.html"}:
                response.headers.setdefault("Cache-Control", "no-cache")
            else:
                response.headers.setdefault("Cache-Control", "public, max-age=300")
            return response

        if "." in path:
            return response

        if self._index_path.exists():
            index = FileResponse(self._index_path)
            index.headers.setdefault("Cache-Control", "no-cache")
            return index

        return response
