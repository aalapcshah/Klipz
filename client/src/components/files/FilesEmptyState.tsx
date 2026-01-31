import { Upload, FileVideo, Image, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface FilesEmptyStateProps {
  onUploadClick: () => void;
}

export function FilesEmptyState({ onUploadClick }: FilesEmptyStateProps) {
  return (
    <div className="flex items-center justify-center min-h-[500px] p-8">
      <Card className="max-w-2xl w-full border-dashed">
        <CardContent className="pt-12 pb-12 px-8">
          <div className="flex flex-col items-center text-center space-y-6">
            {/* Illustration */}
            <div className="relative">
              <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-16 h-16 text-primary" />
              </div>
              <div className="absolute -top-2 -right-2 w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <FileVideo className="w-6 h-6 text-blue-500" />
              </div>
              <div className="absolute -bottom-2 -left-2 w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Image className="w-6 h-6 text-green-500" />
              </div>
              <div className="absolute top-1/2 -right-6 w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-500" />
              </div>
            </div>

            {/* Content */}
            <div className="space-y-3">
              <h2 className="text-2xl font-bold">Welcome to Klipz!</h2>
              <p className="text-muted-foreground max-w-md">
                Start your journey by uploading your first media file. Klipz will automatically enrich it with AI-powered metadata, making it easy to search and organize.
              </p>
            </div>

            {/* CTA Button */}
            <Button 
              size="lg" 
              onClick={onUploadClick}
              className="gap-2"
            >
              <Upload className="w-5 h-5" />
              Upload Your First File
            </Button>

            {/* Features List */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 w-full">
              <div className="flex flex-col items-center text-center space-y-2 p-4 rounded-lg bg-muted/50">
                <FileVideo className="w-8 h-8 text-blue-500" />
                <h3 className="font-semibold text-sm">Video & Audio</h3>
                <p className="text-xs text-muted-foreground">
                  Automatic transcription and metadata extraction
                </p>
              </div>
              <div className="flex flex-col items-center text-center space-y-2 p-4 rounded-lg bg-muted/50">
                <Image className="w-8 h-8 text-green-500" />
                <h3 className="font-semibold text-sm">Images</h3>
                <p className="text-xs text-muted-foreground">
                  AI-powered tagging and content recognition
                </p>
              </div>
              <div className="flex flex-col items-center text-center space-y-2 p-4 rounded-lg bg-muted/50">
                <FileText className="w-8 h-8 text-purple-500" />
                <h3 className="font-semibold text-sm">Smart Search</h3>
                <p className="text-xs text-muted-foreground">
                  Find files by voice, text, or metadata
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
