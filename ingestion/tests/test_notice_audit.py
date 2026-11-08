from scripts.audit_notice_links import inspect_payload, read_receipt, write_receipt
from tests.test_fedora_archives import payload


def test_audit_counts_only_blocked_notices_and_checks_same_archive_members():
    links = inspect_payload(
        payload(
            [
                ("usr/share/licenses/tool/LICENSE", b"", "/opt/tool/legal"),
                ("usr/share/licenses/tool/NOTICE", b"", "/etc/shared"),
                ("usr/share/licenses/tool/COPYING", b"", "LICENSE"),
                ("usr/bin/tool", b"", "/opt/tool/bin"),
                ("opt/tool/legal", b"text", None),
            ]
        )
    )
    assert links == [
        {
            "path": "usr/share/licenses/tool/LICENSE",
            "target": "opt/tool/legal",
            "samePackageRegularFile": True,
        },
        {
            "path": "usr/share/licenses/tool/NOTICE",
            "target": "etc/shared",
            "samePackageRegularFile": False,
        },
    ]


def test_receipts_are_atomic_and_unreadable_ones_are_cache_misses(tmp_path):
    path = tmp_path / "abc.json"
    assert read_receipt(path, "abc") is None
    path.write_text('{"sha256": "abc", "links": [')  # interrupted write
    assert read_receipt(path, "abc") is None
    write_receipt(path, {"sha256": "abc", "links": []})
    assert read_receipt(path, "abc") == {"sha256": "abc", "links": []}
    assert read_receipt(path, "other") is None
    assert not list(tmp_path.glob("*.partial"))
