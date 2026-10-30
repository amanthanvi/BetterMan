---
slug: capabilities
title: Capabilities
term: capabilities
summary: How Linux splits the superuser's power into separate privileges, such as binding to a low port, that can be granted one at a time.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: capabilities(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Capabilities list; Thread capability sets; File capabilities; Capabilities and execution of programs by root; Set-user-ID-root programs that have file capabilities; The securebits flags: establishing a capabilities-only environment; NOTES
  - page: path_resolution(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Bypassing permission checks: superuser and capabilities
related: getcap(8), setcap(8), capsh(1), setpriv(1), credentials(7), user_namespaces(7)
aliases: capability, linux capabilities, cap_net_bind_service, cap_sys_admin, cap_net_raw, file capabilities
references: capabilities(7)
---
Traditional Unix has two kinds of process: privileged ones, whose effective
user ID is 0 (root), which bypass every kernel permission check, and everyone
else, who are checked in full. Linux splits root's power into separate units
called capabilities, which can be granted and dropped one at a time.

Some examples from capabilities(7):

- `CAP_NET_BIND_SERVICE` binds a socket to a port below 1024.
- `CAP_CHOWN` makes arbitrary changes to a file's owner and group.
- `CAP_DAC_OVERRIDE` bypasses file read, write and execute permission checks,
  but grants execute only if at least one of the file's execute bits is set.
- `CAP_KILL` bypasses the permission checks for sending [[signals]].
- `CAP_SYS_ADMIN` covers a long, overloaded list of administration tasks,
  such as mounting file systems.

Each thread holds several sets of capabilities. The *effective* set is what the
kernel checks; the *permitted* set limits what may become effective. A
capability dropped from the permitted set returns only by running a
set-user-ID-root program, or one whose file capabilities grant it.

An executable file can carry capabilities too, stored in an extended attribute
and set with setcap(8); getcap(8) shows them. By default the kernel still
treats root specially: a process whose real and effective user IDs are 0 gets,
when it runs a program, every capability not removed from its *bounding* set.
The *securebits* flags can turn that off. A set-user-ID-root program that has
file capabilities, run by a user whose real ID is not 0, gets only the file's
capabilities.

Capabilities are specific to Linux.
