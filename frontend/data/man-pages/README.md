# Man Pages Data

Generated at: 2025-06-18T12:51:48.267Z

## Statistics

- **Total Pages**: 148
- **Common Commands**: 26

### By Section

- Section 1: 137 pages
- Section 3: 1 pages
- Section 8: 10 pages

### By Category

- User Commands: 137 pages
- System Administration: 10 pages
- Library Functions: 1 pages

## Data Structure

The man pages are stored in `enhanced-pages.ts` with the following structure:

```typescript
interface ManPage {
  name: string
  section: number
  title: string
  description: string
  synopsis?: string
  category?: string
  isCommon?: boolean
  seeAlso?: Array<{ name: string; section: number }>
  // ... more fields
}
```

## Usage

```typescript
import { getManPage, searchManPages } from './enhanced-pages'

// Get a specific man page
const lsPage = getManPage('ls', 1)

// Search for man pages
const results = searchManPages('file')
```
