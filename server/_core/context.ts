import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifyAdminSession } from "../routes/adminAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // If no OAuth user found, check for standalone admin session
  // This allows admin panel access without Manus OAuth (e.g., self-hosted)
  if (!user) {
    try {
      const isStandaloneAdmin = await verifyAdminSession(opts.req);
      if (isStandaloneAdmin) {
        user = {
          id: 0,
          openId: "standalone-admin",
          name: "Admin",
          email: null,
          loginMethod: "standalone",
          role: "admin",
          location: null,
          age: null,
          bio: null,
          reasonForUse: null,
          company: null,
          jobTitle: null,
          avatarUrl: null,
          profileCompleted: true,
          accountStatus: "active",
          deactivatedAt: null,
          subscriptionTier: "pro",
          knowledgeGraphUsageCount: 0,
          knowledgeGraphUsageLimit: 999999,
          subscriptionExpiresAt: null,
          trialStartedAt: null,
          trialEndsAt: null,
          trialUsed: false,
          storageUsedBytes: 0,
          videoCount: 0,
          teamId: null,
          teamRole: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        } as User;
      }
    } catch {
      // Standalone admin verification failed, continue without user
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
