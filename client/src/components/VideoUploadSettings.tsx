import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Video, Sparkles, Settings2, HardDrive } from "lucide-react";
import { formatFileSize, isCompressionSupported } from "@/lib/videoCompression";

type VideoQuality = "original" | "high" | "medium" | "low" | "custom";

interface VideoUploadPreferences {
  defaultQuality: VideoQuality;
  customBitrate: number;
  customResolution: number;
  showPreviewDialog: boolean;
  autoCompress: boolean;
}

const DEFAULT_PREFERENCES: VideoUploadPreferences = {
  defaultQuality: "original",
  customBitrate: 3000,
  customResolution: 720,
  showPreviewDialog: true,
  autoCompress: false,
};

const STORAGE_KEY = "klipz_video_upload_preferences";

export function getVideoUploadPreferences(): VideoUploadPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load video upload preferences:", e);
  }
  return DEFAULT_PREFERENCES;
}

export function setVideoUploadPreferences(prefs: Partial<VideoUploadPreferences>): void {
  try {
    const current = getVideoUploadPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save video upload preferences:", e);
  }
}

const QUALITY_OPTIONS = [
  { value: "original", label: "Original Quality", description: "No compression, full quality", estimate: "100%" },
  { value: "high", label: "High (1080p)", description: "5 Mbps bitrate", estimate: "~50-70%" },
  { value: "medium", label: "Medium (720p)", description: "2.5 Mbps bitrate", estimate: "~30-50%" },
  { value: "low", label: "Low (480p)", description: "1 Mbps bitrate", estimate: "~15-30%" },
  { value: "custom", label: "Custom", description: "Set your own settings", estimate: "varies" },
];

export function VideoUploadSettings() {
  const [preferences, setPreferences] = useState<VideoUploadPreferences>(DEFAULT_PREFERENCES);
  const [hasChanges, setHasChanges] = useState(false);
  const compressionSupported = isCompressionSupported();

  useEffect(() => {
    setPreferences(getVideoUploadPreferences());
  }, []);

  const updatePreference = <K extends keyof VideoUploadPreferences>(
    key: K,
    value: VideoUploadPreferences[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const savePreferences = () => {
    setVideoUploadPreferences(preferences);
    setHasChanges(false);
    toast.success("Video upload preferences saved");
  };

  const resetToDefaults = () => {
    setPreferences(DEFAULT_PREFERENCES);
    setVideoUploadPreferences(DEFAULT_PREFERENCES);
    setHasChanges(false);
    toast.success("Preferences reset to defaults");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Video Upload Settings
        </CardTitle>
        <CardDescription>
          Configure default compression and upload behavior for videos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!compressionSupported && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm">
            Video compression is not supported in your browser. Videos will be uploaded at original quality.
          </div>
        )}

        {/* Auto Compress Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Auto-Compress Videos
            </Label>
            <p className="text-sm text-muted-foreground">
              Compress videos in-browser before uploading to save storage
            </p>
            {preferences.autoCompress && (
              <p className="text-xs text-amber-500 mt-1">
                Note: Browser compression may cause audio loss or shorter duration on some videos. Use "Original Quality" for important content.
              </p>
            )}
          </div>
          <Switch
            checked={preferences.autoCompress}
            onCheckedChange={(checked) => updatePreference("autoCompress", checked)}
            disabled={!compressionSupported}
          />
        </div>

        {/* Show Preview Dialog Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Show Quality Preview
            </Label>
            <p className="text-sm text-muted-foreground">
              Show compression preview dialog before each upload
            </p>
          </div>
          <Switch
            checked={preferences.showPreviewDialog}
            onCheckedChange={(checked) => updatePreference("showPreviewDialog", checked)}
            disabled={!compressionSupported || !preferences.autoCompress}
          />
        </div>

        {/* Default Quality Selection */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Default Compression Quality
          </Label>
          <Select
            value={preferences.defaultQuality}
            onValueChange={(value) => updatePreference("defaultQuality", value as VideoQuality)}
            disabled={!compressionSupported || !preferences.autoCompress}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select quality" />
            </SelectTrigger>
            <SelectContent>
              {QUALITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center justify-between w-full">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({option.estimate} of original)
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {QUALITY_OPTIONS.find((o) => o.value === preferences.defaultQuality)?.description}
          </p>
        </div>

        {/* Custom Settings */}
        {preferences.defaultQuality === "custom" && preferences.autoCompress && (
          <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
            <h4 className="text-sm font-medium">Custom Compression Settings</h4>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Video Bitrate</Label>
                <span className="text-muted-foreground">{preferences.customBitrate} kbps</span>
              </div>
              <Slider
                value={[preferences.customBitrate]}
                onValueChange={([value]) => updatePreference("customBitrate", value)}
                min={500}
                max={10000}
                step={100}
              />
              <p className="text-xs text-muted-foreground">
                Higher bitrate = better quality, larger file size
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Max Resolution</Label>
                <span className="text-muted-foreground">{preferences.customResolution}p</span>
              </div>
              <Slider
                value={[preferences.customResolution]}
                onValueChange={([value]) => updatePreference("customResolution", value)}
                min={360}
                max={2160}
                step={60}
              />
              <p className="text-xs text-muted-foreground">
                Videos taller than this will be scaled down
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
          <Button onClick={savePreferences} disabled={!hasChanges}>
            Save Preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
