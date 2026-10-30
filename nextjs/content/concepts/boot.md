---
slug: boot
title: The boot process
term: boot process
summary: What happens between power-on and a login prompt, from firmware and boot loader to the kernel, the initramfs and the system manager.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: bootup(7)
    package: systemd 257.13-1~deb13u1
    distros: debian, ubuntu, fedora
    sections: DESCRIPTION; SYSTEM MANAGER BOOTUP
  - page: boot(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, arch, alpine
    sections: Hardware; OS loader; Kernel; Root user-space process; Boot scripts; Sequencing directories
related: systemd(1), init(1), systemctl(1), bootparam(7), kernel-command-line(7), systemd.special(7), systemd.target(5)
aliases: boot, booting, bootup, boot sequence, initramfs, initrd, boot loader, bootloader, runlevel, default.target
references: bootup(7), boot(7), bootparam(7), kernel-command-line(7)
---
Booting a Linux system passes control along a short chain of programs.

1. After power-on, the *firmware* does minimal hardware set-up and hands
   control to a *boot loader*, such as GRUB or systemd-boot. On EFI and some
   other firmware, the firmware can load the kernel directly instead.
2. The boot loader or the firmware loads the *kernel* into memory and,
   optionally, an *initramfs*. Kernel parameters, such as which file system is
   the root, are listed in bootparam(7) and kernel-command-line(7).
3. The kernel unpacks the initramfs, a compressed archive used as a temporary
   root file system, and starts its first user-space program as PID 1. That
   early user space finds and mounts the real root file system. The older
   name *initrd* is still used for it. Without one, the kernel mounts the root
   itself and starts the init program there, traditionally `/sbin/init`.
4. Control passes to the host's system manager, often systemd(1), which mounts
   the remaining file systems and starts the configured services.

Under systemd this last step is organized into *targets*. At boot, systemd
starts everything `default.target` depends on, usually an alias for
`graphical.target` or `multi-user.target`, largely in parallel.

Older System V systems use *run levels*: init reads `/etc/inittab`, and scripts
in `/etc/init.d` run through links in `/etc/rc[0-6S].d`, `S` links with
`start` and `K` links with `stop`, in link-name order.

At shutdown, systemd stops the services, unmounts the file systems it can,
optionally hands over to an *exitrd* to detach the rest, and powers off.
