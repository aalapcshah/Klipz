import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Mic, 
  Volume2, 
  VolumeX, 
  Music, 
  Monitor, 
  Headphones,
  Activity,
  RotateCcw,
  Link,
  Unlink,
  Play,
  Pause,
  Library,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface AudioTrack {
  id: string;
  name: string;
  type: 'mic' | 'system' | 'music';
  enabled: boolean;
  volume: number; // 0-100
  muted: boolean;
  pan: number; // -100 to 100 (left to right)
  level: number; // Current audio level 0-100
  stream?: MediaStream;
  gainNode?: GainNode;
  panNode?: StereoPannerNode;
  analyser?: AnalyserNode;
}

interface MultiTrackAudioMixerProps {
  onTracksChange?: (tracks: AudioTrack[]) => void;
  onMixedStream?: (stream: MediaStream) => void;
  className?: string;
}

export function MultiTrackAudioMixer({
  onTracksChange,
  onMixedStream,
  className
}: MultiTrackAudioMixerProps) {
  const [tracks, setTracks] = useState<AudioTrack[]>([
    { id: 'mic', name: 'Microphone', type: 'mic', enabled: false, volume: 80, muted: false, pan: 0, level: 0 },
    { id: 'system', name: 'System Audio', type: 'system', enabled: false, volume: 70, muted: false, pan: 0, level: 0 },
    { id: 'music', name: 'Background Music', type: 'music', enabled: false, volume: 50, muted: false, pan: 0, level: 0 },
  ]);
  const [masterVolume, setMasterVolume] = useState(100);
  const [masterMuted, setMasterMuted] = useState(false);
  const [linkedVolumes, setLinkedVolumes] = useState(false);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [showMusicLibrary, setShowMusicLibrary] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Background music presets (royalty-free placeholder URLs)
  const MUSIC_PRESETS = [
    { id: 'upbeat', name: 'Upbeat Corporate', genre: 'Corporate', duration: '2:30', mood: 'Energetic' },
    { id: 'ambient', name: 'Ambient Dreams', genre: 'Ambient', duration: '3:15', mood: 'Calm' },
    { id: 'cinematic', name: 'Epic Cinematic', genre: 'Cinematic', duration: '2:45', mood: 'Dramatic' },
    { id: 'lofi', name: 'Lo-Fi Chill', genre: 'Lo-Fi', duration: '3:00', mood: 'Relaxed' },
    { id: 'electronic', name: 'Electronic Pulse', genre: 'Electronic', duration: '2:20', mood: 'Modern' },
    { id: 'acoustic', name: 'Acoustic Morning', genre: 'Acoustic', duration: '2:50', mood: 'Warm' },
    { id: 'jazz', name: 'Smooth Jazz', genre: 'Jazz', duration: '3:30', mood: 'Sophisticated' },
    { id: 'inspiring', name: 'Inspiring Piano', genre: 'Piano', duration: '2:15', mood: 'Uplifting' },
  ];

  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();
    destinationRef.current = audioContextRef.current.createMediaStreamDestination();
    masterGainRef.current = audioContextRef.current.createGain();
    masterGainRef.current.connect(destinationRef.current);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audioContextRef.current?.close();
    };
  }, []);

  // Update master volume
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterMuted ? 0 : masterVolume / 100;
    }
  }, [masterVolume, masterMuted]);

  // Audio level monitoring
  useEffect(() => {
    const updateLevels = () => {
      setTracks(prev => prev.map(track => {
        if (!track.analyser || !track.enabled) return { ...track, level: 0 };
        
        const dataArray = new Uint8Array(track.analyser.frequencyBinCount);
        track.analyser.getByteFrequencyData(dataArray);
        
        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(100, (rms / 255) * 100 * 2);
        
        return { ...track, level };
      }));

      animationRef.current = requestAnimationFrame(updateLevels);
    };

    updateLevels();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Enable microphone
  const enableMicrophone = async () => {
    if (!audioContextRef.current || !masterGainRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const gainNode = audioContextRef.current.createGain();
      const panNode = audioContextRef.current.createStereoPanner();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;

      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(analyser);
      analyser.connect(masterGainRef.current);

      const micTrack = tracks.find(t => t.id === 'mic');
      if (micTrack) {
        gainNode.gain.value = micTrack.volume / 100;
        panNode.pan.value = micTrack.pan / 100;
      }

      setTracks(prev => prev.map(t => 
        t.id === 'mic' 
          ? { ...t, enabled: true, stream, gainNode, panNode, analyser }
          : t
      ));
    } catch (error) {
      console.error('Failed to access microphone:', error);
    }
  };

  // Enable system audio (requires screen capture)
  const enableSystemAudio = async () => {
    if (!audioContextRef.current || !masterGainRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        audio: true,
        video: true // Required for getDisplayMedia
      });
      
      // Stop video track, we only need audio
      stream.getVideoTracks().forEach(track => track.stop());

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.error('No system audio available');
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      const source = audioContextRef.current.createMediaStreamSource(audioStream);
      const gainNode = audioContextRef.current.createGain();
      const panNode = audioContextRef.current.createStereoPanner();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;

      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(analyser);
      analyser.connect(masterGainRef.current);

      const systemTrack = tracks.find(t => t.id === 'system');
      if (systemTrack) {
        gainNode.gain.value = systemTrack.volume / 100;
        panNode.pan.value = systemTrack.pan / 100;
      }

      setTracks(prev => prev.map(t => 
        t.id === 'system' 
          ? { ...t, enabled: true, stream: audioStream, gainNode, panNode, analyser }
          : t
      ));
    } catch (error) {
      console.error('Failed to capture system audio:', error);
    }
  };

  // Load background music
  const loadMusicFile = (file: File) => {
    if (!audioContextRef.current || !masterGainRef.current) return;

    setMusicFile(file);

    // Create audio element
    const audio = new Audio(URL.createObjectURL(file));
    audio.loop = true;
    audioElementRef.current = audio;

    // Wait for audio to be ready
    audio.addEventListener('canplaythrough', () => {
      if (!audioContextRef.current || !masterGainRef.current) return;

      const source = audioContextRef.current.createMediaElementSource(audio);
      const gainNode = audioContextRef.current.createGain();
      const panNode = audioContextRef.current.createStereoPanner();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;

      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(analyser);
      analyser.connect(masterGainRef.current);

      musicSourceRef.current = source;

      const musicTrack = tracks.find(t => t.id === 'music');
      if (musicTrack) {
        gainNode.gain.value = musicTrack.volume / 100;
        panNode.pan.value = musicTrack.pan / 100;
      }

      setTracks(prev => prev.map(t => 
        t.id === 'music' 
          ? { ...t, enabled: true, gainNode, panNode, analyser }
          : t
      ));

      audio.play();
    });
  };

  // Disable track
  const disableTrack = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    if (track.stream) {
      track.stream.getTracks().forEach(t => t.stop());
    }

    if (trackId === 'music' && audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
      musicSourceRef.current = null;
      setMusicFile(null);
    }

    setTracks(prev => prev.map(t => 
      t.id === trackId 
        ? { ...t, enabled: false, stream: undefined, gainNode: undefined, panNode: undefined, analyser: undefined, level: 0 }
        : t
    ));
  };

  // Toggle track
  const toggleTrack = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    if (track.enabled) {
      disableTrack(trackId);
    } else {
      switch (trackId) {
        case 'mic':
          await enableMicrophone();
          break;
        case 'system':
          await enableSystemAudio();
          break;
        case 'music':
          // Trigger file picker
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*';
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) loadMusicFile(file);
          };
          input.click();
          break;
      }
    }
  };

  // Update track volume
  const updateTrackVolume = (trackId: string, volume: number) => {
    setTracks(prev => {
      const newTracks = prev.map(t => {
        if (t.id === trackId) {
          if (t.gainNode) {
            t.gainNode.gain.value = t.muted ? 0 : volume / 100;
          }
          return { ...t, volume };
        }
        // If volumes are linked, update all tracks
        if (linkedVolumes) {
          if (t.gainNode) {
            t.gainNode.gain.value = t.muted ? 0 : volume / 100;
          }
          return { ...t, volume };
        }
        return t;
      });
      return newTracks;
    });
  };

  // Update track pan
  const updateTrackPan = (trackId: string, pan: number) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        if (t.panNode) {
          t.panNode.pan.value = pan / 100;
        }
        return { ...t, pan };
      }
      return t;
    }));
  };

  // Toggle track mute
  const toggleTrackMute = (trackId: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        const newMuted = !t.muted;
        if (t.gainNode) {
          t.gainNode.gain.value = newMuted ? 0 : t.volume / 100;
        }
        return { ...t, muted: newMuted };
      }
      return t;
    }));
  };

  // Reset all tracks
  const resetAll = () => {
    tracks.forEach(t => {
      if (t.enabled) disableTrack(t.id);
    });
    setMasterVolume(100);
    setMasterMuted(false);
    setLinkedVolumes(false);
  };

  // Notify parent of changes
  useEffect(() => {
    onTracksChange?.(tracks);
    if (destinationRef.current) {
      onMixedStream?.(destinationRef.current.stream);
    }
  }, [tracks, onTracksChange, onMixedStream]);

  const getTrackIcon = (type: string) => {
    switch (type) {
      case 'mic': return <Mic className="h-4 w-4" />;
      case 'system': return <Monitor className="h-4 w-4" />;
      case 'music': return <Music className="h-4 w-4" />;
      default: return <Volume2 className="h-4 w-4" />;
    }
  };

  const [isSectionOpen, setIsSectionOpen] = useState(false);

  return (
    <Card className={cn("p-3 max-w-full overflow-hidden", className)}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsSectionOpen(!isSectionOpen)}
      >
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4 text-green-500" />
          <span className="font-medium text-sm">Multi-Track Audio</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 w-6 p-0", linkedVolumes && "text-primary")}
            onClick={(e) => { e.stopPropagation(); setLinkedVolumes(!linkedVolumes); }}
          >
            {linkedVolumes ? <Link className="h-3 w-3" /> : <Unlink className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); resetAll(); }} className="h-6 w-6 p-0">
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {isSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isSectionOpen && (
      <div className="mt-3 space-y-3">
        {/* Master Volume */}
        <div className="p-3 bg-muted rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
              <Volume2 className="h-4 w-4" /> Master
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setMasterMuted(!masterMuted)}
            >
              {masterMuted ? <VolumeX className="h-4 w-4 text-destructive" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              value={[masterVolume]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) => setMasterVolume(v)}
              className="flex-1"
            />
            <span className="text-xs w-8 text-right">{masterVolume}%</span>
          </div>
        </div>

        {/* Individual Tracks */}
        <div className="space-y-3">
          {tracks.map(track => (
            <div 
              key={track.id} 
              className={cn(
                "p-3 rounded-lg border transition-colors",
                track.enabled ? "bg-muted/50 border-primary/30" : "bg-background border-border"
              )}
            >
              {/* Track Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={track.enabled}
                    onCheckedChange={() => toggleTrack(track.id)}
                  />
                  <Label className="text-xs sm:text-sm flex items-center gap-2">
                    {getTrackIcon(track.type)}
                    <span className="hidden sm:inline">{track.name}</span>
                    <span className="sm:hidden">{track.type === 'mic' ? 'Mic' : track.type === 'system' ? 'Sys' : 'Music'}</span>
                  </Label>
                </div>
                {track.enabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => toggleTrackMute(track.id)}
                  >
                    {track.muted ? <VolumeX className="h-4 w-4 text-destructive" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                )}
              </div>

              {/* Track Controls */}
              {track.enabled && (
                <div className="space-y-3 pt-2">
                  {/* Volume */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Volume</span>
                      <span>{track.volume}%</span>
                    </div>
                    <Slider
                      value={[track.volume]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => updateTrackVolume(track.id, v)}
                      disabled={track.muted}
                    />
                  </div>

                  {/* Pan */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Pan</span>
                      <span>{track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(track.pan)}` : `R${track.pan}`}</span>
                    </div>
                    <Slider
                      value={[track.pan]}
                      min={-100}
                      max={100}
                      step={1}
                      onValueChange={([v]) => updateTrackPan(track.id, v)}
                    />
                  </div>

                  {/* Level Meter */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Activity className="h-3 w-3" />
                      <span>Level</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all duration-75 rounded-full",
                          track.level > 80 ? "bg-red-500" : track.level > 50 ? "bg-yellow-500" : "bg-green-500"
                        )}
                        style={{ width: `${track.level}%` }}
                      />
                    </div>
                  </div>

                  {/* Music file info */}
                  {track.type === 'music' && musicFile && (
                    <div className="text-xs text-muted-foreground truncate">
                      🎵 {musicFile.name}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Background Music Library */}
        <div className="border rounded-lg overflow-hidden">
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-3 h-auto"
            onClick={() => setShowMusicLibrary(!showMusicLibrary)}
          >
            <div className="flex items-center gap-2">
              <Library className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Background Music Library</span>
              <span className="text-xs text-muted-foreground">({MUSIC_PRESETS.length} tracks)</span>
            </div>
            {showMusicLibrary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          
          {showMusicLibrary && (
            <div className="p-3 pt-0 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Select a royalty-free track to add background music to your recording.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                {MUSIC_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSelectedPreset(preset.id);
                      // Enable music track with preset
                      setTracks(prev => prev.map(t => 
                        t.id === 'music' ? { ...t, enabled: true } : t
                      ));
                    }}
                    className={cn(
                      "p-2 rounded-lg border text-left transition-all hover:border-primary/50",
                      selectedPreset === preset.id 
                        ? "border-primary bg-primary/10" 
                        : "border-border bg-background"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{preset.name}</span>
                      {selectedPreset === preset.id && (
                        <Sparkles className="h-3 w-3 text-primary" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded">{preset.genre}</span>
                      <span className="text-[10px] text-muted-foreground">{preset.duration}</span>
                      <span className="text-[10px] text-muted-foreground">• {preset.mood}</span>
                    </div>
                  </button>
                ))}
              </div>
              
              {selectedPreset && (
                <div className="flex items-center justify-between p-2 bg-muted rounded-lg mt-2">
                  <div className="flex items-center gap-2">
                    <Music className="h-4 w-4 text-purple-500" />
                    <span className="text-xs font-medium">
                      {MUSIC_PRESETS.find(p => p.id === selectedPreset)?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setIsPlaying(!isPlaying)}
                    >
                      {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setSelectedPreset(null);
                        setIsPlaying(false);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground">Or upload your own:</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'audio/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        loadMusicFile(file);
                        setSelectedPreset(null);
                      }
                    };
                    input.click();
                  }}
                >
                  Upload Audio
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Help Text */}
        <p className="text-xs text-muted-foreground">
          Enable tracks to mix multiple audio sources. System audio requires screen sharing permission.
        </p>
      </div>
      )}
    </Card>
  );
}

export default MultiTrackAudioMixer;
