import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Cookie } from "lucide-react";
import { Link } from "wouter";
import { useBannerQueue } from "@/contexts/BannerQueueContext";

export function CookieConsent() {
  const [needsConsent, setNeedsConsent] = useState(false);
  const { activeBanner, register, dismiss } = useBannerQueue();

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      setNeedsConsent(true);
      register("cookie");
    }
  }, [register]);

  const acceptAll = () => {
    localStorage.setItem("cookie-consent", "all");
    setNeedsConsent(false);
    dismiss("cookie");
  };

  const acceptEssential = () => {
    localStorage.setItem("cookie-consent", "essential");
    setNeedsConsent(false);
    dismiss("cookie");
  };

  const handleDismiss = () => {
    acceptEssential();
  };

  if (!needsConsent || activeBanner !== "cookie") return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur-sm border-t shadow-lg">
      <div className="container max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <Cookie className="h-6 w-6 text-primary shrink-0 mt-1" />
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Cookie Preferences</h3>
              <p className="text-sm text-muted-foreground">
                We use cookies to enhance your experience. Essential cookies are required for the site to function. 
                Analytics cookies help us improve our service. You can manage your preferences at any time.{" "}
                <Link href="/privacy-policy" className="underline hover:text-primary">
                  Learn more
                </Link>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={acceptEssential}
              className="whitespace-nowrap"
            >
              Essential Only
            </Button>
            <Button
              size="sm"
              onClick={acceptAll}
              className="whitespace-nowrap"
            >
              Accept All
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
