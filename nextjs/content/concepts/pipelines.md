---
slug: pipelines
title: Pipes and pipelines
term: pipes
summary: How cmd1 | cmd2 connects one command's output to the next one's input, and what pipes and FIFOs are underneath.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: bash(1)
    package: bash 5.2.37-2+b10
    distros: debian
    sections: SHELL GRAMMAR (Pipelines)
  - page: pipe(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; I/O on pipes and FIFOs; Pipe capacity; PIPE_BUF
  - page: fifo(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION
related: sh(1), mkfifo(1), tee(1), xargs(1), pipe(2), mkfifo(3)
aliases: pipe, pipes, pipeline, pipelines, piping, named pipe, named pipes, fifo, fifos, pipefail, sigpipe
references: pipe(7), fifo(7)
pages: bash(1), sh(1), dash(1)
---
A pipeline is a sequence of commands joined by `|`: in `ps ax | grep ssh`, the
standard output of ps(1) becomes the standard input of grep(1). Each command runs in its own subshell process, except that with the
`lastpipe` option and job control off, bash may run the last one itself. The
shell waits for all of them to finish.

- `|&` sends standard error through the pipe too; it is short for `2>&1 |`.
- The pipeline's [[exit-status|exit status]] is that of the *last* command.
  With `set -o pipefail` it is that of
  the rightmost command that failed, or zero if all succeeded.
- `!` before a pipeline inverts its exit status.

Underneath, a pipe is a one-way kernel channel carrying a plain byte stream.
It holds a limited amount: 16 pages by default on current Linux, adjustable
with fcntl(2); programs should not rely on any size. A writer
that fills it waits for the reader, or fails if nonblocking; a reader of an
empty pipe waits for data. When every writer has closed its end, the reader
sees end-of-file. When every reader has gone, a writer receives the `SIGPIPE`
[[signals|signal]], which by default ends it, or its write fails with `EPIPE`
if it ignores the signal. This is how `yes | head -1` stops.

A FIFO, or *named pipe*, works the same way but has a name in the file system,
so unrelated processes can use it; opening one normally blocks until the other
end is opened. See mkfifo(1).
