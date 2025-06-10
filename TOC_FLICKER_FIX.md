# TOC Sidebar Flickering Issue - Analysis and Fixes

## Problem Summary
The Table of Contents (TOC) sidebar was flickering when navigating between pages in the BetterMan documentation viewer. This was caused by:

1. **State Re-initialization**: TOC state was re-initialized on each page load based on window width
2. **Multiple Transition Conflicts**: CSS transitions were applied through multiple sources
3. **Framer Motion vs CSS Transitions**: Mixing animation libraries caused timing conflicts
4. **No State Persistence**: TOC open/closed state wasn't persisted across navigation

## Implemented Fixes

### 1. Persistent TOC State in App Store
Added TOC state management to the global app store to persist across page navigations:

```typescript
// In appStore.ts
interface AppStore extends AppState {
  // Document viewer state
  documentTocOpen: boolean;
  setDocumentTocOpen: (open: boolean) => void;
  toggleDocumentToc: () => void;
}
```

### 2. Updated EnhancedDocumentViewer
- Removed local TOC state initialization based on window width
- Now uses persistent state from app store:

```typescript
const {
  documentTocOpen: showToc,
  setDocumentTocOpen: setShowToc,
} = useAppStore();
```

### 3. Simplified CSS Transitions
Updated `document-viewer.css` to:
- Remove conflicting transition rules
- Use only transform transitions for TOC sliding
- Apply GPU acceleration consistently
- Separate color transitions from layout transitions

### 4. Created DocumentViewerWrapper Component
Added a wrapper component that:
- Prevents initial render flicker
- Ensures store is hydrated before rendering
- Shows a placeholder during initial load to prevent layout shift

### 5. Removed Framer Motion from TOC
- Replaced Framer Motion animations with pure CSS transitions
- Used inline styles for consistent transform application
- Eliminated animation library conflicts

## CSS Optimizations

```css
/* Force GPU acceleration and prevent repaints */
.document-page aside.fixed {
  will-change: transform;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  contain: layout style paint;
}

/* Single transition for TOC sliding */
.document-page aside.fixed {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Content area transition - only padding */
.document-page main {
  transition: padding-left 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

## Result
The TOC sidebar now:
- Maintains its open/closed state across page navigations
- Transitions smoothly without flickering
- Prevents layout shifts during navigation
- Works consistently across all document pages

## Testing
To verify the fix:
1. Open a document page
2. Toggle the TOC sidebar
3. Navigate to another document
4. The TOC should maintain its state without flickering