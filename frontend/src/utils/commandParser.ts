export interface CommandToken {
  type: 'command' | 'argument' | 'option' | 'pipe' | 'redirect' | 'string' | 'variable';
  value: string;
  start: number;
  end: number;
}

export interface CommandSuggestion {
  command: string;
  description: string;
  usage?: string;
  dangerous?: boolean;
}

// Common Linux commands with descriptions
const COMMAND_DATABASE: Record<string, CommandSuggestion> = {
  ls: {
    command: 'ls',
    description: 'List directory contents',
    usage: 'ls [OPTIONS] [FILE]...'
  },
  cd: {
    command: 'cd',
    description: 'Change directory',
    usage: 'cd [DIRECTORY]'
  },
  pwd: {
    command: 'pwd',
    description: 'Print working directory',
    usage: 'pwd [OPTIONS]'
  },
  echo: {
    command: 'echo',
    description: 'Display a line of text',
    usage: 'echo [OPTIONS] [STRING]...'
  },
  cat: {
    command: 'cat',
    description: 'Concatenate files and print to stdout',
    usage: 'cat [OPTIONS] [FILE]...'
  },
  grep: {
    command: 'grep',
    description: 'Search text patterns in files',
    usage: 'grep [OPTIONS] PATTERN [FILE]...'
  },
  find: {
    command: 'find',
    description: 'Search for files and directories',
    usage: 'find [PATH] [OPTIONS] [EXPRESSION]'
  },
  chmod: {
    command: 'chmod',
    description: 'Change file permissions',
    usage: 'chmod [OPTIONS] MODE FILE...'
  },
  chown: {
    command: 'chown',
    description: 'Change file ownership',
    usage: 'chown [OPTIONS] OWNER[:GROUP] FILE...'
  },
  rm: {
    command: 'rm',
    description: 'Remove files or directories',
    usage: 'rm [OPTIONS] FILE...',
    dangerous: true
  },
  'rm -rf': {
    command: 'rm -rf',
    description: 'Force remove files/directories recursively',
    usage: 'rm -rf [PATH]',
    dangerous: true
  },
  sudo: {
    command: 'sudo',
    description: 'Execute as superuser',
    usage: 'sudo [OPTIONS] COMMAND',
    dangerous: true
  },
  dd: {
    command: 'dd',
    description: 'Convert and copy files',
    usage: 'dd [OPTIONS]',
    dangerous: true
  },
  mkfs: {
    command: 'mkfs',
    description: 'Build a file system',
    usage: 'mkfs [OPTIONS] DEVICE',
    dangerous: true
  },
  fdisk: {
    command: 'fdisk',
    description: 'Manipulate disk partition table',
    usage: 'fdisk [OPTIONS] DEVICE',
    dangerous: true
  },
  man: {
    command: 'man',
    description: 'Display manual pages',
    usage: 'man [OPTIONS] [SECTION] PAGE'
  },
  help: {
    command: 'help',
    description: 'Display help information',
    usage: 'help [COMMAND]'
  },
  clear: {
    command: 'clear',
    description: 'Clear terminal screen',
    usage: 'clear'
  },
  date: {
    command: 'date',
    description: 'Display or set system date and time',
    usage: 'date [OPTIONS] [+FORMAT]'
  },
  whoami: {
    command: 'whoami',
    description: 'Display current username',
    usage: 'whoami'
  },
  ps: {
    command: 'ps',
    description: 'Display process status',
    usage: 'ps [OPTIONS]'
  },
  top: {
    command: 'top',
    description: 'Display running processes',
    usage: 'top [OPTIONS]'
  },
  kill: {
    command: 'kill',
    description: 'Terminate processes',
    usage: 'kill [OPTIONS] PID...',
    dangerous: true
  },
  mkdir: {
    command: 'mkdir',
    description: 'Create directories',
    usage: 'mkdir [OPTIONS] DIRECTORY...'
  },
  touch: {
    command: 'touch',
    description: 'Create empty files or update timestamps',
    usage: 'touch [OPTIONS] FILE...'
  },
  cp: {
    command: 'cp',
    description: 'Copy files or directories',
    usage: 'cp [OPTIONS] SOURCE DEST'
  },
  mv: {
    command: 'mv',
    description: 'Move/rename files or directories',
    usage: 'mv [OPTIONS] SOURCE DEST'
  },
  head: {
    command: 'head',
    description: 'Display first lines of files',
    usage: 'head [OPTIONS] [FILE]...'
  },
  tail: {
    command: 'tail',
    description: 'Display last lines of files',
    usage: 'tail [OPTIONS] [FILE]...'
  },
  sort: {
    command: 'sort',
    description: 'Sort lines of text files',
    usage: 'sort [OPTIONS] [FILE]...'
  },
  uniq: {
    command: 'uniq',
    description: 'Report or omit repeated lines',
    usage: 'uniq [OPTIONS] [INPUT [OUTPUT]]'
  },
  wc: {
    command: 'wc',
    description: 'Print line, word, and byte counts',
    usage: 'wc [OPTIONS] [FILE]...'
  },
  tar: {
    command: 'tar',
    description: 'Archive files',
    usage: 'tar [OPTIONS] [FILE]...'
  },
  gzip: {
    command: 'gzip',
    description: 'Compress files',
    usage: 'gzip [OPTIONS] [FILE]...'
  },
  gunzip: {
    command: 'gunzip',
    description: 'Decompress files',
    usage: 'gunzip [OPTIONS] [FILE]...'
  },
  wget: {
    command: 'wget',
    description: 'Download files from the web',
    usage: 'wget [OPTIONS] URL'
  },
  curl: {
    command: 'curl',
    description: 'Transfer data from URLs',
    usage: 'curl [OPTIONS] URL'
  },
  ssh: {
    command: 'ssh',
    description: 'Secure shell client',
    usage: 'ssh [OPTIONS] [USER@]HOSTNAME [COMMAND]'
  },
  scp: {
    command: 'scp',
    description: 'Secure copy files',
    usage: 'scp [OPTIONS] SOURCE DEST'
  },
  git: {
    command: 'git',
    description: 'Version control system',
    usage: 'git [OPTIONS] COMMAND [ARGS]'
  },
  vim: {
    command: 'vim',
    description: 'Text editor',
    usage: 'vim [OPTIONS] [FILE]...'
  },
  nano: {
    command: 'nano',
    description: 'Text editor',
    usage: 'nano [OPTIONS] [FILE]'
  },
  sed: {
    command: 'sed',
    description: 'Stream editor',
    usage: 'sed [OPTIONS] SCRIPT [FILE]...'
  },
  awk: {
    command: 'awk',
    description: 'Pattern scanning and processing',
    usage: 'awk [OPTIONS] PROGRAM [FILE]...'
  }
};

// Parse command line into tokens
export function parseCommand(input: string): CommandToken[] {
  const tokens: CommandToken[] = [];
  let current = 0;
  let inString = false;
  let stringChar = '';
  let tokenStart = 0;
  let tokenValue = '';

  const addToken = (type: CommandToken['type'], value: string, start: number, end: number) => {
    if (value.trim()) {
      tokens.push({ type, value, start, end });
    }
  };

  while (current < input.length) {
    const char = input[current];

    // Handle strings
    if ((char === '"' || char === "'") && !inString) {
      inString = true;
      stringChar = char;
      tokenStart = current;
      tokenValue = char;
    } else if (char === stringChar && inString) {
      inString = false;
      tokenValue += char;
      addToken('string', tokenValue, tokenStart, current + 1);
      tokenValue = '';
    } else if (inString) {
      tokenValue += char;
    } else {
      // Handle other tokens
      switch (char) {
        case ' ':
        case '\t':
          if (tokenValue) {
            const type = determineTokenType(tokenValue, tokens);
            addToken(type, tokenValue, tokenStart, current);
            tokenValue = '';
          }
          break;
        case '|':
          if (tokenValue) {
            const type = determineTokenType(tokenValue, tokens);
            addToken(type, tokenValue, tokenStart, current);
            tokenValue = '';
          }
          addToken('pipe', '|', current, current + 1);
          break;
        case '>':
        case '<':
          if (tokenValue) {
            const type = determineTokenType(tokenValue, tokens);
            addToken(type, tokenValue, tokenStart, current);
            tokenValue = '';
          }
          // Check for >> or <<
          if (current + 1 < input.length && input[current + 1] === char) {
            addToken('redirect', char + char, current, current + 2);
            current++;
          } else {
            addToken('redirect', char, current, current + 1);
          }
          break;
        case '$':
          if (tokenValue) {
            const type = determineTokenType(tokenValue, tokens);
            addToken(type, tokenValue, tokenStart, current);
            tokenValue = '';
          }
          tokenStart = current;
          tokenValue = char;
          // Read variable name
          current++;
          while (current < input.length && /[a-zA-Z0-9_]/.test(input[current])) {
            tokenValue += input[current];
            current++;
          }
          addToken('variable', tokenValue, tokenStart, current);
          tokenValue = '';
          current--;
          break;
        default:
          if (!tokenValue) {
            tokenStart = current;
          }
          tokenValue += char;
      }
    }
    current++;
  }

  // Add final token
  if (tokenValue) {
    const type = determineTokenType(tokenValue, tokens);
    addToken(type, tokenValue, tokenStart, current);
  }

  return tokens;
}

function determineTokenType(value: string, previousTokens: CommandToken[]): CommandToken['type'] {
  // First token is usually a command
  if (previousTokens.length === 0 || 
      previousTokens[previousTokens.length - 1].type === 'pipe') {
    return 'command';
  }

  // Options start with -
  if (value.startsWith('-')) {
    return 'option';
  }

  // Default to argument
  return 'argument';
}

// Get command suggestions based on partial input
export function getCommandSuggestions(partial: string): CommandSuggestion[] {
  if (!partial) return [];

  const suggestions: CommandSuggestion[] = [];
  const lowerPartial = partial.toLowerCase();

  for (const [cmd, info] of Object.entries(COMMAND_DATABASE)) {
    if (cmd.toLowerCase().startsWith(lowerPartial)) {
      suggestions.push(info);
    }
  }

  return suggestions.sort((a, b) => {
    // Prioritize exact matches
    if (a.command === partial) return -1;
    if (b.command === partial) return 1;
    // Then prioritize non-dangerous commands
    if (a.dangerous && !b.dangerous) return 1;
    if (!a.dangerous && b.dangerous) return -1;
    // Finally sort alphabetically
    return a.command.localeCompare(b.command);
  });
}

// Check if a command is dangerous
export function isDangerousCommand(command: string): boolean {
  const tokens = parseCommand(command);
  if (tokens.length === 0) return false;

  const cmd = tokens[0].value;
  const cmdInfo = COMMAND_DATABASE[cmd];
  
  // Check for known dangerous commands
  if (cmdInfo?.dangerous) return true;

  // Check for specific dangerous patterns
  if (cmd === 'rm' && tokens.some(t => t.value === '-rf' || t.value === '-fr')) {
    return true;
  }

  if (cmd === 'dd' && tokens.some(t => t.value.startsWith('of='))) {
    return true;
  }

  // Any command with sudo is potentially dangerous
  if (cmd === 'sudo') return true;

  return false;
}

// Get command explanation
export function explainCommand(command: string): string[] {
  const tokens = parseCommand(command);
  const explanations: string[] = [];

  tokens.forEach((token, index) => {
    if (token.type === 'command') {
      const cmdInfo = COMMAND_DATABASE[token.value];
      if (cmdInfo) {
        explanations.push(`${token.value}: ${cmdInfo.description}`);
      }
    } else if (token.type === 'option') {
      explanations.push(`${token.value}: Command option/flag`);
    } else if (token.type === 'pipe') {
      explanations.push(`|: Pipe output to next command`);
    } else if (token.type === 'redirect') {
      if (token.value === '>') {
        explanations.push(`>: Redirect output to file (overwrite)`);
      } else if (token.value === '>>') {
        explanations.push(`>>: Redirect output to file (append)`);
      } else if (token.value === '<') {
        explanations.push(`<: Redirect input from file`);
      }
    } else if (token.type === 'variable') {
      explanations.push(`${token.value}: Environment variable`);
    }
  });

  return explanations;
}