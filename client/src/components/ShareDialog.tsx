import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  Link2, 
  Copy, 
  Check, 
  Lock, 
  Calendar, 
  Eye, 
  Download, 
  Trash2, 
  ExternalLink,
  Loader2,
  Shield,
  Clock
} from "lucide-react";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: "file" | "video";
  itemId: number;
  itemName: string;
}

export function ShareDialog({ open, onOpenChange, itemType, itemId, itemName }: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState("create");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [useExpiration, setUseExpiration] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [maxViews, setMaxViews] = useState("");
  const [useMaxViews, setUseMaxViews] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const utils = trpc.useUtils();

  // Fetch existing share links
  const { data: existingLinks, isLoading: isLoadingLinks } = itemType === "file"
    ? trpc.shareLinks.getForFile.useQuery({ fileId: itemId }, { enabled: open })
    : trpc.shareLinks.getForVideo.useQuery({ videoId: itemId }, { enabled: open });

  const createMutation = trpc.shareLinks.create.useMutation({
    onSuccess: (data) => {
      toast.success("Share link created!");
      // Copy to clipboard
      const fullUrl = `${window.location.origin}/share/${data.token}`;
      navigator.clipboard.writeText(fullUrl);
      toast.info("Link copied to clipboard");
      // Reset form
      setPassword("");
      setUsePassword(false);
      setExpiresAt("");
      setUseExpiration(false);
      setMaxViews("");
      setUseMaxViews(false);
      setActiveTab("manage");
      // Refresh links
      if (itemType === "file") {
        utils.shareLinks.getForFile.invalidate({ fileId: itemId });
      } else {
        utils.shareLinks.getForVideo.invalidate({ videoId: itemId });
      }
      setIsCreating(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create share link");
      setIsCreating(false);
    },
  });

  const deleteMutation = trpc.shareLinks.delete.useMutation({
    onSuccess: () => {
      toast.success("Share link deleted");
      if (itemType === "file") {
        utils.shareLinks.getForFile.invalidate({ fileId: itemId });
      } else {
        utils.shareLinks.getForVideo.invalidate({ videoId: itemId });
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete share link");
    },
  });

  const handleCreate = () => {
    setIsCreating(true);
    createMutation.mutate({
      fileId: itemType === "file" ? itemId : undefined,
      videoId: itemType === "video" ? itemId : undefined,
      password: usePassword && password ? password : undefined,
      expiresAt: useExpiration && expiresAt ? new Date(expiresAt).toISOString() : undefined,
      allowDownload,
      maxViews: useMaxViews && maxViews ? parseInt(maxViews) : undefined,
    });
  };

  const copyLink = async (token: string, linkId: number) => {
    const fullUrl = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopiedId(linkId);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(existingLinks && existingLinks.length > 0 ? "manage" : "create");
    }
  }, [open, existingLinks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Share {itemType === "file" ? "File" : "Video"}
          </DialogTitle>
          <DialogDescription className="truncate">
            {itemName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create Link</TabsTrigger>
            <TabsTrigger value="manage" className="relative">
              Manage Links
              {existingLinks && existingLinks.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  {existingLinks.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 mt-4">
            {/* Password Protection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="use-password">Password Protection</Label>
                </div>
                <Switch
                  id="use-password"
                  checked={usePassword}
                  onCheckedChange={setUsePassword}
                />
              </div>
              {usePassword && (
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </div>

            {/* Expiration Date */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="use-expiration">Expiration Date</Label>
                </div>
                <Switch
                  id="use-expiration"
                  checked={useExpiration}
                  onCheckedChange={setUseExpiration}
                />
              </div>
              {useExpiration && (
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
              )}
            </div>

            {/* Max Views */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="use-max-views">View Limit</Label>
                </div>
                <Switch
                  id="use-max-views"
                  checked={useMaxViews}
                  onCheckedChange={setUseMaxViews}
                />
              </div>
              {useMaxViews && (
                <Input
                  type="number"
                  placeholder="Maximum number of views"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                  min="1"
                />
              )}
            </div>

            {/* Allow Download */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="allow-download">Allow Download</Label>
              </div>
              <Switch
                id="allow-download"
                checked={allowDownload}
                onCheckedChange={setAllowDownload}
              />
            </div>

            <Button 
              onClick={handleCreate} 
              className="w-full mt-4"
              disabled={isCreating || (usePassword && !password)}
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Create Share Link
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="manage" className="mt-4">
            {isLoadingLinks ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : existingLinks && existingLinks.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {existingLinks.map((link) => (
                  <div
                    key={link.id}
                    className={`p-3 rounded-lg border ${
                      link.isExpired || !link.isActive
                        ? "bg-muted/50 border-muted"
                        : "bg-card border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {link.hasPassword && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              Protected
                            </Badge>
                          )}
                          {link.expiresAt && (
                            <Badge 
                              variant={link.isExpired ? "destructive" : "outline"} 
                              className="text-xs"
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              {link.isExpired ? "Expired" : formatDate(link.expiresAt)}
                            </Badge>
                          )}
                          {!link.isActive && (
                            <Badge variant="secondary" className="text-xs">
                              Disabled
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          <span>{link.viewCount} views</span>
                          {link.maxViews && (
                            <span className="text-xs">/ {link.maxViews} max</span>
                          )}
                          {!link.allowDownload && (
                            <>
                              <span className="mx-1">•</span>
                              <span className="text-xs">No download</span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Created {formatDate(link.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyLink(link.token, link.id)}
                          disabled={link.isExpired || !link.isActive}
                        >
                          {copiedId === link.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(`/share/${link.token}`, "_blank")}
                          disabled={link.isExpired || !link.isActive}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate({ id: link.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No share links yet</p>
                <p className="text-sm">Create one to share this {itemType}</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
