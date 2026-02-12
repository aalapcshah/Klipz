import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle, Sparkles, X } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

export function TrialBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  
  const { data: status } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: !!user }
  );
  
  if (!user || !status || dismissed) return null;
  
  // Show trial active banner
  if (status.isOnTrial && status.trialDaysRemaining !== null) {
    return (
      <div className="bg-primary/10 border-b border-primary/20 px-3 py-2">
        <div className="container flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">
              <strong>Pro Trial:</strong> {status.trialDaysRemaining} days remaining
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/pricing">
              <Button size="sm" variant="default">
                Upgrade Now
              </Button>
            </Link>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  // Show trial expired banner
  if (status.trialExpired) {
    return (
      <div className="bg-destructive/10 border-b border-destructive/20 px-3 py-2">
        <div className="container flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <span className="truncate">
              <strong>Trial Expired:</strong> Upgrade to Pro to continue using premium features
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/pricing">
              <Button size="sm" variant="default" className="whitespace-nowrap">
                Upgrade
              </Button>
            </Link>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  // Show free trial available banner for free users who haven't used trial
  if (status.currentTier === "free" && !status.trialUsed) {
    return (
      <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 border-b border-primary/20 px-3 py-2">
        <div className="container flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">
              <strong>Try Pro Free:</strong> Get 14 days of Pro features - no credit card required
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/pricing">
              <Button size="sm" variant="default">
                Start Free Trial
              </Button>
            </Link>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}
