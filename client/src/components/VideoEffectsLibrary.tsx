import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Sun, Contrast, Palette, Film, Circle, Square, RotateCcw } from 'lucide-react';
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
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hue, setHue] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const grainAnimationRef = useRef<number | null>(null);

  // Generate CSS filter string from all settings
  const generateFilterString = useCallback(() => {
    const filters: string[] = [];
    
    // Basic adjustments
    if (brightness !== 100) filters.push(`brightness(${brightness / 100})`);
    if (contrast !== 100) filters.push(`contrast(${contrast / 100})`);
    if (saturation !== 100) filters.push(`saturate(${saturation / 100})`);
    if (hue !== 0) filters.push(`hue-rotate(${hue}deg)`);
    
    // LUT preset
    if (selectedLUT > 0 && LUT_PRESETS[selectedLUT].filter !== 'none') {
      filters.push(LUT_PRESETS[selectedLUT].filter);
    }
    
    // Blur effect
    const blurEffect = effects.find(e => e.id === 'blur');
    if (blurEffect?.enabled && blurEffect.intensity > 0) {
      filters.push(`blur(${blurEffect.intensity / 10}px)`);
    }
    
    return filters.length > 0 ? filters.join(' ') : 'none';
  }, [brightness, contrast, saturation, hue, selectedLUT, effects]);

  // Apply effects to video element
  useEffect(() => {
    if (!videoRef.current) return;
    
    const filterString = generateFilterString();
    videoRef.current.style.filter = filterString;
    
    // Notify parent of changes
    onEffectsChange?.(effects);
  }, [videoRef, effects, generateFilterString, onEffectsChange]);

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
          <Button variant="ghost" size="sm" onClick={resetAll} className="h-8">
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent>
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
