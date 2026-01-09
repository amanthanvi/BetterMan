# Type generation out of sync (OpenAPI → TypeScript)

CI enforces that `frontend/src/api/openapi.gen.ts` is generated from backend OpenAPI and committed.

If CI fails in the `api_types` job, regenerate types using the same commands as `.github/workflows/ci.yml`.

## Regenerate (mirror CI)

1. Export OpenAPI JSON:

   - `cd backend`
   - `uv run python scripts/export_openapi.py /tmp/betterman-openapi.json`

2. Generate TypeScript:

   - `cd ..`
   - `pnpm -C frontend exec openapi-typescript /tmp/betterman-openapi.json --output src/api/openapi.gen.ts`

3. Verify diff + commit:

   - `git diff frontend/src/api/openapi.gen.ts`
   - Commit the updated generated file.

## Notes

- Prefer updating Pydantic response models in the backend over hand-editing frontend types.
- Keep `frontend/src/api/types.ts` as a stable alias layer over generated `paths` types.

