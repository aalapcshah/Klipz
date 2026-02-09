import { Upload, FileVideo, Image, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface FilesEmptyStateProps {
  onUploadClick: () => void;
}

export function FilesEmptyState({ onUploadClick }: FilesEmptyStateProps) {
  return (
    <div className="flex items-center justify-center p-4 md:p-8">
      <Card className="max-w-2xl w-full border-dashed">
        <CardContent className="pt-8 pb-8 px-6">
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Compact illustration */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center">
                <FileVideo className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center">
                <Image className="w-3.5 h-3.5 text-green-500" />
              </div>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold">Welcome to Klipz!</h2>
              <p className="text-xs text-muted-foreground max-w-sm">
                Upload your first media file. Klipz will automatically enrich it with AI-powered metadata, making it easy to search and organize.
              </p>
            </div>

            {/* CTA Button */}
            <Button 
              size="sm" 
              onClick={onUploadClick}
              className="gap-1.5"
            >
              <Upload className="w-4 h-4" />
              Upload Your First File
            </Button>

            {/* Compact Features - always horizontal */}
            <div className="flex items-start gap-3 w-full mt-2">
              <div className="flex-1 flex items-center gap-2 p-2 rounded-md bg-muted/50 text-left">
                <FileVideo className="w-4 h-4 text-blue-500 shrink-0" />
                <div>
                  <p className="font-medium text-[11px] leading-tight">Video & Audio</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Auto transcription</p>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-2 p-2 rounded-md bg-muted/50 text-left">
                <Image className="w-4 h-4 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium text-[11px] leading-tight">Images</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">AI tagging</p>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-2 p-2 rounded-md bg-muted/50 text-left">
                <FileText className="w-4 h-4 text-purple-500 shrink-0" />
                <div>
                  <p className="font-medium text-[11px] leading-tight">Smart Search</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Voice & text</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
