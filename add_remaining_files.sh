#!/bin/bash

# Add remaining critical Next.js files
echo "Adding remaining Next.js configuration files..."

# Add Next.js configuration files
git add next.config.mjs
git add middleware.ts
git add tailwind.config.ts
git add tsconfig.json

# Add scripts directory
git add scripts/

# Add supabase directory
git add supabase/

# Add check scripts
git add check-structure.js

# Check git status
echo ""
echo "Git status after adding files:"
git status --short

echo ""
echo "Files have been staged. You can now commit with:"
echo "git commit -m 'Add Next.js application files for Vercel deployment'"