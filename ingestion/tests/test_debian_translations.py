from __future__ import annotations

import gzip
import hashlib
import io
import json
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

from ingestion import cli
from ingestion import debian_translations as l10n
from ingestion.debian_archives import ArchiveStore, extract
from ingestion.debian_indexes import (
    LOCALIZED_MAN_PATH,
    MAN_PATH,
    PINS,
    TRANSLATION_ROOTS,
    Package,
    localized_manual,
)
from ingestion.mandoc_parser import parse_mandoc_html

COPYRIGHT = (
    b"Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/\nLicense: GPL-2+\n"
)
TAR_DE = (
    b'.TH TAR 1 "4. M\xc3\xa4rz 2023" "GNU tar 1.34" "Handbuch"\n'
    b".SH BEZEICHNUNG\ntar \\- ein Archivierungsprogramm\n"
    b".SH \xc3\x9cBERSICHT\n\\fBtar\\fP [\\fIOPTION\\fP]\n"
    b".SH OPTIONEN\n.TP\n\\fB\\-x\\fP, \\fB\\-\\-extract\\fP\nEntpackt.\n"
    b'.SH "SIEHE AUCH"\n\\fBgzip\\fP(1)\n'
)


def deb(tmp_path: Path, name: str, members: dict[str, bytes | str], installed=1) -> Package:
    """A real ar/tar .deb; str values are symlink targets."""
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w") as tar:
        for path, value in {**members, f"usr/share/doc/{name}/copyright": COPYRIGHT}.items():
            info = tarfile.TarInfo(f"./{path}")
            if isinstance(value, str):
                info.type, info.linkname = tarfile.SYMTYPE, value
                tar.addfile(info)
            else:
                payload = gzip.compress(value) if path.endswith(".gz") else value
                info.size = len(payload)
                tar.addfile(info, io.BytesIO(payload))

    def ar_member(member, payload):
        header = f"{member:<16}{0:<12}{0:<6}{0:<6}{'100644':<8}{len(payload):<10}`\n"
        return header.encode() + payload + (b"\n" if len(payload) % 2 else b"")

    archive = tmp_path / f"{name}.deb"
    archive.write_bytes(
        b"!<arch>\n" + ar_member("debian-binary", b"2.0\n") + ar_member("data.tar", data.getvalue())
    )
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    return Package(
        name, "1.0-1", f"pool/main/{name}.deb", digest, archive.stat().st_size, installed
    )


_OPEN_STORES: list[ArchiveStore] = []


@pytest.fixture(autouse=True)
def _close_stores():
    yield
    while _OPEN_STORES:
        _OPEN_STORES.pop().db.close()


def workspace(tmp_path: Path, packages: dict[str, tuple[dict, int]], locales=("de",)):
    obj = object.__new__(l10n.TranslationWorkspace)
    obj.root = tmp_path
    obj.locales = tuple(locales)
    obj.localized_roots = frozenset(TRANSLATION_ROOTS[locale] for locale in locales)
    obj.store = ArchiveStore(tmp_path)
    _OPEN_STORES.append(obj.store)
    obj.packages = [
        deb(tmp_path, name, members, installed) for name, (members, installed) in packages.items()
    ]
    obj.available = {p.name: p for p in obj.packages}
    obj.acquired = set(obj.available)
    obj.missing = []
    obj.archive_fallbacks = 0
    obj.owners = obj.store.db
    obj.owners.execute("CREATE TABLE owners(path TEXT,pkg TEXT)")
    obj.pins = {**json.loads(PINS.read_text()), "mirror": "https://example.test/snapshot"}
    for pkg in obj.packages:
        entries = extract(
            tmp_path / f"{pkg.name}.deb", pkg, tmp_path, localized_roots=obj.localized_roots
        )
        obj.store.add(pkg, entries)
    return obj


@pytest.mark.parametrize(
    ("path", "root"),
    [
        ("usr/share/man/de/man1/tar.1.gz", "de"),
        ("usr/share/man/pt_BR/man8/mount.8.gz", "pt_BR"),
        ("usr/share/man/ja/man3/printf.3.xz", "ja"),
        ("usr/share/man/ru/man5/passwd.5", "ru"),
    ],
)
def test_translated_roots_are_exact_and_never_english(path, root):
    match = LOCALIZED_MAN_PATH.fullmatch(path)
    assert match and match[1] == root
    assert localized_manual(path, {root}) and not localized_manual(path, {"fr"})
    assert not MAN_PATH.fullmatch(path)


@pytest.mark.parametrize(
    "path",
    [
        "usr/share/man/man1/tar.1.gz",
        "usr/share/man/de.UTF-8/man1/sl.1.gz",
        "usr/share/man/pt/man1/ls.1.gz",
        "usr/share/man/zh_CN/man1/ls.1.gz",
        "usr/share/man/de/man1/sub/tar.1.gz",
        "usr/share/man/DE/man1/tar.1.gz",
    ],
)
def test_other_roots_are_not_translations_we_ingest(path):
    assert not LOCALIZED_MAN_PATH.fullmatch(path)


def test_locale_codes_map_to_debian_roots():
    assert TRANSLATION_ROOTS == {
        "de": "de",
        "fr": "fr",
        "es": "es",
        "pt-BR": "pt_BR",
        "ja": "ja",
        "ru": "ru",
    }
    assert l10n.primary_packages("pt-BR") == ("manpages-pt-br", "manpages-pt-br-dev")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (TAR_DE, "GNU tar 1.34"),
        (b'.TH LS 1 "2025-04-08" "GNU coreutils 9.7"\n', "GNU coreutils 9.7"),
        (b'.TH open 2 "2. Mai 2025" "Linux man-pages 6.14"\n', "Linux man-pages 6.14"),
        (b".TH X 1 2025 \\fBfoo\\-1.2\\fP\n", "foo-1.2"),
        (b'.TH BAR 1 "1 M\xc3\xa4rz 2001" "10 May 2011"\n', None),
        (b'.TH BAR 1 "2001" "GNU"\n', None),
        (b'.TH BAR 1 "2001"\n', None),
        (b".Dd May 1, 2020\n.Dt LS 1\n.Os Debian 13.1\n", None),
    ],
)
def test_documented_version_reads_only_a_dotted_th_source(raw, expected):
    assert l10n.documented_version(raw) == expected


def test_english_extraction_ignores_translated_roots(tmp_path):
    package = deb(
        tmp_path,
        "manpages-de",
        {
            "usr/share/man/de/man1/tar.1.gz": TAR_DE,
            "usr/share/man/de.UTF-8/man1/sl.1.gz": TAR_DE,
            "usr/share/man/man1/english.1.gz": b".TH E 1\n",
        },
    )
    english = {entry[1] for entry in extract(tmp_path / "manpages-de.deb", package, tmp_path)}
    assert "usr/share/man/man1/english.1.gz" in english
    assert not any("/de/" in path or "de.UTF-8" in path for path in english)
    translated = {
        entry[1]
        for entry in extract(
            tmp_path / "manpages-de.deb", package, tmp_path, localized_roots=frozenset({"de"})
        )
    }
    assert "usr/share/man/de/man1/tar.1.gz" in translated
    assert not any("de.UTF-8" in path for path in translated)


def test_routes_conflicts_aliases_and_includes_stay_in_one_language(tmp_path):
    obj = workspace(
        tmp_path,
        {
            "manpages-de": (
                {
                    "usr/share/man/de/man1/tar.1.gz": TAR_DE,
                    "usr/share/man/de/man1/gtar.1.gz": b".so man1/tar.1\n",
                    "usr/share/man/de/man1/star.1.gz": "tar.1.gz",
                    "usr/share/man/de/man1/inc.1.gz": (
                        b'.TH INC 1 "x" "inc 2.0"\n.SH BEZEICHNUNG\ninc \\- x\n.so man1/part.1\n'
                    ),
                    "usr/share/man/de/man1/part.1.gz": b"Teil.\n",
                    "usr/share/man/de/man1/escape.1.gz": b".TH E 1\n.so ../fr/man1/x.1\n",
                    "usr/share/man/man1/tar.1.gz": b".TH TAR 1\n.SH NAME\ntar \\- English\n",
                },
                10,
            ),
            "tar": (
                {"usr/share/man/de/man1/tar.1.gz": b".TH TAR 1\n.SH BEZEICHNUNG\ntar \\- alt\n"},
                99,
            ),
        },
    )
    sources = list(obj.translated_sources("de"))
    rows = {
        (name, section): (pkg, alias, target)
        for pkg, _p, name, section, alias, target, _r in sources
    }
    # The most-installed package owns the route; the other copy is recorded.
    assert rows[("tar", "1")] == ("tar", False, None)
    assert obj.dropped == [
        {
            "name": "tar",
            "section": "1",
            "package": "manpages-de",
            "sourcePath": "usr/share/man/de/man1/tar.1.gz",
        }
    ]
    assert rows[("gtar", "1")][1:] == (True, ("tar", "1", "manpages-de"))
    assert rows[("star", "1")][1:] == (True, ("tar", "1", "manpages-de"))
    assert rows[("inc", "1")][1] is False
    # A translation may include only its own language's pages.
    assert ("escape", "1") not in rows
    assert any("escapes manual root" in item["error"] for item in obj.missing)
    assert not any(path.startswith("usr/share/man/man1/") for _pkg, path, *_ in sources)


@pytest.mark.parametrize(
    "member",
    [
        # A symlink into the English root, a stub naming the English page, and
        # relative and absolute inline includes of it.
        "../../man1/foo.1.gz",
        b".so ../../man1/foo.1\n",
        b".TH FOO 1\n.SH BEZEICHNUNG\nfoo \\- x\n.so ../../man1/foo.1\n",
        b".TH FOO 1\n.SH BEZEICHNUNG\nfoo \\- x\n.so /usr/share/man/man1/foo.1\n",
    ],
)
def test_english_text_is_never_published_as_a_translation(tmp_path, member):
    obj = workspace(
        tmp_path,
        {
            "foo": (
                {
                    "usr/share/man/man1/foo.1.gz": b".TH FOO 1\n.SH NAME\nfoo \\- English text\n",
                    "usr/share/man/de/man1/foo.1.gz": member,
                },
                10,
            )
        },
    )
    sources = list(obj.translated_sources("de"))
    assert not any(name == "foo" for _pkg, _path, name, *_ in sources)
    assert [item["path"] for item in obj.missing] == ["usr/share/man/de/man1/foo.1.gz"]
    assert any(
        "outside its language root" in item["error"]
        or "escapes manual root" in item["error"]
        or "no translated manual identity" in item["error"]
        for item in obj.missing
    )


def test_publish_declares_a_staging_translation_with_documented_versions(tmp_path, monkeypatch):
    obj = workspace(
        tmp_path,
        {
            "manpages-de": (
                {
                    "usr/share/man/de/man1/tar.1.gz": TAR_DE,
                    "usr/share/man/de/man1/gtar.1.gz": b".so man1/tar.1\n",
                    "usr/share/man/de/man1/old.1.gz": (
                        b'.TH OLD 1 "2001" "GNU"\n.SH BEZEICHNUNG\nold \\- x\n'
                    ),
                },
                10,
            ),
        },
    )
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")
    monkeypatch.setenv("BETTERMAN_INGEST_UPLOAD_WORKERS", "1")
    calls = []

    class Client:
        def post(self, path, payload):
            calls.append((path, payload))
            if path == "/ingest/pages/storage":
                return {"inserted": len(payload["pages"]), "skipped": 0}
            return {}

        def activate_release(self, payload):
            calls.append(("activate", payload))

    result = l10n.publish_translation(
        obj, "de", Client(), activate=True, dataset_stage="staging", git_sha="fixture"
    )
    release = next(payload for path, payload in calls if path == "/ingest/release")
    assert release["locale"] == "de" and release["distro"] == "debian"
    assert "+debian-de+fixture+" in release["datasetReleaseId"]
    assert release["packageManifest"]["acquisition"] == "deb-extraction"
    assert release["packageManifest"]["archiveRoot"] == "usr/share/man/de"
    assert "providerCount" not in release
    assert (release["pageCount"], release["aliasCount"]) == (2, 1)
    pages = {
        p["name"]: p
        for path, body in calls
        if path == "/ingest/pages/storage"
        for p in body["pages"]
    }
    assert pages["tar"]["documentedVersion"] == "GNU tar 1.34"
    assert pages["tar"]["description"] == "ein Archivierungsprogramm"
    assert "documentedVersion" not in pages["old"]
    aliases = [a for path, body in calls if path == "/ingest/aliases" for a in body["aliases"]]
    assert aliases == [{"name": "gtar", "section": "1", "targetName": "tar", "targetSection": "1"}]
    assert calls[-1][0] == "activate" and calls[-1][1]["stage"] == "staging"
    assert result.published


def test_ingest_refuses_prod_before_the_contract_or_any_network(monkeypatch):
    monkeypatch.setattr(l10n, "ConvexIngestClient", lambda *_: pytest.fail("no client for prod"))
    with pytest.raises(ValueError, match="staging"):
        l10n.ingest_debian_translation(
            locale="de",
            activate=True,
            convex_url="http://127.0.0.1:1",
            ingest_secret="local",
            dataset_stage="prod",
            git_sha="test",
        )


def test_contract_failure_precedes_translation_acquisition(monkeypatch):
    from ingestion.convex_client import ConvexContractError

    class Client:
        def require_deployed_contract(self):
            raise ConvexContractError("deploy v9 first")

    monkeypatch.setattr(l10n, "ConvexIngestClient", lambda *_: Client())
    monkeypatch.setattr(
        l10n, "TranslationWorkspace", lambda *_a, **_k: pytest.fail("no acquisition")
    )
    with pytest.raises(ConvexContractError, match="v9"):
        l10n.ingest_debian_translation(
            locale="de",
            activate=False,
            convex_url="http://127.0.0.1:1",
            ingest_secret="local",
            dataset_stage="staging",
            git_sha="test",
        )


@pytest.mark.parametrize(
    ("argv", "stage", "error"),
    [
        (["--debian-translation", "de"], "prod", "cannot use stage prod"),
        (["--distro", "ubuntu", "--debian-translation", "de"], "staging", "--distro debian"),
        (["--debian-full", "--debian-translation", "de"], "staging", "--distro debian"),
        (["--in-container", "--debian-translation", "de"], "staging", "--in-container"),
    ],
)
def test_cli_translation_opt_in_is_staging_only_and_debian_only(monkeypatch, argv, stage, error):
    monkeypatch.setenv("BETTERMAN_DATASET_STAGE", stage)
    monkeypatch.setattr(cli, "_run_ingest", lambda **_: pytest.fail("must not ingest"))
    monkeypatch.setattr(cli, "run_ingest_container", lambda **_: pytest.fail("must not ingest"))
    events = []
    monkeypatch.setattr(cli, "_log", lambda event, **fields: events.append((event, fields)))
    assert cli.main(["ingest", *argv]) == 2
    assert error in events[-1][1]["error"]


def test_cli_translation_uses_the_archive_path(monkeypatch):
    calls = []
    monkeypatch.setenv("BETTERMAN_DATASET_STAGE", "staging")
    monkeypatch.setattr(cli, "_run_ingest", lambda **kwargs: calls.append(kwargs) or 0)
    monkeypatch.setattr(cli, "run_ingest_container", lambda **_: pytest.fail("no Docker"))
    assert cli.main(["ingest", "--debian-translation", "pt-BR", "--no-activate"]) == 0
    assert calls == [
        {
            "sample": False,
            "activate": False,
            "distro": "debian",
            "image_ref": "deb-archives",
            "image_digest": "pinned",
            "translation": "pt-BR",
        }
    ]


@pytest.mark.skipif(shutil.which("mandoc") is None, reason="needs mandoc")
@pytest.mark.parametrize(
    ("roff", "description", "see_also"),
    [
        (TAR_DE, "ein Archivierungsprogramm", "gzip"),
        (
            ".TH LS 1\n.SH 名前\nls \\- ディレクトリの内容をリスト表示する\n.SH 書式\n\\fBls\\fP\n"
            ".SH 関連項目\n\\fBdir\\fP(1)\n".encode(),
            "ディレクトリの内容をリスト表示する",
            "dir",
        ),
        (
            ".TH LS 1\n.SH НАИМЕНОВАНИЕ\nls \\- выводит список\n.SH ОБЗОР\n\\fBls\\fP\n"
            '.SH "СМОТРИТЕ ТАКЖЕ"\n\\fBdir\\fP(1)\n'.encode(),
            "выводит список",
            "dir",
        ),
    ],
)
def test_parser_reads_translated_name_synopsis_and_see_also(roff, description, see_also):
    html = subprocess.run(["mandoc", "-Thtml"], input=roff, capture_output=True, check=True)
    parsed = parse_mandoc_html(html.stdout.decode())
    assert parsed.description == description
    assert parsed.synopsis
    assert [ref.name for ref in parsed.see_also or []] == [see_also]


def test_parser_keeps_english_ids_ahead_of_translated_titles():
    parsed = parse_mandoc_html(
        '<div class="manual-text"><section><h1>BEZEICHNUNG</h1><p>x - wrong</p></section>'
        '<section><h1 id="NAME">NAME</h1><p>x - right</p></section></div>'
    )
    assert parsed.description == "right"
