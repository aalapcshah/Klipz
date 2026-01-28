import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Link2,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Loader2,
  Shield,
  Clock,
  Eye,
  Download,
  FileText,
  Video,
  Folder,
  Search,
  Filter,
  Link2Off,
} from "lucide-react";
import { toast } from "sonner";

type ShareType = "all" | "file" | "video" | "collection";
type ShareStatus = "all" | "active" | "expired" | "disabled";

export function MyShares() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ShareType>("all");
  const [statusFilter, setStatusFilter] = useState<ShareStatus>("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedShare, setSelectedShare] = useState<any>(null);

  const { data: shares, isLoading, refetch } = trpc.shareLinks.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.shareLinks.delete.useMutation({
    onSuccess: () => {
      toast.success("Share link deleted");
      utils.shareLinks.list.invalidate();
      setDeleteDialogOpen(false);
      setSelectedShare(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete share link");
    },
  });

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
    });
  };

  const getItemIcon = (share: any) => {
    if (share.fileId) return <FileText className="h-4 w-4" />;
    if (share.videoId) return <Video className="h-4 w-4" />;
    if (share.collectionId) return <Folder className="h-4 w-4" />;
    return <Link2 className="h-4 w-4" />;
  };

  const getItemType = (share: any): string => {
    if (share.fileId) return "file";
    if (share.videoId) return "video";
    if (share.collectionId) return "collection";
    return "unknown";
  };

  const getItemName = (share: any): string => {
    if (share.file) return share.file.title || share.file.filename || "Untitled File";
    if (share.video) return share.video.title || share.video.filename || "Untitled Video";
    if (share.collection) return share.collection.name || "Untitled Collection";
    return "Unknown Item";
  };

  const isExpired = (share: any): boolean => {
    if (!share.expiresAt) return false;
    return new Date(share.expiresAt) < new Date();
  };

  const getShareStatus = (share: any): "active" | "expired" | "disabled" => {
    if (!share.isActive) return "disabled";
    if (isExpired(share)) return "expired";
    return "active";
  };

  // Filter shares
  const filteredShares = shares?.filter((share) => {
    // Type filter
    if (typeFilter !== "all") {
      const itemType = getItemType(share);
      if (itemType !== typeFilter) return false;
    }

    // Status filter
    if (statusFilter !== "all") {
      const status = getShareStatus(share);
      if (status !== statusFilter) return false;
    }

    // Search filter
    if (searchQuery) {
      const itemName = getItemName(share).toLowerCase();
      if (!itemName.includes(searchQuery.toLowerCase())) return false;
    }

    return true;
  }) || [];

  // Calculate stats
  const stats = {
    total: shares?.length || 0,
    active: shares?.filter((s) => s.isActive && !isExpired(s)).length || 0,
    expired: shares?.filter((s) => isExpired(s)).length || 0,
    totalViews: shares?.reduce((sum, s) => sum + (s.viewCount || 0), 0) || 0,
    totalDownloads: shares?.reduce((sum, s) => sum + ((s as any).downloadCount || 0), 0) || 0,
  };

  return (
    <DashboardLayout>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">My Shares</h1>
          <p className="text-muted-foreground mt-2">
            Manage all your shared files, videos, and collections
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Shares</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-2xl text-green-500">{stats.active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Expired</CardDescription>
              <CardTitle className="text-2xl text-yellow-500">{stats.expired}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Views</CardDescription>
              <CardTitle className="text-2xl">{stats.totalViews}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Downloads</CardDescription>
              <CardTitle className="text-2xl">{stats.totalDownloads}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by item name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ShareType)}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="file">Files</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                  <SelectItem value="collection">Collections</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ShareStatus)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Shares Table */}
        <Card>
          <CardHeader>
            <CardTitle>Share Links</CardTitle>
            <CardDescription>
              {filteredShares.length} share{filteredShares.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredShares.length === 0 ? (
              <div className="text-center py-12">
                <Link2Off className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No shares found</h3>
                <p className="text-muted-foreground">
                  {shares?.length === 0
                    ? "You haven't shared any files, videos, or collections yet."
                    : "No shares match your current filters."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Protection</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Downloads</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShares.map((share) => {
                      const status = getShareStatus(share);
                      return (
                        <TableRow key={share.id}>
                          <TableCell>
                            <div className="flex items-center gap-2 max-w-[200px]">
                              {getItemIcon(share)}
                              <span className="truncate font-medium">
                                {getItemName(share)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {getItemType(share)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                status === "active"
                                  ? "default"
                                  : status === "expired"
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="capitalize"
                            >
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {share.hasPassword && (
                                <Badge variant="outline" className="text-xs">
                                  <Shield className="h-3 w-3 mr-1" />
                                  Password
                                </Badge>
                              )}
                              {!share.allowDownload && (
                                <Badge variant="outline" className="text-xs">
                                  <Download className="h-3 w-3 mr-1 line-through" />
                                  No DL
                                </Badge>
                              )}
                              {!share.hasPassword && share.allowDownload && (
                                <span className="text-muted-foreground text-sm">None</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                              {share.viewCount || 0}
                              {share.maxViews && (
                                <span className="text-muted-foreground">
                                  /{share.maxViews}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
<Download className="h-3 w-3 text-muted-foreground" />
                            {(share as any).downloadCount || 0}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(share.createdAt)}
                          </TableCell>
                          <TableCell>
                            {share.expiresAt ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                {formatDate(share.expiresAt)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">Never</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyLink(share.token, share.id)}
                              >
                                {copiedId === share.id ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  window.open(`/share/${share.token}`, "_blank")
                                }
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedShare(share);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete share link?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this share link. Anyone with the link will no
                longer be able to access the shared content.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedShare && deleteMutation.mutate({ id: selectedShare.id })}
                className="bg-destructive text-destructive-foreground"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

export default MyShares;
