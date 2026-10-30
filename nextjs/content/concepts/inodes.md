---
slug: inodes
title: Inodes and file modes
term: inodes
summary: The record behind every file name, holding its type, owner, permission bits, size, link count and timestamps.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
sources:
  - page: inode(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION (inode fields; the file type and mode); NOTES
related: stat(1), ls(1), chmod(1), chown(1), stat(2), statx(2), symlink(7)
aliases: inode, inode number, file mode, file modes, file permissions, permission bits, sticky bit
references: inode(7)
---
Each file has an *inode*, a record of its metadata: type, owner, permissions,
size and timestamps. The name lives in a directory entry that points to the
inode number, and a file can have several names ([[symbolic-links|hard
links]]) that lead to one inode. Inode numbers are unique only within one file
system, which is why hard links cannot cross file systems; stat(1) shows an
inode. Besides the link count, it keeps three timestamps:

- *atime*, last access, which mount options or `O_NOATIME` can stop updating;
- *mtime*, last modification of the contents;
- *ctime*, last status change, set by writes and by changes to the inode
  itself, such as owner, link count or mode.

Most Linux file systems do not support a creation time.

The type says what the file is: a regular file, directory, symbolic link,
character or block device, FIFO or socket. The mode holds the permission bits
you set with chmod(1), in octal: read 4, write 2, execute 1, one digit each for
owner, group and others. `0640` lets the owner read and write, the group read,
and others nothing.

Three more bits sit in front. *Set-user-ID* (4000) and *set-group-ID* (2000) on
a program change the effective user or group ID of whoever runs it to the
file's. Set-group-ID on a directory makes new files there take its group. The
*sticky* bit (1000) on a directory lets only a file's owner, the directory's
owner or a privileged process rename or delete files in it.
