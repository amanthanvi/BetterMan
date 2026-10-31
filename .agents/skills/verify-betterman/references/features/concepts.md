# Concepts

## Reach

Follow a Concepts link in the footer of a man page that references one, or open `/concept/<slug>` (for example `/concept/signals`).

## Spec

`nextjs/e2e/concepts.spec.ts`

## Proves

bash(1) shows a Concepts line, and pipes opens `/concept/pipelines` with the heading Pipes and pipelines. tar(1) has no Concepts line. An unknown slug is a 404.

The draft-flag test stays skipped unless the server and the runner both have `BETTERMAN_CONCEPT_DRAFTS=1`. The published pages run without it.
