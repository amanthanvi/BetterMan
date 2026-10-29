"""Read copyright notices from an already verified archive workspace."""


def copyright_text(workspace, package: str) -> str:
    paths = [
        row[0]
        for row in workspace.store.db.execute(
            "SELECT path FROM entries WHERE pkg=? "
            "AND (path LIKE 'usr/share/doc/%/copyright' "
            "OR path LIKE 'usr/share/doc/%/copyright.gz') ORDER BY path",
            (package,),
        )
    ]
    if not paths:
        paths = [f"usr/share/doc/{package}/copyright"]
    texts = []
    for path in paths:
        text = workspace.resolve(package, path).decode("utf-8", errors="replace")
        if text.strip() and text not in texts:
            texts.append(text)
    if not texts:
        raise RuntimeError(f"Missing nonblank archive copyright: {package}")
    return "\n\n".join(texts)
