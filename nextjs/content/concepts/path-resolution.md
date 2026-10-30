---
slug: path-resolution
title: Path resolution and permissions
term: path resolution
summary: How the kernel turns a path such as ../etc/passwd into a file, step by step, and which permission bits it checks on the way.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
sources:
  - page: path_resolution(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Step 1; Step 2; Step 3; . and ..; Mount points; Trailing slashes; Permissions; Bypassing permission checks
related: namei(1), realpath(1), chmod(1), chroot(2), stat(2), credentials(7), symlink(7), capabilities(7)
aliases: pathname, pathnames, path resolution, absolute path, relative path, permission denied, eacces, enoent, enotdir, search permission
references: path_resolution(7)
---
The kernel resolves a path one component at a time.

A path that starts with `/` is *absolute* and starts at the process's root
directory. Any other path is *relative*
and starts at the current working directory, or for openat(2)-style calls at
the directory given by a file descriptor. Both are inherited from the
parent process.

Each component except the last must be a directory or a
[[symbolic-links|symbolic link]] to one; Linux follows at most 40 links per
path. The familiar errors come from this walk:

- `ENOENT`, "No such file or directory": a component does not exist.
- `ENOTDIR`, "Not a directory": a component in the middle is something else.
- `EACCES`, "Permission denied": the process may not search a directory on
  the path.

`..` is the parent directory (`/..` is `/`), and a trailing slash insists that
the last component is a directory.

Permission bits come in three groups of three: read, write and execute. Linux
checks them against the process's filesystem user and group IDs, which
normally equal the effective IDs, and its supplementary groups. It uses the
owner's group if the process owns the file, the group's if it is in the file's
group, and otherwise the last. On a directory, *execute* means permission to
search it.

Root traditionally bypasses these checks. On Linux, `CAP_DAC_OVERRIDE`
overrides them, but grants execute only if at least one execute bit is set;
`CAP_DAC_READ_SEARCH` grants only read and search on directories and read on
ordinary files. See [[capabilities]].
