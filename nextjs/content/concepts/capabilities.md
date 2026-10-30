---
slug: capabilities
title: Capabilities
term: capabilities
summary: How Linux splits the superuser's power into separate privileges, such as binding to a low port, that can be granted one at a time.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: capabilities(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Capabilities list; Thread capability sets; File capabilities; Capabilities and execution of programs by root; NOTES
related: getcap(8), setcap(8), capsh(1), setpriv(1), credentials(7), user_namespaces(7)
aliases: capability, linux capabilities, cap_net_bind_service, cap_sys_admin, cap_net_raw, setcap, file capabilities
references: capabilities(7)
---
Traditional Unix has two kinds of process: privileged ones, whose effective
user ID is 0 (root), which bypass every kernel permission check, and everyone
else, who are checked in full. Linux splits root's power into separate units
called capabilities, which can be granted and dropped one at a time.

A few examples from the list in capabilities(7):

- `CAP_NET_BIND_SERVICE` binds a socket to a port below 1024.
- `CAP_CHOWN` makes arbitrary changes to a file's owner and group.
- `CAP_DAC_OVERRIDE` bypasses file read, write and execute permission checks.
- `CAP_KILL` bypasses the permission checks for sending [[signals]].
- `CAP_SYS_ADMIN` covers a long, overloaded list of administration tasks,
  such as mounting file systems.

Each thread holds several sets of capabilities. The *effective* set is what the
kernel checks; the *permitted* set limits what may become effective; a
capability dropped from the permitted set cannot be taken back without running
a privileged program. Other sets decide what survives running a new program.

An executable file can carry capabilities too, stored in an extended attribute
and set with setcap(8). That lets a program do one privileged thing, such as
listen on port 80, without running as root; getcap(8) shows a file's
capabilities. By default the kernel still treats root specially: a process
running as root that starts a program gets every capability not removed from
its *bounding* set.

Capabilities are specific to Linux.
