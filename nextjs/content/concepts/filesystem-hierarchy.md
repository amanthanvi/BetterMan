---
slug: filesystem-hierarchy
title: The file system hierarchy
term: file system hierarchy
summary: What the standard top-level directories such as /etc, /usr, /var and /tmp are for.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
sources:
  - page: hier(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine, freebsd, macos
    sections: DESCRIPTION
  - page: file-hierarchy(7)
    package: systemd 257.13-1~deb13u1
    distros: debian, ubuntu, fedora
    sections: DESCRIPTION
related: systemd-path(1), mount(8), proc(5)
aliases: hier, fhs, filesystem hierarchy, file hierarchy, directory layout, directory structure
references: hier(7), file-hierarchy(7)
---
Unix-like systems arrange their files in one tree that starts at `/`, and most
of them follow the same plan for its top-level directories. hier(7) describes
it for Linux:

- `/etc`, configuration files local to the machine.
- `/bin` and `/sbin`, programs needed to bring the system up or repair it;
  `/sbin` holds those normal users seldom run.
- `/usr`, shareable, read-only data: `/usr/bin` is the main home of programs,
  `/usr/lib` of libraries, `/usr/share` of architecture-independent data such
  as manual pages, and `/usr/include` of C headers.
- `/usr/local`, programs installed locally by the site rather than by the
  distribution, with its own `bin`, `lib`, `etc` and `man`.
- `/var`, files that change in size: logs in `/var/log`, program state in
  `/var/lib`, caches in `/var/cache`, queues in `/var/spool`.
- `/tmp` and `/var/tmp`, temporary files; anything in `/tmp` may be deleted
  without notice, for example at boot, while `/var/tmp` keeps files for an
  unspecified duration.
- `/home`, users' home directories, and `/root`, the root user's.
- `/dev`, device files; `/proc` and `/sys`, file systems through which the
  kernel reports on processes and itself.
- `/boot`, the boot loader's static files; `/mnt` and `/media`, mount points
  for temporary and removable file systems; `/opt`, add-on packages; `/srv`,
  data this system serves.

The exact rules differ between systems. On systems that use systemd,
file-hierarchy(7) points to the current specification, and systemd-path(1)
answers where a given kind of file belongs. FreeBSD and macOS have hier(7)
pages of their own.
