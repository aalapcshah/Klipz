import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Cookie } from "lucide-react";
import { Link } from "wouter";
import { useBannerQueue } from "@/contexts/BannerQueueContext";

const COOKIE_CONSENT_KEY = "cookie-consent";
const COOKIE_CONSENT_TIMESTAMP_KEY = "cookie-consent-timestamp";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function CookieConsent() {
  const [needsConsent, setNeedsConsent] = useState(false);
  const { activeBanner, register, dismiss } = useBannerQueue();

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    const timestamp = localStorage.getItem(COOKIE_CONSENT_TIMESTAMP_KEY);

    if (!consent) {
      // Never consented
      setNeedsConsent(true);
      register("cookie");
      return;
    }

    // Check if consent has expired (older than 30 days)
    if (timestamp) {
      const consentTime = parseInt(timestamp, 10);
      if (Date.now() - consentTime > THIRTY_DAYS_MS) {
        // Consent expired — clear and re-prompt
        localStorage.removeItem(COOKIE_CONSENT_KEY);
        localStorage.removeItem(COOKIE_CONSENT_TIMESTAMP_KEY);
        setNeedsConsent(true);
        register("cookie");
      }
    }
  }, [register]);

  const saveConsent = (type: string) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, type);
    localStorage.setItem(COOKIE_CONSENT_TIMESTAMP_KEY, Date.now().toString());
    setNeedsConsent(false);
    dismiss("cookie");
  };

  const acceptAll = () => saveConsent("all");
  const acceptEssential = () => saveConsent("essential");
  const handleDismiss = () => acceptEssential();

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
