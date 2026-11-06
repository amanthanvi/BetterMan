"""Canonical declared-license texts; never a substitute for package notices."""

from __future__ import annotations

import json
import re
import tarfile
from pathlib import Path

from ingestion.debian_archives import MAX_SOURCE_BYTES
from ingestion.debian_indexes import download
from ingestion.util import sha256_hex

PINS = Path(__file__).resolve().parents[1] / "data/spdx-license-list.json"
LEGACY = PINS.with_name("license-expression-aliases.json")
NO_LICENSE_TEXT = "No license text is available for this package."


def parse_expression(expression):
    tokens = re.findall(r"\(|\)|[A-Za-z0-9][A-Za-z0-9.+:-]*|\S", expression)
    if not tokens or len(tokens) > 512:
        raise ValueError("Empty or oversized license expression")
    position, identifiers = 0, []

    def identifier(kind):
        nonlocal position
        if (
            position >= len(tokens)
            or tokens[position] in {"AND", "OR", "WITH"}
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.:-]*\+?", tokens[position])
        ):
            raise ValueError("Expected a license identifier")
        identifiers.append((tokens[position], kind))
        position += 1

    def primary(depth):
        nonlocal position
        if depth > 64:
            raise ValueError("License expression nesting exceeds 64")
        if position < len(tokens) and tokens[position] == "(":
            position += 1
            expression_group(depth + 1)
            if position >= len(tokens) or tokens[position] != ")":
                raise ValueError("Unclosed license expression group")
            position += 1
        else:
            identifier("license")
            if position < len(tokens) and tokens[position] == "WITH":
                position += 1
                identifier("exception")

    def conjunction(depth):
        nonlocal position
        primary(depth)
        while position < len(tokens) and tokens[position] == "AND":
            position += 1
            primary(depth)

    def expression_group(depth):
        nonlocal position
        conjunction(depth)
        while position < len(tokens) and tokens[position] == "OR":
            position += 1
            conjunction(depth)

    expression_group(0)
    if position != len(tokens):
        raise ValueError("Unexpected token in license expression")
    return list(dict.fromkeys(identifiers))


def load_texts(root):
    pins = json.loads(PINS.read_text())
    archive = root / "spdx-license-list-data.tar.gz"
    download(pins["url"], archive, pins["sha256"], pins["size"])
    prefix = f"license-list-data-{pins['release'].removeprefix('v')}/"
    indexes, bodies = {}, {}
    with tarfile.open(archive, mode="r|gz") as stream:
        if pins.get("commit") and stream.pax_headers.get("comment") != pins["commit"]:
            raise ValueError("SPDX archive commit mismatch")
        for member in stream:
            path = member.name.removeprefix(prefix)
            if member.name == path:
                continue
            if path not in {"json/licenses.json", "json/exceptions.json"} and not re.fullmatch(
                r"text/(?:deprecated_)?[A-Za-z0-9][A-Za-z0-9.+-]*\.txt", path
            ):
                continue
            if not member.isfile() or member.size > MAX_SOURCE_BYTES:
                raise ValueError("Invalid SPDX text/index archive member")
            data = stream.extractfile(member).read(MAX_SOURCE_BYTES + 1).decode("utf-8")
            if path in {"json/licenses.json", "json/exceptions.json"}:
                indexes[path] = json.loads(data)
            else:
                bodies[path[5:-4]] = data
    result = {"license": {}, "exception": {}}
    for kind, name, field, key in (
        ("license", "licenses", "licenses", "licenseId"),
        ("exception", "exceptions", "exceptions", "licenseExceptionId"),
    ):
        index = indexes.get(f"json/{name}.json", {})
        if index.get("licenseListVersion") != pins["release"].removeprefix("v"):
            raise ValueError("SPDX archive/index release mismatch")
        for entry in index[field]:
            identifier = entry[key]
            body = bodies.get(
                ("deprecated_" if kind == "license" and entry.get("isDeprecatedLicenseId") else "")
                + identifier,
                "",
            )
            if not body.strip():
                raise ValueError(f"Missing canonical SPDX text: {identifier}")
            result[kind][identifier] = body
    return result


def declared_identifiers(expression, distro):
    mappings = json.loads(LEGACY.read_text())
    aliases = mappings["common"] | mappings.get(distro, {})
    terms = parse_expression(aliases.get(expression, expression))
    expanded = []
    for identifier, kind in terms:
        if kind == "license" and identifier in aliases:
            expanded.extend(parse_expression(aliases[identifier]))
        else:
            expanded.append((identifier, kind))
    return list(dict.fromkeys(expanded))


def standard_text(workspace, package):
    from ingestion.fedora_archives import notice_path

    expression = workspace.available[package].license
    owner = {"arch": "licenses", "alpine": "spdx-licenses-text"}.get(workspace.distro)
    if owner in workspace.available and owner not in workspace.acquired:
        workspace.acquire([workspace.available[owner]], workers=1)
    if not hasattr(workspace, "canonical_license_texts"):
        workspace.canonical_license_texts = load_texts(workspace.root)
    inventory = workspace.canonical_license_texts
    canonical = {
        kind: {name.casefold(): name for name in texts} for kind, texts in inventory.items()
    }
    metadata = {
        "standardLicenseIdentifiers": [],
        "spdxLicenseIdentifiers": [],
        "missingLicenseIdentifiers": [],
    }
    try:
        terms = declared_identifiers(expression, workspace.distro)
    except ValueError as exc:
        terms = []
        metadata["licenseExpressionError"] = str(exc)
    # Simple legacy names require exact IDs or a reviewed alias, never case guessing.
    terms = [
        (canonical[kind].get(name.casefold(), name) if "-" in name else name, kind)
        for name, kind in terms
    ]
    shared = {}
    if owner in workspace.acquired:
        wanted = {name for name, _kind in terms}
        for (path,) in workspace.store.db.execute(
            "SELECT path FROM entries WHERE pkg=? AND kind IN ('file','link','blocked')", (owner,)
        ):
            name = Path(path).name.removesuffix(".txt")
            if name in wanted and notice_path(path):
                shared[name] = workspace.resolve(owner, path).decode("utf-8", errors="strict")
    groups, attached = {}, set()
    pins = json.loads(PINS.read_text())
    # Verified distro texts take precedence; equal bodies share one displayed block.
    for source, texts in (
        (f"verified {owner} package", shared),
        (f"SPDX License List {pins['release']}", None),
    ):
        for name, kind in terms:
            if (name, kind) in attached or name not in inventory[kind]:
                continue
            text = texts.get(name) if texts is not None else inventory[kind].get(name)
            if text and text.strip():
                ids, _source = groups.setdefault(text, ([], source))
                ids.append((name, kind))
                attached.add((name, kind))
                if texts is None:
                    metadata["spdxLicenseIdentifiers"].append(name)
    missing = sorted({name for name, kind in terms if (name, kind) not in attached})
    metadata["standardLicenseIdentifiers"] = sorted({name for name, _kind in attached})
    metadata["missingLicenseIdentifiers"] = missing
    if not hasattr(workspace, "standard_license_metadata"):
        workspace.standard_license_metadata = {}
    workspace.standard_license_metadata[package] = metadata
    if not hasattr(workspace, "unmatched_license_identifiers"):
        workspace.unmatched_license_identifiers = {}
    workspace.unmatched_license_identifiers[package] = missing
    workspace.standard_license_provenance = pins | {
        "legacyMappingsSha256": sha256_hex(LEGACY.read_bytes())
    }
    parts = [f"Declared license expression: {' '.join(expression.split())}"]
    if missing:
        parts.append(
            "Missing license identifiers after shared and SPDX sources: " + ", ".join(missing)
        )
    if "licenseExpressionError" in metadata:
        parts.append("Unparseable license expression: " + metadata["licenseExpressionError"])
    if not groups:
        parts.insert(0, NO_LICENSE_TEXT)
        parts.append("This package ships no license file.")
    for text, (ids, source) in groups.items():
        name, kind = ids[0]
        heading = (
            f"Standard text for the declared {kind} {name}; this package ships no license file."
        )
        if len(ids) > 1:
            heading += "\nAlso applies to: " + ", ".join(name for name, _kind in ids[1:])
        parts.append(f"{heading}\nSource: {source}.\n\n{text}")
    return "\n\n".join(parts)


def license_text(workspace, package):
    """Keep actual notices unchanged; attach standards only when none is reachable."""
    from ingestion import alpine_archives, arch_archives, debian_licenses, fedora_archives

    if workspace.distro in {"debian", "ubuntu"}:
        return debian_licenses.copyright_text(workspace, package)
    collectors = {"fedora": fedora_archives, "arch": arch_archives, "alpine": alpine_archives}
    if workspace.distro not in collectors:
        raise ValueError("Unsupported standard-license distro")
    deferred = []

    def directory(owner, path, remaining):
        if workspace.distro == "alpine" and alpine_archives.acquire_directory_owner(
            workspace, package, owner, path
        ):
            return "\n\n".join(
                fedora_archives._notice_texts(
                    workspace, owner, path, directory_fallback=directory, remaining=remaining
                )
            )
        deferred.append((owner, path))
        return None

    own = fedora_archives.copyright_text(workspace, package, directory_fallback=directory)
    if own.strip():
        # Existing mixed notice/directory recovery retains its exact upstream behavior.
        return collectors[workspace.distro].copyright_text(workspace, package) if deferred else own
    return standard_text(workspace, package)
