import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { distroValidator } from "./schema";
import { requireActiveRelease } from "./_releaseLookups";
import { PUBLIC_DATASET_STAGE } from "./lib";

const MAX_CURSOR_CHARS = 8192;
type PackageCursor = { releaseId: string; packageName: string; cursor: string };

/** Bind the otherwise opaque Convex cursor to its release and package query. */
export function encodePackageCursor(value: PackageCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify([1, value.releaseId, value.packageName, value.cursor]));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const cursor = `p1.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  if (cursor.length > MAX_CURSOR_CHARS) throw new Error("PACKAGE_CURSOR_TOO_LONG");
  return cursor;
}

function decodePackageCursor(cursor: string): PackageCursor | null {
  if (cursor.length > MAX_CURSOR_CHARS || !/^p1\.[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const binary = atob(cursor.slice(3).replace(/-/g, "+").replace(/_/g, "/"));
    const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
    if (!Array.isArray(raw) || raw.length !== 4 || raw[0] !== 1 ||
      raw.slice(1).some((part) => typeof part !== "string" || part.length === 0)) return null;
    return { releaseId: raw[1], packageName: raw[2], cursor: raw[3] };
  } catch {
    return null;
  }
}

export const getPackage = query({
  args: {
    distro: distroValidator,
    name: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    name: v.string(), version: v.union(v.string(), v.null()), datasetReleaseId: v.string(),
    pages: v.array(v.object({ name: v.string(), section: v.string(), title: v.string(), version: v.union(v.string(), v.null()) })),
    hasMore: v.boolean(), nextCursor: v.union(v.string(), v.null()),
    cursorReset: v.union(v.null(), v.literal("invalid"), v.literal("stale")),
  }),
  handler: async (ctx, args) => {
    const release = await requireActiveRelease(ctx, { stage: PUBLIC_DATASET_STAGE, distro: args.distro });
    const name = args.name.trim();
    let cursorReset: "invalid" | "stale" | null = null;
    let cursor: string | null = null;
    if (args.paginationOpts.cursor !== null) {
      const decoded = decodePackageCursor(args.paginationOpts.cursor);
      if (!decoded || decoded.packageName !== name) cursorReset = "invalid";
      else if (decoded.releaseId !== release._id) cursorReset = "stale";
      else cursor = decoded.cursor;
    }
    const requested = args.paginationOpts.numItems;
    const numItems = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.floor(requested))) : 1;
    const read = (next: string | null) => ctx.db.query("manPages")
      .withIndex("by_releaseId_and_sourcePackage_and_name_and_section", (q) => q.eq("releaseId", release._id).eq("sourcePackage", name))
      .paginate({ numItems, cursor: next });
    let result;
    try {
      result = await read(cursor);
    } catch (error) {
      if (cursor === null) throw error;
      // Convex permits one paginate call per execution; the route restarts in a new request.
      cursorReset = "invalid";
      result = { page: [], isDone: true, continueCursor: "" };
    }
    return {
      name, version: result.page[0]?.sourcePackageVersion ?? null, datasetReleaseId: release.datasetReleaseId,
      pages: result.page.map((page) => ({ name: page.name, section: page.section, title: page.title, version: page.sourcePackageVersion ?? null })),
      hasMore: !result.isDone,
      nextCursor: result.isDone ? null : encodePackageCursor({ releaseId: release._id, packageName: name, cursor: result.continueCursor }),
      cursorReset,
    };
  },
});
