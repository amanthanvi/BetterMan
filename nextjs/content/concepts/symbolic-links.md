---
slug: symbolic-links
title: Symbolic and hard links
term: symbolic links
summary: The difference between a hard link, another name for the same file, and a symbolic link, a file that holds a path, and which commands follow them.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
sources:
  - page: symlink(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine, freebsd, macos
    sections: DESCRIPTION; Symbolic link ownership, permissions, and timestamps; Treatment of symbolic links in system calls; Commands not traversing a file tree; Commands traversing a file tree
related: ln(1), readlink(1), namei(1), ls(1), find(1), symlink(2), lstat(2), inode(7), path_resolution(7)
aliases: symlink, symlinks, symbolic link, soft link, soft links, hard link, hard links, dangling link
references: symlink(7)
---
A *hard link* is a name for a file. Every hard link to a file refers to the same
[[inodes|inode]], so all of them are equally the file, with no original and
copy. Hard links cannot refer to directories.

A *symbolic link* is a small file whose contents are a path name. It points to
a name, not to the file underneath, so it can refer to a directory or to
another file system. The target need not exist; a link to a missing path is
*dangling*. ln(1) makes hard links, and `ln -s` symbolic ones.

A command meeting a symbolic link either *follows* it to the target or acts on
the link itself:

- Links in the directory part of a path, such as `a` in `a/b`, are followed
  by nearly every system call and command; openat2(2) can refuse them.
- A command given a link as an argument usually follows it: `cat slink`
  prints the target's contents. mv(1) and rm(1) instead rename or delete the
  link itself.
- `chown -h` changes the link itself rather than its target.
- Commands that walk a tree, such as `chown -R` or find(1), do not follow links
  to directories by default. `-H` follows links named on the command line, and
  `-L` also those met in the walk; `-P` restores the default, and the last of
  the three wins. rm(1) takes none of them, and ls(1) differs.

A relative target is resolved from the link's own directory, so moving the
link can break it.
