# Releasing

Tags are `vX.Y.Z`. Minor for user-facing features, patch for fixes.

1. Move the Unreleased entries in `CHANGELOG.md` under the new version heading.
2. Confirm `main` is green.
3. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. Optionally create a GitHub release: `gh release create vX.Y.Z --generate-notes`.

Deployment is not tied to tags. Every push to `main` that passes CI deploys. Treat published tags as immutable.
