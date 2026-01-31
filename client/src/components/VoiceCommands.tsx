import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';

interface VoiceCommand {
  patterns: string[];
  action: () => void;
  description: string;
}

interface VoiceCommandsProps {
  commands: VoiceCommand[];
  onSearchCommand?: (query: string) => void;
  className?: string;
  showButton?: boolean;
  autoActivate?: boolean;
}

// Check if speech recognition is available
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function VoiceCommands({
  commands,
  onSearchCommand,
  className,
  showButton = true,
  autoActivate = false,
}: VoiceCommandsProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsSupported(!!SpeechRecognition);
  }, []);

  const processCommand = useCallback((text: string) => {
    const normalizedText = text.toLowerCase().trim();
    
    // Check for search command first
    const searchPatterns = ['search for', 'search', 'find', 'look for'];
    for (const pattern of searchPatterns) {
      if (normalizedText.startsWith(pattern)) {
        const query = normalizedText.replace(pattern, '').trim();
        if (query && onSearchCommand) {
          triggerHaptic('success');
          setLastCommand(`Search: "${query}"`);
          onSearchCommand(query);
          toast.success(`Searching for "${query}"`);
          return true;
        }
      }
    }

    // Check other commands
    for (const command of commands) {
      for (const pattern of command.patterns) {
        if (normalizedText.includes(pattern.toLowerCase())) {
          triggerHaptic('success');
          setLastCommand(command.description);
          command.action();
          toast.success(command.description);
          return true;
        }
      }
    }

    return false;
  }, [commands, onSearchCommand]);

  const startListening = useCallback(() => {
    if (!isSupported || isListening) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('');
        setLastCommand(null);
        triggerHaptic('light');
        toast.info('Listening for voice commands...', { duration: 2000 });
      };

      recognition.onresult = (event: any) => {
        const current = event.resultIndex;
        const result = event.results[current];
        const text = result[0].transcript;
        
        setTranscript(text);
        
        // Process final results
        if (result.isFinal) {
          const commandRecognized = processCommand(text);
          if (!commandRecognized) {
            toast.error(`Command not recognized: "${text}"`, { duration: 3000 });
            triggerHaptic('warning');
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'no-speech') {
          toast.info('No speech detected. Try again.');
        } else if (event.error === 'not-allowed') {
          toast.error('Microphone access denied. Please enable it in your browser settings.');
        } else {
          toast.error(`Voice recognition error: ${event.error}`);
        }
        triggerHaptic('error');
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();

      // Auto-stop after 10 seconds
      timeoutRef.current = setTimeout(() => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      }, 10000);

    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      toast.error('Failed to start voice recognition');
      setIsListening(false);
    }
  }, [isSupported, isListening, processCommand]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Auto-activate if requested
  useEffect(() => {
    if (autoActivate && isSupported && !isListening) {
      startListening();
    }
  }, [autoActivate, isSupported, isListening, startListening]);

  if (!isSupported) {
    return null;
  }

  if (!showButton) {
    return null;
  }

  return (
    <div className={cn('relative', className)}>
      {/* Voice Command Button */}
      <Button
        variant={isListening ? 'default' : 'outline'}
        size="icon"
        onClick={toggleListening}
        className={cn(
          'relative transition-all duration-200',
          isListening && 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
        )}
        title={isListening ? 'Stop listening' : 'Start voice commands'}
      >
        {isListening ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        
        {/* Listening indicator ring */}
        {isListening && (
          <span className="absolute -inset-1 rounded-full border-2 border-red-500 animate-ping opacity-75" />
        )}
      </Button>

      {/* Transcript Display */}
      {isListening && transcript && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 min-w-[200px] max-w-[300px]">
          <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Volume2 className="h-3 w-3 animate-pulse" />
              Hearing:
            </div>
            <p className="text-sm font-medium">{transcript}</p>
          </div>
        </div>
      )}

      {/* Last Command Feedback */}
      {lastCommand && !isListening && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 rounded-lg px-3 py-2 text-sm whitespace-nowrap">
            ✓ {lastCommand}
          </div>
        </div>
      )}
    </div>
  );
}

// Pre-built command sets for common use cases
export function useFileCommands(callbacks: {
  onTakePhoto?: () => void;
  onUpload?: () => void;
  onSearch?: (query: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
}) {
  return [
    {
      patterns: ['take photo', 'take a photo', 'capture', 'camera'],
      action: callbacks.onTakePhoto || (() => {}),
      description: 'Opening camera...',
    },
    {
      patterns: ['upload', 'upload file', 'upload files'],
      action: callbacks.onUpload || (() => {}),
      description: 'Opening upload dialog...',
    },
    {
      patterns: ['select all', 'select everything'],
      action: callbacks.onSelectAll || (() => {}),
      description: 'Selecting all files...',
    },
    {
      patterns: ['clear selection', 'deselect', 'deselect all'],
      action: callbacks.onClearSelection || (() => {}),
      description: 'Clearing selection...',
    },
  ];
}

export function useVideoCommands(callbacks: {
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onStartCamera?: () => void;
  onToggleEffects?: () => void;
}) {
  return [
    {
      patterns: ['start recording', 'record', 'begin recording'],
      action: callbacks.onStartRecording || (() => {}),
      description: 'Starting recording...',
    },
    {
      patterns: ['stop recording', 'stop', 'end recording'],
      action: callbacks.onStopRecording || (() => {}),
      description: 'Stopping recording...',
    },
    {
      patterns: ['start camera', 'open camera', 'camera on'],
      action: callbacks.onStartCamera || (() => {}),
      description: 'Starting camera...',
    },
    {
      patterns: ['show effects', 'toggle effects', 'effects', 'advanced features'],
      action: callbacks.onToggleEffects || (() => {}),
      description: 'Toggling effects panel...',
    },
  ];
}

export default VoiceCommands;
