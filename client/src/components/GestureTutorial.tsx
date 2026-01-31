import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Hand, ArrowDown, Plus, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface GestureTutorialProps {
  onComplete: () => void;
  forceShow?: boolean;
}

const TUTORIAL_STORAGE_KEY = 'gestureTutorialCompleted';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  animation: string;
  tip: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 'swipe-delete',
    title: 'Swipe to Delete',
    description: 'Swipe left on any file or video card to quickly delete it.',
    icon: <Hand className="w-12 h-12" />,
    animation: 'animate-swipe-left',
    tip: 'A red indicator will appear as you swipe',
  },
  {
    id: 'swipe-favorite',
    title: 'Swipe to Favorite',
    description: 'Swipe right on any file or video card to add it to your favorites.',
    icon: <Hand className="w-12 h-12" />,
    animation: 'animate-swipe-right',
    tip: 'A yellow star indicator will appear as you swipe',
  },
  {
    id: 'pull-refresh',
    title: 'Pull to Refresh',
    description: 'Pull down from the top of the page to refresh your files and videos.',
    icon: <ArrowDown className="w-12 h-12" />,
    animation: 'animate-pull-down',
    tip: 'Release when you see the refresh indicator',
  },
  {
    id: 'fab-menu',
    title: 'Quick Actions Button',
    description: 'Tap the floating button in the bottom-right corner to access quick actions like Camera, Upload, and Search.',
    icon: <Plus className="w-12 h-12" />,
    animation: 'animate-pulse-scale',
    tip: 'The menu expands with multiple options',
  },
  {
    id: 'voice-commands',
    title: 'Voice Commands',
    description: 'Use voice commands for hands-free control. Say "take photo", "start recording", or "search for [query]".',
    icon: <Mic className="w-12 h-12" />,
    animation: 'animate-pulse',
    tip: 'Tap the microphone icon to activate voice mode',
  },
];

export function GestureTutorial({ onComplete, forceShow = false }: GestureTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if tutorial has been completed before
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    
    // Only show on mobile devices
    const isMobile = window.innerWidth < 768;
    
    if (forceShow || (!completed && isMobile)) {
      setIsVisible(true);
    }
  }, [forceShow]);

  const handleNext = () => {
    triggerHaptic('light');
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    triggerHaptic('light');
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    triggerHaptic('success');
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    setIsVisible(false);
    onComplete();
  };

  const handleSkip = () => {
    triggerHaptic('light');
    handleComplete();
  };

  if (!isVisible) return null;

  const step = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {currentStep + 1} of {tutorialSteps.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            Skip
            <X className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          {/* Animation Area */}
          <div className="relative h-32 flex items-center justify-center mb-6">
            {/* Animated Icon */}
            <div
              className={cn(
                'text-primary transition-all duration-500',
                step.animation
              )}
            >
              {step.icon}
            </div>

            {/* Gesture Animation Overlay */}
            {step.id === 'swipe-delete' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-16 bg-muted/30 rounded-lg relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent to-destructive/30 animate-swipe-indicator-left" />
                </div>
              </div>
            )}
            {step.id === 'swipe-favorite' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-16 bg-muted/30 rounded-lg relative overflow-hidden">
                  <div className="absolute inset-y-0 right-0 w-full bg-gradient-to-l from-transparent to-yellow-500/30 animate-swipe-indicator-right" />
                </div>
              </div>
            )}
            {step.id === 'pull-refresh' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 border-2 border-primary/50 rounded-full animate-bounce" />
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-xl font-semibold mb-2">{step.title}</h3>

          {/* Description */}
          <p className="text-muted-foreground mb-4">{step.description}</p>

          {/* Tip */}
          <div className="bg-primary/10 text-primary text-sm px-4 py-2 rounded-lg inline-block">
            💡 {step.tip}
          </div>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center gap-2 pb-4">
          {tutorialSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                triggerHaptic('light');
                setCurrentStep(index);
              }}
              className={cn(
                'w-2 h-2 rounded-full transition-all duration-200',
                index === currentStep
                  ? 'bg-primary w-6'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/30">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={isFirstStep}
            className={cn(isFirstStep && 'invisible')}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <Button onClick={handleNext}>
            {isLastStep ? (
              'Get Started'
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes swipe-left {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-20px); }
        }
        @keyframes swipe-right {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(20px); }
        }
        @keyframes pull-down {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(15px); }
        }
        @keyframes pulse-scale {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        @keyframes swipe-indicator-left {
          0% { transform: translateX(100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(0); opacity: 0; }
        }
        @keyframes swipe-indicator-right {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(0); opacity: 0; }
        }
        .animate-swipe-left {
          animation: swipe-left 2s ease-in-out infinite;
        }
        .animate-swipe-right {
          animation: swipe-right 2s ease-in-out infinite;
        }
        .animate-pull-down {
          animation: pull-down 2s ease-in-out infinite;
        }
        .animate-pulse-scale {
          animation: pulse-scale 2s ease-in-out infinite;
        }
        .animate-swipe-indicator-left {
          animation: swipe-indicator-left 2s ease-in-out infinite;
        }
        .animate-swipe-indicator-right {
          animation: swipe-indicator-right 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// Helper function to reset tutorial (for Settings page)
export function resetGestureTutorial() {
  localStorage.removeItem(TUTORIAL_STORAGE_KEY);
}

// Helper function to check if tutorial was completed
export function isGestureTutorialCompleted(): boolean {
  return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
}

export default GestureTutorial;
