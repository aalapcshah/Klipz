import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Cloud, Loader2 } from "lucide-react";

interface CloudExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: number;
  videoTitle: string;
}

type CloudProvider = "google_drive" | "dropbox";

export function CloudExportDialog({
  open,
  onOpenChange,
  videoId,
  videoTitle,
}: CloudExportDialogProps) {
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const getOAuthUrlQuery = trpc.cloudExport.getOAuthUrl.useQuery(
    {
      provider: selectedProvider!,
      redirectUri: `${window.location.origin}/oauth/callback`,
    },
    {
      enabled: false, // Manual trigger
    }
  );

  const exportMutation = trpc.cloudExport.exportVideo.useMutation();

  const handleProviderSelect = async (provider: CloudProvider) => {
    setSelectedProvider(provider);
    setIsAuthenticating(true);

    try {
      // Get OAuth URL
      const result = await getOAuthUrlQuery.refetch();
      const oauthUrl = result.data?.url;

      if (!oauthUrl) {
        toast.error("Failed to get OAuth URL");
        setIsAuthenticating(false);
        return;
      }

      // Open OAuth popup
      const popup = window.open(
        oauthUrl,
        "oauth",
        "width=600,height=700,left=200,top=100"
      );

      // Listen for OAuth callback
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === "oauth_success") {
          setAccessToken(event.data.accessToken);
          setIsAuthenticating(false);
          popup?.close();
          window.removeEventListener("message", handleMessage);
          
          // Automatically start upload
          handleUpload(event.data.accessToken);
        } else if (event.data.type === "oauth_error") {
          toast.error("OAuth authentication failed");
          setIsAuthenticating(false);
          popup?.close();
          window.removeEventListener("message", handleMessage);
        }
      };

      window.addEventListener("message", handleMessage);

      // Check if popup was closed
      const checkPopup = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkPopup);
          setIsAuthenticating(false);
          window.removeEventListener("message", handleMessage);
        }
      }, 1000);
    } catch (error) {
      console.error("OAuth error:", error);
      toast.error("Failed to start OAuth flow");
      setIsAuthenticating(false);
    }
  };

  const handleUpload = async (token: string) => {
    if (!selectedProvider) return;

    setIsUploading(true);

    try {
      await exportMutation.mutateAsync({
        videoId,
        provider: selectedProvider,
        accessToken: token,
      });

      toast.success(
        `Video uploaded to ${
          selectedProvider === "google_drive" ? "Google Drive" : "Dropbox"
        } successfully!`
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload video"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const providerInfo = {
    google_drive: {
      name: "Google Drive",
      description: "Upload to your Google Drive account",
      color: "bg-blue-500 hover:bg-blue-600",
    },
    dropbox: {
      name: "Dropbox",
      description: "Upload to your Dropbox account",
      color: "bg-blue-600 hover:bg-blue-700",
    },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export to Cloud Storage</DialogTitle>
          <DialogDescription>
            Upload "{videoTitle}" to your cloud storage provider
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!selectedProvider && (
            <>
              <p className="text-sm text-muted-foreground">
                Select a cloud storage provider:
              </p>
              <div className="grid gap-3">
                {(Object.keys(providerInfo) as CloudProvider[]).map((provider) => (
                  <Button
                    key={provider}
                    onClick={() => handleProviderSelect(provider)}
                    className={`justify-start h-auto py-4 ${providerInfo[provider].color}`}
                    disabled={isAuthenticating}
                  >
                    <Cloud className="mr-3 h-5 w-5" />
                    <div className="text-left">
                      <div className="font-semibold">{providerInfo[provider].name}</div>
                      <div className="text-xs opacity-90">
                        {providerInfo[provider].description}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </>
          )}

          {isAuthenticating && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Waiting for authentication...
              </p>
              <p className="text-xs text-muted-foreground">
                Please complete the OAuth flow in the popup window
              </p>
            </div>
          )}

          {isUploading && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Uploading video to{" "}
                {selectedProvider === "google_drive" ? "Google Drive" : "Dropbox"}...
              </p>
            </div>
          )}

          {selectedProvider && !isAuthenticating && !isUploading && accessToken && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="text-green-500 text-4xl">✓</div>
              <p className="text-sm font-medium">Authentication successful!</p>
              <p className="text-xs text-muted-foreground">
                Upload will start automatically...
              </p>
            </div>
          )}
        </div>

        {!isAuthenticating && !isUploading && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
