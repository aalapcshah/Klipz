import { WebSocket } from "ws";

// Store reference to WebSocket server
let wssInstance: any = null;

export function setWebSocketServer(wss: any) {
  wssInstance = wss;
}

export function broadcastTemplateEvent(
  type: "template_created" | "template_updated" | "template_deleted",
  template: any,
  userId: number,
  userName: string
) {
  if (!wssInstance) return;

  const message = {
    type,
    template,
    userId,
    userName,
  };

  wssInstance.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

export function broadcastCommentEvent(
  type: "comment_created" | "comment_updated" | "comment_deleted" | "comment_replied",
  annotationId: number,
  annotationType: "voice" | "visual",
  comment: any,
  userId: number,
  userName: string
) {
  if (!wssInstance) return;

  const message = {
    type,
    annotationId,
    annotationType,
    comment,
    userId,
    userName,
  };

  wssInstance.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

export function broadcastApprovalEvent(
  type: "approval_requested" | "approval_approved" | "approval_rejected" | "approval_cancelled",
  annotationId: number,
  annotationType: "voice" | "visual",
  approval: any,
  userId: number,
  userName: string
) {
  if (!wssInstance) return;

  const message = {
    type,
    annotationId,
    annotationType,
    approval,
    userId,
    userName,
  };

  wssInstance.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

export function broadcastActivityEvent(
  activityType: "upload" | "view" | "edit" | "tag" | "share" | "delete" | "enrich" | "export",
  fileId: number | undefined,
  fileName: string | undefined,
  details: string | undefined,
  userId: number,
  userName: string
) {
  if (!wssInstance) return;

  const message = {
    type: "activity_logged",
    activityType,
    fileId,
    fileName,
    details,
    userId,
    userName,
    timestamp: new Date().toISOString(),
  };

  wssInstance.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}
