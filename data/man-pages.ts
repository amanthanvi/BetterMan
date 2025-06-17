// Temporary man pages data for production
// In a real implementation, this would be populated from parsed man pages

export interface ManPage {
  name: string
  section: number
  title: string
  description: string
  synopsis?: string
  category?: string
  isCommon?: boolean
  searchContent?: string
  sections?: Array<{
    id: string
    title: string
    content: string
    level: number
    subsections?: any[]
  }>
  options?: Array<{
    flag: string
    description: string
  }>
  examples?: string[]
  relatedCommands?: string[]
  seeAlso?: string[]
  author?: string
  bugs?: string
}

// Basic man pages data
const manPages: ManPage[] = [
  {
    name: 'ls',
    section: 1,
    title: 'list directory contents',
    description: 'List information about the FILEs (the current directory by default). Sort entries alphabetically if none of -cftuvSUX nor --sort is specified.',
    synopsis: 'ls [OPTION]... [FILE]...',
    options: [
      { flag: '-a, --all', description: 'do not ignore entries starting with .' },
      { flag: '-l', description: 'use a long listing format' },
      { flag: '-h, --human-readable', description: 'with -l, print sizes in human readable format' },
      { flag: '-t', description: 'sort by modification time, newest first' },
      { flag: '-r, --reverse', description: 'reverse order while sorting' },
    ],
    examples: [
      'ls -la',
      'ls -lh /var/log', 
      'ls -lt',
    ],
    relatedCommands: ['dir', 'vdir', 'dircolors', 'sort'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-a, --all  do not ignore entries starting with .\n-l  use a long listing format\n-h, --human-readable  with -l, print sizes in human readable format\n-t  sort by modification time, newest first\n-r, --reverse  reverse order while sorting',
        level: 1
      }
    ],
  },
  {
    name: 'grep',
    section: 1,
    title: 'print lines matching a pattern',
    description: 'grep searches the named input FILEs for lines containing a match to the given PATTERN. If no files are specified, or if the file "-" is given, grep searches standard input.',
    synopsis: 'grep [OPTIONS] PATTERN [FILE...]',
    options: [
      { flag: '-i, --ignore-case', description: 'ignore case distinctions' },
      { flag: '-v, --invert-match', description: 'select non-matching lines' },
      { flag: '-n, --line-number', description: 'print line number with output lines' },
      { flag: '-r, --recursive', description: 'read all files under each directory' },
      { flag: '-E, --extended-regexp', description: 'PATTERN is an extended regular expression' },
    ],
    examples: [
      'grep "error" log.txt',
      'grep -r "TODO" .',
      'grep -i "warning" *.log',
    ],
    relatedCommands: ['egrep', 'fgrep', 'sed', 'awk'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-i, --ignore-case  ignore case distinctions\n-v, --invert-match  select non-matching lines\n-n, --line-number  print line number with output lines\n-r, --recursive  read all files under each directory\n-E, --extended-regexp  PATTERN is an extended regular expression',
        level: 1
      }
    ],
  },
  {
    name: 'cd',
    section: 1,
    title: 'change the shell working directory',
    description: 'Change the shell working directory. Change the current directory to DIR. The default DIR is the value of the HOME shell variable.',
    synopsis: 'cd [-L|[-P [-e]] [-@]] [dir]',
    options: [
      { flag: '-L', description: 'force symbolic links to be followed' },
      { flag: '-P', description: 'use the physical directory structure' },
      { flag: '-e', description: 'exit with non-zero status if unable to change directory' },
    ],
    examples: [
      'cd /home/user',
      'cd ..',
      'cd -',
      'cd ~',
    ],
    relatedCommands: ['pwd', 'pushd', 'popd'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-L  force symbolic links to be followed\n-P  use the physical directory structure\n-e  exit with non-zero status if unable to change directory',
        level: 1
      }
    ],
  },
];

// Export the list of man pages for static generation
export const manPageList = manPages;

// Function to get a specific man page
export function getManPage(name: string, section?: number): ManPage | undefined {
  return manPages.find(page => 
    page.name === name && 
    (section === undefined || page.section === section)
  );
}

// Function to search man pages
export function searchManPages(query: string): ManPage[] {
  const lowerQuery = query.toLowerCase();
  return manPages.filter(page => 
    page.name.toLowerCase().includes(lowerQuery) ||
    page.title.toLowerCase().includes(lowerQuery) ||
    page.description.toLowerCase().includes(lowerQuery)
  );
}