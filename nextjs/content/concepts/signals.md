---
slug: signals
title: Signals
term: signals
summary: How the kernel or another program tells a process to stop, pause, continue or quit, and what happens by default.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: signal(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Signal dispositions; Sending a signal; Signal mask and pending signals; Standard signals; Queueing and delivery semantics for standard signals
  - page: pid_namespaces(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: The namespace init process
  - page: bash(1)
    package: bash 5.2.37-2+b10
    distros: debian
    sections: SIGNALS; JOB CONTROL
related: kill(1), pkill(1), kill(2), sigaction(2), signal(2), sigprocmask(2)
aliases: signal, sigterm, sigkill, sigint, sighup, sigstop, sigpipe, signal handler
references: signal(7)
---
A signal is a short notification delivered to a process. The kernel sends some
itself, such as `SIGSEGV` after an invalid memory reference; others are sent by
a program, for example with kill(2), or by you with kill(1).

Each signal has a *disposition* that decides what happens when it arrives. The
default action is one of five: terminate the process, terminate it and dump
core, ignore the signal, stop (pause) the process, or continue a stopped one. A
program can change the disposition with sigaction(2): keep the default, ignore
the signal, or catch it in a handler of its own. `SIGKILL` and `SIGSTOP` are the
exceptions; they cannot be caught, blocked or ignored.

Signals you meet most often:

- `SIGINT`, interrupt from the keyboard (usually Ctrl-C), and `SIGTERM`, a
  termination request.
  Both terminate by default, but a program may catch them and clean up first.
- `SIGKILL` always ends the process, though the init process (PID 1) of a
  PID namespace has special delivery rules.
- `SIGHUP`, a hangup on the controlling terminal or the death of the
  controlling process.
- `SIGTSTP`, stop typed at the terminal (usually Ctrl-Z), and `SIGSTOP` pause
  a process; `SIGCONT` lets it continue.
- `SIGPIPE`, a write to a pipe that has no readers.

A process can also *block* a signal. A blocked signal stays pending until it
is unblocked, and standard signals do not queue: several copies that arrive
while blocked are delivered once. Signal numbers differ between architectures,
so names are the portable way to refer to them.
