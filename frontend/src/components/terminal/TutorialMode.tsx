import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { EnhancedTerminal } from './EnhancedTerminal';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  XCircle,
  Lightbulb,
  RotateCcw,
  Trophy,
  BookOpen
} from 'lucide-react';
import { api } from '../../services/api';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';

interface TutorialStep {
  step: number;
  title: string;
  description: string;
  command: string;
  expected_output?: string;
  hint?: string;
}

interface TutorialProgress {
  currentStep: number;
  completedSteps: number[];
  startTime: Date;
  endTime?: Date;
}

const TutorialMode: React.FC = () => {
  const { tutorialId } = useParams<{ tutorialId: string }>();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [progress, setProgress] = useState<TutorialProgress>({
    currentStep: 0,
    completedSteps: [],
    startTime: new Date()
  });
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [showHint, setShowHint] = useState(false);
  const [lastCommand, setLastCommand] = useState('');
  const [commandOutput, setCommandOutput] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (tutorialId) {
      loadTutorialSteps();
    }
  }, [tutorialId]);

  const loadTutorialSteps = async () => {
    try {
      const response = await api.get(`/terminal/tutorials/${tutorialId}/steps`);
      setSteps(response.data);
    } catch (error) {
      console.error('Failed to load tutorial steps:', error);
      toast.error('Failed to load tutorial');
      navigate('/terminal');
    }
  };

  const currentStepData = steps[progress.currentStep];
  const isLastStep = progress.currentStep === steps.length - 1;
  const completionPercentage = (progress.completedSteps.length / steps.length) * 100;

  const handleCommandExecute = async (command: string): Promise<string> => {
    setLastCommand(command);
    setIsChecking(true);

    try {
      const response = await api.post('/terminal/execute', {
        command,
        session_id: sessionId,
        timeout: 30
      });
      
      if (!sessionId) {
        setSessionId(response.data.session_id);
      }
      
      const output = response.data.output || response.data.error || '';
      setCommandOutput(output);
      
      // Check if command matches expected
      if (currentStepData && command.trim() === currentStepData.command.trim()) {
        markStepComplete();
      }
      
      return output;
    } catch (error) {
      console.error('Command execution failed:', error);
      return `Error: ${error instanceof Error ? error.message : 'Command execution failed'}`;
    } finally {
      setIsChecking(false);
    }
  };

  const markStepComplete = () => {
    const newCompletedSteps = [...progress.completedSteps, progress.currentStep];
    setProgress({
      ...progress,
      completedSteps: newCompletedSteps
    });

    // Show success message
    toast.success('Step completed!');

    // If this was the last step, show completion
    if (isLastStep) {
      completeTutorial();
    } else {
      // Auto-advance to next step after a short delay
      setTimeout(() => {
        goToNextStep();
      }, 1500);
    }
  };

  const completeTutorial = () => {
    // Show confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Update progress
    setProgress({
      ...progress,
      endTime: new Date()
    });

    // Show completion modal
    toast.custom((t) => (
      <Card className="p-6 max-w-md">
        <div className="text-center">
          <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Tutorial Completed!</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Great job! You've completed all {steps.length} steps.
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => navigate('/terminal')}>
              Back to Terminal
            </Button>
            <Button variant="outline" onClick={() => navigate('/terminal')}>
              Try Another Tutorial
            </Button>
          </div>
        </div>
      </Card>
    ), { duration: Infinity });
  };

  const goToNextStep = () => {
    if (!isLastStep) {
      setProgress({
        ...progress,
        currentStep: progress.currentStep + 1
      });
      setShowHint(false);
      setLastCommand('');
      setCommandOutput('');
    }
  };

  const goToPreviousStep = () => {
    if (progress.currentStep > 0) {
      setProgress({
        ...progress,
        currentStep: progress.currentStep - 1
      });
      setShowHint(false);
      setLastCommand('');
      setCommandOutput('');
    }
  };

  const skipStep = () => {
    if (!isLastStep) {
      goToNextStep();
    }
  };

  const resetTutorial = () => {
    setProgress({
      currentStep: 0,
      completedSteps: [],
      startTime: new Date()
    });
    setShowHint(false);
    setLastCommand('');
    setCommandOutput('');
  };

  if (!currentStepData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/terminal')}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Tutorial Mode
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Step {progress.currentStep + 1} of {steps.length}
                </p>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="flex items-center gap-4">
              <div className="w-48 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetTutorial}
                title="Reset tutorial"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Instructions Panel */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-500" />
                Step {progress.currentStep + 1}: {currentStepData.title}
              </h2>
              
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {currentStepData.description}
              </p>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Expected Command:
                  </h3>
                  <code className="block bg-gray-100 dark:bg-gray-800 rounded p-3 font-mono text-sm">
                    {currentStepData.command}
                  </code>
                </div>

                {showHint && currentStepData.hint && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5" />
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        {currentStepData.hint}
                      </p>
                    </div>
                  </div>
                )}

                {!showHint && currentStepData.hint && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowHint(true)}
                    className="w-full"
                  >
                    <Lightbulb className="w-4 h-4 mr-2" />
                    Show Hint
                  </Button>
                )}

                {/* Step status */}
                {progress.completedSteps.includes(progress.currentStep) && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Step completed!</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Navigation */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousStep}
                  disabled={progress.currentStep === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skipStep}
                  disabled={isLastStep}
                >
                  Skip
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextStep}
                  disabled={isLastStep || !progress.completedSteps.includes(progress.currentStep)}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </Card>

            {/* Step indicators */}
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-3">Progress</h3>
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-2 text-sm ${
                      index === progress.currentStep
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : progress.completedSteps.includes(index)
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 dark:text-gray-600'
                    }`}
                  >
                    {progress.completedSteps.includes(index) ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : index === progress.currentStep ? (
                      <div className="w-4 h-4 rounded-full border-2 border-current" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-current" />
                    )}
                    <span>{step.title}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Terminal */}
          <div className="lg:col-span-2">
            <Card className="p-4">
              <div className="mb-4">
                <Badge variant="info">Tutorial Mode</Badge>
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                  Type the expected command and press Enter
                </span>
              </div>
              
              <EnhancedTerminal
                onCommandExecute={handleCommandExecute}
                sessionId={sessionId}
                enableSandbox={true}
                theme="dark"
                initialCommands={[`# Tutorial: Step ${progress.currentStep + 1}`]}
              />
              
              {/* Command validation feedback */}
              {lastCommand && (
                <div className="mt-4">
                  {lastCommand.trim() === currentStepData.command.trim() ? (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-sm">Correct! Moving to next step...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <XCircle className="w-5 h-5" />
                      <span className="text-sm">
                        Not quite right. Expected: <code className="font-mono">{currentStepData.command}</code>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialMode;