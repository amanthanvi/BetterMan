// Debian's man-db SECTION default (also used for BetterMan's other Linux distros):
// https://salsa.debian.org/debian/man-db/-/blob/master/debian/rules (--with-sections).
// man-db src/man.c compare_candidates: exact listed extensions, then their first
// character's section, then unlisted sections; lexical extension breaks ties.
// https://gitlab.com/man-db/man-db/-/blob/main/src/man.c
// A requested `3` also matches `3perl`/`3tcl`; exact `3` wins. BetterMan's explicit
// section URLs remain exact and do not implement man(1)'s section-prefix lookup.
const LINUX = "1 n l 8 3 0 2 3type 3posix 3pm 3perl 3am 5 4 9 6 7".split(" ");
// https://github.com/freebsd/freebsd-src/blob/main/usr.bin/man/man.sh (man_default_sections)
const FREEBSD = "1 8 2 3 3lua n 4 5 6 7 9 l".split(" ");
// https://github.com/apple-oss-distributions/man/blob/main/man/man.conf (MANSECT)
const MACOS = "1 1p 8 2 3 3p 4 5 6 7 9 0p tcl n l p o".split(" ");

/** Section preference only: package/provider selection remains the release's policy. */
export function compareManSections(distro: string, left: string, right: string): number {
  const order = distro === "freebsd" ? FREEBSD : distro === "macos" ? MACOS : LINUX;
  const rank = (section: string) => {
    const exact = order.indexOf(section);
    const index = exact < 0 && order === LINUX ? order.indexOf(section[0]) : exact;
    return index < 0 ? order.length : index;
  };
  return rank(left) - rank(right) || (left < right ? -1 : left > right ? 1 : 0);
}
