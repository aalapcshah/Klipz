import { useState, useCallback } from "react";
import { usePersistedBoolean } from "@/hooks/usePersistedState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  Download, 
  FileText, 
  ChevronDown, 
  ChevronUp,
  Bookmark,
  ListOrdered,
  Copy,
  Check
} from "lucide-react";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import { trpc } from "@/lib/trpc";

type ExportFormat = "srt" | "vtt" | "json" | "txt";

interface Bookmark {
  id: number;
  timestamp: number;
  label: string;
  color?: string;
}

interface Chapter {
  id: number;
  timestamp: number;
  name: string;
  description?: string;
}

interface BookmarkChapterExportProps {
  fileId: number;
  videoTitle?: string;
  bookmarks?: Bookmark[];
  chapters?: Chapter[];
}

export function BookmarkChapterExport({ 
  fileId, 
  videoTitle = "video",
  bookmarks: propBookmarks = [],
  chapters: propChapters = []
}: BookmarkChapterExportProps) {
  const [isExpanded, setIsExpanded] = usePersistedBoolean('tool-export-expanded', false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("vtt");
  const [includeBookmarks, setIncludeBookmarks] = useState(true);
  const [includeChapters, setIncludeChapters] = useState(true);
  const [includeVoiceNotes, setIncludeVoiceNotes] = useState(true);
  const [copied, setCopied] = useState(false);

  // Use props for bookmarks and chapters, fetch voice annotations from API
  const bookmarks = propBookmarks;
  const chapters = propChapters;
  const { data: voiceAnnotations = [] } = trpc.voiceAnnotations.getAnnotations.useQuery({ fileId });

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
    }
    return `00:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
  };

  const formatTimeVTT = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  };

  const formatTimeSimple = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const generateExportContent = useCallback(() => {
    // Collect all items to export
    const items: Array<{
      timestamp: number;
      endTime: number;
      label: string;
      type: "bookmark" | "chapter" | "voice";
      description?: string;
    }> = [];

    if (includeBookmarks) {
      bookmarks.forEach((b: Bookmark) => {
        items.push({
          timestamp: b.timestamp,
          endTime: b.timestamp + 5, // Default 5 second duration for bookmarks
          label: b.label,
          type: "bookmark",
        });
      });
    }

    if (includeChapters) {
      chapters.forEach((c: Chapter, idx: number) => {
        const nextChapter = chapters[idx + 1];
        items.push({
          timestamp: c.timestamp,
          endTime: nextChapter ? nextChapter.timestamp : c.timestamp + 60, // Until next chapter or 60s
          label: c.name,
          type: "chapter",
          description: c.description || undefined,
        });
      });
    }

    if (includeVoiceNotes) {
      voiceAnnotations.forEach(v => {
        items.push({
          timestamp: v.videoTimestamp,
          endTime: v.videoTimestamp + (v.duration || 5),
          label: v.transcript || "Voice Note",
          type: "voice",
        });
      });
    }

    // Sort by timestamp
    items.sort((a, b) => a.timestamp - b.timestamp);

    if (items.length === 0) {
      return null;
    }

    switch (exportFormat) {
      case "srt":
        return generateSRT(items);
      case "vtt":
        return generateVTT(items);
      case "json":
        return generateJSON(items);
      case "txt":
        return generateTXT(items);
      default:
        return null;
    }
  }, [exportFormat, includeBookmarks, includeChapters, includeVoiceNotes, bookmarks, chapters, voiceAnnotations]);

  const generateSRT = (items: Array<{ timestamp: number; endTime: number; label: string; type: string; description?: string }>) => {
    return items.map((item, idx) => {
      const lines = [
        (idx + 1).toString(),
        `${formatTime(item.timestamp)} --> ${formatTime(item.endTime)}`,
        `[${item.type.toUpperCase()}] ${item.label}`,
      ];
      if (item.description) {
        lines.push(item.description);
      }
      return lines.join("\n");
    }).join("\n\n");
  };

  const generateVTT = (items: Array<{ timestamp: number; endTime: number; label: string; type: string; description?: string }>) => {
    const header = "WEBVTT\n\n";
    const cues = items.map((item, idx) => {
      const lines = [
        `${idx + 1}`,
        `${formatTimeVTT(item.timestamp)} --> ${formatTimeVTT(item.endTime)}`,
        `[${item.type.toUpperCase()}] ${item.label}`,
      ];
      if (item.description) {
        lines.push(item.description);
      }
      return lines.join("\n");
    }).join("\n\n");
    return header + cues;
  };

  const generateJSON = (items: Array<{ timestamp: number; endTime: number; label: string; type: string; description?: string }>) => {
    const data = {
      title: videoTitle,
      exportedAt: new Date().toISOString(),
      items: items.map(item => ({
        ...item,
        timestampFormatted: formatTimeSimple(item.timestamp),
        endTimeFormatted: formatTimeSimple(item.endTime),
      })),
    };
    return JSON.stringify(data, null, 2);
  };

  const generateTXT = (items: Array<{ timestamp: number; endTime: number; label: string; type: string; description?: string }>) => {
    const header = `${videoTitle} - Timeline Export\n${"=".repeat(40)}\n\n`;
    const content = items.map(item => {
      const typeLabel = item.type === "bookmark" ? "📌" : item.type === "chapter" ? "📖" : "🎤";
      let line = `${formatTimeSimple(item.timestamp)} ${typeLabel} ${item.label}`;
      if (item.description) {
        line += `\n   ${item.description}`;
      }
      return line;
    }).join("\n\n");
    return header + content;
  };

  const handleExport = useCallback(() => {
    const content = generateExportContent();
    if (!content) {
      toast.error("No items to export");
      return;
    }

    const mimeTypes: Record<ExportFormat, string> = {
      srt: "text/plain",
      vtt: "text/vtt",
      json: "application/json",
      txt: "text/plain",
    };

    const blob = new Blob([content], { type: mimeTypes[exportFormat] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${videoTitle.replace(/[^a-z0-9]/gi, "_")}_timeline.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    triggerHaptic("success");
    toast.success(`Exported as ${exportFormat.toUpperCase()}`);
  }, [generateExportContent, exportFormat, videoTitle]);

  const handleCopyToClipboard = useCallback(async () => {
    const content = generateExportContent();
    if (!content) {
      toast.error("No items to export");
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      triggerHaptic("success");
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  }, [generateExportContent]);

  const totalItems = 
    (includeBookmarks ? bookmarks.length : 0) + 
    (includeChapters ? chapters.length : 0) + 
    (includeVoiceNotes ? voiceAnnotations.length : 0);

  return (
    <Card className="p-3 max-w-full overflow-hidden">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Export Timeline</span>
          {totalItems > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalItems} items
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Include Options */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Include in export:</Label>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-bookmarks"
                checked={includeBookmarks}
                onCheckedChange={(checked) => setIncludeBookmarks(checked as boolean)}
              />
              <Label htmlFor="include-bookmarks" className="text-sm flex items-center gap-2">
                <Bookmark className="h-3 w-3 text-amber-500" />
                Bookmarks ({bookmarks.length})
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-chapters"
                checked={includeChapters}
                onCheckedChange={(checked) => setIncludeChapters(checked as boolean)}
              />
              <Label htmlFor="include-chapters" className="text-sm flex items-center gap-2">
                <ListOrdered className="h-3 w-3 text-blue-500" />
                Chapters ({chapters.length})
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-voice"
                checked={includeVoiceNotes}
                onCheckedChange={(checked) => setIncludeVoiceNotes(checked as boolean)}
              />
              <Label htmlFor="include-voice" className="text-sm flex items-center gap-2">
                <FileText className="h-3 w-3 text-green-500" />
                Voice Notes ({voiceAnnotations.length})
              </Label>
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Export format:</Label>
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vtt">
                  <div className="flex items-center gap-2">
                    <span>WebVTT (.vtt)</span>
                    <Badge variant="secondary" className="text-xs">Recommended</Badge>
                  </div>
                </SelectItem>
                <SelectItem value="srt">SRT Subtitles (.srt)</SelectItem>
                <SelectItem value="json">JSON Data (.json)</SelectItem>
                <SelectItem value="txt">Plain Text (.txt)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {exportFormat === "vtt" && "Compatible with most video players and YouTube"}
              {exportFormat === "srt" && "Universal subtitle format for video editors"}
              {exportFormat === "json" && "Structured data for programmatic use"}
              {exportFormat === "txt" && "Human-readable timeline summary"}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={handleExport}
              disabled={totalItems === 0}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button 
              variant="outline"
              onClick={handleCopyToClipboard}
              disabled={totalItems === 0}
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Empty State */}
          {totalItems === 0 && (
            <div className="text-center text-sm text-muted-foreground py-2">
              No bookmarks, chapters, or voice notes to export
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
