---
slug: path-resolution
title: Path resolution and permissions
term: path resolution
summary: How the kernel turns a path such as ../etc/passwd into a file, step by step, and which permission bits it checks on the way.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: path_resolution(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Step 1; Step 2; Step 3; . and ..; Mount points; Trailing slashes; Permissions; Bypassing permission checks
related: namei(1), realpath(1), chmod(1), chroot(2), stat(2), credentials(7), symlink(7), capabilities(7)
aliases: path, paths, pathname, pathnames, absolute path, relative path, permission denied, eacces, enoent, enotdir, search permission
references: path_resolution(7)
---
Whenever a program names a file, the kernel resolves the path one component at
a time.

A path that starts with `/` is *absolute* and starts at the process's root
directory, usually the root of the file system. Any other path is *relative*
and starts at the current working directory. Both are inherited from the
parent process.

Each component except the last must be a directory or a
[[symbolic-links|symbolic link]] to one. A symbolic link is resolved on the
way, up to 40 of them per path on Linux. The familiar errors come from this
walk:

- `ENOENT`, "No such file or directory": a component does not exist.
- `ENOTDIR`, "Not a directory": a component in the middle is something else.
- `EACCES`, "Permission denied": the process may not search a directory on
  the path.

Every directory has `.`, itself, and `..`, its parent; `/..` is `/`. A
trailing slash insists that the last component is a directory.

Permission bits come in three groups of three: read, write and execute. The
kernel uses the owner's group if the process's effective user ID owns the file,
the group's if the file's group is one of the process's groups, and otherwise
the last. For a directory, *execute* means permission to search it, which is
why a directory you cannot search blocks every path through it.

Root traditionally bypasses these checks. On Linux that power comes from the
[[capabilities]] `CAP_DAC_OVERRIDE` and `CAP_DAC_READ_SEARCH`; even so, a file is
executable only if at least one of its execute bits is set.
