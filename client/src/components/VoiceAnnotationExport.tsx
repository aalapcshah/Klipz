import { Download } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { useState } from "react";

interface VoiceAnnotation {
  id: number;
  videoTimestamp: number;
  duration?: number;
  transcript: string | null;
  createdAt: string;
}

interface VoiceAnnotationExportProps {
  annotations: VoiceAnnotation[];
  videoTitle?: string;
}

export function VoiceAnnotationExport({ annotations, videoTitle }: VoiceAnnotationExportProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<"txt" | "html">("txt");
  const [isExporting, setIsExporting] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const exportAnnotations = () => {
    setIsExporting(true);
    
    try {
      let content: string;
      let mimeType: string;
      let filename: string;

      if (exportFormat === "txt") {
        // Plain text export
        content = `Voice Annotations Export\n`;
        content += `Video: ${videoTitle || "Untitled"}\n`;
        content += `Exported: ${new Date().toLocaleString()}\n`;
        content += `Total Annotations: ${annotations.length}\n`;
        content += `\n${"=".repeat(60)}\n\n`;

        annotations.forEach((ann, index) => {
          content += `Annotation ${index + 1}\n`;
          content += `Timestamp: ${formatTime(ann.videoTimestamp)}\n`;
          if (ann.duration) {
            content += `Duration: ${ann.duration}s\n`;
          }
          content += `Created: ${new Date(ann.createdAt).toLocaleString()}\n`;
          content += `\nTranscript:\n${ann.transcript || "(No transcript)"}\n`;
          content += `\n${"-".repeat(60)}\n\n`;
        });

        mimeType = "text/plain";
        filename = `voice-annotations-${Date.now()}.txt`;
      } else {
        // HTML export (can be opened in Word)
        content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Voice Annotations - ${videoTitle || "Untitled"}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #0ea5e9; padding-bottom: 10px; }
    .meta { color: #666; margin-bottom: 30px; }
    .annotation { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
    .annotation-header { font-weight: bold; font-size: 1.1em; color: #0ea5e9; margin-bottom: 10px; }
    .timestamp { color: #666; font-size: 0.9em; margin-bottom: 5px; }
    .transcript { margin-top: 10px; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Voice Annotations Export</h1>
  <div class="meta">
    <p><strong>Video:</strong> ${videoTitle || "Untitled"}</p>
    <p><strong>Exported:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>Total Annotations:</strong> ${annotations.length}</p>
  </div>
`;

        annotations.forEach((ann, index) => {
          content += `
  <div class="annotation">
    <div class="annotation-header">Annotation ${index + 1}</div>
    <div class="timestamp">
      <strong>Timestamp:</strong> ${formatTime(ann.videoTimestamp)}
      ${ann.duration ? ` | <strong>Duration:</strong> ${ann.duration}s` : ""}
    </div>
    <div class="timestamp">
      <strong>Created:</strong> ${new Date(ann.createdAt).toLocaleString()}
    </div>
    <div class="transcript">
      <strong>Transcript:</strong><br>
      ${ann.transcript || "(No transcript)"}
    </div>
  </div>
`;
        });

        content += `
</body>
</html>`;

        mimeType = "text/html";
        filename = `voice-annotations-${Date.now()}.html`;
      }

      // Create and download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowDialog(false);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export annotations. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  if (annotations.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        Export ({annotations.length})
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Voice Annotations</DialogTitle>
            <DialogDescription>
              Export {annotations.length} voice annotation{annotations.length !== 1 ? "s" : ""} to a document
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Export Format</Label>
              <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as "txt" | "html")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="txt" id="txt" />
                  <Label htmlFor="txt" className="font-normal cursor-pointer">
                    Plain Text (.txt) - Simple text file
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="html" id="html" />
                  <Label htmlFor="html" className="font-normal cursor-pointer">
                    HTML (.html) - Can be opened in Word or browser
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>The export will include:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All {annotations.length} voice annotations</li>
                <li>Timestamps and durations</li>
                <li>Full transcripts</li>
                <li>Creation dates</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isExporting}>
              Cancel
            </Button>
            <Button onClick={exportAnnotations} disabled={isExporting}>
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
