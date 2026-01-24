import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationList } from "./NotificationList";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const utils = trpc.useUtils();

  // Get unread count
  const { data: unreadData } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const unreadCount = unreadData?.count || 0;

  // Mark all as read when dropdown opens
  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.getUnreadCount.invalidate();
      utils.notifications.getNotifications.invalidate();
    },
  });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && unreadCount > 0) {
      // Mark all as read after a short delay to allow user to see notifications
      setTimeout(() => {
        markAllAsRead.mutate();
      }, 1000);
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <NotificationList onClose={() => setIsOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
