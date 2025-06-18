# Man Page Parsing and Deployment Solution

This document outlines the complete solution for parsing, processing, and deploying man pages in BetterMan.

## Overview

The solution addresses the following issues:
1. **Incomplete and improper parsing** - Content was not being extracted correctly
2. **Duplicate commands in See Also sections** - Commands appearing in their own references
3. **Loss of section information** - See Also references losing section numbers
4. **Styling inconsistencies** - Groff/troff artifacts in displayed content
5. **Manual deployment process** - Need for automated CI/CD pipeline

## Architecture

### 1. Enhanced Parser (`enhanced-man-parser-v2.ts`)

The new parser provides:
- **Proper groff/troff cleaning** - Removes all formatting artifacts
- **Section-aware parsing** - Preserves section numbers in references
- **Better content extraction** - Handles various man page formats
- **Validation** - Ensures data quality before storage

Key improvements:
```typescript
// Preserves section information
seeAlso: Array<{ name: string; section: number }>

// Better content cleaning
private static readonly GROFF_PATTERNS = {
  commands: /^\.[A-Z]{2}.*$/gm,
  fonts: /\\f[BIPRH]/g,
  // ... more patterns
}
```

### 2. Data Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Man Pages     │────▶│  Enhanced Parser │────▶│  JSON Output    │
│  (System/Linux) │     │   (TypeScript)   │     │ (Structured)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ TypeScript Data │◀────│ Migration Script │◀────│   Validation    │
│ (enhanced-pages)│     │  (Fixed Types)   │     │   (Quality)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### 3. CI/CD Workflow (`parse-and-deploy.yml`)

The GitHub Actions workflow:
1. **Installs Ubuntu packages** with comprehensive man pages
2. **Parses man pages** using the enhanced parser
3. **Validates data quality** checking for duplicates and artifacts
4. **Generates TypeScript files** with proper types
5. **Commits changes** to trigger Vercel deployment
6. **Updates production database** via admin API

### 4. Scripts

- **`parse-man-pages-enhanced.ts`** - Main parsing script with batching
- **`migrate-parsed-pages-fixed.ts`** - Converts to app format preserving types
- **`fix-see-also.ts`** - Repairs existing data
- **`validate-man-pages.ts`** - Quality checks
- **`check-duplicates.ts`** - Finds self-references
- **`generate-man-index.ts`** - Creates searchable index

## Implementation Steps

### Step 1: Deploy the Fixed Parser

1. The enhanced parser is already created at `lib/parser/enhanced-man-parser-v2.ts`
2. Update imports in parsing scripts to use v2 parser

### Step 2: Fix Current Data

```bash
# Fix the existing data
npx tsx scripts/fix-see-also.ts

# Validate the fixes
npx tsx scripts/validate-man-pages.ts

# Generate index
npx tsx scripts/generate-man-index.ts
```

### Step 3: Deploy CI/CD

1. Commit the new workflow: `.github/workflows/parse-and-deploy.yml`
2. Set up GitHub secrets:
   - `ADMIN_TOKEN` - For database updates
   - `VERCEL_API_URL` - Production URL

### Step 4: Frontend Updates

The frontend already supports the proper types:
```tsx
// components/docs/enhanced-document-viewer.tsx
{page.seeAlso.map((ref) => (
  <SeeAlsoLink key={`${ref.name}.${ref.section}`} reference={ref} />
))}
```

### Step 5: Run Initial Parse

Trigger the workflow manually:
```bash
gh workflow run parse-and-deploy.yml
```

## Benefits

1. **Automated Updates** - Weekly parsing keeps content fresh
2. **Quality Assurance** - Validation prevents bad data
3. **Better UX** - No duplicates, proper references
4. **Scalability** - Can parse 10,000+ man pages
5. **Cross-platform** - Works with Ubuntu, Alpine, Debian

## Monitoring

Check workflow status:
```bash
gh run list --workflow=parse-and-deploy.yml
```

View parse statistics:
```bash
cat data/man-pages/README.md
```

## Troubleshooting

### Common Issues

1. **Parse failures** - Check `validation-report.json`
2. **Deploy failures** - Verify `ADMIN_TOKEN` is set
3. **Missing pages** - Install more packages in workflow

### Manual Fixes

If needed, run locally:
```bash
# Parse
npm run parse:man-pages

# Migrate
npm run migrate:man-pages

# Validate
npm run validate:man-pages
```

## Future Improvements

1. **Multi-platform parsing** - Add macOS, BSD support
2. **Incremental updates** - Only parse changed pages
3. **Better examples** - Extract from real-world usage
4. **Interactive playground** - Test commands safely
5. **Version tracking** - Show when pages were updated

## Summary

This solution provides a complete, automated pipeline for maintaining high-quality man page documentation. The key improvements are:

- ✅ Proper groff/troff parsing
- ✅ Section-aware references
- ✅ No duplicate entries
- ✅ Automated CI/CD
- ✅ Quality validation
- ✅ Scalable architecture