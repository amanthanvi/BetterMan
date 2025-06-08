# TOC Flicker Fix Summary

## Changes Made to Fix TOC Flickering

1. **Removed Framer Motion animations from TOC sidebar**
   - Replaced `AnimatePresence` and `motion.aside` with regular `aside` element
   - Used CSS transitions instead of JavaScript animations
   - Added `will-change: transform` for better performance

2. **Fixed CSS for smoother transitions**
   - Added `contain: layout style paint` for layout isolation
   - Used GPU-accelerated transforms with `translate3d`
   - Improved transition timing functions

3. **Simplified collapse/expand logic**
   - Removed AnimatePresence from TOC content
   - Used CSS opacity and display transitions
   - Fixed maxHeight calculation for proper scrolling

## Database Fix for Duplicate "Section json" Documents

Run this command to remove the duplicate documents:

```bash
cd /home/athanvi/BetterMan/backend
python3 fix_json_sections.py
```

This will:
- Back up the 89 documents with section='json'
- Remove them from the database
- Leave you with 89 proper man page documents

## Testing

After making these changes:
1. The TOC should slide in/out smoothly without flickering
2. Search results should no longer show duplicates
3. All document links should work properly