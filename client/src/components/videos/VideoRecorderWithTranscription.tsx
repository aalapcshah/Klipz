import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Video,
  VideoOff,
  Circle,
  Square,
  Loader2,
  Upload,
  Mic,
  MicOff,
  FileText,
  Sparkles,
  Zap,
  Palette,
  Headphones,
  Paintbrush,
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/storage";
import { VideoSpeedRamping } from "../VideoSpeedRamping";
import { VideoEffectsLibrary } from "../VideoEffectsLibrary";
import { MultiTrackAudioMixer } from "../MultiTrackAudioMixer";
import { GreenScreenChromaKey } from "../GreenScreenChromaKey";

interface TranscriptSegment {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface MatchedFile {
  id: number;
  title: string;
  confidence: number;
  matchedKeywords: string[];
}

export function VideoRecorderWithTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  
  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [matchedFiles, setMatchedFiles] = useState<MatchedFile[]>([]);
  
  // Feature panels state
  const [showAdvancedFeatures, setShowAdvancedFeatures] = useState(() => {
    // Restore from localStorage
    const saved = typeof window !== 'undefined' ? localStorage.getItem('videoAdvancedFeaturesExpanded') : null;
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [activeFeatureTab, setActiveFeatureTab] = useState<string>("effects");

  // Toggle advanced features and persist to localStorage
  const toggleAdvancedFeatures = () => {
    const newValue = !showAdvancedFeatures;
    setShowAdvancedFeatures(newValue);
    localStorage.setItem('videoAdvancedFeaturesExpanded', JSON.stringify(newValue));
  };
  
  // Active effects state
  const [activeEffects, setActiveEffects] = useState<string[]>([]);
  const [greenScreenEnabled, setGreenScreenEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  const createVideoMutation = trpc.videos.create.useMutation();
  const { data: allFilesData } = trpc.files.list.useQuery({ page: 1, pageSize: 100 });
  const allFiles = allFilesData?.files || [];
  const trpcUtils = trpc.useUtils();

  // Warn before leaving with unsaved recording
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (recordedBlob) {
        e.preventDefault();
        e.returnValue = 'You have an unsaved recording. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [recordedBlob]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'r':
          // R - Start/Stop recording
          if (!recordedBlob) {
            if (isRecording) {
              stopRecording();
              toast.success('Recording stopped (R)');
            } else if (isPreviewing) {
              startRecording();
              toast.success('Recording started (R)');
            }
          }
          break;
        case 'c':
          // C - Start camera
          if (!isPreviewing && !recordedBlob) {
            startCamera();
            toast.success('Camera started (C)');
          }
          break;
        case 'e':
          // E - Expand/collapse advanced features
          toggleAdvancedFeatures();
          toast.success(showAdvancedFeatures ? 'Advanced features collapsed (E)' : 'Advanced features expanded (E)');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isPreviewing, recordedBlob, showAdvancedFeatures]);

  useEffect(() => {
    // Initialize Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          const timestamp = Date.now() - startTimeRef.current;
          setTranscript(prev => [...prev, {
            text: finalTranscript.trim(),
            timestamp: Math.floor(timestamp / 1000),
            isFinal: true
          }]);
          
          // Trigger file matching
          matchFilesFromTranscript(finalTranscript);
        }
        
        setCurrentTranscript(interimTranscript);
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          // Ignore no-speech errors during pauses
          return;
        }
        toast.error(`Transcription error: ${event.error}`);
      };
      
      recognition.onend = () => {
        if (isTranscribing) {
          // Restart if still recording
          recognition.start();
        }
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const matchFilesFromTranscript = async (text: string) => {
    if (!allFiles || allFiles.length === 0) return;
    
    try {
      // Extract keywords from transcript
      const keywords = extractKeywords(text);
      const searchTerms = text.toLowerCase();
      
      // Calculate confidence scores
      const matched = allFiles
        .map((file: any) => {
          const matchedKeywords = keywords.filter(keyword =>
            file.title?.toLowerCase().includes(keyword.toLowerCase()) ||
            file.description?.toLowerCase().includes(keyword.toLowerCase()) ||
            file.aiDescription?.toLowerCase().includes(keyword.toLowerCase())
          );
          
          // Calculate relevance score
          let score = 0;
          if (file.title?.toLowerCase().includes(searchTerms)) score += 30;
          if (file.description?.toLowerCase().includes(searchTerms)) score += 20;
          if (file.aiDescription?.toLowerCase().includes(searchTerms)) score += 15;
          score += matchedKeywords.length * 10;
          
          return {
            id: file.id,
            title: file.title || file.filename,
            confidence: Math.min(95, score),
            matchedKeywords: matchedKeywords.slice(0, 3),
            score
          };
        })
        .filter((m: any) => m.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);
      
      if (matched.length > 0) {
        setMatchedFiles(prev => {
          // Merge with existing, avoiding duplicates
          const existing = new Map(prev.map((f: MatchedFile) => [f.id, f]));
          matched.forEach((m: any) => {
            if (!existing.has(m.id) || existing.get(m.id)!.confidence < m.confidence) {
              existing.set(m.id, m);
            }
          });
          return Array.from(existing.values())
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 10);
        });
      }
    } catch (error) {
      console.error('File matching error:', error);
    }
  };

  const extractKeywords = (text: string): string[] => {
    // Simple keyword extraction (remove common words)
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 10);
  };

  const startCamera = async () => {
    try {
      // Try with ideal constraints first
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch (err) {
        // Fallback to basic constraints if ideal fails
        console.warn('Ideal camera constraints failed, trying basic constraints:', err);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsPreviewing(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('not found') || errorMessage.includes('NotFoundError')) {
        toast.error("No camera found. Please connect a camera and try again.");
      } else if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowedError')) {
        toast.error("Camera access denied. Please allow camera permissions.");
      } else {
        toast.error("Failed to access camera: " + errorMessage);
      }
      console.error('Camera error:', error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsPreviewing(false);
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm;codecs=vp8,opus",
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = URL.createObjectURL(blob);
      }
    };

    mediaRecorder.start(1000);
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setRecordingTime(0);
    setTranscript([]);
    setCurrentTranscript("");
    setMatchedFiles([]);
    startTimeRef.current = Date.now();

    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);

    // Start transcription
    if (recognitionRef.current) {
      setIsTranscribing(true);
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start transcription:', error);
        toast.error('Transcription not available in this browser');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    stopCamera();

    // Stop transcription
    if (recognitionRef.current && isTranscribing) {
      recognitionRef.current.stop();
      setIsTranscribing(false);
    }
  };

  const handleUpload = async () => {
    if (!recordedBlob) return;

    setUploading(true);
    try {
      const filename = `recording-${Date.now()}.webm`;
      const { url, fileKey } = await uploadFileToStorage(
        recordedBlob,
        filename,
        trpcUtils
      );

      // Combine all transcript segments
      const fullTranscript = transcript.map(s => s.text).join(' ');

      await createVideoMutation.mutateAsync({
        fileKey,
        url,
        filename,
        duration: recordingTime,
        title: `Recording ${new Date().toLocaleString()}`,
        transcript: fullTranscript || undefined,
      });

      toast.success("Video uploaded successfully!");
      
      setRecordedBlob(null);
      setRecordingTime(0);
      setTranscript([]);
      setMatchedFiles([]);
      if (videoRef.current) {
        videoRef.current.src = "";
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload video");
    } finally {
      setUploading(false);
    }
  };

  const handleDiscard = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    setTranscript([]);
    setMatchedFiles([]);
    if (videoRef.current) {
      videoRef.current.src = "";
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      {/* Advanced Recording Features Toggle - Now at Top */}
      <Card className="p-4">
        {/* Info about features */}
        {isPreviewing && !showAdvancedFeatures && (
          <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-600 dark:text-blue-400">
            <strong>Tip:</strong> Video effects and filters are applied in real-time to your camera feed. Expand to configure.
          </div>
        )}
        <Button
          variant="outline"
          className="w-full flex items-center justify-between"
          onClick={toggleAdvancedFeatures}
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="font-medium">Advanced Recording Features</span>
            <span className="hidden md:inline text-xs text-muted-foreground">(E)</span>
            {(activeEffects.length > 0 || greenScreenEnabled) && (
              <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-xs rounded">
                {activeEffects.length + (greenScreenEnabled ? 1 : 0)} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span>Speed</span>
              <Palette className="h-3 w-3 ml-2" />
              <span>Effects</span>
              <Headphones className="h-3 w-3 ml-2" />
              <span>Audio</span>
              <Paintbrush className="h-3 w-3 ml-2" />
              <span>Green Screen</span>
            </div>
            {showAdvancedFeatures ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </Button>
      </Card>

      {/* Advanced Features Panel - Now at Top */}
      {showAdvancedFeatures && (
        <Card className="p-4">
          <Tabs value={activeFeatureTab} onValueChange={setActiveFeatureTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1">
              <TabsTrigger value="effects" className="flex items-center gap-1 text-xs sm:text-sm py-2">
                <Palette className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Effects</span>
              </TabsTrigger>
              <TabsTrigger value="speed" className="flex items-center gap-1 text-xs sm:text-sm py-2">
                <Zap className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Speed</span>
              </TabsTrigger>
              <TabsTrigger value="audio" className="flex items-center gap-1 text-xs sm:text-sm py-2">
                <Headphones className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Audio</span>
              </TabsTrigger>
              <TabsTrigger value="greenscreen" className="flex items-center gap-1 text-xs sm:text-sm py-2">
                <Paintbrush className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Green Screen</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="effects" className="mt-4">
              <VideoEffectsLibrary
                videoRef={videoRef}
                onEffectsChange={(effects) => {
                  const enabledEffects = effects.filter((e: any) => e.enabled).map((e: any) => e.name);
                  setActiveEffects(enabledEffects);
                }}
              />
            </TabsContent>

            <TabsContent value="speed" className="mt-4">
              <VideoSpeedRamping
                videoRef={videoRef}
                duration={recordingTime}
                currentTime={0}
                onTimeUpdate={(time) => {
                  console.log('Time update:', time);
                }}
              />
            </TabsContent>

            <TabsContent value="audio" className="mt-4">
              <MultiTrackAudioMixer
                onTracksChange={(tracks) => {
                  console.log('Audio tracks changed:', tracks);
                }}
              />
            </TabsContent>

            <TabsContent value="greenscreen" className="mt-4">
              <GreenScreenChromaKey
                videoRef={videoRef}
                canvasRef={canvasRef}
                onSettingsChange={(settings) => {
                  setGreenScreenEnabled(settings.enabled);
                }}
              />
            </TabsContent>
          </Tabs>
        </Card>
      )}

      {/* Main Recording Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Video Area */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 md:p-6">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={!recordedBlob}
                controls={!!recordedBlob}
                className="w-full h-full object-contain"
              />
              <canvas ref={canvasRef} className="hidden" />

              {isRecording && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-2 rounded-md">
                  <Circle className="h-4 w-4 fill-current animate-pulse" />
                  <span className="font-mono font-bold">{formatTime(recordingTime)}</span>
                </div>
              )}

              {isTranscribing && (
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-md">
                  <Mic className="h-4 w-4 animate-pulse" />
                  <span className="text-sm font-medium">Transcribing</span>
                </div>
              )}

              {/* Active Effects Indicator */}
              {isPreviewing && (activeEffects.length > 0 || greenScreenEnabled) && (
                <div className="absolute bottom-4 left-4 flex flex-wrap gap-1 max-w-[70%]">
                  {activeEffects.map((effect, idx) => (
                    <span key={idx} className="px-2 py-1 bg-primary/80 text-primary-foreground text-xs rounded flex items-center gap-1">
                      <Palette className="h-3 w-3" />
                      {effect}
                    </span>
                  ))}
                  {greenScreenEnabled && (
                    <span className="px-2 py-1 bg-emerald-500/80 text-white text-xs rounded flex items-center gap-1">
                      <Paintbrush className="h-3 w-3" />
                      Green Screen
                    </span>
                  )}
                </div>
              )}

              {!isPreviewing && !recordedBlob && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <VideoOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg opacity-75">Camera Off</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              {!isPreviewing && !recordedBlob && (
                <Button onClick={startCamera} size="lg">
                  <Video className="h-5 w-5 mr-2" />
                  Start Camera
                </Button>
              )}

              {isPreviewing && !isRecording && (
                <>
                  <Button onClick={stopCamera} variant="outline">
                    <VideoOff className="h-4 w-4 mr-2" />
                    Stop Camera
                  </Button>
                  <Button onClick={startRecording} size="lg" className="bg-destructive hover:bg-destructive/90">
                    <Circle className="h-5 w-5 mr-2" />
                    Start Recording
                  </Button>
                </>
              )}

              {isRecording && (
                <Button onClick={stopRecording} size="lg" variant="destructive">
                  <Square className="h-5 w-5 mr-2" />
                  Stop Recording
                </Button>
              )}

              {recordedBlob && !uploading && (
                <>
                  <Button onClick={handleDiscard} variant="outline">
                    Discard
                  </Button>
                  <Button onClick={handleUpload} size="lg">
                    <Upload className="h-5 w-5 mr-2" />
                    Upload Video
                  </Button>
                </>
              )}

              {uploading && (
                <Button disabled size="lg">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Uploading...
                </Button>
              )}
            </div>

            {recordedBlob && (
              <>
                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500 mb-2">
                    <Upload className="h-4 w-4" />
                    <span className="font-semibold">Don't forget to save your recording!</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Click "Upload Video" to save your recording permanently. Unsaved recordings will be lost if you leave this page.
                  </p>
                </div>
                <div className="mt-2 text-center">
                  <Badge variant="secondary">
                    Duration: {formatTime(recordingTime)} • Size:{" "}
                    {(recordedBlob.size / 1024 / 1024).toFixed(2)} MB
                  </Badge>
                </div>
              </>
            )}
          </Card>

          {/* Live Transcript */}
          {(isRecording || transcript.length > 0) && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Live Transcript</h3>
                {isRecording && (
                  <Badge variant="outline" className="ml-auto">
                    <Mic className="h-3 w-3 mr-1" />
                    Listening
                  </Badge>
                )}
              </div>
              <ScrollArea className="h-48">
                <div className="space-y-2 pr-4">
                  {transcript.map((segment, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {formatTime(segment.timestamp)}
                      </Badge>
                      <p className="text-sm">{segment.text}</p>
                    </div>
                  ))}
                  {currentTranscript && (
                    <div className="flex gap-2">
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {formatTime(recordingTime)}
                      </Badge>
                      <p className="text-sm text-muted-foreground italic">
                        {currentTranscript}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>

        {/* Matched Files Sidebar */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Matched Files</h3>
              <Badge variant="secondary" className="ml-auto">
                {matchedFiles.length}
              </Badge>
            </div>
            
            {matchedFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {isRecording
                  ? "Start speaking to see matched files..."
                  : "No matches yet"}
              </div>
            ) : (
              <ScrollArea className="h-[300px] lg:h-[500px]">
                <div className="space-y-3 pr-4">
                  {matchedFiles.map((file) => (
                    <Card key={file.id} className="p-3 bg-accent/5">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-sm line-clamp-2">
                          {file.title}
                        </h4>
                        <Badge
                          variant={
                            file.confidence > 70
                              ? "default"
                              : file.confidence > 50
                                ? "secondary"
                                : "outline"
                          }
                          className="ml-2 shrink-0"
                        >
                          {file.confidence}%
                        </Badge>
                      </div>
                      {file.matchedKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {file.matchedKeywords.map((keyword, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-xs"
                            >
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>

          {recognitionRef.current === null && (
            <Card className="p-4 bg-yellow-500/10 border-yellow-500/20">
              <div className="flex items-start gap-2">
                <MicOff className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-yellow-600">
                    Transcription unavailable
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your browser doesn't support live transcription. Try Chrome or Edge.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
}
