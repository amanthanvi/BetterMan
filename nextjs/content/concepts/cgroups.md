---
slug: cgroups
title: Control groups (cgroups)
term: cgroups
summary: How Linux organizes processes into a hierarchy of groups whose CPU, memory and other resource use can be limited and measured.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
sources:
  - page: cgroups(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Terminology; Cgroups version 1 and version 2; Creating cgroups and moving processes; CGROUPS VERSION 2; Cgroups v2 unified hierarchy; Cgroups v2 controllers; Cgroups v2 subtree control; Cgroups v2 "no internal processes" rule; NOTES; FILES
related: systemd-cgls(1), systemd-run(1), systemd.resource-control(5), cgroup_namespaces(7), namespaces(7)
aliases: cgroup, cgroups, control group, control groups, cgroup v2, cgroups v2, resource limits, cgroupfs
references: cgroups(7), cgroup_namespaces(7)
---
Control groups, usually called cgroups, let the kernel organize processes into
a tree of groups and then limit and measure the resources each group uses.

The parts that do the limiting are *controllers*, such as `cpu`, `memory`,
`io` and `pids`. Limits generally apply to the whole subtree beneath a group,
and a descendant cannot exceed a limit set higher up.

Version 1 gave each controller its own hierarchy. Version 2, official since
Linux 4.5, uses one unified hierarchy and implements a subset of the version 1
controllers. Both can be mounted at once, but not one controller in both.

Cgroups are managed through a file system:

- Each group is a directory; a subdirectory is a child group.
- Writing a PID into a group's `cgroup.procs` file moves that process into the
  group. In version 1, and in version 2 thread mode, the threads of one process
  can sit in different groups. A child starts in its parent's groups, unless created with clone3(2)
  `CLONE_INTO_CGROUP`.
- In version 2, `cgroup.subtree_control` chooses which controllers are active
  for a group's children. A group other than the root cannot both contain
  processes and enable controllers for its children.
- `/proc/<pid>/cgroup` shows which groups a process is in.

cgroups(7) says the usual place for version 1 mounts is under `/sys/fs/cgroup`,
and that "on many modern systems, systemd(1) automatically mounts the cgroup2
filesystem at /sys/fs/cgroup/unified during the boot process." Layouts vary
between systems.

[[namespaces|Namespaces]], their partner in containers, decide what a group
can see. Cgroups are specific to Linux.
