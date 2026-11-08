import { expect, it } from "vitest";
import { compareManSections } from "./_manSections";

it.each([
  ["tar", ["3tcl", "1"], "1"],
  ["ls", ["6", "1plan9", "1"], "1"],
  ["kill", ["2freebsd", "2", "1"], "1"],
  ["printf", ["3o", "3", "1"], "1"],
  ["time", ["3tcl", "2", "3am", "1"], "1"],
  ["open", ["2freebsd", "3perl", "2"], "2"],
])("orders Linux %s like man-db", (_name, sections, expected) => {
  for (const distro of ["debian", "ubuntu", "fedora", "arch", "alpine"]) {
    expect([...sections].sort((a, b) => compareManSections(distro, a, b))[0]).toBe(expected);
  }
});

it("uses the complete Debian SECTION order and exact extensions before unlisted suffixes", () => {
  const order = "1 1plan9 n l 8 3 3tcl 0 2 2freebsd 3type 3posix 3pm 3perl 3am 5 4 9 6 7 x z".split(" ");
  expect([...order].reverse().sort((a, b) => compareManSections("debian", a, b))).toEqual(order);
});

it.each([
  ["freebsd", "1 8 2 3 3lua n 4 5 6 7 9 l"],
  ["macos", "1 1p 8 2 3 3p 4 5 6 7 9 0p tcl n l p o"],
])("uses %s's MANSECT order", (distro, order) => {
  const sections = order.split(" ");
  expect([...sections].reverse().sort((a, b) => compareManSections(distro, a, b))).toEqual(sections);
});
