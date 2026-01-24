import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

interface UseWebSocketOptions {
  fileId?: number;
  onAnnotationCreated?: (data: any) => void;
  onAnnotationUpdated?: (data: any) => void;
  onAnnotationDeleted?: (data: any) => void;
  onUserJoined?: (data: { userId: number; userName: string }) => void;
  onUserLeft?: (data: { userId: number; userName: string }) => void;
  // Template events
  onTemplateCreated?: (data: any) => void;
  onTemplateUpdated?: (data: any) => void;
  onTemplateDeleted?: (data: any) => void;
  // Comment events
  onCommentCreated?: (data: any) => void;
  onCommentUpdated?: (data: any) => void;
  onCommentDeleted?: (data: any) => void;
  onCommentReplied?: (data: any) => void;
  // Approval events
  onApprovalRequested?: (data: any) => void;
  onApprovalApproved?: (data: any) => void;
  onApprovalRejected?: (data: any) => void;
  onApprovalCanceled?: (data: any) => void;
}

interface UserPresence {
  userId: number;
  userName: string;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    fileId,
    onAnnotationCreated,
    onAnnotationUpdated,
    onAnnotationDeleted,
    onUserJoined,
    onUserLeft,
    onTemplateCreated,
    onTemplateUpdated,
    onTemplateDeleted,
    onCommentCreated,
    onCommentUpdated,
    onCommentDeleted,
    onCommentReplied,
    onApprovalRequested,
    onApprovalApproved,
    onApprovalRejected,
    onApprovalCanceled,
  } = options;
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);

  useEffect(() => {
    if (!user) return;

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      setIsConnected(true);

      // Join the file room if fileId is provided
      if (fileId) {
        ws.send(JSON.stringify({
          type: "join_file",
          fileId,
          userId: user.id,
          userName: user.name || "Anonymous",
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case "annotation_created":
            onAnnotationCreated?.(message);
            break;

          case "annotation_updated":
            onAnnotationUpdated?.(message);
            break;

          case "annotation_deleted":
            onAnnotationDeleted?.(message);
            break;

          case "user_joined":
            setActiveUsers((prev) => [...prev, { userId: message.userId, userName: message.userName }]);
            onUserJoined?.(message);
            break;

          case "user_left":
            setActiveUsers((prev) => prev.filter((u) => u.userId !== message.userId));
            onUserLeft?.(message);
            break;

          case "room_users":
            setActiveUsers(message.users);
            break;

          // Template events
          case "template_created":
            onTemplateCreated?.(message);
            break;

          case "template_updated":
            onTemplateUpdated?.(message);
            break;

          case "template_deleted":
            onTemplateDeleted?.(message);
            break;

          // Comment events
          case "comment_created":
            onCommentCreated?.(message);
            break;

          case "comment_updated":
            onCommentUpdated?.(message);
            break;

          case "comment_deleted":
            onCommentDeleted?.(message);
            break;

          case "comment_replied":
            onCommentReplied?.(message);
            break;

          // Approval events
          case "approval_requested":
            onApprovalRequested?.(message);
            break;

          case "approval_approved":
            onApprovalApproved?.(message);
            break;

          case "approval_rejected":
            onApprovalRejected?.(message);
            break;

          case "approval_canceled":
            onApprovalCanceled?.(message);
            break;

          default:
            console.log("[WebSocket] Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
      }
    };

    ws.onclose = () => {
      console.log("[WebSocket] Disconnected");
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN && fileId) {
        ws.send(JSON.stringify({
          type: "leave_file",
          fileId,
        }));
      }
      ws.close();
    };
  }, [
    fileId,
    user,
    onAnnotationCreated,
    onAnnotationUpdated,
    onAnnotationDeleted,
    onUserJoined,
    onUserLeft,
    onTemplateCreated,
    onTemplateUpdated,
    onTemplateDeleted,
    onCommentCreated,
    onCommentUpdated,
    onCommentDeleted,
    onCommentReplied,
    onApprovalRequested,
    onApprovalApproved,
    onApprovalRejected,
    onApprovalCanceled,
  ]);

  const broadcastAnnotation = (type: "annotation_created" | "annotation_updated" | "annotation_deleted", annotationType: "voice" | "visual", annotation: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && user) {
      wsRef.current.send(JSON.stringify({
        type,
        fileId,
        annotationType,
        annotation,
        userId: user.id,
        userName: user.name || "Anonymous",
      }));
    }
  };

  return {
    isConnected,
    activeUsers,
    broadcastAnnotation,
  };
}
