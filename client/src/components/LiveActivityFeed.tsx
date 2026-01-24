import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  Upload,
  Eye,
  Edit,
  Tag,
  Share2,
  Trash2,
  Zap,
  FileText,
} from "lucide-react";

interface ActivityEvent {
  type: "activity_logged";
  activityType: "upload" | "view" | "edit" | "tag" | "share" | "delete" | "enrich" | "export";
  fileId?: number;
  fileName?: string;
  details?: string;
  userId: number;
  userName: string;
  timestamp: string;
}

const activityIcons: Record<string, any> = {
  upload: Upload,
  view: Eye,
  edit: Edit,
  tag: Tag,
  share: Share2,
  delete: Trash2,
  enrich: Zap,
  export: FileText,
};

const activityColors: Record<string, string> = {
  upload: "bg-blue-500/10 text-blue-500",
  view: "bg-green-500/10 text-green-500",
  edit: "bg-yellow-500/10 text-yellow-500",
  tag: "bg-purple-500/10 text-purple-500",
  share: "bg-cyan-500/10 text-cyan-500",
  delete: "bg-red-500/10 text-red-500",
  enrich: "bg-orange-500/10 text-orange-500",
  export: "bg-pink-500/10 text-pink-500",
};

export function LiveActivityFeed() {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      console.log("[LiveActivityFeed] WebSocket connected");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "activity_logged") {
          setActivities((prev) => [message, ...prev].slice(0, 20)); // Keep last 20 activities
        }
      } catch (error) {
        console.error("[LiveActivityFeed] Failed to parse message:", error);
      }
    };

    ws.onclose = () => {
      console.log("[LiveActivityFeed] WebSocket disconnected");
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[LiveActivityFeed] WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Live Activity Feed
        </h3>
        <Badge variant={isConnected ? "default" : "secondary"}>
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Waiting for activity...
            </div>
          ) : (
            activities.map((activity, index) => {
              const Icon = activityIcons[activity.activityType] || Activity;
              const colorClass = activityColors[activity.activityType] || "bg-gray-500/10 text-gray-500";

              return (
                <div
                  key={`${activity.timestamp}-${index}`}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className={`p-2 rounded-lg ${colorClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm capitalize">
                        {activity.activityType}
                      </span>
                      {activity.fileName && (
                        <span className="text-xs text-muted-foreground truncate">
                          • {activity.fileName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {activity.userName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
