import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users } from "lucide-react";

interface UserPresence {
  userId: number;
  userName: string;
}

interface UserPresenceIndicatorProps {
  activeUsers: UserPresence[];
  maxDisplay?: number;
}

export function UserPresenceIndicator({ activeUsers, maxDisplay = 3 }: UserPresenceIndicatorProps) {
  if (activeUsers.length === 0) {
    return null;
  }

  const displayedUsers = activeUsers.slice(0, maxDisplay);
  const remainingCount = Math.max(0, activeUsers.length - maxDisplay);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (userId: number) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-teal-500",
    ];
    return colors[userId % colors.length];
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Users className="h-4 w-4 text-muted-foreground" />
        <div className="flex -space-x-2">
          {displayedUsers.map((user) => (
            <Tooltip key={user.userId}>
              <TooltipTrigger asChild>
                <Avatar className={`h-8 w-8 border-2 border-background ${getAvatarColor(user.userId)}`}>
                  <AvatarFallback className="text-xs text-white">
                    {getInitials(user.userName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p>{user.userName}</p>
              </TooltipContent>
            </Tooltip>
          ))}
          {remainingCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-8 w-8 border-2 border-background bg-gray-500">
                  <AvatarFallback className="text-xs text-white">
                    +{remainingCount}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p>{remainingCount} more {remainingCount === 1 ? "user" : "users"}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
