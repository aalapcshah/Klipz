import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useOffline } from '@/hooks/useOffline';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function OfflineIndicator({ className, showDetails = false }: OfflineIndicatorProps) {
  const { 
    isOnline, 
    isOfflineReady, 
    pendingSyncCount, 
    cachedFileCount,
    syncPendingChanges,
    clearCache 
  } = useOffline();
  
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncPendingChanges();
    } finally {
      setIsSyncing(false);
    }
  };

  if (!showDetails) {
    // Simple indicator
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1', className)}>
              {isOnline ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-amber-500" />
              )}
              {pendingSyncCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {pendingSyncCount}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isOnline ? 'Online' : 'Offline'}</p>
            {!isOnline && cachedFileCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {cachedFileCount} files available offline
              </p>
            )}
            {pendingSyncCount > 0 && (
              <p className="text-xs text-amber-500">
                {pendingSyncCount} changes pending sync
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Detailed popover
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('gap-2', className)}>
          {isOnline ? (
            <Cloud className="h-4 w-4 text-green-500" />
          ) : (
            <CloudOff className="h-4 w-4 text-amber-500" />
          )}
          <span className="hidden sm:inline">
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {pendingSyncCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5">
              {pendingSyncCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <>
                  <Wifi className="h-5 w-5 text-green-500" />
                  <span className="font-medium">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-amber-500" />
                  <span className="font-medium">Offline Mode</span>
                </>
              )}
            </div>
            {isOfflineReady && (
              <Badge variant="outline" className="text-xs">
                Ready
              </Badge>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cached files</span>
              <span>{cachedFileCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending sync</span>
              <span className={pendingSyncCount > 0 ? 'text-amber-500' : ''}>
                {pendingSyncCount}
              </span>
            </div>
          </div>

          {!isOnline && (
            <p className="text-xs text-muted-foreground">
              Your changes will sync automatically when you're back online.
            </p>
          )}

          <div className="flex gap-2">
            {isOnline && pendingSyncCount > 0 && (
              <Button 
                size="sm" 
                onClick={handleSync}
                disabled={isSyncing}
                className="flex-1"
              >
                {isSyncing ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Now
              </Button>
            )}
            <Button 
              size="sm" 
              variant="outline"
              onClick={clearCache}
              className="flex-1"
            >
              Clear Cache
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Offline banner for showing at top of page when offline
export function OfflineBanner() {
  const { isOnline, cachedFileCount, pendingSyncCount } = useOffline();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when going back online
  useEffect(() => {
    if (isOnline) {
      setDismissed(false);
    }
  }, [isOnline]);

  if (isOnline || dismissed) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
      <div className="container flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-amber-500" />
          <span className="text-sm">
            You're offline. 
            {cachedFileCount > 0 && (
              <span className="text-muted-foreground ml-1">
                Viewing {cachedFileCount} cached files.
              </span>
            )}
            {pendingSyncCount > 0 && (
              <span className="text-amber-500 ml-1">
                {pendingSyncCount} changes will sync when online.
              </span>
            )}
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setDismissed(true)}
          className="h-6 px-2 text-xs"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
