# Releasing BetterMan

This doc describes how to cut a tagged release (e.g. `v0.6.0`).

## Preconditions

- `main` is green in CI.
- `SPEC.md` matches reality.
- `PLAN.md` milestones reflect what shipped.
- `CHANGELOG.md` includes release notes for the version you’re tagging.

## Versioning

- Tag format: `vX.Y.Z`.
- SemVer intent:
  - MAJOR: breaking changes.
  - MINOR: user-facing features.
  - PATCH: fixes + small polish.

## Release steps

1. Update release notes and docs

   - Add/update the `CHANGELOG.md` entry.
   - Update `README.md` “Status” (latest release).
   - Update `PLAN.md` “Status” + the relevant “Release vX.Y.Z” milestone section.

2. Run a local gate (recommended)

   Use the repo scripts (see `PLAN.md` for the canonical list). Common ones:

   - `pnpm next:lint`
   - `pnpm next:build`
   - `pnpm backend:test`
   - `pnpm backend:lint`
   - `pnpm ingest:test`
   - `pnpm ingest:lint`
   - `pnpm frontend:test`

3. Push your commits

   ```bash
   git push origin main
   ```

4. Tag the release

   Create an annotated tag pointing at the release commit:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. Verify CI + deploy

   - Watch the CI run for your push (and ensure the deploy job succeeded):

     ```bash
     gh run list --branch main -L 5
     gh run watch <run-id> --exit-status
     ```

## Optional: GitHub Release page

If you want a GitHub Release created from the tag:

```bash
gh release create vX.Y.Z --generate-notes
```

## Notes

- Treat published tags as immutable. If you need follow-up fixes, ship another commit and tag a patch release.
