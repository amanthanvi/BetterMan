---
slug: symbolic-links
title: Symbolic and hard links
term: symbolic links
summary: The difference between a hard link, another name for the same file, and a symbolic link, a file that holds a path, and which commands follow them.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: symlink(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine, freebsd, macos
    sections: DESCRIPTION; Symbolic link ownership, permissions, and timestamps; Commands not traversing a file tree; Commands traversing a file tree
related: ln(1), readlink(1), namei(1), ls(1), find(1), symlink(2), lstat(2), inode(7), path_resolution(7)
aliases: symlink, symlinks, symbolic link, soft link, soft links, hard link, hard links, dangling link, ln -s
references: symlink(7)
---
A *hard link* is a name for a file. Every hard link to a file refers to the same
[[inodes|inode]], so all of them are equally the file: there is no original and
copy, and a change made through one name shows through all of them. Hard links
cannot refer to directories.

A *symbolic link* is a small file whose contents are a path name. It points to
a name, not to the file underneath, so it can refer to a directory or to
another file system. The target need not exist; a link to a missing path is
called *dangling*. ln(1) makes a hard link, and `ln -s` a symbolic one.

When a command meets a symbolic link it either *follows* it and acts on the
target, or acts on the link itself:

- Links in the directory part of a path, such as `a` in `a/b`, are always
  followed.
- A command given a link as an argument usually follows it: `cat slink`
  prints the target's contents. mv(1) and rm(1) are exceptions; they rename
  or delete the link itself, and nothing else.
- `chown -h` changes the link itself rather than its target.
- Commands that walk a tree, such as `chown -R` or find(1), do not follow links
  to directories by default. `-H` follows those named on the command line and
  `-L` follows every one; `-P` restores the default.

A link that names its target by a relative path is resolved from the link's
own directory, so moving it can break it.
