from __future__ import annotations

from pathlib import Path

from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class SPAStaticFiles(StaticFiles):
    def __init__(self, *, directory: str, index: str = "index.html"):
        super().__init__(directory=directory, html=True, check_dir=False)
        self._index_path = Path(directory) / index

    async def get_response(self, path: str, scope: Scope):  # type: ignore[override]
        if path.startswith("api/"):
            return await super().get_response(path, scope)

        response = await super().get_response(path, scope)
        if response.status_code != 404:
            return response

        if "." in path:
            return response

        if self._index_path.exists():
            return FileResponse(self._index_path)

        return response
