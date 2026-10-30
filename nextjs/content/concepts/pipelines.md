---
slug: pipelines
title: Pipes and pipelines
term: pipes
summary: How cmd1 | cmd2 connects one command's output to the next one's input, and what pipes and FIFOs are underneath.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: bash(1)
    package: bash 5.2.37-2+b10
    distros: debian
    sections: SHELL GRAMMAR (Pipelines)
  - page: pipe(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; I/O on pipes and FIFOs; Pipe capacity
  - page: fifo(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION
related: sh(1), mkfifo(1), tee(1), xargs(1), pipe(2), mkfifo(3)
aliases: pipe, pipes, pipeline, pipelines, piping, named pipe, named pipes, fifo, fifos, pipefail, sigpipe
references: pipe(7), fifo(7)
pages: bash(1), sh(1), dash(1)
---
A pipeline is a sequence of commands joined by `|`. In `ps ax | grep ssh`, the
standard output of ps(1) is connected through a pipe to the standard input of
grep(1). Each command of the pipeline runs in its own process, and the shell
waits for all of them to finish.

A few details from bash(1):

- `|&` sends standard error through the pipe too; it is short for `2>&1 |`.
- The pipeline's [[exit-status|exit status]] is that of the *last* command,
  so an earlier failure goes unnoticed. With `set -o pipefail` it is the status
  of the last command that failed, or zero if all succeeded.
- `!` before a pipeline inverts its exit status.

Underneath, a pipe is a one-way channel inside the kernel: bytes written to
one end are read from the other, as a plain byte stream with no message
boundaries. A pipe holds a limited amount of data (on Linux, 16 pages by
default: 65,536 bytes with 4 KiB pages); a writer that fills it waits until the reader catches up, and a
reader of an empty pipe waits for data. When every writer has closed its end,
the reader sees end-of-file. When every reader has gone, a writer receives the
`SIGPIPE` [[signals|signal]], which by default ends it; this is how
`yes | head -1` stops.

A FIFO, or *named pipe*, works the same way but has a name in the file system,
so unrelated processes can use it. mkfifo(1) creates one.
