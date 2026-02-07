import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Paintbrush, 
  Image as ImageIcon, 
  Palette, 
  Droplet,
  RotateCcw,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface ChromaKeySettings {
  enabled: boolean;
  keyColor: string; // hex color
  tolerance: number; // 0-100
  smoothness: number; // 0-100 (edge softness)
  spillSuppression: number; // 0-100
  backgroundType: 'color' | 'image' | 'blur' | 'transparent';
  backgroundColor: string;
  backgroundImage: string | null;
  blurAmount: number;
}

interface GreenScreenChromaKeyProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onSettingsChange?: (settings: ChromaKeySettings) => void;
  onProcessedFrame?: (canvas: HTMLCanvasElement) => void;
  className?: string;
}

const PRESET_COLORS = [
  { name: 'Green Screen', color: '#00FF00' },
  { name: 'Blue Screen', color: '#0000FF' },
  { name: 'Lime Green', color: '#32CD32' },
  { name: 'Chroma Green', color: '#00B140' },
  { name: 'Chroma Blue', color: '#0047AB' },
  { name: 'Custom', color: null },
];

const BACKGROUND_PRESETS = [
  { name: 'Office', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280' },
  { name: 'Nature', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1280' },
  { name: 'City', url: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1280' },
  { name: 'Abstract', url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1280' },
];

export function GreenScreenChromaKey({
  videoRef,
  canvasRef,
  onSettingsChange,
  onProcessedFrame,
  className
}: GreenScreenChromaKeyProps) {
  const [settings, setSettings] = useState<ChromaKeySettings>({
    enabled: false,
    keyColor: '#00FF00',
    tolerance: 40,
    smoothness: 10,
    spillSuppression: 50,
    backgroundType: 'blur',
    backgroundColor: '#1a1a2e',
    backgroundImage: null,
    blurAmount: 20,
  });
  const [showPreview, setShowPreview] = useState(true);
  const [customColorInput, setCustomColorInput] = useState('#00FF00');
  const [isProcessing, setIsProcessing] = useState(false);
  const [crossOriginError, setCrossOriginError] = useState(false);

  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Convert hex to RGB
  const hexToRgb = useCallback((hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 255, b: 0 };
  }, []);

  // Check if pixel matches key color
  const isKeyColor = useCallback((r: number, g: number, b: number, keyRgb: { r: number; g: number; b: number }, tolerance: number) => {
    const distance = Math.sqrt(
      Math.pow(r - keyRgb.r, 2) +
      Math.pow(g - keyRgb.g, 2) +
      Math.pow(b - keyRgb.b, 2)
    );
    const maxDistance = (tolerance / 100) * 441.67; // sqrt(255^2 * 3)
    return distance < maxDistance;
  }, []);

  // Process video frame with chroma key
  const processFrame = useCallback(() => {
    if (!settings.enabled || !videoRef.current || !outputCanvasRef.current) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = outputCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Check if video is ready
    if (video.readyState < 2) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Set canvas size to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    try {
      // Draw video frame
      ctx.drawImage(video, 0, 0);

      // Get image data - this may fail for cross-origin videos
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const keyRgb = hexToRgb(settings.keyColor);

    // Process each pixel
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (isKeyColor(r, g, b, keyRgb, settings.tolerance)) {
        // Calculate alpha based on smoothness
        const distance = Math.sqrt(
          Math.pow(r - keyRgb.r, 2) +
          Math.pow(g - keyRgb.g, 2) +
          Math.pow(b - keyRgb.b, 2)
        );
        const maxDistance = (settings.tolerance / 100) * 441.67;
        const smoothRange = (settings.smoothness / 100) * maxDistance;
        
        if (distance < maxDistance - smoothRange) {
          // Fully transparent
          data[i + 3] = 0;
        } else {
          // Partial transparency for smooth edges
          const alpha = ((distance - (maxDistance - smoothRange)) / smoothRange) * 255;
          data[i + 3] = Math.min(255, Math.max(0, alpha));
        }

        // Spill suppression - reduce green/blue tint on edges
        if (settings.spillSuppression > 0 && data[i + 3] > 0) {
          const spillFactor = settings.spillSuppression / 100;
          if (keyRgb.g > keyRgb.r && keyRgb.g > keyRgb.b) {
            // Green screen - reduce green
            data[i + 1] = Math.max(0, g - (g - Math.max(r, b)) * spillFactor);
          } else if (keyRgb.b > keyRgb.r && keyRgb.b > keyRgb.g) {
            // Blue screen - reduce blue
            data[i + 2] = Math.max(0, b - (b - Math.max(r, g)) * spillFactor);
          }
        }
      }
    }

    // Put processed image data
    ctx.putImageData(imageData, 0, 0);

    // Draw background behind the subject
    if (settings.backgroundType !== 'transparent') {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        // Draw background
        switch (settings.backgroundType) {
          case 'color':
            tempCtx.fillStyle = settings.backgroundColor;
            tempCtx.fillRect(0, 0, canvas.width, canvas.height);
            break;
          case 'image':
            if (backgroundImageRef.current) {
              tempCtx.drawImage(backgroundImageRef.current, 0, 0, canvas.width, canvas.height);
            }
            break;
          case 'blur':
            tempCtx.filter = `blur(${settings.blurAmount}px)`;
            tempCtx.drawImage(video, 0, 0);
            tempCtx.filter = 'none';
            break;
        }

        // Draw processed video on top
        tempCtx.drawImage(canvas, 0, 0);

        // Copy back to main canvas
        ctx.drawImage(tempCanvas, 0, 0);
      }
    }

    onProcessedFrame?.(canvas);
    } catch (error) {
      // Handle cross-origin or security errors
      if (error instanceof DOMException && (error.name === 'SecurityError' || error.message.includes('cross-origin') || error.message.includes('tainted'))) {
        console.warn('Green screen cannot process cross-origin video. This feature works best with camera input or same-origin videos.');
        setCrossOriginError(true);
        setSettings(prev => ({ ...prev, enabled: false }));
        return;
      }
      console.error('Error processing video frame:', error);
    }
    animationRef.current = requestAnimationFrame(processFrame);
  }, [settings, videoRef, hexToRgb, isKeyColor, onProcessedFrame]);

  // Start/stop processing
  useEffect(() => {
    if (settings.enabled) {
      setIsProcessing(true);
      processFrame();
    } else {
      setIsProcessing(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [settings.enabled, processFrame]);

  // Load background image
  useEffect(() => {
    if (settings.backgroundImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        backgroundImageRef.current = img;
      };
      img.src = settings.backgroundImage;
    } else {
      backgroundImageRef.current = null;
    }
  }, [settings.backgroundImage]);

  // Notify parent of settings changes
  useEffect(() => {
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  const updateSettings = (updates: Partial<ChromaKeySettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        updateSettings({ 
          backgroundType: 'image',
          backgroundImage: event.target?.result as string 
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const resetSettings = () => {
    setSettings({
      enabled: false,
      keyColor: '#00FF00',
      tolerance: 40,
      smoothness: 10,
      spillSuppression: 50,
      backgroundType: 'blur',
      backgroundColor: '#1a1a2e',
      backgroundImage: null,
      blurAmount: 20,
    });
  };

  const [isSectionOpen, setIsSectionOpen] = useState(false);

  return (
    <Card className={cn("w-full", className)}>
    <Collapsible open={isSectionOpen} onOpenChange={setIsSectionOpen}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left cursor-pointer hover:opacity-80 transition-opacity">
              <ChevronDown className={cn("h-4 w-4 transition-transform", isSectionOpen && "rotate-180")} />
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Paintbrush className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
                Green Screen
              </CardTitle>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetSettings} className="h-8">
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => updateSettings({ enabled })}
            />
          </div>
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-4">
        {/* Cross-origin error message */}
        {crossOriginError && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-sm text-yellow-600 dark:text-yellow-500">
              <strong>Note:</strong> Green screen processing is not available for this video due to cross-origin restrictions. This feature works best with:
            </p>
            <ul className="text-xs text-muted-foreground mt-2 ml-4 list-disc">
              <li>Live camera feed during recording</li>
              <li>Videos recorded directly in the app</li>
            </ul>
          </div>
        )}

        {/* Preview Canvas */}
        {showPreview && settings.enabled && (
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
            <canvas
              ref={outputCanvasRef}
              className="w-full h-full object-contain"
            />
            {isProcessing && (
              <div className="absolute top-2 right-2 px-2 py-1 bg-green-500/80 rounded text-xs text-white">
                Processing
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="key" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="key" className="text-xs sm:text-sm">Key Color</TabsTrigger>
            <TabsTrigger value="background" className="text-xs sm:text-sm">Background</TabsTrigger>
          </TabsList>

          {/* Key Color Tab */}
          <TabsContent value="key" className="space-y-4 mt-3">
            {/* Color Presets */}
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">Color Presets</Label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.name}
                    className={cn(
                      "p-2 rounded-lg border text-center transition-all",
                      preset.color && settings.keyColor.toLowerCase() === preset.color.toLowerCase()
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-primary/50"
                    )}
                    onClick={() => preset.color && updateSettings({ keyColor: preset.color })}
                    disabled={!settings.enabled}
                  >
                    {preset.color ? (
                      <div 
                        className="w-6 h-6 rounded mx-auto mb-1 border"
                        style={{ backgroundColor: preset.color }}
                      />
                    ) : (
                      <Palette className="w-6 h-6 mx-auto mb-1 text-muted-foreground" />
                    )}
                    <div className="text-[10px] truncate">{preset.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Color Picker */}
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">Custom Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={settings.keyColor}
                  onChange={(e) => updateSettings({ keyColor: e.target.value })}
                  className="w-12 h-9 p-1 cursor-pointer"
                  disabled={!settings.enabled}
                />
                <Input
                  type="text"
                  value={customColorInput}
                  onChange={(e) => {
                    setCustomColorInput(e.target.value);
                    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                      updateSettings({ keyColor: e.target.value });
                    }
                  }}
                  placeholder="#00FF00"
                  className="flex-1"
                  disabled={!settings.enabled}
                />
              </div>
            </div>

            {/* Tolerance */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <Label className="flex items-center gap-1">
                  <Droplet className="h-3 w-3" /> Tolerance
                </Label>
                <span>{settings.tolerance}%</span>
              </div>
              <Slider
                value={[settings.tolerance]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => updateSettings({ tolerance: v })}
                disabled={!settings.enabled}
              />
              <p className="text-xs text-muted-foreground">
                Higher values remove more color variations
              </p>
            </div>

            {/* Smoothness */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <Label>Edge Smoothness</Label>
                <span>{settings.smoothness}%</span>
              </div>
              <Slider
                value={[settings.smoothness]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => updateSettings({ smoothness: v })}
                disabled={!settings.enabled}
              />
            </div>

            {/* Spill Suppression */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <Label>Spill Suppression</Label>
                <span>{settings.spillSuppression}%</span>
              </div>
              <Slider
                value={[settings.spillSuppression]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => updateSettings({ spillSuppression: v })}
                disabled={!settings.enabled}
              />
              <p className="text-xs text-muted-foreground">
                Reduces color spill on edges
              </p>
            </div>
          </TabsContent>

          {/* Background Tab */}
          <TabsContent value="background" className="space-y-4 mt-3">
            {/* Background Type */}
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">Background Type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['blur', 'color', 'image', 'transparent'] as const).map((type) => (
                  <button
                    key={type}
                    className={cn(
                      "p-2 rounded-lg border text-center transition-all capitalize",
                      settings.backgroundType === type
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                    onClick={() => updateSettings({ backgroundType: type })}
                    disabled={!settings.enabled}
                  >
                    <div className="text-xs sm:text-sm">{type}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Blur Amount */}
            {settings.backgroundType === 'blur' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs sm:text-sm">
                  <Label>Blur Amount</Label>
                  <span>{settings.blurAmount}px</span>
                </div>
                <Slider
                  value={[settings.blurAmount]}
                  min={5}
                  max={50}
                  step={1}
                  onValueChange={([v]) => updateSettings({ blurAmount: v })}
                  disabled={!settings.enabled}
                />
              </div>
            )}

            {/* Background Color */}
            {settings.backgroundType === 'color' && (
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Background Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={settings.backgroundColor}
                    onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                    className="w-12 h-9 p-1 cursor-pointer"
                    disabled={!settings.enabled}
                  />
                  <Input
                    type="text"
                    value={settings.backgroundColor}
                    onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                    className="flex-1"
                    disabled={!settings.enabled}
                  />
                </div>
              </div>
            )}

            {/* Background Image */}
            {settings.backgroundType === 'image' && (
              <div className="space-y-3">
                <Label className="text-xs sm:text-sm">Background Image</Label>
                
                {/* Upload Button */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => document.getElementById('bg-image-upload')?.click()}
                    disabled={!settings.enabled}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Upload Image
                  </Button>
                  {settings.backgroundImage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateSettings({ backgroundImage: null })}
                      disabled={!settings.enabled}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <input
                    id="bg-image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>

                {/* Preset Backgrounds */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BACKGROUND_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      className={cn(
                        "relative aspect-video rounded-lg overflow-hidden border transition-all",
                        settings.backgroundImage === preset.url
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => updateSettings({ backgroundImage: preset.url })}
                      disabled={!settings.enabled}
                    >
                      <img
                        src={preset.url}
                        alt={preset.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] p-1 text-center">
                        {preset.name}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Current Background Preview */}
                {settings.backgroundImage && (
                  <div className="relative aspect-video rounded-lg overflow-hidden border">
                    <img
                      src={settings.backgroundImage}
                      alt="Background"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Help Text */}
        <p className="text-xs text-muted-foreground">
          Position yourself in front of a solid green or blue background for best results.
        </p>
      </CardContent>
      </CollapsibleContent>
    </Collapsible>
    </Card>
  );
}

export default GreenScreenChromaKey;
