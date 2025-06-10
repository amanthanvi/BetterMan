import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Play, Terminal as TerminalIcon } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

interface TryItButtonProps {
  command: string;
  className?: string;
  variant?: 'inline' | 'block';
}

export const TryItButton: React.FC<TryItButtonProps> = ({ 
  command, 
  className = '',
  variant = 'inline'
}) => {
  const navigate = useNavigate();
  const { addToast } = useAppStore();

  const handleTryIt = () => {
    // Store the command in session storage to execute it in terminal
    sessionStorage.setItem('terminal-execute-command', command);
    
    // Navigate to terminal
    navigate('/terminal');
    
    // Show notification
    addToast({
      id: `try-${Date.now()}`,
      type: 'info',
      message: `Opening terminal with command: ${command}`,
      duration: 3000
    });
  };

  if (variant === 'inline') {
    return (
      <button
        onClick={handleTryIt}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors ${className}`}
        title="Try this command in the interactive terminal"
      >
        <Play className="w-3 h-3" />
        Try it
      </button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleTryIt}
      className={className}
    >
      <TerminalIcon className="w-4 h-4 mr-2" />
      Try in Terminal
    </Button>
  );
};