import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Shield,
  Users,
  FileText,
  Database,
  Tag,
  FolderOpen,
  Upload,
  Link2,
  Sparkles,
  Crown,
  RefreshCw,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  HardDrive,
  Settings,
  Eye,
} from "lucide-react";

// Tab definitions
const TABS = [
  { id: "overview", label: "Overview", icon: Settings },
  { id: "users", label: "Users", icon: Users },
  { id: "files", label: "Files", icon: FileText },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "collections", label: "Collections", icon: FolderOpen },
  { id: "enrichment", label: "Enrichment", icon: Sparkles },
  { id: "uploads", label: "Uploads", icon: Upload },
  { id: "shares", label: "Shares", icon: Link2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// Overview Tab
// ============================================================================
function OverviewTab() {
  const { data: stats, isLoading } = trpc.admin.getSystemStats.useQuery();
  const { data: overview } = trpc.admin.getSystemOverview.useQuery();

  if (isLoading) return <div className="text-muted-foreground p-4">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Users" value={stats?.totalUsers || 0} />
        <StatCard label="Total Files" value={stats?.totalFiles || 0} />
        <StatCard label="Total Activities" value={stats?.totalActivities || 0} />
        <StatCard label="Recent (24h)" value={stats?.recentActivities || 0} />
        <StatCard label="New Users (7d)" value={stats?.newUsers || 0} />
      </div>

      {/* Storage & Resources */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Total Storage"
            value={`${overview.storage.totalGB} GB`}
          />
          <StatCard label="Videos" value={overview.videosCount} />
          <StatCard label="Collections" value={overview.collectionsCount} />
          <StatCard
            label="File Types"
            value={overview.filesByType?.length || 0}
          />
        </div>
      )}

      {/* Enrichment Status */}
      {overview?.enrichmentStatus && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Enrichment Status
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {overview.enrichmentStatus.map((s: any) => (
              <StatCard key={s.status} label={s.status || "none"} value={s.count} />
            ))}
          </div>
        </div>
      )}

      {/* Top Users by Storage */}
      {overview?.topUsersByStorage && overview.topUsersByStorage.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Top Users by Storage
          </h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">User</th>
                  <th className="text-left p-2 font-medium">Email</th>
                  <th className="text-right p-2 font-medium">Files</th>
                  <th className="text-right p-2 font-medium">Storage</th>
                </tr>
              </thead>
              <tbody>
                {overview.topUsersByStorage.map((u: any) => (
                  <tr key={u.userId} className="border-t border-border">
                    <td className="p-2">{u.userName || "Unknown"}</td>
                    <td className="p-2 text-muted-foreground">{u.userEmail || "—"}</td>
                    <td className="p-2 text-right">{u.fileCount}</td>
                    <td className="p-2 text-right">{formatBytes(u.totalSize)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

// ============================================================================
// Users Tab
// ============================================================================
function UsersTab() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideTier, setOverrideTier] = useState<string>("pro");
  const [overrideUserId, setOverrideUserId] = useState<number | null>(null);
  const pageSize = 20;

  const { data, isLoading, refetch } = trpc.adminControl.listUsers.useQuery({
    search: search || undefined,
    tier: tierFilter as any,
    role: roleFilter as any,
    limit: pageSize,
    offset: page * pageSize,
  });

  const overrideMutation = trpc.adminControl.overrideSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription updated");
      refetch();
      setShowOverrideDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.adminControl.updateAccountStatus.useMutation({
    onSuccess: () => {
      toast.success("Account status updated");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetTrialMutation = trpc.adminControl.resetUserTrial.useMutation({
    onSuccess: () => {
      toast.success("Trial reset");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetUsageMutation = trpc.adminControl.resetUserUsage.useMutation({
    onSuccess: () => {
      toast.success("Usage counters reset");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  const tierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      free: "bg-gray-500/20 text-gray-400",
      trial: "bg-yellow-500/20 text-yellow-400",
      pro: "bg-emerald-500/20 text-emerald-400",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[tier] || ""}`}>
        {tier.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8"
          />
        </div>
        <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Users Table */}
      <div className="border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">User</th>
              <th className="text-left p-2 font-medium">Email</th>
              <th className="text-center p-2 font-medium">Role</th>
              <th className="text-center p-2 font-medium">Tier</th>
              <th className="text-center p-2 font-medium">Status</th>
              <th className="text-right p-2 font-medium">Storage</th>
              <th className="text-right p-2 font-medium">Joined</th>
              <th className="text-center p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : data?.users.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  No users found
                </td>
              </tr>
            ) : (
              data?.users.map((user) => (
                <tr key={user.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-2 font-medium">{user.name || "—"}</td>
                  <td className="p-2 text-muted-foreground text-xs">{user.email || "—"}</td>
                  <td className="p-2 text-center">
                    <Badge variant={user.role === "admin" ? "default" : "outline"} className="text-xs">
                      {user.role}
                    </Badge>
                  </td>
                  <td className="p-2 text-center">{tierBadge(user.subscriptionTier)}</td>
                  <td className="p-2 text-center">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        user.accountStatus === "active"
                          ? "text-green-400"
                          : user.accountStatus === "suspended"
                          ? "text-red-400"
                          : "text-yellow-400"
                      }`}
                    >
                      {user.accountStatus}
                    </Badge>
                  </td>
                  <td className="p-2 text-right text-xs">{formatBytes(user.storageUsedBytes)}</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex gap-1 justify-center flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => {
                          setOverrideUserId(user.id);
                          setOverrideTier(user.subscriptionTier);
                          setShowOverrideDialog(true);
                        }}
                      >
                        <Crown className="h-3 w-3 mr-1" />
                        Tier
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() =>
                          updateRoleMutation.mutate({
                            userId: user.id,
                            role: user.role === "admin" ? "user" : "admin",
                          })
                        }
                      >
                        <Shield className="h-3 w-3 mr-1" />
                        {user.role === "admin" ? "Demote" : "Promote"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() =>
                          updateStatusMutation.mutate({
                            userId: user.id,
                            status: user.accountStatus === "active" ? "suspended" : "active",
                          })
                        }
                      >
                        {user.accountStatus === "active" ? "Suspend" : "Activate"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => resetTrialMutation.mutate({ userId: user.id })}
                      >
                        Reset Trial
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => resetUsageMutation.mutate({ userId: user.id })}
                      >
                        Reset Usage
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {data?.total || 0} users total
          </span>
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Override Dialog */}
      <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Subscription Tier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              User ID: <strong>{overrideUserId}</strong>
            </p>
            <Select value={overrideTier} onValueChange={setOverrideTier}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="trial">Trial (14 days)</SelectItem>
                <SelectItem value="pro">Pro (no expiry)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (overrideUserId) {
                  overrideMutation.mutate({
                    userId: overrideUserId,
                    tier: overrideTier as any,
                  });
                }
              }}
              disabled={overrideMutation.isPending}
            >
              {overrideMutation.isPending ? "Updating..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Files Tab
// ============================================================================
function FilesTab() {
  const [search, setSearch] = useState("");
  const [mimeFilter, setMimeFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading, refetch } = trpc.adminControl.listAllFiles.useQuery({
    search: search || undefined,
    mimeType: mimeFilter || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const deleteMutation = trpc.adminControl.deleteFile.useMutation({
    onSuccess: () => {
      toast.success("File deleted");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8"
          />
        </div>
        <Select value={mimeFilter} onValueChange={(v) => { setMimeFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
            <SelectItem value="application/pdf">PDFs</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">Filename</th>
              <th className="text-left p-2 font-medium">Type</th>
              <th className="text-right p-2 font-medium">Size</th>
              <th className="text-center p-2 font-medium">Enrichment</th>
              <th className="text-center p-2 font-medium">Quality</th>
              <th className="text-right p-2 font-medium">User ID</th>
              <th className="text-right p-2 font-medium">Created</th>
              <th className="text-center p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : data?.files.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">No files found</td>
              </tr>
            ) : (
              data?.files.map((file) => (
                <tr key={file.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-2 max-w-[200px] truncate" title={file.filename}>
                    {file.title || file.filename}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{file.mimeType}</td>
                  <td className="p-2 text-right text-xs">{formatBytes(file.fileSize)}</td>
                  <td className="p-2 text-center">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        file.enrichmentStatus === "completed"
                          ? "text-green-400"
                          : file.enrichmentStatus === "failed"
                          ? "text-red-400"
                          : file.enrichmentStatus === "processing"
                          ? "text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {file.enrichmentStatus}
                    </Badge>
                  </td>
                  <td className="p-2 text-center">
                    {file.qualityScore ? (
                      <span className={`text-xs font-medium ${
                        file.qualityScore >= 70 ? "text-green-400" :
                        file.qualityScore >= 40 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {file.qualityScore}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="p-2 text-right text-xs">{file.userId}</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {formatDate(file.createdAt)}
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => window.open(file.url, "_blank")}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2 text-red-400 hover:text-red-300"
                        onClick={() => {
                          if (confirm("Delete this file permanently?")) {
                            deleteMutation.mutate({ fileId: file.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{data?.total || 0} files total</span>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Storage Tab
// ============================================================================
function StorageTab() {
  const { data, isLoading, refetch } = trpc.adminControl.getStorageBreakdown.useQuery();

  if (isLoading) return <div className="text-muted-foreground p-4">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Total Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Storage Used" value={formatBytes(data?.total.bytes || 0)} />
        <StatCard label="Total Files" value={data?.total.fileCount || 0} />
      </div>

      {/* Per-User Breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Storage by User
        </h3>
        <div className="border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">User</th>
                <th className="text-left p-2 font-medium">Email</th>
                <th className="text-center p-2 font-medium">Tier</th>
                <th className="text-right p-2 font-medium">Files</th>
                <th className="text-right p-2 font-medium">Storage</th>
                <th className="text-right p-2 font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data?.byUser.map((u) => (
                <tr key={u.userId} className="border-t border-border">
                  <td className="p-2">{u.userName || "Unknown"}</td>
                  <td className="p-2 text-muted-foreground text-xs">{u.userEmail || "—"}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      u.userTier === "pro" ? "bg-emerald-500/20 text-emerald-400" :
                      u.userTier === "trial" ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>
                      {u.userTier?.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2 text-right">{u.fileCount}</td>
                  <td className="p-2 text-right">{formatBytes(u.totalSize)}</td>
                  <td className="p-2 text-right">
                    {data.total.bytes > 0
                      ? ((u.totalSize / data.total.bytes) * 100).toFixed(1) + "%"
                      : "0%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tags Tab
// ============================================================================
function TagsTab() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = trpc.adminControl.listAllTags.useQuery({
    search: search || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">Tag</th>
              <th className="text-left p-2 font-medium">Color</th>
              <th className="text-right p-2 font-medium">Usage Count</th>
              <th className="text-right p-2 font-medium">User ID</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : (data || []).length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">No tags found</td>
              </tr>
            ) : (
              (data || []).map((tag) => (
                <tr key={tag.id} className="border-t border-border">
                  <td className="p-2 font-medium">{tag.name}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: tag.color || "#888" }}
                      />
                      <span className="text-xs text-muted-foreground">{tag.color}</span>
                    </div>
                  </td>
                  <td className="p-2 text-right">{tag.usageCount}</td>
                  <td className="p-2 text-right text-xs">{tag.userId}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Collections Tab
// ============================================================================
function CollectionsTab() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = trpc.adminControl.listAllCollections.useQuery({
    search: search || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search collections..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">Name</th>
              <th className="text-left p-2 font-medium">Description</th>
              <th className="text-right p-2 font-medium">Files</th>
              <th className="text-right p-2 font-medium">User ID</th>
              <th className="text-right p-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : (data || []).length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">No collections found</td>
              </tr>
            ) : (
              (data || []).map((col) => (
                <tr key={col.id} className="border-t border-border">
                  <td className="p-2 font-medium">
                    <div className="flex items-center gap-2">
                      {col.color && (
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: col.color }} />
                      )}
                      {col.name}
                    </div>
                  </td>
                  <td className="p-2 text-muted-foreground text-xs max-w-[200px] truncate">
                    {col.description || "—"}
                  </td>
                  <td className="p-2 text-right">{col.fileCount}</td>
                  <td className="p-2 text-right text-xs">{col.userId}</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {formatDate(col.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Enrichment Tab
// ============================================================================
function EnrichmentTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data, isLoading, refetch } = trpc.adminControl.listEnrichmentJobs.useQuery({
    status: statusFilter as any,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">ID</th>
              <th className="text-center p-2 font-medium">Status</th>
              <th className="text-right p-2 font-medium">Progress</th>
              <th className="text-right p-2 font-medium">Failed</th>
              <th className="text-right p-2 font-medium">User ID</th>
              <th className="text-left p-2 font-medium">Error</th>
              <th className="text-right p-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : (data || []).length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">No enrichment jobs</td>
              </tr>
            ) : (
              (data || []).map((job) => (
                <tr key={job.id} className="border-t border-border">
                  <td className="p-2">#{job.id}</td>
                  <td className="p-2 text-center">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        job.status === "completed" ? "text-green-400" :
                        job.status === "failed" ? "text-red-400" :
                        job.status === "processing" ? "text-yellow-400" :
                        "text-muted-foreground"
                      }`}
                    >
                      {job.status}
                    </Badge>
                  </td>
                  <td className="p-2 text-right">{job.completedFiles}/{job.totalFiles}</td>
                  <td className="p-2 text-right text-red-400">{job.failedFiles || 0}</td>
                  <td className="p-2 text-right text-xs">{job.userId}</td>
                  <td className="p-2 text-xs text-red-400 max-w-[200px] truncate">
                    {job.lastError || "—"}
                  </td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {formatDate(job.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Uploads Tab - Real-time Upload Monitoring
// ============================================================================
function UploadsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, refetch } = trpc.adminControl.listUploadSessions.useQuery(
    { status: statusFilter as any },
    { refetchInterval: autoRefresh ? 5000 : false }
  );

  const cleanupMutation = trpc.adminControl.cleanupUploadSessions.useMutation({
    onSuccess: (result) => {
      toast.success(`Cleaned up ${result.cleaned} sessions`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const sessions = data?.sessions || [];
  const statusCounts = data?.statusCounts || {};
  const activeSessions = sessions.filter(s => s.status === "active" || s.status === "finalizing");

  function formatTimeAgo(date: Date | string | null): string {
    if (!date) return "—";
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  }

  function formatDuration(start: Date | string | null): string {
    if (!start) return "—";
    const diff = Date.now() - new Date(start).getTime();
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "text-blue-400 bg-blue-500/20";
      case "finalizing": return "text-yellow-400 bg-yellow-500/20";
      case "completed": return "text-green-400 bg-green-500/20";
      case "failed": return "text-red-400 bg-red-500/20";
      case "paused": return "text-orange-400 bg-orange-500/20";
      case "expired": return "text-gray-400 bg-gray-500/20";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Summary Tiles - 3 per row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <div className="bg-card border border-border rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-bold">{data?.total || 0}</div>
        </div>
        <div className="bg-card border border-blue-500/30 rounded-lg p-2 text-center">
          <div className="text-xs text-blue-400">Active</div>
          <div className="text-lg font-bold text-blue-400">{statusCounts.active || 0}</div>
        </div>
        <div className="bg-card border border-yellow-500/30 rounded-lg p-2 text-center">
          <div className="text-xs text-yellow-400">Finalizing</div>
          <div className="text-lg font-bold text-yellow-400">{statusCounts.finalizing || 0}</div>
        </div>
        <div className="bg-card border border-green-500/30 rounded-lg p-2 text-center">
          <div className="text-xs text-green-400">Completed</div>
          <div className="text-lg font-bold text-green-400">{statusCounts.completed || 0}</div>
        </div>
        <div className="bg-card border border-red-500/30 rounded-lg p-2 text-center">
          <div className="text-xs text-red-400">Failed</div>
          <div className="text-lg font-bold text-red-400">{statusCounts.failed || 0}</div>
        </div>
        <div className="bg-card border border-gray-500/30 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-400">Expired</div>
          <div className="text-lg font-bold text-gray-400">{statusCounts.expired || 0}</div>
        </div>
      </div>

      {/* Active Uploads - Live Progress */}
      {activeSessions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Live Uploads ({activeSessions.length})
          </h3>
          <div className="space-y-2">
            {activeSessions.map((session) => (
              <div key={session.id} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate max-w-[300px]" title={session.filename}>
                      {session.filename}
                    </span>
                    <Badge variant="outline" className={`text-xs shrink-0 ${statusColor(session.status)}`}>
                      {session.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {session.mimeType}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>User #{session.userId}</span>
                    <span>Duration: {formatDuration(session.createdAt)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2 text-red-400"
                      onClick={() => {
                        if (confirm("Delete this upload session?")) {
                          cleanupMutation.mutate({ sessionIds: [session.id] });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="w-full bg-muted rounded-full h-2 mb-1">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      session.status === "finalizing" ? "bg-yellow-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${session.progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {session.uploadedChunks}/{session.totalChunks} chunks
                    {" · "}
                    {formatBytes(session.uploadedBytes)} / {formatBytes(session.fileSize)}
                  </span>
                  <span className="font-medium">
                    {session.progressPercent}%
                    {session.lastActivityAt && (
                      <> · Last activity: {formatTimeAgo(session.lastActivityAt)}</>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="finalizing">Finalizing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={autoRefresh ? "bg-blue-600 hover:bg-blue-700" : ""}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? "animate-spin" : ""}`} />
          {autoRefresh ? "Auto-refresh ON (5s)" : "Auto-refresh OFF"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-yellow-400 hover:text-yellow-300"
          onClick={() => {
            if (confirm("Clean up all stuck upload sessions older than 24 hours?")) {
              cleanupMutation.mutate({ olderThanHours: 24 });
            }
          }}
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          Cleanup Stuck
        </Button>
      </div>

      {/* All Sessions Table */}
      <div className="border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">File</th>
              <th className="text-center p-2 font-medium">Status</th>
              <th className="text-left p-2 font-medium">Progress</th>
              <th className="text-right p-2 font-medium">Size</th>
              <th className="text-right p-2 font-medium">Type</th>
              <th className="text-right p-2 font-medium">User</th>
              <th className="text-right p-2 font-medium">Last Activity</th>
              <th className="text-right p-2 font-medium">Created</th>
              <th className="text-center p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground">No upload sessions</td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-2 max-w-[200px]">
                    <div className="truncate text-xs font-medium" title={session.filename}>
                      {session.filename}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{session.mimeType}</div>
                  </td>
                  <td className="p-2 text-center">
                    <Badge
                      variant="outline"
                      className={`text-xs ${statusColor(session.status)}`}
                    >
                      {session.status}
                    </Badge>
                  </td>
                  <td className="p-2 min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            session.status === "completed" ? "bg-green-500" :
                            session.status === "finalizing" ? "bg-yellow-500" :
                            session.status === "failed" ? "bg-red-500" :
                            "bg-blue-500"
                          }`}
                          style={{ width: `${session.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {session.progressPercent}%
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {session.uploadedChunks}/{session.totalChunks} chunks
                    </div>
                  </td>
                  <td className="p-2 text-right text-xs">{formatBytes(session.fileSize)}</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">{session.uploadType || "file"}</td>
                  <td className="p-2 text-right text-xs">#{session.userId}</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {formatTimeAgo(session.lastActivityAt)}
                  </td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {formatDate(session.createdAt)}
                  </td>
                  <td className="p-2 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 text-red-400"
                      onClick={() => {
                        if (confirm("Delete this upload session?")) {
                          cleanupMutation.mutate({ sessionIds: [session.id] });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Shares Tab
// ============================================================================
function SharesTab() {
  const { data, isLoading, refetch } = trpc.adminControl.listShareLinks.useQuery({});
  const revokeMutation = trpc.admin.revokeShareLink.useMutation({
    onSuccess: () => {
      toast.success("Share link revoked");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">Token</th>
              <th className="text-center p-2 font-medium">Active</th>
              <th className="text-right p-2 font-medium">Views</th>
              <th className="text-right p-2 font-medium">File ID</th>
              <th className="text-right p-2 font-medium">User ID</th>
              <th className="text-right p-2 font-medium">Expires</th>
              <th className="text-center p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : (data || []).length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">No share links</td>
              </tr>
            ) : (
              (data || []).map((link) => (
                <tr key={link.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs max-w-[150px] truncate">{link.token}</td>
                  <td className="p-2 text-center">
                    <Badge variant="outline" className={link.isActive ? "text-green-400" : "text-red-400"}>
                      {link.isActive ? "Active" : "Revoked"}
                    </Badge>
                  </td>
                  <td className="p-2 text-right">{link.viewCount}</td>
                  <td className="p-2 text-right text-xs">{link.fileId}</td>
                  <td className="p-2 text-right text-xs">{link.userId}</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {formatDate(link.expiresAt)}
                  </td>
                  <td className="p-2 text-center">
                    {link.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2 text-red-400"
                        onClick={() => revokeMutation.mutate({ id: link.id })}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Main Admin Control Panel
// ============================================================================
export function AdminControlPanel() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Auth check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="h-16 w-16 text-red-400 mx-auto" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            This page is restricted to administrators only.
          </p>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <OverviewTab />;
      case "users": return <UsersTab />;
      case "files": return <FilesTab />;
      case "storage": return <StorageTab />;
      case "tags": return <TagsTab />;
      case "collections": return <CollectionsTab />;
      case "enrichment": return <EnrichmentTab />;
      case "uploads": return <UploadsTab />;
      case "shares": return <SharesTab />;
      default: return <OverviewTab />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-emerald-400" />
            <div>
              <h1 className="text-xl font-bold">Admin Control Panel</h1>
              <p className="text-xs text-muted-foreground">
                Full system control — bypasses all payment restrictions
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="text-emerald-400">
                <Crown className="h-3 w-3 mr-1" />
                {user.name || user.email}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => window.location.href = "/"}>
                Back to App
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border bg-card/50 overflow-x-auto">
        <div className="container">
          <div className="flex gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-emerald-400 text-emerald-400"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="container py-6">{renderTab()}</div>
    </div>
  );
}

export default AdminControlPanel;
