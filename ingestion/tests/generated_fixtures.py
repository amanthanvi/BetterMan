from __future__ import annotations

import json
from pathlib import Path

from ingestion.generated.page import PageInput

GOLDEN = Path(__file__).parent / "fixtures" / "golden"


def golden_page(
    fixture: str, *, name: str, section: str = "1", distro: str = "debian", sha: str | None = None
) -> PageInput:
    data = json.loads((GOLDEN / f"{fixture}.json").read_text(encoding="utf-8"))
    return PageInput(
        distro=distro,
        name=name,
        section=section,
        content_sha256=sha or (fixture.encode().hex() * 8)[:64],
        description=data.get("description") or "",
        synopsis=data.get("synopsis") or [],
        options=data.get("options") or [],
        doc=data["doc"],
    )


def tldr_tree(root: Path, pages: dict[str, str]) -> Path:
    for rel, text in pages.items():
        path = root / "pages" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return root


TAR_TLDR = """# tar

> Archiving utility.
> More information: <https://www.gnu.org/software/tar/manual/tar.html>.

- [c]reate an archive and write it to a [f]ile:

`tar cf {{path/to/target.tar}} {{path/to/file1 path/to/file2 ...}}`

- E[x]tract a (compressed) archive [f]ile into the target directory:

`tar xf {{path/to/source.tar.ext}} {{[-C|--directory]}} {{path/to/directory}}`

- Extract files matching a pattern:

`tar xf {{path/to/source.tar}} --wildcards "{{*.html}}"`

- Use a made-up flag:

`tar --teleport {{path/to/source.tar}}`
"""
