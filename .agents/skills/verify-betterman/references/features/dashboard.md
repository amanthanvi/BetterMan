# Recent and bookmarks

## Reach

Read a page, or bookmark it. Recent and Bookmarks then appear on the home page. `/history` and `/bookmarks` redirect there. `h` jumps to Recent.

## Spec

`nextjs/e2e/dashboard.spec.ts`

## Proves

After a recent page and a bookmark exist, `h` opens `/#recent` and the Recent region is visible. `/history` lands on `/#recent`. `/bookmarks` lands on `/#bookmarks`. Before any exist, those regions stay off the home page unless the URL asks for an empty one.
