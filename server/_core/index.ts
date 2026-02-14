import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { securityHeaders } from "./securityHeaders";
import { apiRateLimit } from "./rateLimit";
import { setupWebSocket } from "./websocket";
import { csrfTokenSetter, csrfProtection } from "./csrf";
import cookieParser from "cookie-parser";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Add security headers to all responses
  app.use(securityHeaders);
  
  // Trust proxy for rate limiting (required for accurate IP detection)
  app.set('trust proxy', 1);
  
  // Stripe webhook MUST be registered BEFORE express.json() to preserve raw body
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const { handleStripeWebhook } = await import("../webhooks/stripe");
    await handleStripeWebhook(req, res);
  });
  
  // Configure body parser with larger size limit for file uploads
  // Increased to 500MB to support large video uploads (base64 encoded files are ~33% larger)
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ limit: "500mb", extended: true }));
  
  // Cookie parser (needed for CSRF double-submit cookie pattern)
  app.use(cookieParser());
  
  // CSRF protection: set token cookie on all responses, validate on state-changing requests
  app.use(csrfTokenSetter);
  app.use(csrfProtection);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Standalone admin auth routes (password-based, OAuth-independent)
  const adminAuthRouter = (await import("../routes/adminAuth")).default;
  app.use(adminAuthRouter);
  // Stream file endpoint for serving chunked uploads without re-assembly
  const streamFileRouter = (await import("../routes/streamFile")).default;
  app.use(streamFileRouter);
  // tRPC API with rate limiting
  app.use(
    "/api/trpc",
    apiRateLimit,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Setup WebSocket server
  setupWebSocket(server);

  // Initialize cron jobs for automated monitoring
  const { initializeCronJobs } = await import("./cronJobs");
  initializeCronJobs();

  // Initialize Stripe product and price (creates them if they don't exist)
  try {
    const { ensureStripeProductAndPrice } = await import("../lib/stripeInit");
    await ensureStripeProductAndPrice();
    console.log("[StripeInit] Product and price initialized successfully");
  } catch (error) {
    console.error("[StripeInit] Failed to initialize (subscriptions may not work):", error);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Auto-retry assembly for any stuck chunked uploads after a 30s delay
    // This runs fire-and-forget so it doesn't block the server
    setTimeout(async () => {
      try {
        console.log("[StartupAssembly] Scanning for pending chunked uploads that need assembly...");
        const { assembleAllPendingSessions } = await import("../lib/backgroundAssembly");
        await assembleAllPendingSessions();
        console.log("[StartupAssembly] Scan complete");
      } catch (error) {
        console.error("[StartupAssembly] Failed to scan for pending assemblies:", error);
      }
    }, 30_000); // 30 second delay to let the server fully warm up
  });
}

startServer().catch(console.error);
