// Man page data structure
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
  keywords?: string[]
  author?: string
  bugs?: string
}

// Import enhanced pages (148 real man pages parsed from system)
import { enhancedManPages } from './man-pages/enhanced-pages'

// For backward compatibility, keep a few hardcoded entries merged with enhanced pages
const legacyPages = [
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
    seeAlso: ['cd', 'pwd', 'find', 'grep'],
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
    seeAlso: ['sed', 'awk', 'find', 'egrep'],
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
    seeAlso: ['pwd', 'pushd', 'popd'],
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
  {
    name: 'find',
    section: 1,
    title: 'search for files in a directory hierarchy',
    description: 'find searches the directory tree rooted at each given file name by evaluating the given expression from left to right, according to the rules of precedence.',
    synopsis: 'find [-H] [-L] [-P] [-D debugopts] [-Olevel] [path...] [expression]',
    options: [
      { flag: '-name pattern', description: 'base of file name matches shell pattern' },
      { flag: '-type c', description: 'file is of type c (b,c,d,p,f,l,s)' },
      { flag: '-mtime n', description: 'file data was last modified n*24 hours ago' },
      { flag: '-size n[cwbkMG]', description: 'file uses n units of space' },
      { flag: '-exec cmd ;', description: 'execute cmd; true if 0 status is returned' },
      { flag: '-print', description: 'print the full file name on standard output' },
    ],
    examples: [
      'find . -name "*.txt"',
      'find /home -type f -mtime -7',
      'find . -size +100M',
      'find . -name "*.log" -exec rm {} \\;',
    ],
    relatedCommands: ['locate', 'which', 'whereis', 'grep'],
    seeAlso: ['locate', 'xargs', 'grep', 'ls'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-name pattern  base of file name matches shell pattern\n-type c  file is of type c (b,c,d,p,f,l,s)\n-mtime n  file data was last modified n*24 hours ago\n-size n[cwbkMG]  file uses n units of space\n-exec cmd ;  execute cmd; true if 0 status is returned\n-print  print the full file name on standard output',
        level: 1
      }
    ],
  },
  {
    name: 'sed',
    section: 1,
    title: 'stream editor for filtering and transforming text',
    description: 'sed is a stream editor. A stream editor is used to perform basic text transformations on an input stream (a file or input from a pipeline).',
    synopsis: 'sed [OPTION]... {script-only-if-no-other-script} [input-file]...',
    options: [
      { flag: '-e script', description: 'add the script to the commands to be executed' },
      { flag: '-f script-file', description: 'add the contents of script-file to the commands' },
      { flag: '-i[SUFFIX]', description: 'edit files in place (makes backup if SUFFIX supplied)' },
      { flag: '-n', description: 'suppress automatic printing of pattern space' },
      { flag: '-r', description: 'use extended regular expressions in the script' },
    ],
    examples: [
      'sed "s/old/new/g" file.txt',
      'sed -i "s/foo/bar/g" *.txt',
      'sed -n "1,10p" file.txt',
      'sed "/pattern/d" file.txt',
    ],
    relatedCommands: ['awk', 'grep', 'tr', 'cut'],
    seeAlso: ['awk', 'grep', 'ed', 'tr'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-e script  add the script to the commands to be executed\n-f script-file  add the contents of script-file to the commands\n-i[SUFFIX]  edit files in place (makes backup if SUFFIX supplied)\n-n  suppress automatic printing of pattern space\n-r  use extended regular expressions in the script',
        level: 1
      }
    ],
  },
  {
    name: 'awk',
    section: 1,
    title: 'pattern scanning and processing language',
    description: 'awk is a pattern scanning and processing language. It searches files for lines that contain certain patterns and performs specified actions on those lines.',
    synopsis: 'awk [-F fs] [-v var=value] [-f progfile | "program text"] [file ...]',
    options: [
      { flag: '-F fs', description: 'use fs for the input field separator' },
      { flag: '-v var=value', description: 'assign value to variable var before execution' },
      { flag: '-f progfile', description: 'read the AWK program from file progfile' },
      { flag: '-W option', description: 'enable compatibility or warning options' },
    ],
    examples: [
      'awk "{print $1}" file.txt',
      'awk -F: "{print $1}" /etc/passwd',
      'awk "NR > 10" file.txt',
      'awk "{sum+=$1} END {print sum}" numbers.txt',
    ],
    relatedCommands: ['sed', 'grep', 'perl', 'cut'],
    seeAlso: ['sed', 'grep', 'perl', 'cut'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-F fs  use fs for the input field separator\n-v var=value  assign value to variable var before execution\n-f progfile  read the AWK program from file progfile\n-W option  enable compatibility or warning options',
        level: 1
      }
    ],
  },
  {
    name: 'chmod',
    section: 1,
    title: 'change file mode bits',
    description: 'chmod changes the file mode bits of each given file according to mode, which can be either a symbolic representation of changes to make, or an octal number representing the bit pattern for the new mode bits.',
    synopsis: 'chmod [OPTION]... MODE[,MODE]... FILE...',
    options: [
      { flag: '-R, --recursive', description: 'change files and directories recursively' },
      { flag: '-v, --verbose', description: 'output a diagnostic for every file processed' },
      { flag: '-c, --changes', description: 'like verbose but report only when a change is made' },
      { flag: '--reference=RFILE', description: 'use RFILE\'s mode instead of MODE values' },
    ],
    examples: [
      'chmod 755 script.sh',
      'chmod +x file.sh',
      'chmod -R 644 *.txt',
      'chmod u+rwx,g+rx,o+r file',
    ],
    relatedCommands: ['chown', 'chgrp', 'umask', 'ls'],
    seeAlso: ['chown', 'chgrp', 'umask', 'stat'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-R, --recursive  change files and directories recursively\n-v, --verbose  output a diagnostic for every file processed\n-c, --changes  like verbose but report only when a change is made\n--reference=RFILE  use RFILE\'s mode instead of MODE values',
        level: 1
      }
    ],
  },
  {
    name: 'pwd',
    section: 1,
    title: 'print name of current/working directory',
    description: 'Print the full filename of the current working directory.',
    synopsis: 'pwd [OPTION]...',
    options: [
      { flag: '-L, --logical', description: 'use PWD from environment, even if it contains symlinks' },
      { flag: '-P, --physical', description: 'avoid all symlinks' },
    ],
    examples: [
      'pwd',
      'pwd -P',
    ],
    relatedCommands: ['cd', 'dirs', 'readlink'],
    seeAlso: ['cd', 'dirs', 'readlink'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-L, --logical  use PWD from environment, even if it contains symlinks\n-P, --physical  avoid all symlinks',
        level: 1
      }
    ],
  },
  {
    name: 'cp',
    section: 1,
    title: 'copy files and directories',
    description: 'Copy SOURCE to DEST, or multiple SOURCE(s) to DIRECTORY.',
    synopsis: 'cp [OPTION]... [-T] SOURCE DEST',
    options: [
      { flag: '-r, -R, --recursive', description: 'copy directories recursively' },
      { flag: '-v, --verbose', description: 'explain what is being done' },
      { flag: '-i, --interactive', description: 'prompt before overwrite' },
      { flag: '-f, --force', description: 'if destination cannot be opened, remove it and try again' },
      { flag: '-p', description: 'preserve mode, ownership, timestamps' },
    ],
    examples: [
      'cp file1.txt file2.txt',
      'cp -r dir1/ dir2/',
      'cp -i source.txt dest.txt',
      'cp -p original.conf backup.conf',
    ],
    relatedCommands: ['mv', 'rm', 'rsync', 'dd'],
    seeAlso: ['mv', 'rm', 'rsync', 'ln'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-r, -R, --recursive  copy directories recursively\n-v, --verbose  explain what is being done\n-i, --interactive  prompt before overwrite\n-f, --force  if destination cannot be opened, remove it and try again\n-p  preserve mode, ownership, timestamps',
        level: 1
      }
    ],
  },
  {
    name: 'mv',
    section: 1,
    title: 'move (rename) files',
    description: 'Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.',
    synopsis: 'mv [OPTION]... [-T] SOURCE DEST',
    options: [
      { flag: '-f, --force', description: 'do not prompt before overwriting' },
      { flag: '-i, --interactive', description: 'prompt before overwrite' },
      { flag: '-n, --no-clobber', description: 'do not overwrite an existing file' },
      { flag: '-v, --verbose', description: 'explain what is being done' },
    ],
    examples: [
      'mv oldname.txt newname.txt',
      'mv file.txt /path/to/directory/',
      'mv -i source.txt dest.txt',
      'mv *.log /var/log/old/',
    ],
    relatedCommands: ['cp', 'rm', 'rename', 'ln'],
    seeAlso: ['cp', 'rm', 'rename', 'ln'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-f, --force  do not prompt before overwriting\n-i, --interactive  prompt before overwrite\n-n, --no-clobber  do not overwrite an existing file\n-v, --verbose  explain what is being done',
        level: 1
      }
    ],
  },
  {
    name: 'rm',
    section: 1,
    title: 'remove files or directories',
    description: 'rm removes each specified file. By default, it does not remove directories.',
    synopsis: 'rm [OPTION]... FILE...',
    options: [
      { flag: '-f, --force', description: 'ignore nonexistent files, never prompt' },
      { flag: '-i', description: 'prompt before every removal' },
      { flag: '-r, -R, --recursive', description: 'remove directories and their contents recursively' },
      { flag: '-v, --verbose', description: 'explain what is being done' },
    ],
    examples: [
      'rm file.txt',
      'rm -rf directory/',
      'rm -i important.txt',
      'rm *.tmp',
    ],
    relatedCommands: ['rmdir', 'unlink', 'shred', 'find'],
    seeAlso: ['rmdir', 'unlink', 'shred', 'find'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-f, --force  ignore nonexistent files, never prompt\n-i  prompt before every removal\n-r, -R, --recursive  remove directories and their contents recursively\n-v, --verbose  explain what is being done',
        level: 1
      }
    ],
  },
  {
    name: 'mkdir',
    section: 1,
    title: 'make directories',
    description: 'Create the DIRECTORY(ies), if they do not already exist.',
    synopsis: 'mkdir [OPTION]... DIRECTORY...',
    options: [
      { flag: '-m, --mode=MODE', description: 'set file mode (as in chmod)' },
      { flag: '-p, --parents', description: 'make parent directories as needed' },
      { flag: '-v, --verbose', description: 'print a message for each created directory' },
    ],
    examples: [
      'mkdir newdir',
      'mkdir -p path/to/new/dir',
      'mkdir -m 755 public',
      'mkdir dir1 dir2 dir3',
    ],
    relatedCommands: ['rmdir', 'install', 'mkfifo', 'mknod'],
    seeAlso: ['rmdir', 'install', 'chmod', 'umask'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-m, --mode=MODE  set file mode (as in chmod)\n-p, --parents  make parent directories as needed\n-v, --verbose  print a message for each created directory',
        level: 1
      }
    ],
  },
  {
    name: 'cat',
    section: 1,
    title: 'concatenate files and print on the standard output',
    description: 'Concatenate FILE(s) to standard output.',
    synopsis: 'cat [OPTION]... [FILE]...',
    options: [
      { flag: '-n, --number', description: 'number all output lines' },
      { flag: '-b, --number-nonblank', description: 'number nonempty output lines' },
      { flag: '-s, --squeeze-blank', description: 'suppress repeated empty output lines' },
      { flag: '-E, --show-ends', description: 'display $ at end of each line' },
    ],
    examples: [
      'cat file.txt',
      'cat file1.txt file2.txt > combined.txt',
      'cat -n script.sh',
      'cat < input.txt',
    ],
    relatedCommands: ['tac', 'less', 'more', 'head', 'tail'],
    seeAlso: ['tac', 'less', 'head', 'tail'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-n, --number  number all output lines\n-b, --number-nonblank  number nonempty output lines\n-s, --squeeze-blank  suppress repeated empty output lines\n-E, --show-ends  display $ at end of each line',
        level: 1
      }
    ],
  },
  {
    name: 'echo',
    section: 1,
    title: 'display a line of text',
    description: 'Echo the STRING(s) to standard output.',
    synopsis: 'echo [SHORT-OPTION]... [STRING]...',
    options: [
      { flag: '-n', description: 'do not output the trailing newline' },
      { flag: '-e', description: 'enable interpretation of backslash escapes' },
      { flag: '-E', description: 'disable interpretation of backslash escapes (default)' },
    ],
    examples: [
      'echo "Hello World"',
      'echo -n "No newline"',
      'echo -e "Line 1\\nLine 2"',
      'echo $PATH',
    ],
    relatedCommands: ['printf', 'cat', 'tee'],
    seeAlso: ['printf', 'cat', 'tee'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-n  do not output the trailing newline\n-e  enable interpretation of backslash escapes\n-E  disable interpretation of backslash escapes (default)',
        level: 1
      }
    ],
  },
  {
    name: 'ps',
    section: 1,
    title: 'report a snapshot of current processes',
    description: 'ps displays information about a selection of the active processes.',
    synopsis: 'ps [options]',
    options: [
      { flag: '-e', description: 'select all processes' },
      { flag: '-f', description: 'full-format listing' },
      { flag: '-u user', description: 'select by effective user ID' },
      { flag: 'aux', description: 'BSD-style output with all processes' },
    ],
    examples: [
      'ps',
      'ps aux',
      'ps -ef',
      'ps -u username',
    ],
    relatedCommands: ['top', 'htop', 'pgrep', 'kill'],
    seeAlso: ['top', 'pgrep', 'kill', 'pkill'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-e  select all processes\n-f  full-format listing\n-u user  select by effective user ID\naux  BSD-style output with all processes',
        level: 1
      }
    ],
  },
  {
    name: 'kill',
    section: 1,
    title: 'send a signal to a process',
    description: 'The default signal for kill is TERM. Use -l or -L to list available signals.',
    synopsis: 'kill [-s signal|-p] [-q sigval] [-a] [--] pid...',
    options: [
      { flag: '-9, -KILL', description: 'send SIGKILL signal' },
      { flag: '-15, -TERM', description: 'send SIGTERM signal (default)' },
      { flag: '-l', description: 'list signal names' },
      { flag: '-s signal', description: 'specify the signal to send' },
    ],
    examples: [
      'kill 1234',
      'kill -9 5678',
      'kill -TERM 9012',
      'kill -l',
    ],
    relatedCommands: ['killall', 'pkill', 'ps', 'signal'],
    seeAlso: ['killall', 'pkill', 'ps', 'pgrep'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-9, -KILL  send SIGKILL signal\n-15, -TERM  send SIGTERM signal (default)\n-l  list signal names\n-s signal  specify the signal to send',
        level: 1
      }
    ],
  },
  {
    name: 'tar',
    section: 1,
    title: 'an archiving utility',
    description: 'GNU tar saves many files together into a single tape or disk archive, and can restore individual files from the archive.',
    synopsis: 'tar [OPTION...] [FILE]...',
    options: [
      { flag: '-c, --create', description: 'create a new archive' },
      { flag: '-x, --extract', description: 'extract files from an archive' },
      { flag: '-v, --verbose', description: 'verbosely list files processed' },
      { flag: '-f, --file=ARCHIVE', description: 'use archive file or device ARCHIVE' },
      { flag: '-z, --gzip', description: 'filter the archive through gzip' },
    ],
    examples: [
      'tar -cvf archive.tar directory/',
      'tar -xvf archive.tar',
      'tar -czvf archive.tar.gz directory/',
      'tar -xzvf archive.tar.gz',
    ],
    relatedCommands: ['gzip', 'zip', 'unzip', 'ar'],
    seeAlso: ['gzip', 'zip', 'unzip', 'ar'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-c, --create  create a new archive\n-x, --extract  extract files from an archive\n-v, --verbose  verbosely list files processed\n-f, --file=ARCHIVE  use archive file or device ARCHIVE\n-z, --gzip  filter the archive through gzip',
        level: 1
      }
    ],
  },
  {
    name: 'ssh',
    section: 1,
    title: 'OpenSSH SSH client (remote login program)',
    description: 'ssh (SSH client) is a program for logging into a remote machine and for executing commands on a remote machine.',
    synopsis: 'ssh [-l login_name] hostname | user@hostname [command]',
    options: [
      { flag: '-p port', description: 'port to connect to on the remote host' },
      { flag: '-i identity_file', description: 'identity (private key) for public key authentication' },
      { flag: '-v', description: 'verbose mode' },
      { flag: '-X', description: 'enables X11 forwarding' },
    ],
    examples: [
      'ssh user@hostname',
      'ssh -p 2222 user@hostname',
      'ssh -i ~/.ssh/id_rsa user@hostname',
      'ssh user@hostname "ls -la"',
    ],
    relatedCommands: ['scp', 'sftp', 'ssh-keygen', 'ssh-copy-id'],
    seeAlso: ['scp', 'sftp', 'ssh-keygen', 'ssh-copy-id'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'OPTIONS',
        content: '-p port  port to connect to on the remote host\n-i identity_file  identity (private key) for public key authentication\n-v  verbose mode\n-X  enables X11 forwarding',
        level: 1
      }
    ],
  },
  {
    name: 'git',
    section: 1,
    title: 'the fast distributed version control system',
    description: 'Git is a fast, scalable, distributed revision control system with an unusually rich command set.',
    synopsis: 'git [--version] [--help] [-C <path>] <command> [<args>]',
    options: [
      { flag: 'clone', description: 'clone a repository into a new directory' },
      { flag: 'add', description: 'add file contents to the index' },
      { flag: 'commit', description: 'record changes to the repository' },
      { flag: 'push', description: 'update remote refs along with associated objects' },
      { flag: 'pull', description: 'fetch from and integrate with another repository' },
    ],
    examples: [
      'git clone https://github.com/user/repo.git',
      'git add .',
      'git commit -m "Initial commit"',
      'git push origin main',
    ],
    relatedCommands: ['svn', 'hg', 'cvs'],
    seeAlso: ['git-clone', 'git-add', 'git-commit', 'git-push'],
    category: 'User Commands',
    isCommon: true,
    sections: [
      {
        id: 'options',
        title: 'COMMON COMMANDS',
        content: 'clone  clone a repository into a new directory\nadd  add file contents to the index\ncommit  record changes to the repository\npush  update remote refs along with associated objects\npull  fetch from and integrate with another repository',
        level: 1
      }
    ],
  },
];

// Merge enhanced pages with any legacy pages, preferring enhanced
const manPages = [...enhancedManPages];

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
    page.description.toLowerCase().includes(lowerQuery) ||
    (page.keywords || []).some(k => k.toLowerCase().includes(lowerQuery))
  );
}