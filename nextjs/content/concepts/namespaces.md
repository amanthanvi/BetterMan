---
slug: namespaces
title: Namespaces
term: namespaces
summary: How Linux gives a group of processes its own isolated view of a global resource, such as process IDs, mounts or the network; the basis of containers.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: namespaces(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Namespace types; The namespaces API; The /proc/pid/ns/ directory
  - page: pid_namespaces(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; The namespace init process
  - page: user_namespaces(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Nested namespaces, namespace membership
related: unshare(1), nsenter(1), lsns(8), clone(2), setns(2), unshare(2), cgroups(7), user_namespaces(7), pid_namespaces(7), network_namespaces(7), mount_namespaces(7)
aliases: namespace, linux namespaces, container, containers, pid namespace, network namespace, mount namespace, user namespace
references: namespaces(7), user_namespaces(7), pid_namespaces(7), network_namespaces(7), mount_namespaces(7), uts_namespaces(7), ipc_namespaces(7), cgroup_namespaces(7), time_namespaces(7)
---
A namespace wraps a global system resource so that the processes inside it
appear to have their own private copy. Changes made inside are visible to the
other members of the namespace and invisible to everyone else. Combining
several namespaces is how containers are built.

Linux has eight types, each isolating one resource:

- *Mount*: the mount points, so a process can see a different file tree.
- *PID*: process IDs; numbering starts again at 1 inside, and the first
  process becomes that namespace's init.
- *Network*: network devices, stacks and ports.
- *UTS*: the host name and NIS domain name.
- *IPC*: System V IPC objects and POSIX message queues.
- *User*: user and group IDs and capabilities, so a process can have user
  ID 0 inside while it is an ordinary user outside.
- *Cgroup*: the root directory of the [[cgroups|control group]] hierarchy.
- *Time*: the boot-time and monotonic clocks.

Every process belongs to one namespace of each type, and a child starts in its
parent's. unshare(1) runs a program in new namespaces, and nsenter(1) runs one
inside the namespaces of an existing process; lsns(8) lists them. Each
process's namespaces appear as links under `/proc/<pid>/ns/`, and two processes
share a namespace when those links point to the same object.

Creating most namespaces needs the `CAP_SYS_ADMIN` [[capabilities|capability]],
since the creator can then change resources other processes will see. User
namespaces are the exception: since Linux 3.8, any user may create one.

Namespaces are specific to Linux.
