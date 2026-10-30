---
slug: namespaces
title: Namespaces
term: namespaces
summary: How Linux gives a group of processes its own isolated view of a global resource, such as process IDs, mounts or the network; the basis of containers.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: namespaces(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Namespace types; The namespaces API; The /proc/pid/ns/ directory
  - page: pid_namespaces(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; The namespace init process; Nesting PID namespaces
  - page: user_namespaces(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Nested namespaces, namespace membership; Interaction of user namespaces and other types of namespaces; NOTES
related: unshare(1), nsenter(1), lsns(8), clone(2), setns(2), unshare(2), cgroups(7), user_namespaces(7), pid_namespaces(7), network_namespaces(7), mount_namespaces(7)
aliases: namespace, linux namespaces, pid namespace, network namespace, mount namespace, user namespace
references: namespaces(7), user_namespaces(7), pid_namespaces(7), network_namespaces(7), mount_namespaces(7), uts_namespaces(7), ipc_namespaces(7), cgroup_namespaces(7), time_namespaces(7)
---
A namespace wraps a global system resource so that the processes inside it
appear to have their own private copy. Changes made inside are visible to the
other members and hidden from everyone else, though how far depends on the
type: a parent PID namespace, for one, still sees its children's processes.
Combining several namespaces is how containers are built.

Linux has eight types, each isolating one resource:

- *Mount*: the mount points, so a process can see a different file tree.
- *PID*: process IDs; numbering starts again at 1 inside, and the first
  process is that namespace's init. If it exits, the kernel kills the rest.
- *Network*: network devices, stacks and ports.
- *UTS*: the host name and NIS domain name.
- *IPC*: System V IPC objects and POSIX message queues.
- *User*: user and group IDs and capabilities, so a process can have user
  ID 0 inside while it is an ordinary user outside.
- *Cgroup*: the root directory of the [[cgroups|control group]] hierarchy.
- *Time*: the boot-time and monotonic clocks.

A child starts in its parent's namespaces. unshare(1) runs a program in new
namespaces, and nsenter(1) runs one inside the namespaces of an existing
process; lsns(8) lists them. A process's namespaces appear as links under
`/proc/<pid>/ns/`.

Creating most namespaces needs the `CAP_SYS_ADMIN` [[capabilities|capability]]
in the caller's user namespace. Since Linux 3.8 an unprivileged process can
create a user namespace, kernel support permitting, and other types in the same
call, because the user namespace is created first.

Namespaces are specific to Linux.
