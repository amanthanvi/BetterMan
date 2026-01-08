from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app


def main() -> None:
    out_path = sys.argv[1] if len(sys.argv) > 1 else "-"
    schema = create_app().openapi()

    if out_path == "-":
        json.dump(schema, sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")
        return

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2, sort_keys=True)
        f.write("\n")


if __name__ == "__main__":
    main()
