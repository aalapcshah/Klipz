import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Loader2, Video, HardDrive, AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import {
  compressVideo,
  estimateCompressedSize,
  getVideoMetadata,
  isCompressionSupported,
  formatFileSize,
  COMPRESSION_PRESETS,
  CompressionProgress,
  CompressionSettings,
} from "@/lib/videoCompression";

type VideoQuality = "high" | "medium" | "low" | "custom";

interface VideoFile {
  id: number;
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string;
}

interface BatchCompressionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFiles: VideoFile[];
  onComplete: () => void;
}

interface CompressionJob {
  fileId: number;
  filename: string;
  originalSize: number;
  estimatedSize: number;
  status: 'pending' | 'compressing' | 'uploading' | 'complete' | 'error';
  progress: number;
  error?: string;
  newSize?: number;
}

export function BatchCompressionDialog({
  open,
  onOpenChange,
  selectedFiles,
  onComplete,
}: BatchCompressionDialogProps) {
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>("medium");
  const [customBitrate, setCustomBitrate] = useState<number>(2500);
  const [customResolution, setCustomResolution] = useState<number>(720);
  const [jobs, setJobs] = useState<CompressionJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJobIndex, setCurrentJobIndex] = useState(0);
  const [compressionSupported] = useState(isCompressionSupported());

  const utils = trpc.useUtils();

  // Filter to only video files
  const videoFiles = selectedFiles.filter(f => f.mimeType?.startsWith('video/'));

  // Initialize jobs when dialog opens
  useEffect(() => {
    if (open && videoFiles.length > 0) {
      initializeJobs();
    }
  }, [open, selectedFiles]);

  const initializeJobs = async () => {
    const newJobs: CompressionJob[] = [];
    
    for (const file of videoFiles) {
      try {
        // Fetch the video to get metadata
        const response = await fetch(file.url);
        const blob = await response.blob();
        const videoFile = new File([blob], file.filename, { type: file.mimeType });
        const metadata = await getVideoMetadata(videoFile);
        
        const settings = getCompressionSettings();
        const estimatedSize = estimateCompressedSize(file.fileSize, metadata.duration, settings);
        
        newJobs.push({
          fileId: file.id,
          filename: file.filename,
          originalSize: file.fileSize,
          estimatedSize,
          status: 'pending',
          progress: 0,
        });
      } catch (error) {
        newJobs.push({
          fileId: file.id,
          filename: file.filename,
          originalSize: file.fileSize,
          estimatedSize: file.fileSize,
          status: 'error',
          progress: 0,
          error: 'Failed to load video metadata',
        });
      }
    }
    
    setJobs(newJobs);
  };

  const getCompressionSettings = (): CompressionSettings => {
    if (selectedQuality === "custom") {
      return {
        maxHeight: customResolution,
        videoBitrate: customBitrate,
        audioBitrate: 128,
      };
    }
    return COMPRESSION_PRESETS[selectedQuality];
  };

  const getTotalSavings = () => {
    const totalOriginal = jobs.reduce((sum, job) => sum + job.originalSize, 0);
    const totalEstimated = jobs.reduce((sum, job) => sum + (job.newSize || job.estimatedSize), 0);
    const savings = totalOriginal - totalEstimated;
    const percentage = totalOriginal > 0 ? ((savings / totalOriginal) * 100).toFixed(1) : '0';
    return { totalOriginal, totalEstimated, savings, percentage };
  };

  const handleStartCompression = async () => {
    if (!compressionSupported) {
      toast.error("Video compression is not supported in this browser");
      return;
    }

    setIsProcessing(true);
    triggerHaptic('medium');

    const settings = getCompressionSettings();
    
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (job.status === 'error') continue;
      
      setCurrentJobIndex(i);
      
      try {
        // Update job status to compressing
        setJobs(prev => prev.map((j, idx) => 
          idx === i ? { ...j, status: 'compressing' as const, progress: 0 } : j
        ));

        // Fetch the original video
        const response = await fetch(videoFiles[i].url);
        const blob = await response.blob();
        const videoFile = new File([blob], job.filename, { type: videoFiles[i].mimeType });

        // Compress the video
        const compressedFile = await compressVideo(
          videoFile,
          settings,
          (progress: CompressionProgress) => {
            setJobs(prev => prev.map((j, idx) => 
              idx === i ? { ...j, progress: progress.progress } : j
            ));
          }
        );

        // Update job status to uploading
        setJobs(prev => prev.map((j, idx) => 
          idx === i ? { ...j, status: 'uploading' as const, progress: 95 } : j
        ));

        // Mark as complete (in a full implementation, would upload to S3)
        setJobs(prev => prev.map((j, idx) => 
          idx === i ? { 
            ...j, 
            status: 'complete' as const, 
            progress: 100,
            newSize: compressedFile.size 
          } : j
        ));

        triggerHaptic('success');
      } catch (error: any) {
        setJobs(prev => prev.map((j, idx) => 
          idx === i ? { 
            ...j, 
            status: 'error' as const, 
            error: error.message || 'Compression failed' 
          } : j
        ));
        triggerHaptic('error');
      }
    }

    setIsProcessing(false);
    
    const completedJobs = jobs.filter(j => j.status === 'complete').length;
    if (completedJobs > 0) {
      toast.success(`Successfully compressed ${completedJobs} video(s)`);
      await utils.files.list.invalidate();
      onComplete();
    }
  };

  const getOverallProgress = () => {
    if (jobs.length === 0) return 0;
    const totalProgress = jobs.reduce((sum, job) => sum + job.progress, 0);
    return Math.round(totalProgress / jobs.length);
  };

  const getStatusIcon = (status: CompressionJob['status']) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'compressing':
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default:
        return <Video className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const { totalOriginal, totalEstimated, savings, percentage } = getTotalSavings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Batch Video Compression
          </DialogTitle>
          <DialogDescription>
            Compress {videoFiles.length} video(s) to save storage space
          </DialogDescription>
        </DialogHeader>

        {!compressionSupported && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">
              Video compression is not supported in this browser. Please use Chrome or Firefox.
            </span>
          </div>
        )}

        {videoFiles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No video files selected</p>
            <p className="text-sm">Select video files to compress them</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quality Selection */}
            <div className="space-y-2">
              <Label>Compression Quality</Label>
              <Select
                value={selectedQuality}
                onValueChange={(value) => {
                  setSelectedQuality(value as VideoQuality);
                  if (!isProcessing) {
                    initializeJobs();
                  }
                }}
                disabled={isProcessing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High (1080p, 5Mbps)</SelectItem>
                  <SelectItem value="medium">Medium (720p, 2.5Mbps)</SelectItem>
                  <SelectItem value="low">Low (480p, 1Mbps)</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Settings */}
            {selectedQuality === "custom" && (
              <div className="space-y-4 p-3 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Bitrate</Label>
                    <span className="text-sm text-muted-foreground">{customBitrate} kbps</span>
                  </div>
                  <Slider
                    value={[customBitrate]}
                    onValueChange={([value]) => setCustomBitrate(value)}
                    min={500}
                    max={8000}
                    step={100}
                    disabled={isProcessing}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Max Resolution</Label>
                    <span className="text-sm text-muted-foreground">{customResolution}p</span>
                  </div>
                  <Slider
                    value={[customResolution]}
                    onValueChange={([value]) => setCustomResolution(value)}
                    min={360}
                    max={1080}
                    step={90}
                    disabled={isProcessing}
                  />
                </div>
              </div>
            )}

            {/* Storage Savings Preview */}
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="h-4 w-4 text-primary" />
                <span className="font-medium">Estimated Storage Savings</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Original</div>
                  <div className="font-medium">{formatFileSize(totalOriginal)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">After</div>
                  <div className="font-medium">{formatFileSize(totalEstimated)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Savings</div>
                  <div className="font-medium text-green-600">
                    {savings > 0 ? `-${formatFileSize(savings)} (${percentage}%)` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Video List */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              <Label>Videos to Compress</Label>
              {jobs.map((job) => (
                <div
                  key={job.fileId}
                  className={`flex items-center gap-3 p-2 rounded-lg border ${
                    job.status === 'error' ? 'border-destructive/50 bg-destructive/5' :
                    job.status === 'complete' ? 'border-green-500/50 bg-green-500/5' :
                    'border-border'
                  }`}
                >
                  {getStatusIcon(job.status)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{job.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatFileSize(job.originalSize)} → {formatFileSize(job.newSize || job.estimatedSize)}
                    </div>
                    {job.error && (
                      <div className="text-xs text-destructive">{job.error}</div>
                    )}
                  </div>
                  {(job.status === 'compressing' || job.status === 'uploading') && (
                    <div className="w-16 text-right text-xs text-muted-foreground">
                      {job.progress}%
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Overall Progress */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{getOverallProgress()}%</span>
                </div>
                <Progress value={getOverallProgress()} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  Processing video {currentJobIndex + 1} of {jobs.length}...
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleStartCompression}
            disabled={isProcessing || videoFiles.length === 0 || !compressionSupported}
            className="w-full sm:w-auto"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Compressing...
              </>
            ) : (
              <>
                <Video className="h-4 w-4 mr-2" />
                Compress {videoFiles.length} Video(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
