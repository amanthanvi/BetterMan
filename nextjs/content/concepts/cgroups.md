---
slug: cgroups
title: Control groups (cgroups)
term: cgroups
summary: How Linux organizes processes into a hierarchy of groups whose CPU, memory and other resource use can be limited and measured.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: cgroups(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Terminology; Cgroups version 1 and version 2; Creating cgroups and moving processes; CGROUPS VERSION 2; Cgroups v2 controllers; Cgroups v2 subtree control; FILES
related: systemd-cgls(1), systemd-run(1), systemd.resource-control(5), cgroup_namespaces(7), namespaces(7)
aliases: cgroup, cgroups, control group, control groups, cgroup v2, cgroups v2, resource limits, cgroupfs
references: cgroups(7), cgroup_namespaces(7)
---
Control groups, usually called cgroups, let the kernel organize processes into
a tree of groups and then limit and measure the resources each group uses:
CPU time, memory, I/O, the number of processes, and more.

The parts that do the limiting are *controllers*, such as `cpu`, `memory`,
`io` and `pids`. A limit set on a group applies to everything beneath it in
the tree, and a child group cannot exceed its parent's limit.

There are two versions. Version 1 let each controller have its own separate
hierarchy. Version 2, official since Linux 4.5, puts every controller in one
unified hierarchy, and is meant to replace version 1, which remains for
compatibility.

Cgroups are managed through a file system, normally mounted under
`/sys/fs/cgroup`:

- Each group is a directory, and making a subdirectory creates a child group.
- Writing a PID into a group's `cgroup.procs` file moves that process, with
  all its threads, into the group. A process is in exactly one group of a
  hierarchy at a time, and a child starts in its parent's group.
- In version 2, `cgroup.subtree_control` chooses which controllers are active
  for a group's children.
- `/proc/<pid>/cgroup` shows which group a process is in.

On many systems, systemd(1) mounts this file system at boot and uses cgroups to
track services and user sessions, so its resource settings are often where you
set limits. Cgroups decide how much of a resource a group may use;
[[namespaces]], their usual partner in containers, decide what it can see.

Cgroups are specific to Linux.
