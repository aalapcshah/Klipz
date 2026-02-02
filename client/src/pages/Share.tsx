import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Link as LinkIcon, Image, Video, FileText, Check, X, Youtube, Instagram, Twitter, Linkedin } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// Detect social media platform from URL
function detectPlatform(url: string): { platform: string; icon: React.ReactNode } | null {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) {
    return { platform: "YouTube", icon: <Youtube className="h-5 w-5 text-red-500" /> };
  }
  if (urlLower.includes("instagram.com")) {
    return { platform: "Instagram", icon: <Instagram className="h-5 w-5 text-pink-500" /> };
  }
  if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) {
    return { platform: "Twitter/X", icon: <Twitter className="h-5 w-5 text-blue-400" /> };
  }
  if (urlLower.includes("linkedin.com")) {
    return { platform: "LinkedIn", icon: <Linkedin className="h-5 w-5 text-blue-600" /> };
  }
  if (urlLower.includes("tiktok.com")) {
    return { platform: "TikTok", icon: <Video className="h-5 w-5 text-black dark:text-white" /> };
  }
  
  return null;
}

// Get file type icon
function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="h-5 w-5 text-blue-500" />;
  if (type.startsWith("video/")) return <Video className="h-5 w-5 text-purple-500" />;
  if (type.startsWith("audio/")) return <FileText className="h-5 w-5 text-orange-500" />;
  return <FileText className="h-5 w-5 text-gray-500" />;
}

export default function SharePage() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  // Shared content state
  const [sharedTitle, setSharedTitle] = useState("");
  const [sharedText, setSharedText] = useState("");
  const [sharedUrl, setSharedUrl] = useState("");
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  
  // Mutations
  const uploadFromUrlMutation = trpc.uploadFromUrl.uploadFromUrl.useMutation();
  const createFileMutation = trpc.files.create.useMutation();
  
  // Parse shared content from URL params or form data
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Check URL parameters (for GET requests or URL shares)
    const title = params.get("title") || "";
    const text = params.get("text") || "";
    const url = params.get("url") || "";
    
    setSharedTitle(title);
    setSharedText(text);
    setSharedUrl(url);
    
    // For POST requests with files, we need to handle them on the server
    // The service worker will intercept and cache the files
    const cachedFiles = sessionStorage.getItem("sharedFiles");
    if (cachedFiles) {
      try {
        const fileData = JSON.parse(cachedFiles);
        // Convert cached file data back to File objects
        // This is handled by the service worker
        console.log("[Share] Found cached files:", fileData);
      } catch (e) {
        console.error("[Share] Error parsing cached files:", e);
      }
    }
  }, []);
  
  // Handle upload
  const handleUpload = async () => {
    if (!user) {
      toast.error("Please log in to upload files");
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // If we have a URL, upload from URL
      if (sharedUrl) {
        const platform = detectPlatform(sharedUrl);
        
        if (platform) {
          toast.info(`Detected ${platform.platform} link. Extracting content...`);
        }
        
        const result = await uploadFromUrlMutation.mutateAsync({
          url: sharedUrl,
          title: sharedTitle || undefined,
          description: sharedText || undefined,
        });
        
        // Create file record
        await createFileMutation.mutateAsync({
          fileKey: result.fileKey,
          url: result.url,
          filename: result.filename,
          mimeType: result.mimeType,
          fileSize: result.fileSize,
          title: result.title,
          description: result.description,
        });
        
        toast.success(`Uploaded ${result.filename} successfully!`);
        setUploadComplete(true);
      }
      
      // If we have files, upload them directly
      if (sharedFiles.length > 0) {
        for (const file of sharedFiles) {
          // TODO: Implement direct file upload
          toast.info(`Uploading ${file.name}...`);
        }
      }
      
      // If only text was shared, create a note or redirect to files
      if (!sharedUrl && sharedFiles.length === 0 && (sharedTitle || sharedText)) {
        toast.info("Text content shared. Redirecting to Files...");
        navigate("/files");
      }
      
    } catch (error) {
      console.error("[Share] Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload shared content");
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Share to Klipz
            </CardTitle>
            <CardDescription>
              Please log in to upload shared content
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/login")} className="w-full">
              Log In to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Show success state
  if (uploadComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-500">
              <Check className="h-5 w-5" />
              Upload Complete!
            </CardTitle>
            <CardDescription>
              Your content has been saved to Klipz
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => navigate("/files")} className="w-full">
              View in Files
            </Button>
            <Button variant="outline" onClick={() => window.close()} className="w-full">
              Close
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const platform = sharedUrl ? detectPlatform(sharedUrl) : null;
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Share to Klipz
          </CardTitle>
          <CardDescription>
            Upload shared content to your Klipz library
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Shared URL */}
          {sharedUrl && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {platform ? platform.icon : <LinkIcon className="h-4 w-4" />}
                {platform ? `${platform.platform} Link` : "Shared URL"}
              </Label>
              <Input
                value={sharedUrl}
                onChange={(e) => setSharedUrl(e.target.value)}
                placeholder="https://..."
              />
              {platform && (
                <p className="text-xs text-muted-foreground">
                  Content will be extracted from {platform.platform}
                </p>
              )}
            </div>
          )}
          
          {/* Shared Title */}
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={sharedTitle}
              onChange={(e) => setSharedTitle(e.target.value)}
              placeholder="Enter a title..."
            />
          </div>
          
          {/* Shared Text/Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={sharedText}
              onChange={(e) => setSharedText(e.target.value)}
              placeholder="Add a description..."
              rows={3}
            />
          </div>
          
          {/* Shared Files */}
          {sharedFiles.length > 0 && (
            <div className="space-y-2">
              <Label>Shared Files ({sharedFiles.length})</Label>
              <div className="space-y-2">
                {sharedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 border rounded-lg">
                    {getFileIcon(file.type)}
                    <span className="flex-1 truncate text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* No content warning */}
          {!sharedUrl && sharedFiles.length === 0 && !sharedTitle && !sharedText && (
            <div className="text-center py-4 text-muted-foreground">
              <p>No content to share</p>
              <p className="text-sm mt-1">
                Paste a URL or drag files to upload
              </p>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => navigate("/files")}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isProcessing || (!sharedUrl && sharedFiles.length === 0)}
              className="flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload to Klipz
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
