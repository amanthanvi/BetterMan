#!/bin/bash

# Create Next.js project with all options pre-configured
mkdir -p betterman-next
cd betterman-next

# Initialize package.json
cat > package.json << 'EOF'
{
  "name": "betterman",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "parse-man-pages": "tsx scripts/parse-man-pages.ts",
    "build-search-index": "tsx scripts/build-search-index.ts",
    "prebuild": "npm run parse-man-pages && npm run build-search-index"
  }
}
EOF

# Install dependencies
npm install next@latest react@latest react-dom@latest
npm install -D typescript @types/react @types/node @types/react-dom eslint eslint-config-next tailwindcss postcss autoprefixer

# Additional dependencies
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install zustand fuse.js clsx tailwind-merge lucide-react
npm install shiki rehype-highlight @radix-ui/react-* 
npm install swr axios date-fns
npm install -D tsx @types/node

echo "Next.js project created successfully!"