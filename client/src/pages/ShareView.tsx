import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { 
  Lock, 
  Download, 
  FileIcon, 
  VideoIcon, 
  Loader2, 
  AlertCircle,
  User,
  Clock,
  Folder,
  Image,
  Music,
  FileText,
  X,
} from "lucide-react";
import { toast } from "sonner";

function CollectionView({ content, allowDownload, token }: { content: any; allowDownload: boolean; token: string }) {
  const [previewFile, setPreviewFile] = useState<any>(null);
  const logDownloadMutation = trpc.shareLinks.logDownload.useMutation();

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith("image/")) return <Image className="h-5 w-5" />;
    if (mimeType?.startsWith("video/")) return <VideoIcon className="h-5 w-5" />;
    if (mimeType?.startsWith("audio/")) return <Music className="h-5 w-5" />;
    if (mimeType?.includes("pdf") || mimeType?.includes("text")) return <FileText className="h-5 w-5" />;
    return <FileIcon className="h-5 w-5" />;
  };

  const handleDownloadFile = async (file: any) => {
    try {
      await logDownloadMutation.mutateAsync({ token });
      const link = document.createElement("a");
      link.href = file.url;
      link.download = file.filename || "download";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Download started");
    } catch {
      toast.error("Failed to download");
    }
  };

  const canPreview = (mimeType: string) =>
    mimeType?.startsWith("image/") || mimeType?.startsWith("video/") || mimeType?.startsWith("audio/");

  return (
    <div className="space-y-6">
      {/* Collection Header */}
      <div className="flex items-center gap-3">
        <div
          className="h-12 w-12 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: content.color || "#6366f1" }}
        >
          <Folder className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{content.name}</h1>
          {content.description && (
            <p className="text-muted-foreground">{content.description}</p>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {content.files?.length || 0} files in this collection
      </div>

      {/* File Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {content.files?.map((file: any) => (
          <Card
            key={file.id}
            className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
            onClick={() => canPreview(file.mimeType) ? setPreviewFile(file) : null}
          >
            {/* Thumbnail */}
            {file.thumbnailUrl || file.mimeType?.startsWith("image/") ? (
              <div className="aspect-video bg-muted overflow-hidden">
                <img
                  src={file.thumbnailUrl || file.url}
                  alt={file.filename}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div className="aspect-video bg-muted flex items-center justify-center">
                {getFileIcon(file.mimeType)}
              </div>
            )}

            {/* File Info */}
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {file.title || file.filename || "Untitled"}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {file.mimeType && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {file.mimeType.split("/")[1]?.toUpperCase() || file.mimeType}
                      </Badge>
                    )}
                    {file.fileSize && (
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.fileSize)}
                      </span>
                    )}
                  </div>
                </div>
                {allowDownload && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadFile(file);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {(!content.files || content.files.length === 0) && (
        <div className="text-center py-12">
          <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">This collection is empty</p>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {previewFile && (
            <div>
              {previewFile.mimeType?.startsWith("image/") && (
                <div className="flex items-center justify-center bg-black min-h-[300px] max-h-[80vh]">
                  <img
                    src={previewFile.url}
                    alt={previewFile.filename}
                    className="max-w-full max-h-[80vh] object-contain"
                  />
                </div>
              )}
              {previewFile.mimeType?.startsWith("video/") && (
                <div className="bg-black">
                  <video
                    src={previewFile.url}
                    className="w-full max-h-[80vh]"
                    controls
                    autoPlay
                  />
                </div>
              )}
              {previewFile.mimeType?.startsWith("audio/") && (
                <div className="p-8 flex flex-col items-center gap-4">
                  <Music className="h-16 w-16 text-muted-foreground" />
                  <p className="font-medium">{previewFile.filename}</p>
                  <audio src={previewFile.url} controls className="w-full max-w-md" />
                </div>
              )}
              <div className="p-4 flex items-center justify-between border-t">
                <div>
                  <p className="font-medium">{previewFile.title || previewFile.filename}</p>
                  <p className="text-sm text-muted-foreground">
                    {previewFile.mimeType} {previewFile.fileSize ? `· ${formatFileSize(previewFile.fileSize)}` : ""}
                  </p>
                </div>
                {allowDownload && (
                  <Button onClick={() => handleDownloadFile(previewFile)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ShareView() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  
  const [password, setPassword] = useState("");
  const [isPasswordSubmitted, setIsPasswordSubmitted] = useState(false);
  
  const { data, isLoading, error, refetch } = trpc.shareLinks.access.useQuery(
    { token, password: isPasswordSubmitted ? password : undefined },
    { 
      enabled: !!token,
      retry: false,
    }
  );
  
  const logDownloadMutation = trpc.shareLinks.logDownload.useMutation();
  
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsPasswordSubmitted(true);
    refetch();
  };
  
  const handleDownload = async () => {
    if (!data?.content || !data.allowDownload) return;
    
    try {
      await logDownloadMutation.mutateAsync({ token });
      const link = document.createElement("a");
      link.href = data.content.url;
      link.download = data.contentType === "file" 
        ? data.content.filename 
        : `${data.content.title || "video"}.mp4`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Download started");
    } catch {
      toast.error("Failed to download");
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading shared content...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h1 className="text-xl font-semibold mb-2">Unable to Access</h1>
          <p className="text-muted-foreground mb-4">
            {error.message || "This share link is invalid or has expired."}
          </p>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            Go to Homepage
          </Button>
        </Card>
      </div>
    );
  }
  
  if (data?.requiresPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6">
          <div className="text-center mb-6">
            <Lock className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h1 className="text-xl font-semibold mb-2">Password Protected</h1>
            <p className="text-muted-foreground">
              This content is protected. Please enter the password to view.
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <Button type="submit" className="w-full">
              Unlock Content
            </Button>
          </form>
        </Card>
      </div>
    );
  }
  
  if (!data?.content) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-xl font-semibold mb-2">Content Not Found</h1>
          <p className="text-muted-foreground">
            The shared content could not be found.
          </p>
        </Card>
      </div>
    );
  }
  
  const { content, contentType, allowDownload, ownerName } = data;
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              {contentType === "collection" ? (
                <Folder className="h-4 w-4 text-primary-foreground" />
              ) : contentType === "video" ? (
                <VideoIcon className="h-4 w-4 text-primary-foreground" />
              ) : (
                <FileIcon className="h-4 w-4 text-primary-foreground" />
              )}
            </div>
            <span className="font-semibold text-lg">Klipz</span>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>Shared by {ownerName}</span>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {contentType === "collection" ? (
          <CollectionView content={content} allowDownload={allowDownload} token={token} />
        ) : (
          <Card className="overflow-hidden">
            {/* File/Video Preview */}
            {contentType === "video" ? (
              <div className="bg-black aspect-video relative">
                <video
                  src={content.url}
                  className="w-full h-full"
                  controls
                  poster={content.thumbnailUrl}
                />
              </div>
            ) : content.mimeType?.startsWith("image/") ? (
              <div className="bg-muted flex items-center justify-center p-4">
                <img
                  src={content.url}
                  alt={content.filename || content.title}
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </div>
            ) : content.mimeType?.startsWith("video/") ? (
              <div className="bg-black aspect-video">
                <video src={content.url} className="w-full h-full" controls />
              </div>
            ) : content.mimeType === "application/pdf" ? (
              <div className="h-[70vh]">
                <iframe
                  src={content.url}
                  className="w-full h-full"
                  title={content.filename || content.title}
                />
              </div>
            ) : (
              <div className="bg-muted p-12 flex flex-col items-center justify-center">
                <FileIcon className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Preview not available</p>
              </div>
            )}
            
            {/* Content Info */}
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold truncate">
                    {content.title || content.filename || "Untitled"}
                  </h1>
                  {content.description && (
                    <p className="text-muted-foreground mt-1">
                      {content.description}
                    </p>
                  )}
                </div>
                
                {allowDownload && (
                  <Button onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                )}
              </div>
              
              {/* Metadata */}
              <div className="flex flex-wrap gap-2">
                {contentType === "file" && content.fileSize && (
                  <Badge variant="secondary">
                    {formatFileSize(content.fileSize)}
                  </Badge>
                )}
                {contentType === "file" && content.mimeType && (
                  <Badge variant="outline">
                    {content.mimeType.split("/")[1]?.toUpperCase() || content.mimeType}
                  </Badge>
                )}
                {contentType === "video" && content.duration && (
                  <Badge variant="secondary">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDuration(content.duration)}
                  </Badge>
                )}
                {contentType === "video" && content.annotations?.length > 0 && (
                  <Badge variant="outline">
                    {content.annotations.length} annotation{content.annotations.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              
              {/* Video Annotations */}
              {contentType === "video" && content.annotations && content.annotations.length > 0 && (
                <div className="pt-4 border-t">
                  <h2 className="font-medium mb-3">Annotations</h2>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {content.annotations.map((annotation: any) => (
                      <div
                        key={annotation.id}
                        className="flex items-start gap-3 p-2 bg-muted rounded-lg text-sm"
                      >
                        <Badge variant="outline" className="shrink-0">
                          {formatDuration(annotation.startTime)}
                        </Badge>
                        <span className="flex-1">
                          {annotation.keyword || `Annotation at ${formatDuration(annotation.startTime)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
        
        {/* Footer */}
        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>
            Powered by{" "}
            <a href="/" className="text-primary hover:underline">
              Klipz
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
