"""What generated text may never be: a destructive page's examples, or text
carrying control characters.

docs/generated-layer.md describes both rules; convex/_generatedLayer.ts
enforces the character rule again at the ingest route.
"""

from __future__ import annotations

import re

# Pages whose command destroys data or a system by nature. They get the
# manual's own EXAMPLES and tldr-pages only: no model call at all, so no
# generated summary, examples or task phrases. Match is on the page name.
DESTRUCTIVE_COMMANDS = frozenset(
    {
        # files and directories
        "rm",
        "rmdir",
        "unlink",
        "shred",
        "srm",
        "wipe",
        "truncate",
        "fallocate",
        # block devices, filesystems and partitions
        "dd",
        "mke2fs",
        "mkswap",
        "mkdosfs",
        "mkntfs",
        "mformat",
        "wipefs",
        "blkdiscard",
        "fdisk",
        "sfdisk",
        "cfdisk",
        "gdisk",
        "sgdisk",
        "cgdisk",
        "parted",
        "partx",
        "cryptsetup",
        "lvremove",
        "vgremove",
        "pvremove",
        "zpool-destroy",
        "zfs-destroy",
        "hdparm",
        "nvme-format",
        "sg_format",
        # history and working trees
        "git-clean",
        "git-reset",
        "git-filter-branch",
        "git-filter-repo",
        "git-gc",
        "git-prune",
        "git-reflog",
        # accounts and power
        "userdel",
        "deluser",
        "groupdel",
        "delgroup",
        "shutdown",
        "reboot",
        "halt",
        "poweroff",
        # processes
        "kill",
        "killall",
        "pkill",
    }
)
# Whole families: mkfs, mkfs.ext4, mkfs.vfat, ...
DESTRUCTIVE_PREFIXES = ("mkfs",)


def is_destructive(name: str) -> bool:
    name = name.lower()
    return name in DESTRUCTIVE_COMMANDS or any(
        name == prefix or name.startswith(prefix + ".") for prefix in DESTRUCTIVE_PREFIXES
    )


# C0 and C1 controls, DEL, line/paragraph separators and bidi controls.
# Nothing is exempt: newlines are only allowed in the manual's own multi-line
# examples, which the caller checks line by line.
FORBIDDEN_CHARS = re.compile(r"[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]")


def has_forbidden_chars(text: str, *, multiline: bool = False) -> bool:
    if multiline:
        return any(FORBIDDEN_CHARS.search(line) for line in text.split("\n"))
    return bool(FORBIDDEN_CHARS.search(text))
