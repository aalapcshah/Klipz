import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Smartphone, Monitor } from "lucide-react";
import { useBannerQueue } from "@/contexts/BannerQueueContext";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [wantsToShow, setWantsToShow] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const { activeBanner, register, dismiss } = useBannerQueue();

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed recently
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      setTimeout(() => {
        setWantsToShow(true);
        register("pwa-install");
      }, 3000);
      return;
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => {
        setWantsToShow(true);
        register("pwa-install");
      }, 2000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setWantsToShow(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [register]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === "accepted") {
        setIsInstalled(true);
      }
      
      setDeferredPrompt(null);
      setWantsToShow(false);
      dismiss("pwa-install");
    } catch (error) {
      console.error("Install prompt error:", error);
    }
  };

  const handleDismiss = () => {
    setWantsToShow(false);
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
    dismiss("pwa-install");
  };

  if (isInstalled || !wantsToShow || activeBanner !== "pwa-install") return null;

  // iOS-specific instructions
  if (isIOS) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-2xl z-50 overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              <span className="font-semibold">Install Klipz</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-white hover:bg-white/20"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {!showIOSInstructions ? (
            <>
              <p className="text-sm text-white/90 mb-3">
                Add Klipz to your home screen for quick access and to share content directly from any app!
              </p>
              <Button
                className="w-full bg-white text-blue-600 hover:bg-white/90"
                onClick={() => setShowIOSInstructions(true)}
              >
                <Download className="h-4 w-4 mr-2" />
                Show Me How
              </Button>
            </>
          ) : (
            <div className="text-sm space-y-2">
              <p className="font-medium">To install on iOS:</p>
              <ol className="list-decimal list-inside space-y-1 text-white/90">
                <li>Tap the <span className="font-semibold">Share</span> button (square with arrow)</li>
                <li>Scroll down and tap <span className="font-semibold">"Add to Home Screen"</span></li>
                <li>Tap <span className="font-semibold">"Add"</span> in the top right</li>
              </ol>
              <Button
                variant="outline"
                className="w-full mt-3 border-white/30 text-white hover:bg-white/10"
                onClick={handleDismiss}
              >
                Got it!
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Standard install prompt for Android/Desktop
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-2xl z-50 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            <span className="font-semibold">Install Klipz App</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/20"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <p className="text-sm text-white/90 mb-3">
          Install Klipz for quick access and to share content directly from any app on your device!
        </p>
        
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-white text-blue-600 hover:bg-white/90"
            onClick={handleInstall}
          >
            <Download className="h-4 w-4 mr-2" />
            Install
          </Button>
          <Button
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10"
            onClick={handleDismiss}
          >
            Later
          </Button>
        </div>
      </div>
      
      <div className="bg-black/20 px-4 py-2 text-xs text-white/80">
        <div className="flex items-center gap-4">
          <span>✓ Share from any app</span>
          <span>✓ Works offline</span>
          <span>✓ Faster access</span>
        </div>
      </div>
    </div>
  );
}
