import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  UserPlus,
  UserMinus,
  LogOut,
  Mail,
  MailX,
  FileUp,
  Pencil,
  PenTool,
  Building2,
  Loader2,
  ChevronDown,
  Activity,
} from "lucide-react";

type ActivityType =
  | "member_joined"
  | "member_left"
  | "member_removed"
  | "invite_sent"
  | "invite_accepted"
  | "invite_revoked"
  | "file_uploaded"
  | "annotation_created"
  | "team_created"
  | "team_name_updated";

interface ActivityItem {
  id: number;
  teamId: number;
  actorId: number;
  actorName: string | null;
  type: ActivityType;
  details: Record<string, string | number | null> | null;
  createdAt: Date;
}

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case "member_joined":
      return <UserPlus className="h-4 w-4 text-emerald-400" />;
    case "member_left":
      return <LogOut className="h-4 w-4 text-yellow-400" />;
    case "member_removed":
      return <UserMinus className="h-4 w-4 text-red-400" />;
    case "invite_sent":
      return <Mail className="h-4 w-4 text-blue-400" />;
    case "invite_accepted":
      return <UserPlus className="h-4 w-4 text-emerald-400" />;
    case "invite_revoked":
      return <MailX className="h-4 w-4 text-orange-400" />;
    case "file_uploaded":
      return <FileUp className="h-4 w-4 text-cyan-400" />;
    case "annotation_created":
      return <PenTool className="h-4 w-4 text-purple-400" />;
    case "team_created":
      return <Building2 className="h-4 w-4 text-emerald-400" />;
    case "team_name_updated":
      return <Pencil className="h-4 w-4 text-blue-400" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function getActivityDescription(activity: ActivityItem): string {
  const actor = activity.actorName || "Someone";
  const details = activity.details || {};

  switch (activity.type) {
    case "team_created":
      return `${actor} created the team "${details.teamName || ""}"`;
    case "member_joined":
      return `${details.memberName || actor} joined the team`;
    case "member_left":
      return `${details.memberName || actor} left the team`;
    case "member_removed":
      return `${actor} removed ${details.memberName || "a member"} from the team`;
    case "invite_sent":
      return `${actor} invited ${details.email || "someone"} to the team`;
    case "invite_accepted":
      return `${actor} accepted the invite (${details.email || ""})`;
    case "invite_revoked":
      return `${actor} revoked the invite for ${details.email || "someone"}`;
    case "file_uploaded":
      return `${actor} uploaded ${details.filename || "a file"}`;
    case "annotation_created":
      return `${actor} created an annotation on ${details.filename || "a video"}`;
    case "team_name_updated":
      return `${actor} renamed the team to "${details.newName || ""}"`;
    default:
      return `${actor} performed an action`;
  }
}

function getActivityColor(type: ActivityType): string {
  switch (type) {
    case "member_joined":
    case "invite_accepted":
    case "team_created":
      return "bg-emerald-500/10 border-emerald-500/20";
    case "member_left":
      return "bg-yellow-500/10 border-yellow-500/20";
    case "member_removed":
    case "invite_revoked":
      return "bg-red-500/10 border-red-500/20";
    case "invite_sent":
    case "team_name_updated":
      return "bg-blue-500/10 border-blue-500/20";
    case "file_uploaded":
      return "bg-cyan-500/10 border-cyan-500/20";
    case "annotation_created":
      return "bg-purple-500/10 border-purple-500/20";
    default:
      return "bg-muted/30";
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(date).toLocaleDateString();
}

export default function TeamActivityFeed() {
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [allActivities, setAllActivities] = useState<ActivityItem[]>([]);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);

  const { data, isLoading, isFetching } = trpc.teams.getActivities.useQuery(
    cursor ? { cursor, limit: 20 } : { limit: 20 }
  );

  // Accumulate activities when loading more
  useEffect(() => {
    if (!data?.activities) return;
    const items = data.activities as ActivityItem[];
    
    if (hasLoadedMore && cursor) {
      setAllActivities((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newItems = items.filter((a) => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
    } else {
      setAllActivities(items);
    }
  }, [data, cursor, hasLoadedMore]);

  const handleLoadMore = useCallback(() => {
    const lastId = allActivities[allActivities.length - 1]?.id;
    if (lastId) {
      setHasLoadedMore(true);
      setCursor(lastId);
    }
  }, [allActivities]);

  const activities = allActivities;
  const nextCursor = data?.nextCursor;

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No activity yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Team activities like member joins, file uploads, and invites will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/20 transition-colors"
              >
                <div className={`mt-0.5 p-1.5 rounded-full border ${getActivityColor(activity.type)}`}>
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">
                    {getActivityDescription(activity)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(activity.createdAt)}
                  </p>
                </div>
              </div>
            ))}

            {/* Load more button */}
            {nextCursor && (
              <div className="pt-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={isFetching}
                  onClick={handleLoadMore}
                >
                  {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ChevronDown className="h-4 w-4 mr-2" />
                  )}
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
