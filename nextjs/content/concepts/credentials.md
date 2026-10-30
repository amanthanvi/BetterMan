---
slug: credentials
title: Process and user IDs
term: process and user IDs
summary: The numbers that identify a process, its parent, its job and session, and the user and group whose permissions it runs with.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
sources:
  - page: credentials(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Process ID (PID); Parent process ID (PPID); Process group ID and session ID; User and group identifiers
  - page: pid_namespaces(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: The namespace init process
related: id(1), ps(1), kill(1), getpid(2), getuid(2), setuid(2), execve(2), capabilities(7)
aliases: ppid, euid, user id, group id, process id, process group, set-user-id, real user id, effective user id
references: credentials(7)
---
Every process carries a set of numbers that say which process it is and whose
permissions it uses.

The *process ID* (PID) is assigned when the process is created and stays the
same when it runs a new program. The *parent process ID* (PPID) names its
current parent: initially the process that created it, but an orphaned process
gets a new parent.

Processes are also grouped for job control. The shell puts the processes of one
command or pipeline into a *process group*, or job: `ls | wc` is one job of two
processes. Process groups belong to a *session*, which shares one controlling
terminal. Only the foreground job may read from the terminal; when a
background process tries, its process group is sent the `SIGTTIN`
[[signals|signal]], which suspends the job.

A process also has user and group IDs:

- The *real* user and group ID say who owns the process.
- The *effective* IDs decide its permissions. They usually equal the real
  IDs, but running a set-user-ID program, such as one installed to run as root,
  changes the effective user ID to the file's owner.
- The *saved* set-user-ID keeps a copy, so such a program can drop its
  privileges and take them back.
- *Supplementary* group IDs add the other groups the user belongs to.

On Linux, file access is checked against separate filesystem IDs, which
normally follow the effective IDs. A child inherits all of these IDs from its
parent. id(1) prints the IDs of your shell.
