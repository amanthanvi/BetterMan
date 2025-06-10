import React, { useState, useEffect } from 'react';
import { EnhancedTerminal } from '../components/terminal/EnhancedTerminal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import { 
  Terminal as TerminalIcon, 
  BookOpen, 
  Code2, 
  GraduationCap,
  Lightbulb,
  Share2,
  Download,
  Play,
  ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Tutorial {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: string;
  steps: number;
}

interface CommandSnippet {
  id: string;
  title: string;
  description: string;
  command: string;
  category: string;
  tags: string[];
  dangerous: boolean;
}

const TerminalPage: React.FC = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [snippets, setSnippets] = useState<CommandSnippet[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [splitScreen, setSplitScreen] = useState(false);
  const [initialCommand, setInitialCommand] = useState<string | undefined>();

  useEffect(() => {
    loadTutorials();
    loadSnippets();
    
    // Check if there's a command to execute from navigation
    const commandToExecute = sessionStorage.getItem('terminal-execute-command');
    if (commandToExecute) {
      setInitialCommand(commandToExecute);
      sessionStorage.removeItem('terminal-execute-command');
    }
  }, []);

  const loadTutorials = async () => {
    try {
      const response = await api.get('/terminal/tutorials');
      setTutorials(response.data);
    } catch (error) {
      console.error('Failed to load tutorials:', error);
    }
  };

  const loadSnippets = async () => {
    try {
      const params = selectedCategory !== 'all' ? { category: selectedCategory } : {};
      const response = await api.get('/terminal/snippets', { params });
      setSnippets(response.data);
    } catch (error) {
      console.error('Failed to load snippets:', error);
    }
  };

  useEffect(() => {
    loadSnippets();
  }, [selectedCategory]);

  const handleCommandExecute = async (command: string): Promise<string> => {
    try {
      const response = await api.post('/terminal/execute', {
        command,
        session_id: sessionId,
        timeout: 30
      });
      
      if (!sessionId) {
        setSessionId(response.data.session_id);
      }
      
      return response.data.output || response.data.error || '';
    } catch (error) {
      console.error('Command execution failed:', error);
      return `Error: ${error instanceof Error ? error.message : 'Command execution failed'}`;
    }
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const startTutorial = (tutorialId: string) => {
    navigate(`/terminal/tutorial/${tutorialId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TerminalIcon className="w-8 h-8 text-green-500" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Interactive Terminal Playground
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Learn Linux commands in a safe, sandboxed environment
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSplitScreen(!splitScreen)}
              >
                {splitScreen ? 'Single View' : 'Split View'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="terminal" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="terminal">Terminal</TabsTrigger>
            <TabsTrigger value="tutorials">Tutorials</TabsTrigger>
            <TabsTrigger value="snippets">Snippets</TabsTrigger>
          </TabsList>

          {/* Terminal Tab */}
          <TabsContent value="terminal" className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <Badge variant="success">Safe Environment</Badge>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Commands run in an isolated Docker container
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Lightbulb className="w-4 h-4" />
                  <span>Press Tab for autocomplete, ↑/↓ for history</span>
                </div>
              </div>

              <EnhancedTerminal
                onCommandExecute={handleCommandExecute}
                sessionId={sessionId}
                splitScreen={splitScreen}
                enableSandbox={true}
                theme="dark"
                initialCommands={initialCommand ? [initialCommand] : undefined}
              />
            </div>

            {/* Quick Tips */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-blue-500" />
                  Try These Commands
                </h3>
                <div className="space-y-1 text-sm">
                  <code className="block bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    ls -la
                  </code>
                  <code className="block bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    ps aux | grep bash
                  </code>
                  <code className="block bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    find . -name "*.txt"
                  </code>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-green-500" />
                  Documentation Links
                </h3>
                <div className="space-y-1 text-sm">
                  <button
                    onClick={() => navigate('/doc/ls')}
                    className="block text-blue-600 hover:underline"
                  >
                    man ls - List files
                  </button>
                  <button
                    onClick={() => navigate('/doc/grep')}
                    className="block text-blue-600 hover:underline"
                  >
                    man grep - Search text
                  </button>
                  <button
                    onClick={() => navigate('/doc/find')}
                    className="block text-blue-600 hover:underline"
                  >
                    man find - Find files
                  </button>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-purple-500" />
                  Share & Export
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Share your terminal session or export command history
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    <Share2 className="w-3 h-3 mr-1" />
                    Share
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download className="w-3 h-3 mr-1" />
                    Export
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Tutorials Tab */}
          <TabsContent value="tutorials" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tutorials.map((tutorial) => (
                <Card key={tutorial.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <GraduationCap className="w-8 h-8 text-blue-500" />
                    <Badge 
                      variant={
                        tutorial.difficulty === 'beginner' ? 'success' :
                        tutorial.difficulty === 'intermediate' ? 'warning' :
                        'danger'
                      }
                    >
                      {tutorial.difficulty}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{tutorial.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {tutorial.description}
                  </p>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{tutorial.duration}</span>
                    <span>{tutorial.steps} steps</span>
                  </div>
                  <Button
                    className="w-full mt-4"
                    onClick={() => startTutorial(tutorial.id)}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Tutorial
                  </Button>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Snippets Tab */}
          <TabsContent value="snippets" className="space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <span className="text-sm font-medium">Category:</span>
              <div className="flex gap-2">
                {['all', 'file-management', 'text-processing', 'system'].map((cat) => (
                  <Button
                    key={cat}
                    size="sm"
                    variant={selectedCategory === cat ? 'primary' : 'outline'}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {snippets.map((snippet) => (
                <Card key={snippet.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold">{snippet.title}</h3>
                    {snippet.dangerous && (
                      <Badge variant="danger" className="text-xs">
                        Dangerous
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {snippet.description}
                  </p>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded p-3 font-mono text-sm mb-3">
                    {snippet.command}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {snippet.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyCommand(snippet.command)}
                    >
                      Copy
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default TerminalPage;