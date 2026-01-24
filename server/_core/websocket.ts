import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { setWebSocketServer } from "./websocketBroadcast";

interface AnnotationMessage {
  type: "annotation_created" | "annotation_updated" | "annotation_deleted";
  fileId: number;
  annotationType: "voice" | "visual";
  annotation: any;
  userId: number;
  userName: string;
}

interface TemplateMessage {
  type: "template_created" | "template_updated" | "template_deleted";
  template: any;
  userId: number;
  userName: string;
}

interface CommentMessage {
  type: "comment_created" | "comment_updated" | "comment_deleted" | "comment_replied";
  annotationId: number;
  annotationType: "voice" | "visual";
  comment: any;
  userId: number;
  userName: string;
}

interface ApprovalMessage {
  type: "approval_requested" | "approval_approved" | "approval_rejected" | "approval_cancelled";
  annotationId: number;
  annotationType: "voice" | "visual";
  approval: any;
  userId: number;
  userName: string;
}

interface UserPresence {
  userId: number;
  userName: string;
  fileId: number;
}

const fileRooms = new Map<number, Set<WebSocket>>();
const userPresence = new Map<WebSocket, UserPresence>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WebSocket] New connection established");

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "join_file":
            handleJoinFile(ws, message.fileId, message.userId, message.userName);
            break;

          case "leave_file":
            handleLeaveFile(ws, message.fileId);
            break;

          case "annotation_created":
          case "annotation_updated":
          case "annotation_deleted":
            broadcastToFile(message.fileId, message, ws);
            break;

          case "template_created":
          case "template_updated":
          case "template_deleted":
            broadcastToAllUsers(message, ws);
            break;

          case "comment_created":
          case "comment_updated":
          case "comment_deleted":
          case "comment_replied":
            broadcastToAnnotation(message.annotationId, message, ws);
            break;

          case "approval_requested":
          case "approval_approved":
          case "approval_rejected":
          case "approval_cancelled":
            broadcastToAnnotation(message.annotationId, message, ws);
            break;

          default:
            console.log("[WebSocket] Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("[WebSocket] Error processing message:", error);
      }
    });

    ws.on("close", () => {
      const presence = userPresence.get(ws);
      if (presence) {
        handleLeaveFile(ws, presence.fileId);
      }
      console.log("[WebSocket] Connection closed");
    });

    ws.on("error", (error) => {
      console.error("[WebSocket] Error:", error);
    });
  });

  console.log("[WebSocket] Server initialized");
  
  // Set the WebSocket server instance for broadcasting
  setWebSocketServer(wss);
  
  return wss;
}

function handleJoinFile(ws: WebSocket, fileId: number, userId: number, userName: string) {
  if (!fileRooms.has(fileId)) {
    fileRooms.set(fileId, new Set());
  }

  const room = fileRooms.get(fileId)!;
  room.add(ws);

  userPresence.set(ws, { userId, userName, fileId });

  // Notify others in the room
  const presenceMessage = {
    type: "user_joined",
    userId,
    userName,
    fileId,
  };

  broadcastToFile(fileId, presenceMessage, ws);

  // Send current users to the new joiner
  const currentUsers: UserPresence[] = [];
  room.forEach((client) => {
    const presence = userPresence.get(client);
    if (presence && client !== ws) {
      currentUsers.push(presence);
    }
  });

  ws.send(JSON.stringify({
    type: "room_users",
    users: currentUsers,
  }));

  console.log(`[WebSocket] User ${userName} (${userId}) joined file ${fileId}`);
}

function handleLeaveFile(ws: WebSocket, fileId: number) {
  const room = fileRooms.get(fileId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) {
      fileRooms.delete(fileId);
    }
  }

  const presence = userPresence.get(ws);
  if (presence) {
    // Notify others
    broadcastToFile(fileId, {
      type: "user_left",
      userId: presence.userId,
      userName: presence.userName,
      fileId,
    }, ws);

    userPresence.delete(ws);
    console.log(`[WebSocket] User ${presence.userName} (${presence.userId}) left file ${fileId}`);
  }
}

function broadcastToFile(fileId: number, message: any, exclude?: WebSocket) {
  const room = fileRooms.get(fileId);
  if (!room) return;

  const messageStr = JSON.stringify(message);

  room.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

function broadcastToAllUsers(message: any, exclude?: WebSocket) {
  const messageStr = JSON.stringify(message);

  // Broadcast to all connected users across all rooms
  userPresence.forEach((presence, client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

function broadcastToAnnotation(annotationId: number, message: any, exclude?: WebSocket) {
  const messageStr = JSON.stringify(message);

  // Broadcast to all users who might be viewing this annotation
  // Since annotations are tied to files, broadcast to all connected users
  userPresence.forEach((presence, client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}
