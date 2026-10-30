---
slug: scheduling
title: CPU scheduling and nice values
term: scheduling
summary: How Linux decides which thread runs next, what a nice value changes, and what the real-time policies are.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: sched(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Scheduling policies; SCHED_FIFO; SCHED_RR; SCHED_DEADLINE; SCHED_OTHER; The nice value; SCHED_BATCH; SCHED_IDLE; The autogroup feature; The nice value and group scheduling
related: nice(1), renice(1), chrt(1), taskset(1), nice(2), setpriority(2), sched_setscheduler(2)
aliases: sched, scheduler, cpu scheduling, nice value, niceness, process priority, cpu priority, real-time scheduling, sched_fifo, sched_rr, sched_deadline
references: sched(7)
---
The scheduler is the part of the kernel that decides which runnable thread
gets the CPU next. Each thread has a *scheduling policy*, and that policy
decides how much its priority and nice value count.

Most threads use the normal time-sharing policy, `SCHED_OTHER`. Among those,
the *nice value* sets the share of CPU time: it runs from -20, the highest
priority, to +19, the lowest, and 0 is the default. On Linux it belongs to
each thread, and each step of difference makes the scheduler favour the
higher-priority one by a factor of 1.25. nice(1) starts a command with a
different nice value, and renice(1) changes a running one. How far an
unprivileged process may raise its priority is limited by `RLIMIT_NICE`.

Beside it, `SCHED_BATCH` is for noninteractive,
CPU-intensive work, and `SCHED_IDLE` runs jobs at extremely low priority,
below even nice +19.

The *real-time* policies, `SCHED_FIFO` and `SCHED_RR`, use a static priority
from 1 to 99 and always run before normal threads. A `SCHED_FIFO` thread runs
until it blocks on I/O, yields, or is preempted by a higher priority;
`SCHED_RR` adds a time slice. `SCHED_DEADLINE`, since Linux 3.14, preempts all
of them. A runaway thread under these policies can starve the system,
so their use is limited by privileges and resource limits. chrt(1) sets them.

A nice value only competes within the thread's task group.
Threads in one CPU cgroup form a group, and many distributions enable
*autogrouping*, which groups a session's processes, typically one terminal
window.
