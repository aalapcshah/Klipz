import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  Link2,
  Shield,
  Clock,
  Eye,
  Trash2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface ShareCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: number;
  collectionName: string;
}

export function ShareCollectionDialog({
  open,
  onOpenChange,
  collectionId,
  collectionName,
}: ShareCollectionDialogProps) {
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [useExpiration, setUseExpiration] = useState(false);
  const [expirationDays, setExpirationDays] = useState("7");
  const [allowDownload, setAllowDownload] = useState(true);
  const [maxViews, setMaxViews] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: existingLinks } = trpc.shareLinks.getForCollection.useQuery(
    { collectionId },
    { enabled: open }
  );

  const createMutation = trpc.shareLinks.create.useMutation({
    onSuccess: (data) => {
      toast.success("Share link created!");
      utils.shareLinks.getForCollection.invalidate({ collectionId });
      copyToClipboard(data.token);
      setPassword("");
      setUsePassword(false);
      setUseExpiration(false);
      setMaxViews("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create share link");
    },
  });

  const deleteMutation = trpc.shareLinks.delete.useMutation({
    onSuccess: () => {
      toast.success("Share link deleted");
      utils.shareLinks.getForCollection.invalidate({ collectionId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete share link");
    },
  });

  const toggleMutation = trpc.shareLinks.update.useMutation({
    onSuccess: () => {
      utils.shareLinks.getForCollection.invalidate({ collectionId });
    },
  });

  const copyToClipboard = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCreate = () => {
    const expiresAt = useExpiration
      ? new Date(Date.now() + parseInt(expirationDays) * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    createMutation.mutate({
      collectionId,
      password: usePassword ? password : undefined,
      expiresAt,
      allowDownload,
      maxViews: maxViews ? parseInt(maxViews) : undefined,
    });
  };

  const isExpired = (link: any) =>
    link.expiresAt ? new Date(link.expiresAt) < new Date() : false;

  const getStatus = (link: any) => {
    if (!link.isActive) return "disabled";
    if (isExpired(link)) return "expired";
    if (link.maxViews && link.viewCount >= link.maxViews) return "limit_reached";
    return "active";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Share Collection
          </DialogTitle>
          <DialogDescription>
            Create a public link to share "{collectionName}" with anyone
          </DialogDescription>
        </DialogHeader>

        {/* Existing Share Links */}
        {existingLinks && existingLinks.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Active Share Links</Label>
            <div className="space-y-2">
              {existingLinks.map((link) => {
                const status = getStatus(link);
                return (
                  <div
                    key={link.id}
                    className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs truncate max-w-[180px]">
                          /share/{link.token}
                        </code>
                        <Badge
                          variant={status === "active" ? "default" : "secondary"}
                          className={`text-[10px] px-1.5 py-0 ${status === "active" ? "bg-green-600" : ""}`}
                        >
                          {status === "active" ? "Active" : status === "expired" ? "Expired" : status === "disabled" ? "Disabled" : "Limit Reached"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {link.viewCount} views
                        </span>
                        {link.hasPassword && (
                          <span className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            Protected
                          </span>
                        )}
                        {link.expiresAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {isExpired(link) ? "Expired" : `Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(link.token)}>
                        {copiedToken === link.token ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => window.open(`/share/${link.token}`, "_blank")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Delete this share link permanently?")) {
                            deleteMutation.mutate({ id: link.id });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create New Share Link */}
        <div className="space-y-4 pt-2 border-t">
          <Label className="text-sm font-medium">Create New Share Link</Label>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Password Protection</Label>
              <p className="text-xs text-muted-foreground">Require a password to view</p>
            </div>
            <Switch checked={usePassword} onCheckedChange={setUsePassword} />
          </div>
          {usePassword && (
            <Input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Expiration</Label>
              <p className="text-xs text-muted-foreground">Auto-expire after a set time</p>
            </div>
            <Switch checked={useExpiration} onCheckedChange={setUseExpiration} />
          </div>
          {useExpiration && (
            <Select value={expirationDays} onValueChange={setExpirationDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Allow Downloads</Label>
              <p className="text-xs text-muted-foreground">Let viewers download files</p>
            </div>
            <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Max Views (optional)</Label>
            <Input type="number" placeholder="Unlimited" value={maxViews} onChange={(e) => setMaxViews(e.target.value)} min="1" />
          </div>

          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || (usePassword && !password)}
            className="w-full"
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
            ) : (
              <><Link2 className="h-4 w-4 mr-2" />Create Share Link</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
