import { describe, expect, it, vi } from "vitest";
import { cachedRelatedItem, resolveRelatedItems } from "./_relatedLinks";

describe("negative related-link cache", () => {
  it("skips known missing targets without lookups, including partial stale metadata", async () => {
    const lookup = vi.fn(async () => null);
    const negative = {
      toName: "missing", toSection: "1", toMissing: true,
      toTitle: "stale", toDescription: "stale",
    };
    const cached = {
      toName: "target", toSection: "1", toTitle: "target(1)", toDescription: "target description",
    };
    expect(cachedRelatedItem(negative)).toBeNull();
    expect(await resolveRelatedItems([negative, cached, negative], lookup, 50)).toEqual([
      { name: "target", section: "1", title: "target(1)", description: "target description" },
    ]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps uncached ingestion misses resolvable when a target arrives", async () => {
    const target = { name: "later", section: "1", title: "later(1)", description: "later description" };
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(target);
    const link = { toName: "later", toSection: "1" };
    expect(await resolveRelatedItems([link], lookup, 50)).toEqual([]);
    expect(await resolveRelatedItems([link], lookup, 50)).toEqual([target]);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
