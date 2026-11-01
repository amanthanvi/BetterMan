from scripts.audit_notice_links import inspect_payload
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
