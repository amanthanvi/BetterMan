import type { Doc } from "./_generated/dataModel";

export type RelatedItem = Pick<Doc<"manPages">, "name" | "section" | "title" | "description">;
type RelatedLink = Pick<Doc<"manPageLinks">, "toName" | "toSection" | "toTitle" | "toDescription">;
type ResolveTarget = (name: string, section: string) => Promise<RelatedItem | null>;

export function cachedRelatedItem(link: RelatedLink): RelatedItem | null {
  if (link.toTitle === undefined || link.toDescription === undefined) return null;
  return {
    name: link.toName,
    section: link.toSection,
    title: link.toTitle,
    description: link.toDescription,
  };
}

export async function resolveRelatedItems(
  links: RelatedLink[],
  resolveTarget: ResolveTarget,
  limit: number,
): Promise<RelatedItem[]> {
  const seen = new Set<string>();
  const uniqueLinks = links.filter((link) => {
    const key = JSON.stringify([link.toName, link.toSection]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const items = await Promise.all(uniqueLinks.map(async (link) => {
    const item = cachedRelatedItem(link) ?? await resolveTarget(link.toName, link.toSection);
    if (!item) return null;
    return {
      name: item.name,
      section: item.section,
      title: item.title,
      description: item.description,
    };
  }));
  return items.filter((item): item is RelatedItem => item !== null).slice(0, limit);
}
