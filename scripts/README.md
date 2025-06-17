# BetterMan Scripts

This directory contains scripts for parsing and managing man pages for the BetterMan application.

## CI/CD Pipeline

### GitHub Actions Workflow

The project includes a GitHub Actions workflow (`.github/workflows/parse-man-pages.yml`) that:

1. **Runs on Ubuntu Linux** - Provides access to full GNU/Linux man pages
2. **Installs comprehensive documentation** - Including man-db, manpages-dev, and package-specific docs
3. **Parses thousands of commands** - Extracts full documentation with examples and detailed options
4. **Creates a Pull Request** - Automatically submits parsed pages for review

### Triggering the Workflow

The workflow can be triggered in several ways:

1. **Manual Trigger** - Go to Actions tab on GitHub → "Parse Man Pages" → "Run workflow"
2. **Monthly Schedule** - Runs automatically on the 1st of each month
3. **On Push** - When changes are made to parsing scripts

## Local Scripts

### parse-man-pages-batch.ts

Parses man pages from your local system (may be limited on macOS).

```bash
tsx scripts/parse-man-pages-batch.ts
```

### parse-man-pages-ci.ts

The main parsing script used in CI/CD. Can also be run locally in a Linux environment:

```bash
# Run in Docker/Linux environment
tsx scripts/parse-man-pages-ci.ts
```

### migrate-linux-man-pages.ts

Migrates Linux-parsed man pages to the application format:

```bash
tsx scripts/migrate-linux-man-pages.ts
```

### migrate-parsed-pages.ts

Migrates any parsed man pages to the basic format used by the application:

```bash
tsx scripts/migrate-parsed-pages.ts
```

## Running Linux Parser Locally

To test the Linux parser locally without waiting for CI:

```bash
# Use the provided Docker script
./scripts/parse-linux-local.sh
```

This will:
1. Run an Ubuntu container
2. Install all necessary packages
3. Parse man pages
4. Output them to `data/parsed-man-pages-linux/`

## Quality Differences

### macOS Man Pages
- Simplified BSD versions
- Limited examples
- Terse descriptions
- Missing many GNU-specific options

### Linux Man Pages (via CI/CD)
- Full GNU documentation
- Comprehensive examples
- Detailed option descriptions
- Better cross-references
- More commands available

## Adding New Commands

To add new commands to parse:

1. Edit `scripts/parse-man-pages-ci.ts`
2. Add commands to the `LINUX_COMMANDS` object
3. Commit and push
4. The workflow will run automatically

## Workflow Output

The CI/CD pipeline creates:
- `data/parsed-man-pages-linux/` - Raw parsed JSON files
- `data/man-pages/enhanced-pages.ts` - Migrated TypeScript file
- `MAN_PAGES_SUMMARY.md` - Summary of parsed pages
- Pull Request with all changes