import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { teams, teamInvites, users, teamActivities } from "../../drizzle/schema";
import { eq, and, count, desc, lt } from "drizzle-orm";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { logTeamActivity } from "../lib/teamActivity";

/**
 * Helper to check if a user is a team owner or admin
 */
async function requireTeamAdmin(userId: number, teamId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
  if (team.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the team owner can perform this action" });
  }
  return { db, team };
}

export const teamsRouter = router({
  /**
   * Get invite details by token (public - no auth required to view invite info)
   */
  getInviteDetails: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [invite] = await db
        .select({
          id: teamInvites.id,
          email: teamInvites.email,
          role: teamInvites.role,
          status: teamInvites.status,
          expiresAt: teamInvites.expiresAt,
          createdAt: teamInvites.createdAt,
          teamId: teamInvites.teamId,
          invitedBy: teamInvites.invitedBy,
        })
        .from(teamInvites)
        .where(eq(teamInvites.token, input.token))
        .limit(1);

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }

      // Get team name
      const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, invite.teamId)).limit(1);

      // Get inviter name
      const [inviter] = await db.select({ name: users.name }).from(users).where(eq(users.id, invite.invitedBy)).limit(1);

      // Check if expired
      const isExpired = invite.status === "pending" && new Date() > invite.expiresAt;

      return {
        email: invite.email,
        role: invite.role,
        status: isExpired ? "expired" as const : invite.status,
        teamName: team?.name || "Unknown Team",
        inviterName: inviter?.name || "A team member",
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      };
    }),

  /**
   * Get the current user's team (if they belong to one)
   */
  getMyTeam: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    if (!ctx.user.teamId) return null;

    const [team] = await db.select().from(teams).where(eq(teams.id, ctx.user.teamId)).limit(1);
    if (!team) return null;

    // Get member count
    const [memberResult] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.teamId, team.id));

    // Get pending invites count
    const [inviteResult] = await db
      .select({ count: count() })
      .from(teamInvites)
      .where(and(eq(teamInvites.teamId, team.id), eq(teamInvites.status, "pending")));

    return {
      ...team,
      memberCount: memberResult?.count || 0,
      pendingInvites: inviteResult?.count || 0,
      isOwner: team.ownerId === ctx.user.id,
      storageUsedFormatted: formatBytes(team.storageUsedBytes),
      storageLimitFormatted: `${team.storageGB} GB`,
      storagePercentage: Math.round((team.storageUsedBytes / (team.storageGB * 1024 * 1024 * 1024)) * 100),
    };
  }),

  /**
   * Create a new team (only for team-tier subscribers)
   */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      if (ctx.user.subscriptionTier !== "team") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team plan required to create a team" });
      }

      if (ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already belong to a team" });
      }

      // Create the team
      const [result] = await db.insert(teams).values({
        name: input.name,
        ownerId: ctx.user.id,
        stripeCustomerId: ctx.user.stripeCustomerId,
        stripeSubscriptionId: ctx.user.stripeSubscriptionId,
      });

      const teamId = result.insertId;

      // Update the user's teamId
      await db.update(users)
        .set({ teamId: Number(teamId) })
        .where(eq(users.id, ctx.user.id));

      // Log activity
      await logTeamActivity({
        teamId: Number(teamId),
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "team_created",
        details: { teamName: input.name },
      });

      return { teamId: Number(teamId), name: input.name };
    }),

  /**
   * Get team members
   */
  getMembers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    if (!ctx.user.teamId) return [];

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.teamId, ctx.user.teamId));

    // Get the team to check ownership
    const [team] = await db.select().from(teams).where(eq(teams.id, ctx.user.teamId)).limit(1);

    return members.map((m) => ({
      ...m,
      isOwner: team ? m.id === team.ownerId : false,
    }));
  }),

  /**
   * Invite a user to the team
   */
  inviteMember: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(["member", "admin"]).optional().default("member"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }

      const { db, team } = await requireTeamAdmin(ctx.user.id, ctx.user.teamId);

      // Check seat limit
      const [memberResult] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.teamId, team.id));

      const [pendingResult] = await db
        .select({ count: count() })
        .from(teamInvites)
        .where(and(eq(teamInvites.teamId, team.id), eq(teamInvites.status, "pending")));

      const totalSeats = (memberResult?.count || 0) + (pendingResult?.count || 0);
      if (totalSeats >= team.maxSeats) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Team is at capacity (${team.maxSeats} seats). Remove a member or upgrade your plan.`,
        });
      }

      // Check if user is already a member
      const [existingMember] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, input.email), eq(users.teamId, team.id)))
        .limit(1);

      if (existingMember) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This user is already a team member" });
      }

      // Check for existing pending invite
      const [existingInvite] = await db
        .select()
        .from(teamInvites)
        .where(
          and(
            eq(teamInvites.teamId, team.id),
            eq(teamInvites.email, input.email),
            eq(teamInvites.status, "pending")
          )
        )
        .limit(1);

      if (existingInvite) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An invite is already pending for this email" });
      }

      // Create invite
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(teamInvites).values({
        teamId: team.id,
        email: input.email,
        invitedBy: ctx.user.id,
        role: input.role,
        token,
        expiresAt,
      });

      // Log activity
      await logTeamActivity({
        teamId: team.id,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "invite_sent",
        details: { email: input.email, role: input.role },
      });

      return { success: true, message: `Invite sent to ${input.email}` };
    }),

  /**
   * Get pending invites for the team
   */
  getPendingInvites: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    if (!ctx.user.teamId) return [];

    const invites = await db
      .select({
        id: teamInvites.id,
        email: teamInvites.email,
        role: teamInvites.role,
        status: teamInvites.status,
        expiresAt: teamInvites.expiresAt,
        createdAt: teamInvites.createdAt,
      })
      .from(teamInvites)
      .where(and(eq(teamInvites.teamId, ctx.user.teamId), eq(teamInvites.status, "pending")));

    return invites;
  }),

  /**
   * Accept a team invite (by token)
   */
  acceptInvite: protectedProcedure
    .input(z.object({
      token: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [invite] = await db
        .select()
        .from(teamInvites)
        .where(and(eq(teamInvites.token, input.token), eq(teamInvites.status, "pending")))
        .limit(1);

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired invite" });
      }

      if (new Date() > invite.expiresAt) {
        await db.update(teamInvites)
          .set({ status: "expired" })
          .where(eq(teamInvites.id, invite.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has expired" });
      }

      if (ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already belong to a team. Leave your current team first." });
      }

      // Accept the invite
      await db.update(teamInvites)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(teamInvites.id, invite.id));

      // Add user to the team
      await db.update(users)
        .set({
          teamId: invite.teamId,
          subscriptionTier: "team",
        })
        .where(eq(users.id, ctx.user.id));

      // Log activities
      await logTeamActivity({
        teamId: invite.teamId,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "invite_accepted",
        details: { email: invite.email },
      });
      await logTeamActivity({
        teamId: invite.teamId,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "member_joined",
        details: { memberName: ctx.user.name || ctx.user.email || "Unknown" },
      });

      return { success: true, teamId: invite.teamId };
    }),

  /**
   * Revoke a pending invite
   */
  revokeInvite: protectedProcedure
    .input(z.object({
      inviteId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }

      await requireTeamAdmin(ctx.user.id, ctx.user.teamId);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get invite details for logging
      const [revokedInvite] = await db
        .select({ email: teamInvites.email })
        .from(teamInvites)
        .where(eq(teamInvites.id, input.inviteId))
        .limit(1);

      await db.update(teamInvites)
        .set({ status: "revoked" })
        .where(and(eq(teamInvites.id, input.inviteId), eq(teamInvites.teamId, ctx.user.teamId)));

      // Log activity
      await logTeamActivity({
        teamId: ctx.user.teamId,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "invite_revoked",
        details: { email: revokedInvite?.email || "unknown" },
      });

      return { success: true };
    }),

  /**
   * Remove a member from the team (owner only)
   */
  removeMember: protectedProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }

      const { db, team } = await requireTeamAdmin(ctx.user.id, ctx.user.teamId);

      if (input.userId === team.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the team owner" });
      }

      // Get member details for logging
      const [removedMember] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      // Remove user from team
      await db.update(users)
        .set({ teamId: null, subscriptionTier: "free" })
        .where(and(eq(users.id, input.userId), eq(users.teamId, team.id)));

      // Log activity
      await logTeamActivity({
        teamId: team.id,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "member_removed",
        details: { memberName: removedMember?.name || removedMember?.email || "Unknown" },
      });

      return { success: true };
    }),

  /**
   * Leave a team (for non-owner members)
   */
  leaveTeam: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    if (!ctx.user.teamId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
    }

    // Check if user is the owner
    const [team] = await db.select().from(teams).where(eq(teams.id, ctx.user.teamId)).limit(1);
    if (team && team.ownerId === ctx.user.id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Team owners cannot leave. Transfer ownership or delete the team first.",
      });
    }

    const leavingTeamId = ctx.user.teamId;

    // Remove from team
    await db.update(users)
      .set({ teamId: null, subscriptionTier: "free" })
      .where(eq(users.id, ctx.user.id));

    // Log activity
    await logTeamActivity({
      teamId: leavingTeamId,
      actorId: ctx.user.id,
      actorName: ctx.user.name || null,
      type: "member_left",
      details: { memberName: ctx.user.name || "Unknown" },
    });

    return { success: true };
  }),

  /**
   * Update team name (owner only)
   */
  updateName: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }

      const { db } = await requireTeamAdmin(ctx.user.id, ctx.user.teamId);

      await db.update(teams)
        .set({ name: input.name })
        .where(eq(teams.id, ctx.user.teamId));

      // Log activity
      await logTeamActivity({
        teamId: ctx.user.teamId,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "team_name_updated",
        details: { newName: input.name },
      });

      return { success: true };
    }),

  /**
   * Get team activity feed with pagination
   */
  getActivities: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).optional().default(20),
      cursor: z.number().optional(), // activity ID for cursor-based pagination
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { activities: [], nextCursor: undefined };

      if (!ctx.user.teamId) return { activities: [], nextCursor: undefined };

      const limit = input?.limit ?? 20;
      const cursor = input?.cursor;

      const whereConditions = cursor
        ? and(
            eq(teamActivities.teamId, ctx.user.teamId),
            lt(teamActivities.id, cursor)
          )
        : eq(teamActivities.teamId, ctx.user.teamId);

      const activities = await db
        .select()
        .from(teamActivities)
        .where(whereConditions)
        .orderBy(desc(teamActivities.id))
        .limit(limit + 1);

      const hasMore = activities.length > limit;
      const items = hasMore ? activities.slice(0, limit) : activities;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      return {
        activities: items,
        nextCursor,
      };
    }),
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
