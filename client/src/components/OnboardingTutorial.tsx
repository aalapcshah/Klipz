import { useEffect, useState } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { trpc } from "@/lib/trpc";
import { useAuth } from "../_core/hooks/useAuth";

export function OnboardingTutorial() {
  const { user } = useAuth();
  const [driverInstance, setDriverInstance] = useState<ReturnType<typeof driver> | null>(null);
  
  const { data: onboardingData } = trpc.onboarding.getProgress.useQuery(undefined, {
    enabled: !!user,
  });
  
  const updateProgressMutation = trpc.onboarding.updateProgress.useMutation();
  const skipTutorialMutation = trpc.onboarding.skipTutorial.useMutation();

  useEffect(() => {
    if (!user || !onboardingData) return;
    
    // Don't show tutorial if already completed or skipped
    if (onboardingData.tutorialCompleted || onboardingData.tutorialSkipped) {
      return;
    }

    // Initialize driver.js
    const driverObj = driver({
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      steps: [
        {
          element: '#files-nav',
          popover: {
            title: 'Welcome to MetaClips! 🎬',
            description: 'Let\'s take a quick tour of the key features. This will only take a minute!',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: '#upload-files-button',
          popover: {
            title: 'Upload Your Media',
            description: 'Start by uploading videos or images. MetaClips will automatically enrich them with AI-powered metadata.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: '#search-bar',
          popover: {
            title: 'Search Your Content',
            description: 'Use powerful search to find files by voice transcripts, text, or metadata. You can even use voice search!',
            side: "bottom",
            align: 'center'
          }
        },
        {
          element: '#collections-nav',
          popover: {
            title: 'Organize with Collections',
            description: 'Group related files into collections for better organization and quick access.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          popover: {
            title: 'Video Annotations',
            description: 'When viewing a video, you can add voice notes and drawings at specific timestamps. Perfect for collaboration!',
            side: "left",
            align: 'center'
          }
        },
        {
          popover: {
            title: 'Keyboard Shortcuts ⌨️',
            description: 'Speed up your workflow with keyboard shortcuts:\n• Space/K: Play/Pause\n• C: Add Comment\n• A: Approve\n• R: Reject\n• Ctrl+A: Select All',
            side: "left",
            align: 'center'
          }
        },
        {
          popover: {
            title: 'Collaboration Features',
            description: 'Work with your team using:\n• Annotation templates for consistency\n• Comment threads for discussions\n• Approval workflows for review\n• Real-time updates when others make changes',
            side: "left",
            align: 'center'
          }
        },
        {
          popover: {
            title: 'You\'re All Set! 🚀',
            description: 'That\'s the basics! Explore the app and discover more features. You can restart this tutorial anytime from Settings.',
            side: "left",
            align: 'center'
          }
        }
      ],
      onDestroyStarted: () => {
        // Mark tutorial as completed when user finishes or closes
        if (!driverObj.hasNextStep() || confirm('Skip the tutorial?')) {
          if (!driverObj.hasNextStep()) {
            updateProgressMutation.mutate({ tutorialCompleted: true });
          } else {
            skipTutorialMutation.mutate();
          }
          driverObj.destroy();
        }
      },
      onNextClick: () => {
        driverObj.moveNext();
      },
      onPrevClick: () => {
        driverObj.movePrevious();
      }
    });

    setDriverInstance(driverObj);

    // Auto-start tutorial after a short delay
    const timer = setTimeout(() => {
      driverObj.drive();
    }, 1000);

    return () => {
      clearTimeout(timer);
      if (driverObj) {
        driverObj.destroy();
      }
    };
  }, [user, onboardingData]);

  return null; // This component doesn't render anything
}

// Hook to manually trigger tutorial
export function useOnboardingTutorial() {
  const restartTutorialMutation = trpc.onboarding.restartTutorial.useMutation();
  
  const restartTutorial = () => {
    restartTutorialMutation.mutate();
    window.location.reload(); // Reload to trigger tutorial
  };

  return { restartTutorial };
}
