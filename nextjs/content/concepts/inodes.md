---
slug: inodes
title: Inodes and file modes
term: inodes
summary: The record behind every file name, holding its type, owner, permission bits, size, link count and timestamps.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: inode(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION (inode fields; the file type and mode); NOTES
related: stat(1), ls(1), chmod(1), chown(1), stat(2), statx(2), symlink(7)
aliases: inode, inode number, file mode, file modes, permissions, file permissions, permission bits, setgid, sticky bit, mtime, ctime, atime
references: inode(7)
---
Each file has an *inode*, a record of everything about it except its name.
Directory entries map names to inode numbers, and a file can have several names
([[symbolic-links|hard links]]) that all lead to one inode. Inode numbers are
unique only within one file system, which is why hard links cannot cross file
systems. stat(1) shows what a file's inode holds.

An inode records:

- the file type and mode;
- the link count, the number of hard links;
- the owning user and group;
- the size in bytes and the blocks allocated;
- timestamps: last access (*atime*), last modification of the contents
  (*mtime*), and last status change (*ctime*), which changes whenever the
  inode itself changes, such as a new owner or mode. Some systems also keep a
  creation time.

The type says what the file is: a regular file, directory, symbolic link,
character or block device, FIFO or socket. The mode holds the permission bits
you set with chmod(1), written in octal. Read is 4, write 2 and execute 1, and
there is one digit each for the owner, the group and everyone else, so `0640`
lets the owner read and write, the group read, and others nothing.

Three more bits sit in front. *Set-user-ID* (4000) and *set-group-ID* (2000) on a
program make it run with the file's user or group ID. Set-group-ID on a
directory makes new files there take the directory's group. The *sticky* bit
(1000) on a directory lets only a file's owner, the directory's owner or a
privileged process rename or delete files in it.
