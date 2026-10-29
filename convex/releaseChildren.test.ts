/// <reference types="vite/client" />
import { expect, it } from "vitest";
import schema from "./schema";
import { RELEASE_CHILD_TABLES } from "./_releaseChildren";
import { STORAGE_STATS_FIELDS } from "./maintenance";

it("enumerates every release-owned schema table, excluding only active pointers", () => {
  const tables = JSON.parse(Reflect.get(schema, "export").call(schema)).tables as Array<{
    tableName: string; documentType: { type: string; value: Record<string, { fieldType: { type: string; tableName?: string } }> };
    indexes: Array<{ fields: string[] }>;
  }>;
  const owned = tables.filter((table) => table.tableName !== "activeReleases" &&
    table.documentType.value.releaseId?.fieldType.type === "id" &&
    table.documentType.value.releaseId.fieldType.tableName === "datasetReleases");
  expect([...RELEASE_CHILD_TABLES].sort()).toEqual(owned.map((table) => table.tableName).sort());
  expect(RELEASE_CHILD_TABLES.at(-1)).toBe("manPages");
  for (const table of owned) expect(table.indexes.some((index) => index.fields[0] === "releaseId")).toBe(true);
  for (const [name, fields] of Object.entries(STORAGE_STATS_FIELDS)) {
    const table = tables.find(table => table.tableName === name)!;
    for (const field of fields) {
      expect(table.documentType.value[field], `${name}.${field} must exist in schema`).toBeDefined();
    }
  }
  expect(Object.keys(STORAGE_STATS_FIELDS).sort()).toEqual(tables.map((table) => table.tableName).sort());
});
