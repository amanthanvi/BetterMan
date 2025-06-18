#!/bin/bash

echo "🧹 Cleaning up redundant workflows..."

# Backup existing workflows
mkdir -p .github/workflows-backup
cp .github/workflows/*.yml .github/workflows-backup/ 2>/dev/null

# Remove redundant workflows
rm -f .github/workflows/cd.yml
rm -f .github/workflows/ci-cd.yml
rm -f .github/workflows/dependencies.yml
rm -f .github/workflows/deploy-and-update-data.yml
rm -f .github/workflows/parse-and-deploy.yml
rm -f .github/workflows/parse-man-pages.yml
rm -f .github/workflows/release.yml
rm -f .github/workflows/test.yml

# Keep only essential workflows
mv .github/workflows/ci.yml.new .github/workflows/ci.yml 2>/dev/null

# Keep these workflows
# - ci.yml (testing and linting)
# - update-man-pages.yml (weekly updates)
# - test-admin-api.yml (for testing)

echo "✅ Workflow cleanup complete!"
echo ""
echo "Remaining workflows:"
ls -la .github/workflows/*.yml