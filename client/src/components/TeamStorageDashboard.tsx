import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, HardDrive, FileText, User } from "lucide-react";

// Color palette for member bars
const MEMBER_COLORS = [
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-blue-500",
  "bg-pink-500",
  "bg-teal-500",
];

function getColorForIndex(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

export function TeamStorageDashboard() {
  const { data: storageData, isLoading } = trpc.teams.getStorageBreakdown.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!storageData || storageData.members.length === 0) {
    return null;
  }

  const { members, teamTotalFormatted, teamLimitFormatted, teamPercentage } = storageData;
  const overallColor = (teamPercentage ?? 0) >= 90 ? "bg-red-500" : (teamPercentage ?? 0) >= 70 ? "bg-yellow-500" : "bg-emerald-500";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Storage Breakdown</CardTitle>
        </div>
        <CardDescription>
          Per-member storage usage across your team
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Overall team storage bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Team Total</span>
            <span className="text-sm text-muted-foreground">
              {teamTotalFormatted} / {teamLimitFormatted} ({teamPercentage}%)
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            {/* Stacked bar showing each member's contribution */}
            <div className="h-full flex">
              {members.map((member, idx) => {
                const pct = member.percentage;
                if (pct <= 0) return null;
                return (
                  <div
                    key={member.id}
                    className={`h-full ${getColorForIndex(idx)} first:rounded-l-full last:rounded-r-full`}
                    style={{ width: `${Math.max(pct, 0.5)}%` }}
                    title={`${member.name || member.email}: ${member.storageUsedFormatted}`}
                  />
                );
              })}
              {/* If no storage used, show empty bar */}
              {members.every(m => m.percentage <= 0) && (
                <div className="h-full w-0" />
              )}
            </div>
          </div>
        </div>

        {/* Per-member breakdown */}
        <div className="space-y-3">
          {members.map((member, idx) => (
            <div key={member.id} className="flex items-center gap-3">
              {/* Color indicator */}
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getColorForIndex(idx)}`} />

              {/* Avatar or icon */}
              <div className="flex-shrink-0">
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt={member.name || ""}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Name and stats */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">
                    {member.name || member.email || "Unknown"}
                  </span>
                  <span className="text-sm text-muted-foreground flex-shrink-0 ml-2">
                    {member.storageUsedFormatted}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {/* Individual progress bar */}
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${getColorForIndex(idx)}`}
                      style={{ width: `${Math.min(member.percentage, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                    <FileText className="h-3 w-3" />
                    <span>{member.fileCount} file{member.fileCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legend note */}
        {members.length > 0 && (
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
            Storage calculated from actual file sizes. Team limit: {teamLimitFormatted}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
