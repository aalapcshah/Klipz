import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { HardDrive, Video, Crown, Sparkles } from "lucide-react";
import { Link } from "wouter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function UsageOverviewCompact() {
  const { user } = useAuth();
  
  const { data: status, isLoading } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: !!user }
  );
  
  if (!user || isLoading || !status) return null;
  
  const storagePercent = status.usage.storagePercentage;
  const videoPercent = status.usage.videoPercentage;
  
  const isStorageWarning = storagePercent >= 80;
  const isStorageCritical = storagePercent >= 95;
  const isVideoWarning = videoPercent >= 80;
  const isVideoCritical = videoPercent >= 95;
  
  const tierIcon = status.currentTier === 'pro' ? (
    <Crown className="h-3 w-3 text-primary" />
  ) : status.currentTier === 'trial' ? (
    <Sparkles className="h-3 w-3 text-purple-500" />
  ) : null;
  
  const tierLabel = status.currentTier === 'pro' ? 'Pro' : 
                    status.currentTier === 'trial' ? 'Trial' : 'Free';
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 gap-1.5 text-xs font-normal"
        >
          {tierIcon}
          <span className="hidden sm:inline">{tierLabel}</span>
          <div className="flex items-center gap-1 ml-1">
            <HardDrive className={`h-3 w-3 ${isStorageCritical ? 'text-destructive' : isStorageWarning ? 'text-yellow-500' : 'text-muted-foreground'}`} />
            <span className={`${isStorageCritical ? 'text-destructive' : isStorageWarning ? 'text-yellow-500' : ''}`}>
              {Math.round(storagePercent)}%
            </span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Usage Overview</span>
            <span className="flex items-center gap-1 text-xs">
              {tierIcon}
              {tierLabel}
            </span>
          </div>
          
          {/* Storage */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <HardDrive className="h-3 w-3 text-muted-foreground" />
                <span>Storage</span>
              </div>
              <span className={`${isStorageCritical ? 'text-destructive' : isStorageWarning ? 'text-yellow-500' : ''}`}>
                {status.usage.storageUsedFormatted} / {status.usage.storageLimitFormatted}
              </span>
            </div>
            <Progress 
              value={storagePercent} 
              className={`h-1.5 ${isStorageCritical ? '[&>div]:bg-destructive' : isStorageWarning ? '[&>div]:bg-yellow-500' : ''}`}
            />
          </div>
          
          {/* Videos */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <Video className="h-3 w-3 text-muted-foreground" />
                <span>Videos</span>
              </div>
              {status.usage.videoLimit === -1 ? (
                <span>{status.usage.videoCount} / ∞</span>
              ) : status.usage.videoLimit === 0 ? (
                <span className="text-muted-foreground">N/A</span>
              ) : (
                <span className={`${isVideoCritical ? 'text-destructive' : isVideoWarning ? 'text-yellow-500' : ''}`}>
                  {status.usage.videoCount} / {status.usage.videoLimit}
                </span>
              )}
            </div>
            {status.usage.videoLimit > 0 && (
              <Progress 
                value={videoPercent} 
                className={`h-1.5 ${isVideoCritical ? '[&>div]:bg-destructive' : isVideoWarning ? '[&>div]:bg-yellow-500' : ''}`}
              />
            )}
          </div>
          
          {/* Trial info */}
          {status.isOnTrial && status.trialDaysRemaining !== null && (
            <div className="pt-2 border-t text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground">Trial ends in</span>
                <span className="font-medium text-purple-500">{status.trialDaysRemaining} days</span>
              </div>
              <Link href="/pricing">
                <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1">
                  <Crown className="h-3 w-3" />
                  Upgrade Now
                </Button>
              </Link>
            </div>
          )}
          
          {/* Upgrade CTA for free users */}
          {status.currentTier === 'free' && (
            <div className="pt-2 border-t">
              <Link href="/pricing">
                <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1">
                  <Sparkles className="h-3 w-3" />
                  {status.trialUsed ? 'Upgrade to Pro' : 'Start Free Trial'}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
