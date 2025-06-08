# UI Fixes and Real Man Pages Setup

## UI Fixes Completed

### 1. TOC Sidebar Height Fixed
- Removed the `maxHeight` restriction that was cutting off the TOC
- The TOC now properly fills the entire sidebar height

### 2. Progress Bar Fixed
- Moved progress bar from floating over the navbar to being integrated into the document header
- Progress bar now stays with the header when scrolling
- Uses `absolute` positioning within the header instead of `fixed`

### 3. Command Palette Fixed
- Added import for `defaultShortcuts` to ensure keyboard shortcuts are registered
- Ctrl+K (or Cmd+K on Mac) should now work to open the command palette

## Loading Real Man Pages

I've created a script to load REAL man pages from your system:
`/home/athanvi/BetterMan/backend/load_system_manpages.py`

### To load real man pages:

1. First, clean up the duplicate JSON documents:
```bash
cd /home/athanvi/BetterMan/backend
python3 fix_json_sections.py
```

2. Then load real man pages from your system:
```bash
cd /home/athanvi/BetterMan/backend
python3 load_system_manpages.py
```

This script will:
- Clear all existing simplified content
- Extract real man pages using the system `man` command
- Parse them into sections (NAME, SYNOPSIS, DESCRIPTION, OPTIONS, etc.)
- Store the full formatted content
- Load 80+ common commands including:
  - Core utilities: ls, cp, mv, rm, mkdir, etc.
  - Text processing: grep, sed, awk, cut, sort, etc.
  - Network tools: ping, curl, wget, ssh, etc.
  - Development tools: git, make, gcc, python, docker, etc.

### What's Different

The real man pages will have:
- Complete documentation as shown by `man` command
- All sections including OPTIONS with detailed flag descriptions
- Proper examples section
- Cross-references to related commands
- Author and copyright information
- Exact formatting as you'd see in terminal

## Testing

After loading real man pages:
1. Restart the backend server
2. Search for commands like "ls" or "git"
3. You should see the full man page content, not simplified versions