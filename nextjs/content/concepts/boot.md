---
slug: boot
title: The boot process
term: boot process
summary: What happens between power-on and a login prompt, from firmware and boot loader to the kernel, the initramfs and the first process.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: bootup(7)
    package: systemd 257.13-1~deb13u1
    distros: debian, ubuntu, fedora
    sections: DESCRIPTION; SYSTEM MANAGER BOOTUP
  - page: boot(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, arch, alpine
    sections: Hardware; OS loader; Kernel; Root user-space process; Boot scripts
related: systemd(1), init(1), systemctl(1), bootparam(7), kernel-command-line(7), systemd.special(7), systemd.target(5)
aliases: boot, booting, bootup, startup, boot sequence, init, initramfs, initrd, boot loader, bootloader, runlevel, default.target
references: bootup(7), boot(7), bootparam(7), kernel-command-line(7)
---
Booting a Linux system passes control along a short chain of programs.

1. After power-on, the *firmware* does minimal hardware set-up and hands
   control to a *boot loader*, such as GRUB or systemd-boot, on a storage
   device or the network. On EFI systems the firmware can also load the kernel
   directly.
2. The boot loader loads the *kernel*, and usually an *initramfs*, into memory.
   It can pass the kernel parameters, such as which file system is the root;
   bootparam(7) and kernel-command-line(7) list them.
3. The kernel initializes the hardware drivers and unpacks the initramfs, a
   compressed archive that serves as a temporary root file system. Its job is
   to find and mount the real root file system. The older name *initrd* is
   still used for it.
4. The kernel then starts the first user-space process, which has PID 1.
   Traditionally this runs `/sbin/init`; on many current distributions it is
   systemd(1), the system manager.
5. The system manager mounts the remaining file systems and starts the
   configured services.

On systemd systems the last step is organized into *targets*: named stages
such as `basic.target` and `multi-user.target`. At boot, systemd starts
everything `default.target` depends on, which is usually an alias for
`graphical.target` or `multi-user.target`. The work runs in parallel, so the
order is not fixed beyond the dependencies.

Older System V systems use *run levels* instead. init reads `/etc/inittab`
and runs start and stop scripts from `/etc/init.d` in the order set by links
in `/etc/rc?.d`. Shutdown runs the chain in reverse: services stop, file
systems are unmounted, and the machine powers off.
