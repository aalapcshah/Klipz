import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, CheckCircle2, XCircle, Loader2, X, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface FileProgress {
  id: number;
  filename: string;
  status: "pending" | "processing" | "completed" | "failed";
}

interface BatchEnrichmentProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileIds: number[];
  onComplete: () => void;
}

export function BatchEnrichmentProgressDialog({
  open,
  onOpenChange,
  fileIds,
  onComplete,
}: BatchEnrichmentProgressDialogProps) {
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const cancelledRef = useRef(false);

  const utils = trpc.useUtils();
  const { data: allFilesData } = trpc.files.list.useQuery({ page: 1, pageSize: 1000 });
  const enrichFileMutation = trpc.files.enrich.useMutation();

  // Initialize files list when dialog opens
  useEffect(() => {
    if (open && fileIds.length > 0 && allFilesData?.files) {
      const selectedFiles = allFilesData.files
        .filter((f: any) => fileIds.includes(f.id))
        .map((f: any) => ({
          id: f.id,
          filename: f.filename || f.title || `File ${f.id}`,
          status: "pending" as const,
        }));
      setFiles(selectedFiles);
      setCurrentIndex(0);
      setCompletedCount(0);
      setFailedCount(0);
      setIsCancelled(false);
      cancelledRef.current = false;
    }
  }, [open, fileIds, allFilesData]);

  // Start processing when dialog opens
  useEffect(() => {
    if (open && files.length > 0 && !isProcessing && currentIndex === 0 && completedCount === 0 && failedCount === 0) {
      processFiles();
    }
  }, [open, files.length]);

  const processFiles = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    
    for (let i = 0; i < files.length; i++) {
      if (cancelledRef.current) {
        break;
      }
      
      setCurrentIndex(i);
      
      // Update status to processing
      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: "processing" } : f
      ));
      
      try {
        await enrichFileMutation.mutateAsync({ id: files[i].id });
        
        // Update status to completed
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: "completed" } : f
        ));
        setCompletedCount(prev => prev + 1);
      } catch (error) {
        console.error(`Failed to enrich file ${files[i].id}:`, error);
        
        // Update status to failed
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: "failed" } : f
        ));
        setFailedCount(prev => prev + 1);
      }
    }
    
    setIsProcessing(false);
    
    // Invalidate files list to refresh data
    await utils.files.list.invalidate();
    
    if (!cancelledRef.current) {
      const completed = files.filter(f => f.status === "completed").length;
      const failed = files.filter(f => f.status === "failed").length;
      
      if (failed > 0) {
        toast.warning(`AI enrichment completed: ${completed} succeeded, ${failed} failed`);
      } else {
        toast.success(`AI enrichment completed for ${completed} file(s)`);
      }
    } else {
      toast.info("AI enrichment cancelled");
    }
    
    onComplete();
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setIsCancelled(true);
  };

  const handleClose = () => {
    if (isProcessing) {
      handleCancel();
    }
    onOpenChange(false);
  };

  const progress = files.length > 0 
    ? Math.round(((completedCount + failedCount) / files.length) * 100)
    : 0;

  const currentFile = files[currentIndex];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Enrichment Progress
          </DialogTitle>
          <DialogDescription>
            Processing {files.length} file(s) with AI analysis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {isProcessing ? "Processing..." : isCancelled ? "Cancelled" : "Complete"}
              </span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completedCount + failedCount} of {files.length} files</span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {completedCount}
                </span>
                {failedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    {failedCount}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Current file being processed */}
          {isProcessing && currentFile && (
            <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {currentFile.filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  Analyzing with AI...
                </p>
              </div>
            </div>
          )}

          {/* File list */}
          <ScrollArea className="h-[200px] rounded-md border">
            <div className="p-2 space-y-1">
              {files.map((file, index) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-2 p-2 rounded text-sm ${
                    index === currentIndex && isProcessing
                      ? "bg-primary/10"
                      : ""
                  }`}
                >
                  {file.status === "pending" && (
                    <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                  )}
                  {file.status === "processing" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {file.status === "completed" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {file.status === "failed" && (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="truncate flex-1">{file.filename}</span>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Cancelled warning */}
          {isCancelled && isProcessing && (
            <div className="flex items-center gap-2 text-sm text-amber-500 bg-amber-500/10 p-2 rounded">
              <AlertCircle className="h-4 w-4" />
              <span>Cancelling after current file completes...</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {isProcessing ? (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isCancelled}
            >
              <X className="h-4 w-4 mr-2" />
              {isCancelled ? "Cancelling..." : "Cancel"}
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
