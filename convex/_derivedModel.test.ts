import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildOptionPortability, newInOptions, normalizeOptions, rankFlags, variantGroups,
} from "./_derivedModel";
import { DISTROS, type Distro } from "./lib";

const gnu = normalizeOptions([
  { anchorId: "c", flags: "-c, --create" },
  { anchorId: "x", flags: "-x, --extract, --get" },
  { anchorId: "L", flags: "-L, --tape-length", argument: "N" },
  { anchorId: "n", flags: "-n, --seek" },
  { anchorId: "sort", flags: "--sort", argument: "ORDER" },
]);
const bsd = normalizeOptions([
  { anchorId: "c", flags: "-c" },
  { anchorId: "x", flags: "-x" },
  { anchorId: "L", flags: "-L, --dereference" },
  { anchorId: "n", flags: "-n, --norecurse, --no-recursion" },
]);
const peers = [
  { distro: "debian" as const, options: gnu },
  { distro: "ubuntu" as const, options: gnu },
  { distro: "fedora" as const, options: gnu },
  { distro: "freebsd" as const, options: bsd },
  { distro: "macos" as const, options: bsd },
];

function state(anchor: string, distro: Distro) {
  return buildOptionPortability(gnu, peers, DISTROS, { name: "tar", section: "1", distro: "debian" })
    .find((row) => row.anchorId === anchor)?.distros.find((cell) => cell.distro === distro);
}

describe("derived option portability", () => {
  it("covers mode aliases in the real GNU tar golden rather than only a synthetic spelling", () => {
    const fixture = JSON.parse(readFileSync("ingestion/tests/fixtures/golden/tar.1.json", "utf8")) as { options: unknown };
    const source = normalizeOptions(fixture.options);
    const rows = buildOptionPortability(source, [{ distro: "macos", options: bsd }], ["macos"],
      { name: "tar", section: "1", distro: "debian" });
    expect(rows.find((row) => row.flags.includes("--create"))?.distros[0].state).toBe("available");
    expect(rows.find((row) => row.flags.includes("--extract"))?.distros[0].state).toBe("available");
    expect(rows.find((row) => row.flags.includes("-L"))?.distros[0].state).toBe("different");
    expect(rows.find((row) => row.flags.includes("--seek"))?.distros[0].state).toBe("different");
  });

  it("matches every alias of an option so create and extract also exist on bsdtar", () => {
    for (const distro of ["freebsd", "macos"] as const) {
      expect(state("c", distro)?.state).toBe("available");
      expect(state("x", distro)?.state).toBe("available");
      expect(state("sort", distro)?.state).toBe("absent");
    }
  });

  it("distinguishes argument arity and curated tar -n semantics without prose inference", () => {
    expect(state("L", "freebsd")).toMatchObject({ state: "different", reason: "argument-shape" });
    expect(state("n", "macos")).toMatchObject({ state: "different", reason: "known-tar-n-semantics" });
    expect(state("n", "fedora")?.state).toBe("available");
    const other = buildOptionPortability(gnu, peers, DISTROS, { name: "other", section: "1" });
    expect(other.find((row) => row.anchorId === "n")?.distros.find((cell) => cell.distro === "macos")?.state)
      .toBe("available");
  });

  it("supports bare BSD -n using the scoped platform rule in either direction", () => {
    const bare = normalizeOptions([{ flags: "-n", anchorId: "n" }]);
    const forward = buildOptionPortability(gnu, [{ distro: "freebsd", options: bare }], ["freebsd"],
      { name: "tar", section: "1", distro: "debian" });
    expect(forward.find((row) => row.anchorId === "n")?.distros[0].state).toBe("different");
    const reverse = buildOptionPortability(bare, [{ distro: "debian", options: gnu }], ["debian"],
      { name: "tar", section: "1", distro: "freebsd" });
    expect(reverse[0].distros[0].state).toBe("different");
  });

  it("keeps unknown releases and truncated peers distinct from an absent flag", () => {
    const rows = buildOptionPortability(gnu, [
      { distro: "debian", options: [] },
      { distro: "freebsd", options: bsd.slice(0, 1), truncated: true },
    ], DISTROS);
    expect(rows[0].distros.find((cell) => cell.distro === "debian")?.state).toBe("absent");
    expect(rows[0].distros.find((cell) => cell.distro === "freebsd")?.state).toBe("available");
    expect(rows[1].distros.find((cell) => cell.distro === "freebsd"))
      .toMatchObject({ state: "unknown", reason: "truncated-options" });
    expect(rows[0].distros.find((cell) => cell.distro === "macos"))
      .toMatchObject({ state: "unknown", reason: "no-active-release" });
  });

  it("uses a named GNU/Linux representative without mixing platform availability", () => {
    const rows = buildOptionPortability(gnu, [
      { distro: "debian", options: [] },
      { distro: "ubuntu", options: gnu },
      { distro: "alpine", options: gnu },
    ], DISTROS);
    expect(rows[0].systems[0]).toEqual({ system: "gnu-linux", distro: "debian", state: "absent" });
    const alpineOnly = buildOptionPortability(gnu, [{ distro: "alpine", options: gnu }], DISTROS);
    expect(alpineOnly[0].systems[0]).toEqual({ system: "gnu-linux", distro: null, state: "unknown", reason: "no-active-release" });
  });

  it("distinguishes an omitted manual page from a genuinely missing flag and chooses an included GNU page", () => {
    const rows = buildOptionPortability(gnu, [
      { distro: "debian", options: [], pagePresent: false },
      { distro: "fedora", options: gnu },
      { distro: "macos", options: [], pagePresent: false },
      { distro: "freebsd", options: [], inputAvailable: false },
    ], DISTROS);
    expect(rows[0].systems[0]).toEqual({ system: "gnu-linux", distro: "fedora", state: "available" });
    expect(rows[0].distros.find((d) => d.distro === "debian")).toMatchObject({ state: "page-unavailable" });
    expect(rows[0].systems[2]).toMatchObject({ state: "page-unavailable" });
    expect(rows[0].systems[1]).toMatchObject({ state: "unknown", reason: "input-unavailable" });
  });

  it("skips unavailable GNU inputs and never calls a present-but-unreadable GNU page absent", () => {
    const rows = buildOptionPortability(gnu, [
      { distro: "debian", options: [], inputAvailable: false },
      { distro: "ubuntu", options: gnu },
      { distro: "macos", options: gnu },
    ], DISTROS);
    expect(rows[0].systems[0]).toEqual({ system: "gnu-linux", distro: "ubuntu", state: "available" });
    const unavailable = buildOptionPortability(gnu, [
      { distro: "debian", options: [], inputAvailable: false },
      { distro: "ubuntu", options: [], pagePresent: false },
    ], DISTROS);
    expect(unavailable[0].systems[0]).toEqual({ system: "gnu-linux", distro: null, state: "unknown", reason: "input-unavailable" });
  });

  it("marks GNU tar compression-program -I versus BSD include-list -I as different only for tar", () => {
    const source = normalizeOptions([{ flags: "-I, --use-compress-program", anchorId: "I", argument: "COMMAND" }]);
    const target = normalizeOptions([{ flags: "-I", anchorId: "I", argument: "FILE", description: "Read filenames to include from FILE." }]);
    expect(buildOptionPortability(source, [{ distro: "freebsd", options: target }], ["freebsd"], { name: "tar", section: "1", distro: "debian" })[0].distros[0])
      .toMatchObject({ state: "different", reason: "known-tar-I-semantics" });
    expect(buildOptionPortability(source, [{ distro: "freebsd", options: target }], ["freebsd"], { name: "other", section: "1" })[0].distros[0].state).toBe("available");
  });

  it("compares argument shape, not placeholder spelling or description wording", () => {
    const source = normalizeOptions([
      { anchorId: "out", flags: "--output", argument: "FILE", description: "Write data." },
      { anchorId: "color", flags: "--color[=WHEN]" },
    ]);
    const target = normalizeOptions([
      { anchorId: "out", flags: "--output", argument: "PATH", description: "Select destination." },
      { anchorId: "color", flags: "--color", argument: "WHEN" },
    ]);
    const rows = buildOptionPortability(source, [{ distro: "macos", options: target }], ["macos"]);
    expect(rows[0].distros[0].state).toBe("available");
    expect(rows[1].distros[0]).toMatchObject({ state: "different", reason: "argument-shape" });
  });

  it("does not transitively merge options through a colliding short spelling", () => {
    const source = normalizeOptions([{ anchorId: "a", flags: "-a, --alpha" }]);
    const middle = normalizeOptions([{ anchorId: "other", flags: "-a, --beta" }]);
    const target = normalizeOptions([{ anchorId: "b", flags: "-b, --beta" }]);
    const rows = buildOptionPortability(source, [
      { distro: "ubuntu", options: middle }, { distro: "freebsd", options: target },
    ], ["ubuntu", "freebsd"]);
    expect(rows[0].distros.map((cell) => cell.state)).toEqual(["available", "absent"]);
  });
});

describe("derived option normalization and rankings", () => {
  it("reuses index spellings, expands bracket aliases, and preserves bare/symbolic flags", () => {
    expect(normalizeOptions([
      { flags: "--[no-]color", anchorId: "color" },
      { flags: "-ePATTERNS", anchorId: "e" },
      { flags: "--", anchorId: "separator" },
      { flags: "+/string", anchorId: "search" },
      { flags: "-<n>", anchorId: "number" },
      { flags: "ForwardAgent", anchorId: "directive" },
      null, { flags: "--bad" },
    ]).map((option) => option.flags)).toEqual([
      ["--color", "--no-color"], ["-e"], ["--"], ["+/string"], ["-<n>"],
    ]);
  });

  it("distinguishes optional numeric ranges from bracket-expanded flag aliases", () => {
    expect(normalizeOptions([
      { flags: "-i[4|6]", anchorId: "i" },
      { flags: "--[no-]color", anchorId: "color" },
      { flags: "--blank", argument: "[0-60|force|poke]", anchorId: "blank" },
      { flags: "--level", argument: "0-8", anchorId: "level" },
    ]).map((option) => option.argumentShape)).toEqual(["optional", "none", "optional", "required"]);
  });

  it("has no page-level 400 search-row cap and respects first flag ownership", () => {
    const options = normalizeOptions(Array.from({ length: 450 }, (_, i) => ({
      flags: `--flag-${i}`, anchorId: `f${i}`,
    })));
    expect(options).toHaveLength(450);
    expect(normalizeOptions([
      { flags: "-f, --file", anchorId: "first" },
      { flags: "-f, --force", anchorId: "second" },
    ]).map((option) => option.flags)).toEqual([["-f", "--file"], ["--force"]]);
  });

  it("marks only newly introduced options against a known previous release", () => {
    const previous = normalizeOptions([{ flags: "-c", anchorId: "old-c" }, { flags: "-x", anchorId: "old-x" }, { flags: "-L", anchorId: "old-L" }]);
    expect(newInOptions(gnu, null)).toEqual([]);
    expect(newInOptions(gnu, previous).map((option) => option.anchorId)).toEqual(["n", "sort"]);
    expect(newInOptions(gnu, [])).toEqual([]);
  });

  it("suppresses majority changes as restructures and allows additions up to half the current set", () => {
    expect(newInOptions(gnu, normalizeOptions([{ flags: "-c", anchorId: "old-c" }]))).toEqual([]);
    const current = normalizeOptions([{ flags: "-c, --create", anchorId: "c" }, { flags: "--new", anchorId: "new" }]);
    expect(newInOptions(current, normalizeOptions([{ flags: "-c", anchorId: "old-c" }]))).toEqual([{ anchorId: "new", flags: ["--new"] }]);
  });

  it("groups byte-identical variants and deduplicates distro membership", () => {
    expect(variantGroups([
      { distro: "debian", contentSha256: "gnu" },
      { distro: "ubuntu", contentSha256: "gnu" },
      { distro: "fedora", contentSha256: "gnu" },
      { distro: "freebsd", contentSha256: "bsd" },
      { distro: "macos", contentSha256: "bsd" },
      { distro: "debian", contentSha256: "gnu" },
    ])).toEqual([
      { contentSha256: "gnu", distros: ["debian", "ubuntu", "fedora"] },
      { contentSha256: "bsd", distros: ["freebsd", "macos"] },
    ]);
  });

  it("ranks verified alias frequencies with deterministic ties and provenance", () => {
    const result = rankFlags(gnu, [
      { flag: "--create", count: 2, source: "tldr" },
      { flag: "-c", count: 3, source: "examples" },
      { flag: "-x", count: 5, source: "examples" },
      { flag: "--unknown", count: 900, source: "tldr" },
      { flag: "-L", count: -1, source: "examples" },
    ]);
    expect(result).toEqual({ source: "verified-frequency", flags: [
      { flag: "-c", anchorId: "c", count: 5, sources: ["examples", "tldr"] },
      { flag: "-x", anchorId: "x", count: 5, sources: ["examples"] },
    ] });
    expect(rankFlags(gnu).source).toBe("manual-order");
    expect(rankFlags(gnu).flags.map((flag) => flag.flag)).toEqual(["-c", "-x", "-L", "-n", "--sort"]);
    expect(rankFlags(normalizeOptions(Array.from({ length: 10 }, (_, i) => ({
      flags: `--flag-${i}`, anchorId: `f${i}`,
    })))).flags).toHaveLength(8);
  });
});
