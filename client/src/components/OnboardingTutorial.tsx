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
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Get Started!',
      steps: [
        // Step 1: Welcome
        {
          popover: {
            title: 'Welcome to Klipz! 🎬',
            description: 'Your AI-powered media management platform. Let\'s take a quick 60-second tour of the key features that will supercharge your workflow.',
            side: "left",
            align: 'center'
          }
        },
        // Step 2: Upload
        {
          element: '#upload-files-button',
          popover: {
            title: 'Upload Your Media',
            description: 'Start by uploading images, videos, or documents. Klipz supports drag-and-drop, batch uploads, and even scheduled imports from URLs.',
            side: "bottom",
            align: 'start'
          }
        },
        // Step 3: AI Enrichment
        {
          element: '#enrich-button',
          popover: {
            title: 'AI-Powered Enrichment ✨',
            description: 'This is where the magic happens. Click "Enrich" to let AI automatically analyze your files — generating tags, descriptions, quality scores, and smart metadata. No manual tagging needed!',
            side: "bottom",
            align: 'start'
          }
        },
        // Step 4: Search
        {
          element: '#search-bar',
          popover: {
            title: 'Smart Search & Voice',
            description: 'Find any file instantly using text or voice search. Search by tags, descriptions, file content, or even spoken words from video transcripts. Try the microphone button for hands-free search!',
            side: "bottom",
            align: 'center'
          }
        },
        // Step 5: Collections
        {
          element: '#nav-collections',
          popover: {
            title: 'Organize with Collections',
            description: 'Group related files into collections for projects, campaigns, or themes. Share collections with collaborators and export them in bulk.',
            side: "bottom",
            align: 'start'
          }
        },
        // Step 6: Tools
        {
          element: '#nav-tools',
          popover: {
            title: 'Powerful Tools',
            description: 'Access the Enrichment Queue to process files in bulk, set up Scheduled Exports for automated workflows, and share files with your team via My Shares.',
            side: "bottom",
            align: 'start'
          }
        },
        // Step 7: Insights
        {
          element: '#nav-insights',
          popover: {
            title: 'Insights & Knowledge Graph',
            description: 'Explore your media library through analytics dashboards and an interactive Knowledge Graph that visualizes relationships between your files, tags, and topics.',
            side: "bottom",
            align: 'start'
          }
        },
        // Step 8: Hamburger Menu
        {
          element: '#hamburger-menu',
          popover: {
            title: 'Your Account & Settings',
            description: 'Access your profile, subscription status, storage usage, settings, and support from this menu. You can also customize your experience in Settings.',
            side: "left",
            align: 'start'
          }
        },
        // Step 9: Completion
        {
          popover: {
            title: 'You\'re All Set! 🚀',
            description: 'Start by uploading a few files and clicking "Enrich" to see AI in action. You can restart this tutorial anytime from Settings → Appearance → Restart Tutorial.',
            side: "left",
            align: 'center'
          }
        }
      ],
      onDestroyStarted: () => {
        // Mark tutorial as completed when user finishes or closes
        if (!driverObj.hasNextStep() || confirm('Skip the tutorial? You can restart it anytime from Settings.')) {
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

    // Auto-start tutorial after a short delay to let the page render
    const timer = setTimeout(() => {
      driverObj.drive();
    }, 1500);

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
