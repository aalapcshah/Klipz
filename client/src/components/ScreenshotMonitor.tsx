import { useState, useEffect, useCallback } from 'react';
import { 
  MonitorSmartphone, 
  FolderSync, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Settings2,
  ImagePlus,
  Smartphone,
  Monitor,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface ScreenshotMonitorProps {
  isPremium?: boolean;
}

interface SyncStats {
  lastSync: Date | null;
  totalImported: number;
  pendingCount: number;
  isActive: boolean;
}

export function ScreenshotMonitor({ isPremium = false }: ScreenshotMonitorProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [syncInterval, setSyncInterval] = useState<'realtime' | '5min' | '15min' | '1hour'>('5min');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<SyncStats>({
    lastSync: null,
    totalImported: 0,
    pendingCount: 0,
    isActive: false,
  });

  // Check if File System Access API is supported
  const [isSupported, setIsSupported] = useState(false);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    // Check for File System Access API support
    setIsSupported('showDirectoryPicker' in window);
    
    // Load saved preferences from localStorage
    const savedPrefs = localStorage.getItem('screenshotMonitorPrefs');
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs);
        setIsEnabled(prefs.isEnabled ?? false);
        setAutoEnrich(prefs.autoEnrich ?? true);
        setSyncInterval(prefs.syncInterval ?? '5min');
      } catch (e) {
        console.error('Failed to load screenshot monitor preferences:', e);
      }
    }
  }, []);

  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem('screenshotMonitorPrefs', JSON.stringify({
      isEnabled,
      autoEnrich,
      syncInterval,
    }));
  }, [isEnabled, autoEnrich, syncInterval]);

  const createFileMutation = trpc.files.create.useMutation();
  const utils = trpc.useUtils();

  // Select screenshot folder
  const selectFolder = useCallback(async () => {
    if (!isSupported) {
      toast.error('Not Supported', {
        description: 'Your browser does not support folder access. Try Chrome or Edge.',
      });
      return;
    }

    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'read',
      });
      setDirectoryHandle(handle);
      toast.success('Folder Selected', {
        description: `Monitoring: ${handle.name}`,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error('Failed to select folder', {
          description: (err as Error).message,
        });
      }
    }
  }, [isSupported]);

  // Scan for new screenshots
  const scanForScreenshots = useCallback(async () => {
    if (!directoryHandle) {
      toast.error('No folder selected', {
        description: 'Please select a screenshot folder first.',
      });
      return;
    }

    setIsSyncing(true);
    let importedCount = 0;

    try {
      // Get list of already imported files from localStorage
      const importedFiles: string[] = JSON.parse(localStorage.getItem('importedScreenshots') || '[]');
      const importedSet = new Set<string>(importedFiles);

      // Iterate through files in directory
      for await (const entry of (directoryHandle as any).values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          
          // Check if it's an image
          if (!file.type.startsWith('image/')) continue;
          
          // Check if already imported
          const fileKey = `${file.name}-${file.lastModified}`;
          if (importedSet.has(fileKey)) continue;

          // Check if it looks like a screenshot (common naming patterns)
          const isScreenshot = /^(screenshot|screen shot|capture|IMG_|Screenshot_)/i.test(file.name) ||
                              file.name.includes('Screenshot') ||
                              file.name.includes('Screen Shot');
          
          if (!isScreenshot && !confirm(`Import "${file.name}"? It doesn't look like a screenshot.`)) {
            continue;
          }

          // Convert to base64
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = reader.result as string;
              resolve(base64.split(',')[1]);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(file);
          const base64Data = await base64Promise;

          // Upload file
          await createFileMutation.mutateAsync({
            filename: file.name,
            mimeType: file.type,
            fileSize: file.size,
            content: base64Data,
          });

          // Mark as imported
          importedSet.add(fileKey);
          importedCount++;
        }
      }

      // Save updated imported files list
      localStorage.setItem('importedScreenshots', JSON.stringify(Array.from(importedSet)));

      // Update stats
      setSyncStats(prev => ({
        ...prev,
        lastSync: new Date(),
        totalImported: prev.totalImported + importedCount,
      }));

      // Refresh file list
      utils.files.list.invalidate();

      if (importedCount > 0) {
        toast.success(`Imported ${importedCount} screenshot${importedCount > 1 ? 's' : ''}`, {
          description: autoEnrich ? 'AI enrichment will process them automatically.' : undefined,
        });
      } else {
        toast.info('No new screenshots found');
      }
    } catch (err) {
      console.error('Scan error:', err);
      toast.error('Failed to scan for screenshots', {
        description: (err as Error).message,
      });
    } finally {
      setIsSyncing(false);
    }
  }, [directoryHandle, autoEnrich, createFileMutation, utils]);

  // Auto-sync interval
  useEffect(() => {
    if (!isEnabled || !directoryHandle) return;

    const intervalMs = {
      'realtime': 10000, // 10 seconds
      '5min': 300000,
      '15min': 900000,
      '1hour': 3600000,
    }[syncInterval];

    const interval = setInterval(() => {
      scanForScreenshots();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isEnabled, directoryHandle, syncInterval, scanForScreenshots]);

  if (!isPremium) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="w-5 h-5" />
            Screenshot Auto-Import
            <Badge variant="secondary" className="ml-2">Premium</Badge>
          </CardTitle>
          <CardDescription>
            Automatically import screenshots from your device
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <ImagePlus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-2">Upgrade to Premium</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Automatically sync screenshots from your device and enrich them with AI-powered metadata extraction.
            </p>
            <Button>
              <Sparkles className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MonitorSmartphone className="w-5 h-5" />
              Screenshot Auto-Import
            </CardTitle>
            <CardDescription>
              Automatically import and enrich screenshots from your device
            </CardDescription>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
            disabled={!directoryHandle}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Folder Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Screenshot Folder</Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={selectFolder}
              className="flex-1"
            >
              <FolderSync className="w-4 h-4 mr-2" />
              {directoryHandle ? directoryHandle.name : 'Select Folder'}
            </Button>
            {directoryHandle && (
              <Button
                variant="secondary"
                size="icon"
                onClick={scanForScreenshots}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
          {!isSupported && (
            <p className="text-xs text-destructive">
              Your browser doesn't support folder access. Use Chrome or Edge for this feature.
            </p>
          )}
        </div>

        <Separator />

        {/* Sync Settings */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Sync Settings</Label>
          
          <div className="grid grid-cols-2 gap-3">
            {(['realtime', '5min', '15min', '1hour'] as const).map((interval) => (
              <Button
                key={interval}
                variant={syncInterval === interval ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSyncInterval(interval)}
                disabled={!isEnabled}
                className="justify-start"
              >
                <Clock className="w-3 h-3 mr-2" />
                {interval === 'realtime' ? 'Real-time' :
                 interval === '5min' ? 'Every 5 min' :
                 interval === '15min' ? 'Every 15 min' : 'Every hour'}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-enrich">Auto-enrich with AI</Label>
              <p className="text-xs text-muted-foreground">
                Automatically extract metadata from imported screenshots
              </p>
            </div>
            <Switch
              id="auto-enrich"
              checked={autoEnrich}
              onCheckedChange={setAutoEnrich}
            />
          </div>
        </div>

        <Separator />

        {/* Sync Status */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Sync Status</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              {isEnabled && directoryHandle ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm">
                {isEnabled && directoryHandle ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ImagePlus className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{syncStats.totalImported} imported</span>
            </div>
          </div>
          {syncStats.lastSync && (
            <p className="text-xs text-muted-foreground">
              Last sync: {syncStats.lastSync.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Device Info */}
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Desktop</span>
          </div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Mobile sync via PWA
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScreenshotMonitor;
