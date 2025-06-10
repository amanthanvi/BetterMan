import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import 'xterm/css/xterm.css';
import { Loader2, Terminal as TerminalIcon, X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

interface TerminalProps {
  className?: string;
  onCommandExecute?: (command: string) => void;
  initialCommands?: string[];
  theme?: 'dark' | 'light' | 'monokai' | 'solarized';
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

export const Terminal: React.FC<TerminalProps> = ({
  className,
  onCommandExecute,
  initialCommands = [],
  theme = 'dark'
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentCommand, setCurrentCommand] = useState('');

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: THEMES[theme],
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 10000,
      windowsMode: false,
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
    term.writeln('\x1b[1;32mWelcome to BetterMan Interactive Terminal\x1b[0m');
    term.writeln('Type "help" for available commands or "man <command>" to view documentation.');
    term.writeln('');
    term.write('$ ');

    // Handle command input
    let commandBuffer = '';
    term.onData((data) => {
      const code = data.charCodeAt(0);

      // Handle special keys
      if (code === 13) { // Enter
        term.writeln('');
        if (commandBuffer.trim()) {
          handleCommand(commandBuffer.trim());
          setCommandHistory(prev => [...prev, commandBuffer.trim()]);
          setHistoryIndex(-1);
        }
        commandBuffer = '';
        if (!isLoading) {
          term.write('$ ');
        }
      } else if (code === 127) { // Backspace
        if (commandBuffer.length > 0) {
          commandBuffer = commandBuffer.slice(0, -1);
          term.write('\b \b');
        }
      } else if (code === 27) { // Escape sequences
        // Handle arrow keys
        if (data.length > 1) {
          if (data === '\x1b[A') { // Up arrow
            navigateHistory('up');
          } else if (data === '\x1b[B') { // Down arrow
            navigateHistory('down');
          }
        }
      } else if (code >= 32) { // Printable characters
        commandBuffer += data;
        term.write(data);
      }

      setCurrentCommand(commandBuffer);
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
        term.writeln('  clear     - Clear the terminal screen');
        term.writeln('  help      - Show this help message');
        term.writeln('  man <cmd> - View documentation for a command');
        term.writeln('  ls        - List files in current directory');
        term.writeln('  pwd       - Print working directory');
        term.writeln('  echo      - Display a line of text');
        term.writeln('  date      - Display current date and time');
        term.writeln('');
        term.writeln('\x1b[1;33mTip:\x1b[0m Use up/down arrows to navigate command history');
        setIsLoading(false);
        term.write('$ ');
        return;
      }

      // Simulate command execution
      if (onCommandExecute) {
        onCommandExecute(command);
      }

      // Simulate some basic commands
      switch (command.split(' ')[0]) {
        case 'ls':
          term.writeln('bin   etc   lib   proc  sys   usr');
          term.writeln('boot  home  mnt   root  tmp   var');
          break;
        case 'pwd':
          term.writeln('/home/user');
          break;
        case 'echo':
          term.writeln(command.substring(5));
          break;
        case 'date':
          term.writeln(new Date().toString());
          break;
        case 'man':
          const manCmd = command.split(' ')[1];
          if (manCmd) {
            term.writeln(`\x1b[1;32mOpening man page for '${manCmd}'...\x1b[0m`);
            // Here you would integrate with the actual man page viewer
          } else {
            term.writeln('\x1b[1;31mUsage: man <command>\x1b[0m');
          }
          break;
        default:
          term.writeln(`\x1b[1;31mCommand not found: ${command.split(' ')[0]}\x1b[0m`);
          term.writeln('Type "help" for available commands.');
      }
    } catch (error) {
      term.writeln(`\x1b[1;31mError: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m`);
    } finally {
      setIsLoading(false);
      term.write('$ ');
    }
  }, [onCommandExecute]);

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

  return (
    <div className={cn(
      'bg-gray-900 rounded-lg shadow-lg overflow-hidden',
      isFullscreen && 'fixed inset-0 z-50',
      className
    )}>
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-gray-300">Interactive Terminal</span>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
        </div>
        <div className="flex items-center gap-2">
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
      <div
        ref={terminalRef}
        className={cn(
          'w-full',
          isFullscreen ? 'h-[calc(100vh-48px)]' : 'h-96'
        )}
      />
    </div>
  );
};