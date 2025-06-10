import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import 'xterm/css/xterm.css';
import { 
  Loader2, 
  Terminal as TerminalIcon, 
  X, 
  Maximize2, 
  Minimize2,
  AlertTriangle,
  Info,
  Play,
  Save,
  Share2,
  History
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { 
  parseCommand, 
  getCommandSuggestions, 
  isDangerousCommand,
  explainCommand,
  CommandSuggestion
} from '../../utils/commandParser';
import { useNavigate } from 'react-router-dom';

interface EnhancedTerminalProps {
  className?: string;
  onCommandExecute?: (command: string) => Promise<string>;
  initialCommands?: string[];
  theme?: 'dark' | 'light' | 'monokai' | 'solarized';
  enableSandbox?: boolean;
  splitScreen?: boolean;
  sessionId?: string;
}

const THEMES = {
  dark: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#ffffff',
    selection: '#264f78',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5'
  },
  light: {
    background: '#ffffff',
    foreground: '#383a42',
    cursor: '#383a42',
    selection: '#3e4451',
    black: '#000000',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#c18401',
    blue: '#0184bc',
    magenta: '#a626a4',
    cyan: '#0997b3',
    white: '#fafafa',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#d19a66',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff'
  },
  monokai: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selection: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5'
  },
  solarized: {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#839496',
    selection: '#073642',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3'
  }
};

export const EnhancedTerminal: React.FC<EnhancedTerminalProps> = ({
  className,
  onCommandExecute,
  initialCommands = [],
  theme = 'dark',
  enableSandbox = true,
  splitScreen = false,
  sessionId
}) => {
  const navigate = useNavigate();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentCommand, setCurrentCommand] = useState('');
  const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [commandExplanation, setCommandExplanation] = useState<string[]>([]);
  const [showDangerWarning, setShowDangerWarning] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: THEMES[theme],
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 10000,
      windowsMode: false,
      letterSpacing: 0.5,
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    // Try to load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon could not be loaded:', e);
    }

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome message
    term.writeln('\x1b[1;32m╔══════════════════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[1;32m║   Welcome to BetterMan Interactive Terminal      ║\x1b[0m');
    term.writeln('\x1b[1;32m╚══════════════════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('• Type \x1b[1;36mhelp\x1b[0m for available commands');
    term.writeln('• Use \x1b[1;36mTab\x1b[0m for auto-completion');
    term.writeln('• Press \x1b[1;36mCtrl+F\x1b[0m to search terminal output');
    term.writeln('• Commands are executed in a \x1b[1;33msafe sandbox\x1b[0m environment');
    term.writeln('');
    term.write('$ ');

    // Handle command input
    let commandBuffer = '';
    let cursorPosition = 0;

    term.onData((data) => {
      const code = data.charCodeAt(0);

      // Handle special keys
      if (code === 13) { // Enter
        if (showSuggestions && suggestions.length > 0) {
          // Apply selected suggestion
          commandBuffer = suggestions[selectedSuggestion].command;
          term.write('\r$ ' + commandBuffer);
          setShowSuggestions(false);
          setSuggestions([]);
          return;
        }

        term.writeln('');
        if (commandBuffer.trim()) {
          const trimmedCommand = commandBuffer.trim();
          
          // Check for dangerous commands
          if (isDangerousCommand(trimmedCommand)) {
            setShowDangerWarning(true);
            term.writeln('\x1b[1;31m⚠️  Warning: This command could be dangerous!\x1b[0m');
            term.writeln('Type "yes" to proceed or anything else to cancel.');
            term.write('Confirm: ');
            
            const originalCommand = trimmedCommand;
            commandBuffer = '';
            
            // Wait for confirmation
            const confirmHandler = (data: string) => {
              const confirmCode = data.charCodeAt(0);
              if (confirmCode === 13) { // Enter on confirmation
                term.writeln('');
                if (commandBuffer.trim().toLowerCase() === 'yes') {
                  handleCommand(originalCommand);
                } else {
                  term.writeln('\x1b[1;33mCommand cancelled.\x1b[0m');
                  term.write('$ ');
                }
                setShowDangerWarning(false);
                commandBuffer = '';
                term.offData(confirmHandler);
              } else if (confirmCode === 127) { // Backspace
                if (commandBuffer.length > 0) {
                  commandBuffer = commandBuffer.slice(0, -1);
                  term.write('\b \b');
                }
              } else if (confirmCode >= 32) { // Printable
                commandBuffer += data;
                term.write(data);
              }
            };
            
            term.onData(confirmHandler);
            return;
          }

          handleCommand(trimmedCommand);
          setCommandHistory(prev => [...prev, trimmedCommand]);
          setHistoryIndex(-1);
        }
        commandBuffer = '';
        cursorPosition = 0;
        setShowSuggestions(false);
        setSuggestions([]);
        if (!isLoading) {
          term.write('$ ');
        }
      } else if (code === 127) { // Backspace
        if (cursorPosition > 0) {
          const before = commandBuffer.slice(0, cursorPosition - 1);
          const after = commandBuffer.slice(cursorPosition);
          commandBuffer = before + after;
          cursorPosition--;
          
          // Rewrite the line
          term.write('\r$ ' + commandBuffer + ' ');
          term.write('\r$ ' + commandBuffer);
          
          // Move cursor to correct position
          if (after.length > 0) {
            term.write('\x1b[' + after.length + 'D');
          }
          
          updateSuggestions(commandBuffer);
        }
      } else if (code === 9) { // Tab
        if (suggestions.length > 0) {
          commandBuffer = suggestions[selectedSuggestion].command;
          cursorPosition = commandBuffer.length;
          term.write('\r$ ' + commandBuffer);
          setShowSuggestions(false);
          setSuggestions([]);
        }
      } else if (code === 27) { // Escape sequences
        if (data.length > 1) {
          if (data === '\x1b[A') { // Up arrow
            if (showSuggestions && suggestions.length > 0) {
              setSelectedSuggestion(Math.max(0, selectedSuggestion - 1));
            } else {
              navigateHistory('up');
            }
          } else if (data === '\x1b[B') { // Down arrow
            if (showSuggestions && suggestions.length > 0) {
              setSelectedSuggestion(Math.min(suggestions.length - 1, selectedSuggestion + 1));
            } else {
              navigateHistory('down');
            }
          } else if (data === '\x1b[C') { // Right arrow
            if (cursorPosition < commandBuffer.length) {
              cursorPosition++;
              term.write(data);
            }
          } else if (data === '\x1b[D') { // Left arrow
            if (cursorPosition > 0) {
              cursorPosition--;
              term.write(data);
            }
          }
        }
      } else if (code >= 32) { // Printable characters
        const before = commandBuffer.slice(0, cursorPosition);
        const after = commandBuffer.slice(cursorPosition);
        commandBuffer = before + data + after;
        cursorPosition++;
        
        // Rewrite from cursor position
        term.write(data + after);
        
        // Move cursor back if needed
        if (after.length > 0) {
          term.write('\x1b[' + after.length + 'D');
        }
        
        updateSuggestions(commandBuffer);
      }

      setCurrentCommand(commandBuffer);
      
      // Update command explanation
      if (commandBuffer.trim()) {
        const explanations = explainCommand(commandBuffer);
        setCommandExplanation(explanations);
      } else {
        setCommandExplanation([]);
      }
    });

    // Handle Ctrl+F for search
    term.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.key === 'f') {
        event.preventDefault();
        const searchTerm = prompt('Search in terminal:');
        if (searchTerm) {
          searchAddon.findNext(searchTerm);
        }
        return false;
      }
      return true;
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Execute initial commands
    initialCommands.forEach((cmd) => {
      term.writeln(`$ ${cmd}`);
      handleCommand(cmd);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [theme, initialCommands]);

  const updateSuggestions = useCallback((input: string) => {
    const tokens = parseCommand(input);
    if (tokens.length > 0 && tokens[tokens.length - 1].type === 'command') {
      const suggestions = getCommandSuggestions(tokens[tokens.length - 1].value);
      setSuggestions(suggestions.slice(0, 5));
      setSelectedSuggestion(0);
      setShowSuggestions(suggestions.length > 0);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, []);

  const handleCommand = useCallback(async (command: string) => {
    const term = xtermRef.current;
    if (!term) return;

    setIsLoading(true);

    try {
      // Handle built-in commands
      if (command === 'clear') {
        term.clear();
        setIsLoading(false);
        term.write('$ ');
        return;
      }

      if (command === 'help') {
        term.writeln('\x1b[1;36mAvailable Commands:\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[1;33mBasic Commands:\x1b[0m');
        term.writeln('  clear     - Clear the terminal screen');
        term.writeln('  help      - Show this help message');
        term.writeln('  man <cmd> - View documentation for a command');
        term.writeln('  history   - View command history');
        term.writeln('');
        term.writeln('\x1b[1;33mFile Operations:\x1b[0m');
        term.writeln('  ls        - List files and directories');
        term.writeln('  pwd       - Print working directory');
        term.writeln('  cd        - Change directory');
        term.writeln('  cat       - Display file contents');
        term.writeln('  mkdir     - Create directory');
        term.writeln('  touch     - Create empty file');
        term.writeln('');
        term.writeln('\x1b[1;33mText Processing:\x1b[0m');
        term.writeln('  echo      - Display text');
        term.writeln('  grep      - Search text patterns');
        term.writeln('  sed       - Stream editor');
        term.writeln('  awk       - Pattern processing');
        term.writeln('');
        term.writeln('\x1b[1;33mKeyboard Shortcuts:\x1b[0m');
        term.writeln('  Tab       - Auto-complete commands');
        term.writeln('  ↑/↓       - Navigate command history');
        term.writeln('  Ctrl+F    - Search terminal output');
        term.writeln('  Ctrl+C    - Cancel current command');
        term.writeln('');
        term.writeln('\x1b[1;32mTip:\x1b[0m Commands run in a safe sandbox environment');
        setIsLoading(false);
        term.write('$ ');
        return;
      }

      if (command === 'history') {
        term.writeln('\x1b[1;36mCommand History:\x1b[0m');
        commandHistory.forEach((cmd, index) => {
          term.writeln(`  ${index + 1}  ${cmd}`);
        });
        setIsLoading(false);
        term.write('$ ');
        return;
      }

      // Handle man command specially
      if (command.startsWith('man ')) {
        const manCmd = command.substring(4).trim();
        if (manCmd) {
          term.writeln(`\x1b[1;32mOpening man page for '${manCmd}'...\x1b[0m`);
          // Navigate to the document page
          navigate(`/doc/${manCmd}`);
        } else {
          term.writeln('\x1b[1;31mUsage: man <command>\x1b[0m');
        }
        setIsLoading(false);
        term.write('$ ');
        return;
      }

      // Execute command in sandbox
      if (enableSandbox && onCommandExecute) {
        term.writeln('\x1b[1;90mExecuting in sandbox...\x1b[0m');
        const result = await onCommandExecute(command);
        term.write(result);
      } else {
        // Simulate some basic commands for demo
        switch (command.split(' ')[0]) {
          case 'ls':
            term.writeln('bin   etc   lib   proc  sys   usr');
            term.writeln('boot  home  mnt   root  tmp   var');
            break;
          case 'pwd':
            term.writeln('/home/sandbox');
            break;
          case 'echo':
            term.writeln(command.substring(5));
            break;
          case 'date':
            term.writeln(new Date().toString());
            break;
          case 'whoami':
            term.writeln('sandbox-user');
            break;
          case 'uname':
            term.writeln('Linux sandbox 5.15.0 x86_64 GNU/Linux');
            break;
          default:
            term.writeln(`\x1b[1;31mCommand not found: ${command.split(' ')[0]}\x1b[0m`);
            term.writeln('Type "help" for available commands.');
        }
      }
    } catch (error) {
      term.writeln(`\x1b[1;31mError: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m`);
    } finally {
      setIsLoading(false);
      term.write('$ ');
    }
  }, [onCommandExecute, enableSandbox, navigate, commandHistory]);

  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    const term = xtermRef.current;
    if (!term || commandHistory.length === 0) return;

    let newIndex = historyIndex;
    if (direction === 'up' && historyIndex < commandHistory.length - 1) {
      newIndex = historyIndex + 1;
    } else if (direction === 'down' && historyIndex > -1) {
      newIndex = historyIndex - 1;
    }

    if (newIndex !== historyIndex) {
      // Clear current line
      const currentLength = currentCommand.length;
      term.write('\r$ ' + ' '.repeat(currentLength) + '\r$ ');

      // Write new command
      const newCommand = newIndex === -1 ? '' : commandHistory[commandHistory.length - 1 - newIndex];
      term.write(newCommand);
      setCurrentCommand(newCommand);
      setHistoryIndex(newIndex);
    }
  }, [commandHistory, historyIndex, currentCommand]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setTimeout(() => {
      fitAddonRef.current?.fit();
    }, 100);
  };

  const exportHistory = () => {
    const historyText = commandHistory.join('\n');
    const blob = new Blob([historyText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-history-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareSession = () => {
    if (sessionId) {
      const shareUrl = `${window.location.origin}/terminal/session/${sessionId}`;
      navigator.clipboard.writeText(shareUrl);
      alert('Session URL copied to clipboard!');
    }
  };

  return (
    <div className={cn(
      'flex',
      splitScreen ? 'h-screen' : '',
      isFullscreen && 'fixed inset-0 z-50',
      className
    )}>
      <div className={cn(
        'bg-gray-900 rounded-lg shadow-lg overflow-hidden flex flex-col',
        splitScreen ? 'w-1/2' : 'w-full'
      )}>
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-gray-300">Interactive Terminal</span>
            {enableSandbox && (
              <Badge variant="secondary" className="text-xs">
                Sandbox Mode
              </Badge>
            )}
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={exportHistory}
              className="text-gray-400 hover:text-gray-200"
              title="Export command history"
            >
              <Save className="w-4 h-4" />
            </Button>
            {sessionId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={shareSession}
                className="text-gray-400 hover:text-gray-200"
                title="Share session"
              >
                <Share2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="text-gray-400 hover:text-gray-200"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            {isFullscreen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="relative flex-1">
          <div
            ref={terminalRef}
            className="w-full h-full"
          />
          
          {/* Auto-completion dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute bottom-12 left-4 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.command}
                  className={cn(
                    'px-4 py-2 cursor-pointer transition-colors',
                    index === selectedSuggestion ? 'bg-gray-700' : 'hover:bg-gray-700/50'
                  )}
                  onClick={() => {
                    const term = xtermRef.current;
                    if (term) {
                      setCurrentCommand(suggestion.command);
                      term.write('\r$ ' + suggestion.command);
                      setShowSuggestions(false);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-gray-300">{suggestion.command}</span>
                    {suggestion.dangerous && (
                      <AlertTriangle className="w-3 h-3 text-red-400 ml-2" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{suggestion.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Command explanation bar */}
        {commandExplanation.length > 0 && (
          <div className="px-4 py-2 bg-gray-800/50 border-t border-gray-700">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5" />
              <div className="text-xs text-gray-400 space-y-1">
                {commandExplanation.map((explanation, index) => (
                  <div key={index}>{explanation}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Split screen documentation viewer */}
      {splitScreen && (
        <div className="w-1/2 bg-gray-50 dark:bg-gray-800 p-4 overflow-auto">
          <h3 className="text-lg font-semibold mb-4">Documentation</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Run "man &lt;command&gt;" to view documentation here
          </p>
        </div>
      )}
    </div>
  );
};