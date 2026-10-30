---
slug: scheduling
title: CPU scheduling and nice values
term: scheduling
summary: How Linux decides which thread runs next, what a nice value changes, and what the real-time policies are.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: sched(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Scheduling policies; SCHED_FIFO; SCHED_RR; SCHED_OTHER; The nice value; SCHED_BATCH; SCHED_IDLE; The autogroup feature; The nice value and group scheduling
related: nice(1), renice(1), chrt(1), taskset(1), nice(2), setpriority(2), sched_setscheduler(2)
aliases: sched, scheduler, nice, nice value, niceness, renice, priority, process priority, cpu priority, real-time, realtime, sched_fifo, sched_rr, chrt
references: sched(7)
---
The scheduler is the part of the kernel that decides which runnable thread
gets the CPU next. Each thread has a *scheduling policy*, and that policy
decides how much its priority and nice value count.

Most threads use the normal time-sharing policy, `SCHED_OTHER`. Among those,
the *nice value* sets the share of CPU time: it runs from -20, the highest
priority, to +19, the lowest, and 0 is the default. On current Linux each step
of difference makes the scheduler favour the higher-priority process by a
factor of 1.25. nice(1) starts a command with a different nice value,
and renice(1) changes a running one. An unprivileged process can make itself
nicer, but how far it may raise its priority is limited by `RLIMIT_NICE`.

Two related policies sit beside it. `SCHED_BATCH` is for noninteractive,
CPU-intensive work, and `SCHED_IDLE` is for jobs that should run only when
nothing else wants the CPU, lower even than nice +19.

The *real-time* policies, `SCHED_FIFO` and `SCHED_RR`, use a static priority
from 1 to 99 and always run before normal threads. A `SCHED_FIFO` thread keeps
the CPU until it blocks, yields, or is preempted by a higher priority;
`SCHED_RR` adds a time slice. A runaway real-time thread can starve the whole
system, so their use is limited by privileges and resource limits. chrt(1)
sets these policies.

One surprise: many distributions enable *autogrouping*, which groups the
processes of a session, typically one terminal window. A nice value then only
competes with processes in the same group.
