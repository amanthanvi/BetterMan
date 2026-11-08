// Debian/Ubuntu man-db SECTION default:
// https://salsa.debian.org/debian/man-db/-/blob/master/debian/rules#L35 (--with-sections).
// man-db src/man.c compare_candidates: exact listed extensions, then their first
// character's section, then unlisted sections; lexical extension breaks ties.
// https://gitlab.com/man-db/man-db/-/blob/main/src/man.c
// A requested `3` also matches `3perl`/`3tcl`; exact `3` wins. BetterMan's explicit
// section URLs remain exact and do not implement man(1)'s section-prefix lookup.
const DEBIAN = "1 n l 8 3 0 2 3type 3posix 3pm 3perl 3am 5 4 9 6 7".split(" ");
// Fedora man-db.spec:67 (--with-sections):
// https://src.fedoraproject.org/rpms/man-db/blob/rawhide/f/man-db.spec#_67
const FEDORA = "1 1p 8 2 3 3p 3pm 4 5 6 7 9 0p n l p o 1x 2x 3x 4x 5x 6x 7x 8x".split(" ");
// Arch man-db/PKGBUILD:40; perl/PKGBUILD:186 uses -Dman3ext=3perl.
// https://gitlab.archlinux.org/archlinux/packaging/packages/man-db/-/blob/main/PKGBUILD#L40
// https://gitlab.archlinux.org/archlinux/packaging/packages/perl/-/blob/main/PKGBUILD#L186
const ARCH = "1 1p n l 8 3 3p 0 0p 2 3type 5 4 9 6 7".split(" ");
// Alpine uses mandoc 1.14.6: main.c:842-843 fs_search; :118 sec_prios and
// :522-538 rank candidates by their manN directory, adding 10 only for a suffixed
// directory (man3p/). Alpine installs every page into an unsuffixed manN/ (perl 3pm,
// man-pages-posix 1p/3p, openssl ossl), so ranking is by first digit; the exact
// name.1 sorting before name.1p matches mandoc's fs_search order.
// https://mandoc.bsd.lv/snapshots/mandoc-1.14.6.tar.gz (mandoc-1.14.6/main.c)
const ALPINE = "1 8 6 2 3 5 7 4 9".split(" ");
// https://github.com/freebsd/freebsd-src/blob/main/usr.bin/man/man.sh (man_default_sections)
const FREEBSD = "1 8 2 3 3lua n 4 5 6 7 9 l".split(" ");
// https://github.com/apple-oss-distributions/man/blob/main/man/man.conf (MANSECT)
const MACOS = "1 1p 8 2 3 3p 4 5 6 7 9 0p tcl n l p o".split(" ");

const ORDERS: Record<string, readonly string[]> = {
  debian: DEBIAN, ubuntu: DEBIAN, fedora: FEDORA, arch: ARCH,
  alpine: ALPINE, freebsd: FREEBSD, macos: MACOS,
};

/** Section preference only: package/provider selection remains the release's policy. */
export function compareManSections(distro: string, left: string, right: string): number {
  const order = ORDERS[distro] ?? DEBIAN;
  const rank = (section: string) => {
    if (distro === "alpine") {
      const base = order.indexOf(section[0]);
      return base < 0 ? order.length : base;
    }
    const exact = order.indexOf(section);
    const index = exact < 0 && distro !== "freebsd" && distro !== "macos" ? order.indexOf(section[0]) : exact;
    return index < 0 ? order.length : index;
  };
  return rank(left) - rank(right) || (left < right ? -1 : left > right ? 1 : 0);
}
