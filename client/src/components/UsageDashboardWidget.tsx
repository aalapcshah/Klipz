import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { HardDrive, Video, Crown, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export function UsageDashboardWidget() {
  const { user } = useAuth();
  
  const { data: status, isLoading } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: !!user }
  );
  
  if (!user) return null;
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Usage Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  if (!status) return null;
  
  const storagePercent = status.usage.storagePercentage;
  const videoPercent = status.usage.videoPercentage;
  
  const isStorageWarning = storagePercent >= 80;
  const isStorageCritical = storagePercent >= 95;
  const isVideoWarning = videoPercent >= 80;
  const isVideoCritical = videoPercent >= 95;
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Usage Overview
          </CardTitle>
          <div className="flex items-center gap-1 text-xs">
            {status.currentTier === 'pro' && (
              <span className="flex items-center gap-1 text-primary">
                <Crown className="h-3 w-3" />
                Pro
              </span>
            )}
            {status.currentTier === 'trial' && (
              <span className="flex items-center gap-1 text-purple-500">
                <Sparkles className="h-3 w-3" />
                Trial
              </span>
            )}
            {status.currentTier === 'free' && (
              <span className="text-muted-foreground">Free</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Storage Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span>Storage</span>
            </div>
            <span className={`font-medium ${isStorageCritical ? 'text-destructive' : isStorageWarning ? 'text-yellow-500' : ''}`}>
              {status.usage.storageUsedFormatted} / {status.usage.storageLimitFormatted}
            </span>
          </div>
          <Progress 
            value={storagePercent} 
            className={`h-2 ${isStorageCritical ? '[&>div]:bg-destructive' : isStorageWarning ? '[&>div]:bg-yellow-500' : ''}`}
          />
          {isStorageWarning && (
            <p className="text-xs text-muted-foreground">
              {isStorageCritical ? 'Storage almost full!' : 'Running low on storage'}
            </p>
          )}
        </div>
        
        {/* Video Count */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span>Videos</span>
            </div>
            {status.usage.videoLimit === -1 ? (
              <span className="font-medium">{status.usage.videoCount} / Unlimited</span>
            ) : status.usage.videoLimit === 0 ? (
              <span className="font-medium text-muted-foreground">Not available</span>
            ) : (
              <span className={`font-medium ${isVideoCritical ? 'text-destructive' : isVideoWarning ? 'text-yellow-500' : ''}`}>
                {status.usage.videoCount} / {status.usage.videoLimit}
              </span>
            )}
          </div>
          {status.usage.videoLimit > 0 && (
            <Progress 
              value={videoPercent} 
              className={`h-2 ${isVideoCritical ? '[&>div]:bg-destructive' : isVideoWarning ? '[&>div]:bg-yellow-500' : ''}`}
            />
          )}
          {status.usage.videoLimit === 0 && (
            <p className="text-xs text-muted-foreground">
              Upgrade to Pro to upload videos
            </p>
          )}
        </div>
        
        {/* Upgrade CTA for free users */}
        {status.currentTier === 'free' && (
          <div className="pt-2 border-t">
            <Link href="/pricing">
              <Button variant="outline" size="sm" className="w-full gap-2">
                <Sparkles className="h-4 w-4" />
                {status.trialUsed ? 'Upgrade to Pro' : 'Start Free Trial'}
              </Button>
            </Link>
          </div>
        )}
        
        {/* Trial info */}
        {status.isOnTrial && status.trialDaysRemaining !== null && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Trial ends in</span>
              <span className="font-medium text-purple-500">{status.trialDaysRemaining} days</span>
            </div>
            <Link href="/pricing">
              <Button variant="outline" size="sm" className="w-full mt-2 gap-2">
                <Crown className="h-4 w-4" />
                Upgrade Now
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
