import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, FileVideo, File, ExternalLink } from "lucide-react";

export interface DuplicateFile {
  filename: string;
  fileSize: number;
  type: "video" | "file";
  existingFile: {
    id: number;
    filename: string;
    fileSize: number;
    url: string;
    createdAt: Date;
    type: "video" | "file";
  };
}

export type DuplicateAction = "skip" | "replace" | "keep_both";

interface DuplicateWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateFile[];
  onConfirm: (action: DuplicateAction, applyToAll: boolean) => void;
  onCancel: () => void;
}

export function DuplicateWarningDialog({
  open,
  onOpenChange,
  duplicates,
  onConfirm,
  onCancel,
}: DuplicateWarningDialogProps) {
  const [applyToAll, setApplyToAll] = useState(false);
  const [selectedAction, setSelectedAction] = useState<DuplicateAction>("skip");

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleConfirm = () => {
    onConfirm(selectedAction, applyToAll);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  const singleDuplicate = duplicates.length === 1;
  const firstDuplicate = duplicates[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            {singleDuplicate ? "Duplicate File Detected" : `${duplicates.length} Duplicate Files Detected`}
          </DialogTitle>
          <DialogDescription>
            {singleDuplicate
              ? "A file with the same name already exists in your library."
              : "Some files you're uploading already exist in your library."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Show duplicate details */}
          <ScrollArea className={duplicates.length > 3 ? "h-[200px]" : ""}>
            <div className="space-y-3">
              {duplicates.map((dup, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  {dup.type === "video" ? (
                    <FileVideo className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <File className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{dup.filename}</p>
                    <p className="text-sm text-muted-foreground">
                      New file: {formatFileSize(dup.fileSize)}
                    </p>
                    <div className="mt-2 p-2 bg-background rounded border">
                      <p className="text-xs text-muted-foreground mb-1">Existing file:</p>
                      <p className="text-sm">
                        {formatFileSize(dup.existingFile.fileSize)} • Uploaded {formatDate(dup.existingFile.createdAt)}
                      </p>
                      <a
                        href={dup.existingFile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        View existing file <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Action selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium">What would you like to do?</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="skip"
                  checked={selectedAction === "skip"}
                  onChange={() => setSelectedAction("skip")}
                  className="w-4 h-4"
                />
                <span className="text-sm">Skip duplicate{!singleDuplicate && "s"} (don't upload)</span>
              </label>
              <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="replace"
                  checked={selectedAction === "replace"}
                  onChange={() => setSelectedAction("replace")}
                  className="w-4 h-4"
                />
                <span className="text-sm">Replace existing file{!singleDuplicate && "s"} with new upload</span>
              </label>
              <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="keep_both"
                  checked={selectedAction === "keep_both"}
                  onChange={() => setSelectedAction("keep_both")}
                  className="w-4 h-4"
                />
                <span className="text-sm">Keep both (upload with modified name)</span>
              </label>
            </div>
          </div>

          {/* Apply to all checkbox for multiple duplicates */}
          {!singleDuplicate && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-to-all"
                checked={applyToAll}
                onCheckedChange={(checked) => setApplyToAll(checked === true)}
              />
              <label htmlFor="apply-to-all" className="text-sm cursor-pointer">
                Apply this action to all {duplicates.length} duplicates
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel Upload
          </Button>
          <Button onClick={handleConfirm}>
            {selectedAction === "skip"
              ? "Skip & Continue"
              : selectedAction === "replace"
              ? "Replace & Upload"
              : "Keep Both & Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
