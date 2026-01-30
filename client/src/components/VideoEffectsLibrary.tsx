import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Sun, Contrast, Palette, Film, Circle, Square, RotateCcw, Save, FolderOpen, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface VideoEffect {
  id: string;
  name: string;
  enabled: boolean;
  intensity: number;
  settings?: Record<string, number>;
}

interface LUTPreset {
  name: string;
  filter: string;
  description: string;
}

interface VideoEffectsLibraryProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onEffectsChange?: (effects: VideoEffect[]) => void;
  className?: string;
}

const LUT_PRESETS: LUTPreset[] = [
  { name: 'None', filter: 'none', description: 'No color grading' },
  { name: 'Cinematic', filter: 'contrast(1.1) saturate(0.9) sepia(0.1)', description: 'Hollywood film look' },
  { name: 'Vintage', filter: 'sepia(0.4) contrast(1.1) brightness(0.95)', description: 'Retro film aesthetic' },
  { name: 'Teal & Orange', filter: 'hue-rotate(-10deg) saturate(1.3) contrast(1.05)', description: 'Blockbuster color grade' },
  { name: 'Noir', filter: 'grayscale(1) contrast(1.3) brightness(0.9)', description: 'Black & white dramatic' },
  { name: 'Warm Sunset', filter: 'sepia(0.2) saturate(1.2) brightness(1.05) hue-rotate(-5deg)', description: 'Golden hour warmth' },
  { name: 'Cool Blue', filter: 'hue-rotate(20deg) saturate(0.9) brightness(1.05)', description: 'Cold, moody tones' },
  { name: 'Faded Film', filter: 'contrast(0.9) brightness(1.1) saturate(0.8)', description: 'Washed out retro' },
  { name: 'High Contrast', filter: 'contrast(1.4) saturate(1.1)', description: 'Punchy, bold colors' },
  { name: 'Muted', filter: 'saturate(0.6) contrast(0.95) brightness(1.05)', description: 'Subtle, desaturated' },
];

const DEFAULT_EFFECTS: VideoEffect[] = [
  { id: 'vignette', name: 'Vignette', enabled: false, intensity: 50, settings: { size: 50, softness: 50 } },
  { id: 'filmGrain', name: 'Film Grain', enabled: false, intensity: 30, settings: { size: 1, speed: 50 } },
  { id: 'blur', name: 'Blur', enabled: false, intensity: 0, settings: { type: 0 } },
  { id: 'sharpen', name: 'Sharpen', enabled: false, intensity: 0 },
  { id: 'glow', name: 'Glow', enabled: false, intensity: 30, settings: { radius: 10 } },
  { id: 'chromatic', name: 'Chromatic Aberration', enabled: false, intensity: 20 },
];

export function VideoEffectsLibrary({
  videoRef,
  canvasRef,
  onEffectsChange,
  className
}: VideoEffectsLibraryProps) {
  const [effects, setEffects] = useState<VideoEffect[]>(DEFAULT_EFFECTS);
  const [selectedLUT, setSelectedLUT] = useState<number>(0);
  const [lutIntensity, setLutIntensity] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hue, setHue] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const grainAnimationRef = useRef<number | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  // Fetch user's saved presets
  const { data: savedPresets, refetch: refetchPresets } = trpc.effectPresets.list.useQuery();
  const createPresetMutation = trpc.effectPresets.create.useMutation({
    onSuccess: () => {
      toast.success('Preset saved successfully');
      refetchPresets();
      setSaveDialogOpen(false);
      setPresetName('');
      setPresetDescription('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const deletePresetMutation = trpc.effectPresets.delete.useMutation({
    onSuccess: () => {
      toast.success('Preset deleted');
      refetchPresets();
    },
  });
  const trackUsageMutation = trpc.effectPresets.trackUsage.useMutation();

  // Generate CSS filter string from all settings
  const generateFilterString = useCallback(() => {
    const filters: string[] = [];
    
    // Basic adjustments
    if (brightness !== 100) filters.push(`brightness(${brightness / 100})`);
    if (contrast !== 100) filters.push(`contrast(${contrast / 100})`);
    if (saturation !== 100) filters.push(`saturate(${saturation / 100})`);
    if (hue !== 0) filters.push(`hue-rotate(${hue}deg)`);
    
    // LUT preset with intensity
    if (selectedLUT > 0 && LUT_PRESETS[selectedLUT].filter !== 'none') {
      // Apply LUT with intensity by blending with original
      // At 100% intensity, use full LUT; at 0%, use no LUT
      if (lutIntensity === 100) {
        filters.push(LUT_PRESETS[selectedLUT].filter);
      } else if (lutIntensity > 0) {
        // Parse and scale the LUT filter values based on intensity
        const lutFilter = LUT_PRESETS[selectedLUT].filter;
        const scaledFilter = scaleLutIntensity(lutFilter, lutIntensity / 100);
        filters.push(scaledFilter);
      }
    }
    
    // Blur effect
    const blurEffect = effects.find(e => e.id === 'blur');
    if (blurEffect?.enabled && blurEffect.intensity > 0) {
      filters.push(`blur(${blurEffect.intensity / 10}px)`);
    }
    
    return filters.length > 0 ? filters.join(' ') : 'none';
  }, [brightness, contrast, saturation, hue, selectedLUT, lutIntensity, effects]);

  // Helper function to scale LUT filter intensity
  const scaleLutIntensity = (filter: string, intensity: number): string => {
    // Parse filter functions and scale their values
    return filter.replace(/(\w+)\(([^)]+)\)/g, (match, fn, value) => {
      const numMatch = value.match(/([\d.]+)/);
      if (!numMatch) return match;
      
      const originalValue = parseFloat(numMatch[1]);
      let scaledValue: number;
      
      switch (fn) {
        case 'contrast':
        case 'saturate':
        case 'brightness':
          // These have a neutral value of 1
          scaledValue = 1 + (originalValue - 1) * intensity;
          break;
        case 'sepia':
        case 'grayscale':
          // These have a neutral value of 0
          scaledValue = originalValue * intensity;
          break;
        case 'hue-rotate':
          // Scale the degree value
          const degMatch = value.match(/(-?[\d.]+)deg/);
          if (degMatch) {
            const deg = parseFloat(degMatch[1]) * intensity;
            return `hue-rotate(${deg}deg)`;
          }
          return match;
        default:
          scaledValue = originalValue;
      }
      
      return `${fn}(${scaledValue}${value.replace(/[\d.]+/, '')})`;
    });
  };

  // Apply effects to video element
  useEffect(() => {
    if (!videoRef.current) return;
    
    const filterString = generateFilterString();
    videoRef.current.style.filter = filterString;
  }, [videoRef, generateFilterString]);

  // Notify parent of changes separately to avoid infinite loops
  useEffect(() => {
    const effectsWithLUT = [...effects];
    if (selectedLUT > 0) {
      effectsWithLUT.push({
        id: 'lut',
        name: LUT_PRESETS[selectedLUT].name,
        enabled: true,
        intensity: 100
      });
    }
    onEffectsChange?.(effectsWithLUT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects, selectedLUT]);

  // Film grain animation
  useEffect(() => {
    const grainEffect = effects.find(e => e.id === 'filmGrain');
    if (!grainEffect?.enabled || !overlayRef.current) {
      if (grainAnimationRef.current) {
        cancelAnimationFrame(grainAnimationRef.current);
      }
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 256;
    canvas.height = 256;

    const animateGrain = () => {
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      const intensity = grainEffect.intensity / 100;

      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 255 * intensity;
        data[i] = 128 + noise;
        data[i + 1] = 128 + noise;
        data[i + 2] = 128 + noise;
        data[i + 3] = 30 * intensity;
      }

      ctx.putImageData(imageData, 0, 0);
      
      if (overlayRef.current) {
        overlayRef.current.style.backgroundImage = `url(${canvas.toDataURL()})`;
      }

      grainAnimationRef.current = requestAnimationFrame(animateGrain);
    };

    animateGrain();

    return () => {
      if (grainAnimationRef.current) {
        cancelAnimationFrame(grainAnimationRef.current);
      }
    };
  }, [effects]);

  const toggleEffect = (effectId: string) => {
    setEffects(prev => prev.map(e => 
      e.id === effectId ? { ...e, enabled: !e.enabled } : e
    ));
  };

  const updateEffectIntensity = (effectId: string, intensity: number) => {
    setEffects(prev => prev.map(e => 
      e.id === effectId ? { ...e, intensity } : e
    ));
  };

  const updateEffectSetting = (effectId: string, key: string, value: number) => {
    setEffects(prev => prev.map(e => 
      e.id === effectId ? { ...e, settings: { ...e.settings, [key]: value } } : e
    ));
  };

  const resetAll = () => {
    setEffects(DEFAULT_EFFECTS);
    setSelectedLUT(0);
    setLutIntensity(100);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setHue(0);
    if (videoRef.current) {
      videoRef.current.style.filter = 'none';
    }
  };

  const vignetteEffect = effects.find(e => e.id === 'vignette');
  const grainEffect = effects.find(e => e.id === 'filmGrain');
  const glowEffect = effects.find(e => e.id === 'glow');

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
            Video Effects
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Presets Toggle */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowPresets(!showPresets)} 
              className="h-8"
            >
              <FolderOpen className="h-3 w-3 mr-1" />
              Presets
              {showPresets ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
            
            {/* Save Preset Dialog */}
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Effect Preset</DialogTitle>
                  <DialogDescription>
                    Save your current effect settings as a preset for quick reuse.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="presetName">Preset Name</Label>
                    <Input
                      id="presetName"
                      placeholder="My Custom Look"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="presetDescription">Description (optional)</Label>
                    <Input
                      id="presetDescription"
                      placeholder="Warm cinematic look with high contrast"
                      value={presetDescription}
                      onChange={(e) => setPresetDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      if (!presetName.trim()) {
                        toast.error('Please enter a preset name');
                        return;
                      }
                      createPresetMutation.mutate({
                        name: presetName,
                        description: presetDescription || undefined,
                        settings: {
                          selectedLUT,
                          lutIntensity,
                          brightness,
                          contrast,
                          saturation,
                          hue,
                          effects: effects.map(e => ({
                            id: e.id,
                            name: e.name,
                            enabled: e.enabled,
                            intensity: e.intensity,
                            settings: e.settings,
                          })),
                        },
                      });
                    }}
                    disabled={createPresetMutation.isPending}
                  >
                    {createPresetMutation.isPending ? 'Saving...' : 'Save Preset'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <Button variant="ghost" size="sm" onClick={resetAll} className="h-8">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Saved Presets Section */}
        {showPresets && (
          <div className="mb-4 p-3 bg-muted/30 rounded-lg border">
            <Label className="text-sm font-medium mb-2 block">Your Saved Presets</Label>
            {savedPresets && savedPresets.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {savedPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                  >
                    <button
                      className="flex-1 text-left"
                      onClick={() => {
                        // Load preset settings
                        const settings = preset.settings as any;
                        if (settings) {
                          setSelectedLUT(settings.selectedLUT || 0);
                          setLutIntensity(settings.lutIntensity || 100);
                          setBrightness(settings.brightness || 100);
                          setContrast(settings.contrast || 100);
                          setSaturation(settings.saturation || 100);
                          setHue(settings.hue || 0);
                          if (settings.effects) {
                            setEffects(settings.effects);
                          }
                          trackUsageMutation.mutate({ id: preset.id });
                          toast.success(`Loaded preset: ${preset.name}`);
                        }
                      }}
                    >
                      <div className="text-sm font-medium">{preset.name}</div>
                      {preset.description && (
                        <div className="text-xs text-muted-foreground truncate">{preset.description}</div>
                      )}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePresetMutation.mutate({ id: preset.id });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No saved presets yet. Adjust effects and click Save to create one.</p>
            )}
          </div>
        )}
        
        <Tabs defaultValue="luts" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="luts" className="text-xs sm:text-sm">LUTs</TabsTrigger>
            <TabsTrigger value="adjust" className="text-xs sm:text-sm">Adjust</TabsTrigger>
            <TabsTrigger value="effects" className="text-xs sm:text-sm">Effects</TabsTrigger>
          </TabsList>

          {/* LUT Presets Tab */}
          <TabsContent value="luts" className="space-y-3 mt-3">
            <Label className="text-xs sm:text-sm">Color Grading Presets</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {LUT_PRESETS.map((lut, index) => (
                <button
                  key={lut.name}
                  className={cn(
                    "p-2 rounded-lg border text-center transition-all",
                    selectedLUT === index
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => setSelectedLUT(index)}
                >
                  <div className="text-xs sm:text-sm font-medium truncate">{lut.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate hidden sm:block">
                    {lut.description}
                  </div>
                </button>
              ))}
            </div>
            
            {/* LUT Intensity Slider */}
            {selectedLUT > 0 && (
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg mt-3">
                <div className="flex justify-between text-xs sm:text-sm">
                  <Label className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Effect Intensity
                  </Label>
                  <span className="font-medium">{lutIntensity}%</span>
                </div>
                <Slider
                  value={[lutIntensity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => setLutIntensity(v)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Adjust how strongly the {LUT_PRESETS[selectedLUT].name} effect is applied
                </p>
              </div>
            )}
          </TabsContent>

          {/* Basic Adjustments Tab */}
          <TabsContent value="adjust" className="space-y-4 mt-3">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs sm:text-sm">
                  <Label className="flex items-center gap-1">
                    <Sun className="h-3 w-3" /> Brightness
                  </Label>
                  <span>{brightness}%</span>
                </div>
                <Slider
                  value={[brightness]}
                  min={50}
                  max={150}
                  step={1}
                  onValueChange={([v]) => setBrightness(v)}
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs sm:text-sm">
                  <Label className="flex items-center gap-1">
                    <Contrast className="h-3 w-3" /> Contrast
                  </Label>
                  <span>{contrast}%</span>
                </div>
                <Slider
                  value={[contrast]}
                  min={50}
                  max={150}
                  step={1}
                  onValueChange={([v]) => setContrast(v)}
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs sm:text-sm">
                  <Label className="flex items-center gap-1">
                    <Palette className="h-3 w-3" /> Saturation
                  </Label>
                  <span>{saturation}%</span>
                </div>
                <Slider
                  value={[saturation]}
                  min={0}
                  max={200}
                  step={1}
                  onValueChange={([v]) => setSaturation(v)}
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs sm:text-sm">
                  <Label>Hue Shift</Label>
                  <span>{hue}°</span>
                </div>
                <Slider
                  value={[hue]}
                  min={-180}
                  max={180}
                  step={1}
                  onValueChange={([v]) => setHue(v)}
                />
              </div>
            </div>
          </TabsContent>

          {/* Special Effects Tab */}
          <TabsContent value="effects" className="space-y-4 mt-3">
            {/* Vignette */}
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs sm:text-sm flex items-center gap-2">
                  <Circle className="h-3 w-3" /> Vignette
                </Label>
                <Switch
                  checked={vignetteEffect?.enabled || false}
                  onCheckedChange={() => toggleEffect('vignette')}
                />
              </div>
              {vignetteEffect?.enabled && (
                <div className="space-y-2 pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Intensity</span>
                      <span>{vignetteEffect.intensity}%</span>
                    </div>
                    <Slider
                      value={[vignetteEffect.intensity]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => updateEffectIntensity('vignette', v)}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Size</span>
                      <span>{vignetteEffect.settings?.size || 50}%</span>
                    </div>
                    <Slider
                      value={[vignetteEffect.settings?.size || 50]}
                      min={10}
                      max={100}
                      step={1}
                      onValueChange={([v]) => updateEffectSetting('vignette', 'size', v)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Film Grain */}
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs sm:text-sm flex items-center gap-2">
                  <Film className="h-3 w-3" /> Film Grain
                </Label>
                <Switch
                  checked={grainEffect?.enabled || false}
                  onCheckedChange={() => toggleEffect('filmGrain')}
                />
              </div>
              {grainEffect?.enabled && (
                <div className="space-y-2 pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Intensity</span>
                      <span>{grainEffect.intensity}%</span>
                    </div>
                    <Slider
                      value={[grainEffect.intensity]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => updateEffectIntensity('filmGrain', v)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Blur */}
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs sm:text-sm flex items-center gap-2">
                  <Square className="h-3 w-3" /> Blur
                </Label>
                <Switch
                  checked={effects.find(e => e.id === 'blur')?.enabled || false}
                  onCheckedChange={() => toggleEffect('blur')}
                />
              </div>
              {effects.find(e => e.id === 'blur')?.enabled && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs">
                    <span>Amount</span>
                    <span>{effects.find(e => e.id === 'blur')?.intensity || 0}%</span>
                  </div>
                  <Slider
                    value={[effects.find(e => e.id === 'blur')?.intensity || 0]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => updateEffectIntensity('blur', v)}
                  />
                </div>
              )}
            </div>

            {/* Glow */}
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs sm:text-sm flex items-center gap-2">
                  <Sparkles className="h-3 w-3" /> Glow
                </Label>
                <Switch
                  checked={glowEffect?.enabled || false}
                  onCheckedChange={() => toggleEffect('glow')}
                />
              </div>
              {glowEffect?.enabled && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs">
                    <span>Intensity</span>
                    <span>{glowEffect.intensity}%</span>
                  </div>
                  <Slider
                    value={[glowEffect.intensity]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => updateEffectIntensity('glow', v)}
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Effect Overlays Container */}
        <div
          ref={overlayRef}
          className="pointer-events-none fixed inset-0 z-50 mix-blend-overlay"
          style={{
            display: grainEffect?.enabled ? 'block' : 'none',
            backgroundRepeat: 'repeat',
          }}
        />

        {/* Vignette Overlay */}
        {vignetteEffect?.enabled && (
          <style>{`
            video {
              box-shadow: inset 0 0 ${100 - (vignetteEffect.settings?.size || 50)}px ${vignetteEffect.intensity}px rgba(0,0,0,0.8);
            }
          `}</style>
        )}
      </CardContent>
    </Card>
  );
}

export default VideoEffectsLibrary;
