/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { briefFromRecord, GENERATED_CONTRACT_VERSION, GENERATED_LIMITS, generationDoc } from "./_generatedLayer";
import { serializeStoredPayload } from "./_storedPayload";
import { decodeSummary } from "./_derivedEncoding";
import { persistOptionSignature } from "./_derivedInputs";
import type { Distro } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;

beforeEach(() => vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

const TAR = "a".repeat(64);
const BSDTAR = "b".repeat(64);
const COMMIT = "f4566462f5996e13a4f3523f21dc2a863aec53c1";

const tarOptions = [
  { flags: "-c, --create", anchorId: "c", description: "Create a new archive." },
  { flags: "-x, --extract", anchorId: "x", description: "Extract files." },
  { flags: "-f, --file", argument: "ARCHIVE", anchorId: "f", description: "Use archive file." },
];

function call(t: Harness, path: string, body?: unknown, method = "POST", secret = "test-secret") {
  return t.fetch(path, {
    method,
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function release(ctx: MutationCtx, distro: Distro, stage: "prod" | "staging" = "prod") {
  const datasetReleaseId = `${distro}-${stage}`;
  const releaseId = await ctx.db.insert("datasetReleases", {
    datasetReleaseId, locale: "en", distro, imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-10-26T00:00:00Z", pageCount: 0, sealed: true,
  });
  await ctx.db.insert("activeReleases", {
    stage, locale: "en", distro, releaseId, datasetReleaseId, activatedAt: "2026-10-26T00:00:00Z",
  });
  return releaseId;
}

async function storedPage(
  ctx: MutationCtx,
  releaseId: Id<"datasetReleases">,
  distro: Distro,
  name: string,
  contentSha256: string,
  section = "1",
) {
  const pageId = await ctx.db.insert("manPages", {
    releaseId, datasetReleaseId: `${distro}-prod`, externalId: `${distro}:${name}.${section}`,
    locale: "en", distro, name, section, sitemapPage: 0, title: `${name}(${section})`,
    description: `${name} archiver`, sourcePath: `/man/${name}.${section}`, sourcePackage: "tar",
    contentSha256, hasParseWarnings: false,
  });
  const storageId = await ctx.storage.store(new Blob([serializeStoredPayload(contentSha256, {
    docJson: JSON.stringify({ toc: [], blocks: [{ type: "heading", id: "description", level: 2, text: "DESCRIPTION" }] }),
    synopsisJson: JSON.stringify([`${name} [OPTION...] [FILE]...`]),
    optionsJson: JSON.stringify(tarOptions),
  })]));
  const blobId = await ctx.db.insert("manPageContentBlobs", { contentSha256, storageId });
  await ctx.db.insert("manPageContents", { pageId, blobId, contentSha256 });
  return pageId;
}

const example = (command: string, description = "do it") => ({ command, description });

const TLDR_ATTRIBUTION = {
  name: "tldr-pages",
  url: `https://github.com/tldr-pages/tldr/blob/${COMMIT}/pages/common/tar.md`,
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  modified: "Placeholders converted (alternatives shown as the first choice); examples filtered by flag verification against this manual.",
};

function record(contentSha256 = TAR) {
  return {
    contentSha256,
    tldrCommit: COMMIT,
    page: { examples: [example("tar -cf a.tar dir", "")], flagUsage: [{ flag: "-c", count: 1 }, { flag: "-f", count: 1 }] },
    tldr: {
      commit: COMMIT,
      path: "common/tar.md",
      examples: [
        { description: "Extract an archive", command: "tar xf path/to/source.tar", placeholders: [[7, 25]] },
        example("tar cf path/to/target.tar path/to/file"),
      ],
      rejected: 1,
      flagUsage: [{ flag: "-x", count: 1 }],
    },
    generated: {
      provider: "opencode-go",
      model: "deepseek-v4.1-flash",
      promptVersion: "b6-v1",
      generatedAt: "2026-10-28",
      summary: "Creates, lists and extracts files in tape or disk archives.",
      examples: [example("tar --create --file a.tar dir", "Create an archive from a directory")],
      taskPhrases: ["extract a tar file", "create a tar archive", "list archive contents"],
      rejected: 2,
    },
  };
}

describe("generated layer ingest routes", () => {
  it("advertises its own contract behind the ingest secret", async () => {
    const t = convexTest(schema, modules);
    expect((await call(t, "/ingest/generated/contract", undefined, "GET", "wrong")).status).toBe(401);
    const response = await call(t, "/ingest/generated/contract", undefined, "GET");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: GENERATED_CONTRACT_VERSION,
      routes: ["/ingest/generated/candidates", "/ingest/generated/inputs", "/ingest/generated", "/ingest/generated/flag-usage"],
    });
  });

  it("inserts by content hash and keeps parts a later upsert leaves out", async () => {
    const t = convexTest(schema, modules);
    const first = await call(t, "/ingest/generated", { records: [record()] });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ inserted: 1, updated: 0 });

    const { generated: _paid, ...refresh } = record();
    void _paid;
    refresh.tldr = { ...refresh.tldr, rejected: 0 };
    const second = await call(t, "/ingest/generated", { records: [refresh] });
    expect(await second.json()).toEqual({ inserted: 0, updated: 1 });

    const rows = await t.run((ctx) => ctx.db.query("manPageGenerated").take(5));
    expect(rows).toHaveLength(1);
    expect(rows[0].tldr?.rejected).toBe(0);
    expect(rows[0].generated?.summary).toMatch(/^Creates/);
  });

  it.each([
    ["a short hash", { ...record(), contentSha256: "abc" }],
    ["no parts", { contentSha256: TAR }],
    ["six tldr examples", { ...record(), tldr: { ...record().tldr, examples: Array(6).fill(example("tar -x")) } }],
    ["a placeholder past the command", { ...record(), tldr: { ...record().tldr, examples: [{ ...example("tar xf a"), placeholders: [[7, 99]] }] } }],
    ["overlapping placeholders", { ...record(), tldr: { ...record().tldr, examples: [{ ...example("tar xf abc"), placeholders: [[7, 9], [8, 10]] }] } }],
    ["a multi-line generated command", { ...record(), generated: { ...record().generated, examples: [example("tar -x\nrm -rf /")] } }],
    ["a generated date with a time", { ...record(), generated: { ...record().generated, generatedAt: "2026-10-28T00:00:00Z" } }],
    ["a model label with spaces", { ...record(), generated: { ...record().generated, model: "deep seek" } }],
    ["six task phrases", { ...record(), generated: { ...record().generated, taskPhrases: Array(6).fill("extract a file") } }],
    ["a short tldr commit", { ...record(), tldr: { ...record().tldr, commit: "f4566462" } }],
    ["a short checked tldr commit", { ...record(), tldrCommit: "f4566462" }],
    ["a tldr path outside pages", { ...record(), tldr: { ...record().tldr, path: "../secrets.md" } }],
    ["a zero flag count", { ...record(), page: { ...record().page, flagUsage: [{ flag: "-c", count: 0 }] } }],
    ["a NUL in a summary", { ...record(), generated: { ...record().generated, summary: "Lists\u0000 files for the user." } }],
    ["an escape in a command", { ...record(), generated: { ...record().generated, examples: [example("tar -tf archive\u001b.tar")] } }],
    ["a bidi override in a task phrase", { ...record(), generated: { ...record().generated, taskPhrases: ["list\u202e files", "a b", "c d"] } }],
    ["an isolate in a tldr description", { ...record(), tldr: { ...record().tldr, examples: [example("tar xf a", "x\u2066y")] } }],
    ["DEL in a page command", { ...record(), page: { ...record().page, examples: [example("tar -x\u007f", "")] } }],
    ["a C1 control in a description", { ...record(), generated: { ...record().generated, examples: [example("tar -x", "a\u0085b")] } }],
    ["a line separator", { ...record(), generated: { ...record().generated, summary: "Lists files\u2028 for the user." } }],
    ["a tab in a generated command", { ...record(), generated: { ...record().generated, examples: [example("tar\t-x")] } }],
  ])("rejects a record with %s and writes nothing", async (_name, bad) => {
    const t = convexTest(schema, modules);
    const response = await call(t, "/ingest/generated", { records: [record(BSDTAR), bad] });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_GENERATED_RECORD" } });
    expect(await t.run((ctx) => ctx.db.query("manPageGenerated").take(1))).toEqual([]);
  });

  it("rejects oversized and duplicate batches", async () => {
    const t = convexTest(schema, modules);
    const many = Array.from({ length: GENERATED_LIMITS.recordsPerRequest + 1 }, (_, i) =>
      record(i.toString(16).padStart(64, "0")));
    expect((await call(t, "/ingest/generated", { records: many })).status).toBe(400);
    expect((await call(t, "/ingest/generated", { records: [record(), record()] })).status).toBe(400);
    expect((await call(t, "/ingest/generated", { records: "nope" })).status).toBe(400);
  });

  it("lists a section with each page's generated state, page by page", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const releaseId = await release(ctx, "debian", "staging");
      await storedPage(ctx, releaseId, "debian", "tar", TAR);
      await storedPage(ctx, releaseId, "debian", "cpio", BSDTAR);
      await storedPage(ctx, releaseId, "debian", "tar.conf", "c".repeat(64), "5");
    });
    await call(t, "/ingest/generated", { records: [record()] });
    const first = await (await call(t, "/ingest/generated/candidates", {
      stage: "staging", distro: "debian", section: "1", cursor: null, limit: 1,
    })).json();
    expect(first.items).toEqual([{
      name: "cpio", section: "1", contentSha256: BSDTAR, sourcePackage: "tar",
      hasRecord: false, promptVersion: null, tldrCommit: null, suppressed: [], flagUsageCurrent: true,
    }]);
    expect(first.isDone).toBe(false);
    const second = await (await call(t, "/ingest/generated/candidates", {
      stage: "staging", distro: "debian", section: "1", cursor: first.continueCursor, limit: 1,
    })).json();
    expect(second.items[0]).toMatchObject({ name: "tar", hasRecord: true, promptVersion: "b6-v1", tldrCommit: COMMIT });

    const missing = await call(t, "/ingest/generated/candidates", {
      stage: "prod", distro: "debian", section: "1", cursor: null, limit: 10,
    });
    expect(missing.status).toBe(404);
  });

  it("returns bounded generation inputs from stored content", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const releaseId = await release(ctx, "debian", "staging");
      await storedPage(ctx, releaseId, "debian", "tar", TAR);
    });
    const response = await call(t, "/ingest/generated/inputs", {
      stage: "staging", distro: "debian", pages: [{ name: "tar", section: "1" }, { name: "absent", section: "1" }],
    });
    const body = await response.json();
    expect(body.pages).toHaveLength(1);
    expect(body.deferred).toEqual([]);
    expect(body.skipped).toEqual([]);
    expect(body.pages[0]).toMatchObject({
      name: "tar", section: "1", contentSha256: TAR, description: "tar archiver",
      synopsis: ["tar [OPTION...] [FILE]..."], options: tarOptions,
    });
    expect(body.pages[0].doc.blocks[0].text).toBe("DESCRIPTION");

    const tooMany = Array.from({ length: GENERATED_LIMITS.inputsPerRequest + 1 }, () => ({ name: "tar", section: "1" }));
    expect((await call(t, "/ingest/generated/inputs", { stage: "staging", distro: "debian", pages: tooMany })).status).toBe(400);
  });
});

describe("plain text", () => {
  it("keeps markup as inert text and lets manual examples keep line feeds", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await storedPage(ctx, await release(ctx, "debian"), "debian", "tar", TAR);
    });
    const markup = "<img src=x onerror=alert(1)> & <script>alert(1)</script>";
    const response = await call(t, "/ingest/generated", { records: [{
      contentSha256: TAR,
      page: { examples: [example("$ tar -cf a.tar dir\n$ tar -tf a.tar > list", markup)], flagUsage: [] },
    }] });
    expect(response.status).toBe(200);
    const result = await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "tar", section: "1" }) as {
      data: { brief: { examples: Array<{ description: string; command: string }> } };
    };
    expect(result.data.brief.examples[0]).toMatchObject({
      description: markup, command: "$ tar -cf a.tar dir\n$ tar -tf a.tar > list",
    });
  });
});

describe("input response size", () => {
  async function seedPages(t: Harness, sizes: number[]) {
    await t.run(async (ctx) => {
      const releaseId = await release(ctx, "debian", "staging");
      for (const [index, size] of sizes.entries()) {
        const sha = index.toString(16).padStart(64, "0");
        const pageId = await ctx.db.insert("manPages", {
          releaseId, datasetReleaseId: "debian-staging", externalId: `p${index}`, locale: "en", distro: "debian",
          name: `p${index}`, section: "1", sitemapPage: 0, title: `p${index}(1)`, description: "x",
          sourcePath: `/man/p${index}.1`, contentSha256: sha, hasParseWarnings: false,
        });
        // Multi-byte text: UTF-16 length undercounts its UTF-8 bytes.
        const doc = { toc: [], blocks: [
          { type: "heading", id: "d", level: 2, text: "DESCRIPTION" },
          { type: "paragraph", inlines: [{ type: "text", text: "é".repeat(size) }] },
        ] };
        const storageId = await ctx.storage.store(new Blob([serializeStoredPayload(sha, { docJson: JSON.stringify(doc) })]));
        const blobId = await ctx.db.insert("manPageContentBlobs", { contentSha256: sha, storageId });
        await ctx.db.insert("manPageContents", { pageId, blobId, contentSha256: sha });
      }
    });
  }

  it("skips a single page that cannot fit and says why", async () => {
    const t = convexTest(schema, modules);
    await seedPages(t, [GENERATED_LIMITS.inputResponseBytes + 1024]);
    const response = await call(t, "/ingest/generated/inputs", {
      stage: "staging", distro: "debian", pages: [{ name: "p0", section: "1" }],
    });
    expect(response.status).toBe(200);
    const raw = new Uint8Array(await response.arrayBuffer());
    expect(raw.byteLength).toBeLessThanOrEqual(GENERATED_LIMITS.inputResponseBytes);
    const body = JSON.parse(new TextDecoder().decode(raw));
    expect(body.pages).toEqual([]);
    expect(body.skipped).toEqual([{ name: "p0", section: "1", reason: "input too large", bytes: expect.any(Number) }]);
  });

  it("defers pages that would push the UTF-8 response past the limit", async () => {
    const t = convexTest(schema, modules);
    // Each page is about 3.2 MB of UTF-8 but only 1.6 M UTF-16 units.
    const third = Math.floor(GENERATED_LIMITS.inputResponseBytes / 5);
    await seedPages(t, [third, third, third]);
    const response = await call(t, "/ingest/generated/inputs", {
      stage: "staging", distro: "debian", pages: [0, 1, 2].map((i) => ({ name: `p${i}`, section: "1" })),
    });
    const raw = new Uint8Array(await response.arrayBuffer());
    expect(raw.byteLength).toBeLessThanOrEqual(GENERATED_LIMITS.inputResponseBytes);
    const body = JSON.parse(new TextDecoder().decode(raw));
    expect(body.pages.map((page: { name: string }) => page.name)).toEqual(["p0", "p1"]);
    expect(body.deferred).toEqual([{ name: "p2", section: "1" }]);
  });
});

describe("tldr freshness", () => {
  it("reports the checked tldr commit for pages tldr does not cover", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await storedPage(ctx, await release(ctx, "debian", "staging"), "debian", "tar", TAR);
    });
    await call(t, "/ingest/generated", {
      records: [{ contentSha256: TAR, tldrCommit: COMMIT, page: { examples: [], flagUsage: [] } }],
    });
    const { items } = await (await call(t, "/ingest/generated/candidates", {
      stage: "staging", distro: "debian", section: "1", cursor: null, limit: 5,
    })).json();
    expect(items[0]).toMatchObject({ hasRecord: true, tldrCommit: COMMIT, promptVersion: null });
  });
});

describe("suppression", () => {
  it("removes a part, keeps it out of later uploads and reports it to the generator", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const releaseId = await release(ctx, "debian", "staging");
      await storedPage(ctx, releaseId, "debian", "tar", TAR);
    });
    await call(t, "/ingest/generated", { records: [record()] });
    await t.mutation(internal.generated.suppressParts, { contentSha256: TAR, parts: ["generated"] });
    await call(t, "/ingest/generated", { records: [record()] });
    const [row] = await t.run((ctx) => ctx.db.query("manPageGenerated").take(2));
    expect(row.generated).toBeUndefined();
    expect(row.tldr?.path).toBe("common/tar.md");
    expect(row.suppressed).toEqual(["generated"]);
    const { items } = await (await call(t, "/ingest/generated/candidates", {
      stage: "staging", distro: "debian", section: "1", cursor: null, limit: 5,
    })).json();
    expect(items[0]).toMatchObject({ promptVersion: null, suppressed: ["generated"] });
  });
});

describe("man page read path", () => {
  async function seeded() {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await storedPage(ctx, await release(ctx, "debian"), "debian", "tar", TAR);
      // Ubuntu ships the identical page, so it shares the row.
      await storedPage(ctx, await release(ctx, "ubuntu"), "ubuntu", "tar", TAR);
      await storedPage(ctx, await release(ctx, "macos"), "macos", "tar", BSDTAR);
    });
    await call(t, "/ingest/generated", { records: [record()] });
    return t;
  }

  it("serves page, tldr and generated examples in order with provenance", async () => {
    const t = await seeded();
    const result = await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "tar", section: "1" }) as {
      data: { brief: ReturnType<typeof briefFromRecord> };
    };
    expect(result.data.brief).toEqual({
      summary: "Creates, lists and extracts files in tape or disk archives.",
      examples: [
        { source: "page", command: "tar -cf a.tar dir", description: "" },
        { source: "tldr", command: "tar xf path/to/source.tar", description: "Extract an archive", placeholders: [[7, 25]], attribution: TLDR_ATTRIBUTION },
        { source: "tldr", command: "tar cf path/to/target.tar path/to/file", description: "do it", attribution: TLDR_ATTRIBUTION },
        { source: "generated", command: "tar --create --file a.tar dir", description: "Create an archive from a directory" },
      ],
      taskPhrases: ["extract a tar file", "create a tar archive", "list archive contents"],
      tldr: {
        path: "common/tar.md", commit: COMMIT, license: "CC-BY-4.0",
        url: `https://github.com/tldr-pages/tldr/blob/${COMMIT}/pages/common/tar.md`,
      },
      generated: { provider: "opencode-go", model: "deepseek-v4.1-flash", promptVersion: "b6-v1", generatedAt: "2026-10-28" },
    });
    const ubuntu = await t.action(api.content.getManByName, { distro: "ubuntu", name: "tar" }) as {
      data: { brief: unknown };
    };
    expect(ubuntu.data.brief).toEqual(result.data.brief);
  });

  it("omits the brief for a variant with a different hash", async () => {
    const t = await seeded();
    const result = await t.action(api.content.getManByNameAndSection, { distro: "macos", name: "tar", section: "1" }) as {
      data: { brief: unknown };
    };
    expect(result.data.brief).toBeNull();
  });
});

describe("generationDoc", () => {
  it("keeps only DESCRIPTION and EXAMPLES with their subsections", () => {
    const heading = (text: string, level = 2) => ({ type: "heading", id: text, level, text });
    const para = (text: string) => ({ type: "paragraph", inlines: [{ type: "text", text }] });
    const doc = {
      toc: [{ id: "x", title: "x", level: 2 }],
      blocks: [
        heading("NAME"), para("name"),
        heading("Description"), para("what"), heading("Details", 3), para("more"),
        heading("OPTIONS"), para("options"),
        heading("EXAMPLES"), { type: "code_block", text: "tar -xf a.tar" },
        heading("SEE ALSO"), para("see"),
      ],
    };
    expect(generationDoc(doc).blocks.map((b) => (b as { text?: string }).text ?? (b as { inlines: Array<{ text: string }> }).inlines?.[0].text))
      .toEqual(["Description", "what", "Details", "more", "EXAMPLES", "tar -xf a.tar"]);
    expect(generationDoc(null)).toEqual({ toc: [], blocks: [] });
  });
});

describe("briefFromRecord", () => {
  const row = (parts: Record<string, unknown>) => ({
    _id: "x" as never, _creationTime: 0, contentSha256: TAR, updatedAt: "2026-10-28T00:00:00Z", ...parts,
  });

  it("caps examples at five and drops tldr attribution when none of its examples show", () => {
    const pageExamples = Array.from({ length: 5 }, (_, i) => example(`tar -c ${i}`));
    const brief = briefFromRecord(row({
      page: { examples: pageExamples, flagUsage: [] },
      tldr: { ...record().tldr },
    }) as never);
    expect(brief?.examples).toHaveLength(5);
    expect(brief?.examples.every((item) => item.source === "page")).toBe(true);
    expect(brief?.tldr).toBeNull();
    expect(brief?.summary).toBeNull();
    expect(brief?.generated).toBeNull();
  });

  it("returns null when a row has nothing to show", () => {
    expect(briefFromRecord(row({ page: { examples: [], flagUsage: [{ flag: "-c", count: 1 }] } }) as never)).toBeNull();
    expect(briefFromRecord(null)).toBeNull();
  });
});

describe("B7 flag usage", () => {
  afterEach(() => vi.useRealTimers());

  async function usageOf(t: Harness, distro: Distro) {
    return await t.run(async (ctx) => {
      const pages = await ctx.db.query("manPages").withIndex("by_contentSha256", (q) => q.eq("contentSha256", TAR)).take(10);
      return pages.find((page) => page.distro === distro)?.verifiedFlagUsage;
    });
  }

  it("hands verified EXAMPLES and tldr counts to every page with the hash", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await storedPage(ctx, await release(ctx, "debian", "staging"), "debian", "tar", TAR);
      const pruning = await release(ctx, "ubuntu", "staging");
      await ctx.db.patch(pruning, { pruning: true });
      await storedPage(ctx, pruning, "ubuntu", "tar", TAR);
    });
    expect((await call(t, "/ingest/generated", { records: [record()] })).status).toBe(200);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await usageOf(t, "debian")).toEqual([
      { flag: "-c", count: 1, source: "examples" },
      { flag: "-f", count: 1, source: "examples" },
      { flag: "-x", count: 1, source: "tldr" },
    ]);
    // A release being pruned is left alone; generated examples never count.
    expect(await usageOf(t, "ubuntu")).toBeNull(); // t.run returns undefined as null
    const { items } = await (await call(t, "/ingest/generated/candidates", {
      stage: "staging", distro: "debian", section: "1", cursor: null, limit: 5,
    })).json();
    expect(items[0]).toMatchObject({ name: "tar", flagUsageCurrent: true });
  });

  it("lets a later run refresh a new release's page with an unchanged hash", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await storedPage(ctx, await release(ctx, "debian", "staging"), "debian", "tar", TAR);
      // Already stored before this release existed: no upload will happen.
      await ctx.db.insert("manPageGenerated", {
        contentSha256: TAR, updatedAt: "2026-10-28T00:00:00Z",
        tldr: { ...record().tldr },
      });
    });
    const before = await (await call(t, "/ingest/generated/candidates", {
      stage: "staging", distro: "debian", section: "1", cursor: null, limit: 5,
    })).json();
    expect(before.items[0].flagUsageCurrent).toBe(false);
    const response = await call(t, "/ingest/generated/flag-usage", { contentSha256s: [TAR] });
    expect(await response.json()).toEqual({ scheduled: 1, continued: false });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await usageOf(t, "debian")).toEqual([{ flag: "-x", count: 1, source: "tldr" }]);
    // Nothing is rescheduled once the page is current.
    expect(await (await call(t, "/ingest/generated/flag-usage", { contentSha256s: [TAR] })).json())
      .toEqual({ scheduled: 0, continued: false });
  });
});

describe("B7 propagation at scale and after suppression", () => {
  afterEach(() => vi.useRealTimers());
  const finish = (t: Harness) => t.finishAllScheduledFunctions(() => vi.runAllTimers(), 10_000);

  it("schedules the largest supported batch within Convex's per-mutation limit", async () => {
    vi.useFakeTimers();
    // Round-2 re-check of #434: 25 hashes x 64 pages is 1,600 updates.
    const t = convexTest({ schema, modules, transactionLimits: { functionsScheduled: 1000 } });
    const hashes = Array.from({ length: GENERATED_LIMITS.recordsPerRequest }, (_, i) => i.toString(16).padStart(64, "0"));
    await t.run(async (ctx) => {
      const releaseId = await release(ctx, "debian", "staging");
      for (const [h, sha] of hashes.entries()) {
        await ctx.db.insert("manPageGenerated", {
          contentSha256: sha, updatedAt: "now", page: { examples: [], flagUsage: [{ flag: "-c", count: 1 }] },
        });
        for (let i = 0; i < GENERATED_LIMITS.flagUsagePages; i++) {
          await ctx.db.insert("manPages", {
            releaseId, datasetReleaseId: "debian-staging", externalId: `${h}-${i}`, locale: "en", distro: "debian",
            name: `p${h}-${i}`, section: "1", sitemapPage: 0, title: "p", description: "p", sourcePath: "p",
            contentSha256: sha, hasParseWarnings: false,
          });
        }
      }
    });
    const first = await t.mutation(internal.generated.propagateFlagUsage, { contentSha256s: hashes });
    expect(first).toEqual({ scheduled: GENERATED_LIMITS.flagUsageSchedules, continued: true });
    await finish(t);
    const pages = await t.run((ctx) => ctx.db.query("manPages").take(2000));
    expect(pages).toHaveLength(1600);
    expect(pages.every((page) => page.verifiedFlagUsage?.[0]?.flag === "-c")).toBe(true);
    // Everything is current: nothing more to schedule.
    expect(await t.mutation(internal.generated.propagateFlagUsage, { contentSha256s: hashes }))
      .toEqual({ scheduled: 0, continued: false });
    // 1,600 B7 updates run in memory; CI machines need more than the default 5 s.
  }, 120_000);

  it("resumes after the last handled page when a page is pruned between runs", async () => {
    vi.useFakeTimers();
    // Final re-check of #434: an offset over a re-queried list skipped a live page.
    const t = convexTest({ schema, modules, transactionLimits: { functionsScheduled: 1000 } });
    const hashes = Array.from({ length: 5 }, (_, i) => i.toString(16).padStart(64, "0"));
    const ids = await t.run(async (ctx) => {
      const releaseId = await release(ctx, "debian", "staging");
      const byHash: Id<"manPages">[][] = [];
      for (const [h, sha] of hashes.entries()) {
        await ctx.db.insert("manPageGenerated", {
          contentSha256: sha, updatedAt: "now", page: { examples: [], flagUsage: [{ flag: "-c", count: 1 }] },
        });
        byHash.push([]);
        for (let i = 0; i < GENERATED_LIMITS.flagUsagePages; i++) {
          byHash[h].push(await ctx.db.insert("manPages", {
            releaseId, datasetReleaseId: "debian-staging", externalId: `${h}-${i}`, locale: "en", distro: "debian",
            name: `p${h}-${i}`, section: "1", sitemapPage: 0, title: "p", description: "p", sourcePath: "p",
            contentSha256: sha, hasParseWarnings: false,
            // Ten pages of the first hash are already current.
            ...(h === 0 && i < 10 ? { verifiedFlagUsage: [{ flag: "-c", count: 1, source: "examples" as const }] } : {}),
          }));
        }
      }
      return byHash;
    });
    // 54 + 3 x 64 = 246 updates, then 10 into the last hash before the cap.
    expect(await t.mutation(internal.generated.propagateFlagUsage, { contentSha256s: hashes }))
      .toEqual({ scheduled: GENERATED_LIMITS.flagUsageSchedules, continued: true });
    const [continuation] = await t.run((ctx) => ctx.db.system.query("_scheduled_functions")
      .filter((q) => q.eq(q.field("name"), "generated:propagateFlagUsage")).collect());
    expect(continuation.args[0]).toMatchObject({ contentSha256s: [hashes[4]], after: { id: ids[4][9], seen: 10 } });
    // Prune the in-progress hash's first page before the continuation runs.
    await t.run((ctx) => ctx.db.delete(ids[4][0]));
    await finish(t);

    const updates = await t.run((ctx) => ctx.db.system.query("_scheduled_functions")
      .filter((q) => q.eq(q.field("name"), "derived:setVerifiedFlagUsage")).collect());
    const counts = new Map<string, number>();
    for (const job of updates) counts.set(job.args[0].pageId, (counts.get(job.args[0].pageId) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    const live = await t.run((ctx) => ctx.db.query("manPages").take(400));
    expect(live).toHaveLength(5 * 64 - 1);
    expect(live.every((page) => page.verifiedFlagUsage?.[0]?.flag === "-c")).toBe(true);
    // 320 pages, 10 already current: every other page, including the pruned one
    // that was handled before it went, was updated exactly once.
    expect(counts.size).toBe(310);
  }, 120_000);

  it("recomputes B7's ranking when page and tldr sources are suppressed", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => {
      const releaseId = await release(ctx, "debian", "prod");
      await ctx.db.patch(releaseId, { manifestVerified: true });
      const pageId = await storedPage(ctx, releaseId, "debian", "tar", TAR);
      await persistOptionSignature(ctx, pageId, tarOptions, 1);
      return pageId;
    });
    await t.mutation(internal.derived.rebuildActive, {});
    await finish(t);
    await t.mutation(internal.generated.upsertRecords, { records: [record()], updatedAt: "now" });
    await finish(t);
    const ranking = async () => {
      const derived = await t.run((ctx) => ctx.db.query("manPageDerived")
        .withIndex("by_locale_and_distro_and_name_and_section", (q) =>
          q.eq("locale", "en").eq("distro", "debian").eq("name", "tar").eq("section", "1"))
        .unique());
      return decodeSummary(derived!.summaryJson).mostUsed.source;
    };
    expect((await t.run((ctx) => ctx.db.get(id)))?.verifiedFlagUsage).toHaveLength(3);
    expect(await ranking()).toBe("verified-frequency");

    await t.mutation(internal.generated.suppressParts, { contentSha256: TAR, parts: ["page", "tldr"] });
    await finish(t);
    expect((await t.run((ctx) => ctx.db.get(id)))?.verifiedFlagUsage).toEqual([]);
    expect(await ranking()).toBe("manual-order");
  });

  it("drops only the suppressed source from the counts", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => storedPage(ctx, await release(ctx, "debian", "staging"), "debian", "tar", TAR));
    await t.mutation(internal.generated.upsertRecords, { records: [record()], updatedAt: "now" });
    await finish(t);
    await t.mutation(internal.generated.suppressParts, { contentSha256: TAR, parts: ["tldr"] });
    await finish(t);
    expect((await t.run((ctx) => ctx.db.get(id)))?.verifiedFlagUsage).toEqual([
      { flag: "-c", count: 1, source: "examples" },
      { flag: "-f", count: 1, source: "examples" },
    ]);
  });
});
