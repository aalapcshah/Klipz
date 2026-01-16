import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Pause,
  Plus,
  Trash2,
  Edit2,
  Eye,
  Download,
  Loader2,
  FileImage,
  Film,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Annotation {
  id: number;
  videoId: number;
  fileId: number;
  startTime: number;
  endTime: number;
  position: "left" | "right" | "center";
  keyword: string | null;
  confidence: number | null;
  source: "auto" | "manual";
  file?: {
    id: number;
    title: string;
    url: string;
  };
}

interface AnnotationEditorProps {
  videoId: number;
}

export function AnnotationEditor({ videoId }: AnnotationEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedAnnotation, setSelectedAnnotation] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const { data: video, refetch } = trpc.videos.get.useQuery({ id: videoId });
  const { data: annotations = [], refetch: refetchAnnotations } = trpc.annotations.getByVideo.useQuery({ videoId });
  const { data: files = [] } = trpc.files.list.useQuery();
  
  const createAnnotation = trpc.annotations.create.useMutation();
  const updateAnnotation = trpc.annotations.update.useMutation();
  const deleteAnnotation = trpc.annotations.delete.useMutation();
  const exportVideo = trpc.videoExport.export.useMutation();

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleTimeUpdate = () => setCurrentTime(videoEl.currentTime);
    const handleLoadedMetadata = () => setDuration(videoEl.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoEl.addEventListener("timeupdate", handleTimeUpdate);
    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoEl.addEventListener("play", handlePlay);
    videoEl.addEventListener("pause", handlePause);

    return () => {
      videoEl.removeEventListener("timeupdate", handleTimeUpdate);
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoEl.removeEventListener("play", handlePlay);
      videoEl.removeEventListener("pause", handlePause);
    };
  }, []);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const seekTo = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleAddAnnotation = async () => {
    try {
      await createAnnotation.mutateAsync({
        videoId,
        fileId: files[0]?.id || 0,
        startTime: Math.floor(currentTime),
        endTime: Math.floor(currentTime) + 3,
        position: "right",
        source: "manual",
      });
      toast.success("Annotation added");
      refetchAnnotations();
    } catch (error) {
      toast.error("Failed to add annotation");
    }
  };

  const handleUpdateAnnotation = async (annotation: Annotation) => {
    try {
      await updateAnnotation.mutateAsync({
        id: annotation.id,
        startTime: annotation.startTime,
        endTime: annotation.endTime,
        position: annotation.position,
        keyword: annotation.keyword || undefined,
      });
      toast.success("Annotation updated");
      refetchAnnotations();
      setEditingAnnotation(null);
    } catch (error) {
      toast.error("Failed to update annotation");
    }
  };

  const handleDeleteAnnotation = async (id: number) => {
    if (!confirm("Delete this annotation?")) return;
    
    try {
      await deleteAnnotation.mutateAsync({ id });
      toast.success("Annotation deleted");
      refetchAnnotations();
    } catch (error) {
      toast.error("Failed to delete annotation");
    }
  };

  const getActiveAnnotations = () => {
    return annotations.filter(
      (ann: Annotation) =>
        currentTime >= ann.startTime &&
        currentTime <= ann.endTime
    );
  };

  const handleExport = async () => {
    if (annotations.length === 0) {
      toast.error("Add at least one annotation before exporting");
      return;
    }

    setIsExporting(true);
    setExportedUrl(null);

    try {
      const result = await exportVideo.mutateAsync({ videoId });
      setExportedUrl(result.url || null);
      toast.success("Video exported successfully!");
    } catch (error) {
      toast.error("Export failed: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  if (!video) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Export Section */}
      {exportedUrl && (
        <Card className="p-4 bg-primary/10 border-primary">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Film className="h-5 w-5 text-primary" />
              <div>
                <h4 className="font-semibold">Exported Video Ready</h4>
                <p className="text-sm text-muted-foreground">
                  Your video with burned-in annotations is ready to download
                </p>
              </div>
            </div>
            <Button asChild>
              <a href={exportedUrl} download target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />
                Download
              </a>
            </Button>
          </div>
        </Card>
      )}

      {/* Video Player with Overlay Preview */}
      <Card className="p-6">
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
          <video
            ref={videoRef}
            src={video.url}
            className="w-full h-full object-contain"
          />

          {/* Annotation Overlays (Preview Mode) */}
          {showPreview && getActiveAnnotations().map((ann: Annotation) => (
            <div
              key={ann.id}
              className="absolute bottom-20 right-4 w-48 bg-black/80 backdrop-blur-sm rounded-lg overflow-hidden border-2 border-primary"
            >
              {ann.file && (
                <img
                  src={ann.file.url}
                  alt={ann.file.title}
                  className="w-full h-32 object-cover"
                />
              )}
              <div className="p-2">
                <p className="text-white text-xs font-medium line-clamp-2">
                  {ann.keyword || ann.file?.title || "Annotation"}
                </p>
              </div>
            </div>
          ))}

          {/* Time Display */}
          <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Preview Toggle */}
          <div className="absolute top-4 right-4">
            <Button
              size="sm"
              variant={showPreview ? "default" : "secondary"}
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? "Preview On" : "Preview Off"}
            </Button>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={togglePlayPause} size="lg">
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>

            <div className="flex-1">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <Button onClick={handleAddAnnotation} disabled={createAnnotation.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Add Annotation
            </Button>

            <Button
              onClick={handleExport}
              disabled={isExporting || annotations.length === 0}
              variant="default"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export Video
                </>
              )}
            </Button>
          </div>

          {/* Timeline with Annotations */}
          <div
            ref={timelineRef}
            className="relative h-16 bg-muted rounded-lg overflow-hidden"
          >
            {/* Current Time Indicator */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />

            {/* Annotation Markers */}
            {annotations.map((ann: Annotation) => (
              <div
                key={ann.id}
                className={`absolute top-0 bottom-0 bg-accent/50 border-l-2 border-accent cursor-pointer hover:bg-accent/70 transition-colors ${
                  selectedAnnotation === ann.id ? "ring-2 ring-primary" : ""
                }`}
                style={{
                  left: `${(ann.startTime / duration) * 100}%`,
                  width: `${((ann.endTime - ann.startTime) / duration) * 100}%`,
                }}
                onClick={() => {
                  setSelectedAnnotation(ann.id);
                  seekTo(ann.startTime);
                }}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Annotations List */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Annotations</h3>
          <Badge variant="secondary">{annotations.length} total</Badge>
        </div>

        <ScrollArea className="h-96">
          <div className="space-y-3 pr-4">
            {annotations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No annotations yet. Click "Add Annotation" to start.
              </div>
            ) : (
              annotations.map((ann: Annotation) => (
                <Card
                  key={ann.id}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedAnnotation === ann.id
                      ? "ring-2 ring-primary"
                      : "hover:bg-accent/5"
                  }`}
                onClick={() => {
                  setSelectedAnnotation(ann.id);
                  seekTo(ann.startTime);
                }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {formatTime(ann.startTime)}
                        </Badge>
                        <Badge variant="secondary">{ann.endTime - ann.startTime}s</Badge>
                        <Badge variant="outline">{ann.position}</Badge>
                        {ann.source === "auto" && (
                          <Badge variant="secondary">Auto</Badge>
                        )}
                      </div>
                      
                      {ann.keyword && <p className="text-sm">{ann.keyword}</p>}
                      
                      {ann.file && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileImage className="h-3 w-3" />
                          <span>{ann.file.title}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAnnotation(ann);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Annotation</DialogTitle>
                          </DialogHeader>
                          {editingAnnotation && (
                            <AnnotationForm
                              annotation={editingAnnotation}
                              files={files}
                              onSave={handleUpdateAnnotation}
                              onCancel={() => setEditingAnnotation(null)}
                            />
                          )}
                        </DialogContent>
                      </Dialog>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(ann.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Transcript (if available) */}
      {video.transcript && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Transcript</h3>
          <ScrollArea className="h-48">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap pr-4">
              {video.transcript}
            </p>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

interface AnnotationFormProps {
  annotation: Annotation;
  files: any[];
  onSave: (annotation: Annotation) => void;
  onCancel: () => void;
}

function AnnotationForm({ annotation, files, onSave, onCancel }: AnnotationFormProps) {
  const [formData, setFormData] = useState(annotation);

  return (
    <div className="space-y-4">
      <div>
        <Label>Start Time (seconds)</Label>
        <Input
          type="number"
          value={formData.startTime}
          onChange={(e) =>
            setFormData({ ...formData, startTime: Number(e.target.value) })
          }
        />
      </div>

      <div>
        <Label>End Time (seconds)</Label>
        <Input
          type="number"
          value={formData.endTime}
          onChange={(e) =>
            setFormData({ ...formData, endTime: Number(e.target.value) })
          }
        />
      </div>

      <div>
        <Label>Position</Label>
        <Select
          value={formData.position}
          onValueChange={(value: "left" | "right" | "center") =>
            setFormData({ ...formData, position: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="right">Right</SelectItem>
            <SelectItem value="center">Center</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Keyword (optional)</Label>
        <Input
          value={formData.keyword || ""}
          onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
        />
      </div>

      <div>
        <Label>Attached File</Label>
        <Select
          value={formData.fileId.toString()}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              fileId: Number(value),
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a file" />
          </SelectTrigger>
          <SelectContent>
            {files.map((file) => (
              <SelectItem key={file.id} value={file.id.toString()}>
                {file.title || file.filename}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave(formData)}>Save</Button>
      </div>
    </div>
  );
}
