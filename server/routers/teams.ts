import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { teams, teamInvites, users, teamActivities, files } from "../../drizzle/schema";
import { eq, and, count, desc, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { logTeamActivity } from "../lib/teamActivity";
import { notifyOwner } from "../_core/notification";

/**
 * Helper to check if a user is a team owner (for owner-only operations like promote/demote)
 */
async function requireTeamOwner(userId: number, teamId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
  if (team.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the team owner can perform this action" });
  }
  return { db, team };
}

/**
 * Helper to check if a user is a team owner OR admin (for invite/remove operations)
 */
async function requireTeamAdmin(userId: number, teamId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });

  const isOwner = team.ownerId === userId;
  if (!isOwner) {
    // Check if user is an admin
    const [user] = await db
      .select({ teamRole: users.teamRole })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.teamId, teamId)))
      .limit(1);
    if (!user || user.teamRole !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only team owners and admins can perform this action" });
    }
  }
  return { db, team, isOwner };
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
      isAdmin: ctx.user.teamRole === "admin",
      canManage: team.ownerId === ctx.user.id || ctx.user.teamRole === "admin",
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
        teamRole: users.teamRole,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.teamId, ctx.user.teamId));

    // Get the team to check ownership
    const [team] = await db.select().from(teams).where(eq(teams.id, ctx.user.teamId)).limit(1);

    return members.map((m) => ({
      ...m,
      teamRole: team && m.id === team.ownerId ? "owner" as const : (m.teamRole || "member"),
      isOwner: team ? m.id === team.ownerId : false,
    }));
  }),

  /**
   * Promote a team member to admin
   */
  promoteMember: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }
      const { db, team } = await requireTeamOwner(ctx.user.id, ctx.user.teamId);

      // Can't promote yourself
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role" });
      }

      // Verify target user is a team member
      const [targetUser] = await db
        .select({ id: users.id, name: users.name, teamRole: users.teamRole })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.teamId, team.id)))
        .limit(1);

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User is not a member of this team" });
      }

      if (targetUser.teamRole === "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is already an admin" });
      }

      await db.update(users).set({ teamRole: "admin" }).where(eq(users.id, input.userId));

      await logTeamActivity({
        teamId: team.id,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "member_promoted",
        details: { userId: input.userId, userName: targetUser.name || "Unknown", newRole: "admin" },
      });

      return { success: true, message: `${targetUser.name || "Member"} promoted to admin` };
    }),

  /**
   * Demote a team admin back to member
   */
  demoteMember: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }
      const { db, team } = await requireTeamOwner(ctx.user.id, ctx.user.teamId);

      // Can't demote yourself
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role" });
      }

      // Verify target user is a team member
      const [targetUser] = await db
        .select({ id: users.id, name: users.name, teamRole: users.teamRole })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.teamId, team.id)))
        .limit(1);

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User is not a member of this team" });
      }

      if (targetUser.teamRole !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is not an admin" });
      }

      await db.update(users).set({ teamRole: "member" }).where(eq(users.id, input.userId));

      await logTeamActivity({
        teamId: team.id,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "member_demoted",
        details: { userId: input.userId, userName: targetUser.name || "Unknown", newRole: "member" },
      });

      return { success: true, message: `${targetUser.name || "Member"} demoted to member` };
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

      // Send email notification with invite link
      const origin = ctx.req?.headers?.origin || ctx.req?.headers?.referer?.replace(/\/+$/, "") || "";
      const inviteLink = origin ? `${origin}/team/invite/${token}` : `(invite token: ${token})`;
      try {
        await notifyOwner({
          title: `[Klipz] Team Invite: ${ctx.user.name || "A team member"} invited ${input.email} to ${team.name}`,
          content: [
            `You've been invited to join the team "${team.name}" on Klipz!`,
            "",
            `Invited by: ${ctx.user.name || ctx.user.email || "Team member"}`,
            `Role: ${input.role}`,
            `Team: ${team.name}`,
            "",
            `Accept your invite here: ${inviteLink}`,
            "",
            `This invite expires on ${expiresAt.toLocaleDateString()}.`,
            "",
            "If you don't have a Klipz account yet, you'll be prompted to create one when you click the link.",
          ].join("\n"),
        });
      } catch (err) {
        // Don't block invite creation if email fails
        console.error("[Teams] Failed to send invite email notification:", err);
      }

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
   * Remove a member from the team (owner or admin)
   * Admins can only remove regular members, not other admins or the owner
   */
  removeMember: protectedProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }

      const { db, team, isOwner } = await requireTeamAdmin(ctx.user.id, ctx.user.teamId);

      if (input.userId === team.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the team owner" });
      }

      // If the actor is an admin (not owner), prevent removing other admins
      if (!isOwner) {
        const [targetUser] = await db
          .select({ teamRole: users.teamRole })
          .from(users)
          .where(and(eq(users.id, input.userId), eq(users.teamId, team.id)))
          .limit(1);
        if (targetUser?.teamRole === "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admins cannot remove other admins. Only the team owner can do this." });
        }
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

      const { db } = await requireTeamOwner(ctx.user.id, ctx.user.teamId);

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

  /**
   * Bulk invite multiple users via email list
   */
  bulkInvite: protectedProcedure
    .input(z.object({
      emails: z.array(z.string().email()).min(1).max(50),
      role: z.enum(["member", "admin"]).optional().default("member"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }

      const { db, team } = await requireTeamAdmin(ctx.user.id, ctx.user.teamId);

      // Get current seat usage
      const [memberResult] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.teamId, team.id));

      const [pendingResult] = await db
        .select({ count: count() })
        .from(teamInvites)
        .where(and(eq(teamInvites.teamId, team.id), eq(teamInvites.status, "pending")));

      const currentSeats = (memberResult?.count || 0) + (pendingResult?.count || 0);
      const availableSeats = team.maxSeats - currentSeats;

      // Get existing members' emails
      const existingMembers = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.teamId, team.id));
      const memberEmails = new Set(existingMembers.map(m => m.email?.toLowerCase()));

      // Get existing pending invite emails
      const existingInvites = await db
        .select({ email: teamInvites.email })
        .from(teamInvites)
        .where(and(eq(teamInvites.teamId, team.id), eq(teamInvites.status, "pending")));
      const pendingEmails = new Set(existingInvites.map(i => i.email.toLowerCase()));

      const results: { email: string; status: "sent" | "skipped_member" | "skipped_pending" | "skipped_capacity" | "failed" }[] = [];
      let sentCount = 0;

      // Deduplicate input emails
      const uniqueEmails = Array.from(new Set(input.emails.map(e => e.toLowerCase())));

      const origin = ctx.req?.headers?.origin || ctx.req?.headers?.referer?.replace(/\/+$/, "") || "";

      for (const email of uniqueEmails) {
        if (memberEmails.has(email)) {
          results.push({ email, status: "skipped_member" });
          continue;
        }

        if (pendingEmails.has(email)) {
          results.push({ email, status: "skipped_pending" });
          continue;
        }

        if (sentCount >= availableSeats) {
          results.push({ email, status: "skipped_capacity" });
          continue;
        }

        try {
          const token = crypto.randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          await db.insert(teamInvites).values({
            teamId: team.id,
            email,
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
            details: { email, role: input.role },
          });

          // Send notification (fire-and-forget)
          const inviteLink = origin ? `${origin}/team/invite/${token}` : `(invite token: ${token})`;
          notifyOwner({
            title: `[Klipz] Team Invite: ${ctx.user.name || "A team member"} invited ${email} to ${team.name}`,
            content: [
              `You've been invited to join the team "${team.name}" on Klipz!`,
              "",
              `Invited by: ${ctx.user.name || ctx.user.email || "Team member"}`,
              `Role: ${input.role}`,
              `Team: ${team.name}`,
              "",
              `Accept your invite here: ${inviteLink}`,
              "",
              `This invite expires on ${expiresAt.toLocaleDateString()}.`,
            ].join("\n"),
          }).catch(() => {});

          pendingEmails.add(email);
          sentCount++;
          results.push({ email, status: "sent" });
        } catch (err) {
          results.push({ email, status: "failed" });
        }
      }

      return {
        results,
        summary: {
          total: uniqueEmails.length,
          sent: results.filter(r => r.status === "sent").length,
          skippedMember: results.filter(r => r.status === "skipped_member").length,
          skippedPending: results.filter(r => r.status === "skipped_pending").length,
          skippedCapacity: results.filter(r => r.status === "skipped_capacity").length,
          failed: results.filter(r => r.status === "failed").length,
        },
      };
    }),

  /**
   * Transfer team ownership to another admin
   */
  transferOwnership: protectedProcedure
    .input(z.object({
      newOwnerId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.teamId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You don't belong to a team" });
      }

      const { db, team } = await requireTeamOwner(ctx.user.id, ctx.user.teamId);

      if (input.newOwnerId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You are already the team owner" });
      }

      // Verify new owner is a team admin
      const [newOwner] = await db
        .select({ id: users.id, name: users.name, teamRole: users.teamRole })
        .from(users)
        .where(and(eq(users.id, input.newOwnerId), eq(users.teamId, team.id)))
        .limit(1);

      if (!newOwner) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User is not a member of this team" });
      }

      if (newOwner.teamRole !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ownership can only be transferred to a team admin. Promote the member to admin first." });
      }

      // Transfer ownership
      await db.update(teams)
        .set({ ownerId: input.newOwnerId })
        .where(eq(teams.id, team.id));

      // Set new owner's teamRole to member (they're now the owner, teamRole is irrelevant)
      // Set old owner's teamRole to admin (so they retain management access)
      await db.update(users)
        .set({ teamRole: "member" })
        .where(eq(users.id, input.newOwnerId));

      await db.update(users)
        .set({ teamRole: "admin" })
        .where(eq(users.id, ctx.user.id));

      // Log activity
      await logTeamActivity({
        teamId: team.id,
        actorId: ctx.user.id,
        actorName: ctx.user.name || null,
        type: "ownership_transferred",
        details: {
          newOwnerId: input.newOwnerId,
          newOwnerName: newOwner.name || "Unknown",
          previousOwnerId: ctx.user.id,
          previousOwnerName: ctx.user.name || "Unknown",
        },
      });

      return {
        success: true,
        message: `Ownership transferred to ${newOwner.name || "the new owner"}. You have been set as an admin.`,
      };
    }),

  /**
   * Get per-member storage breakdown for the team
   * Returns each member's file count, total storage used, and percentage of team storage
   */
  getStorageBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { members: [], teamTotal: 0, teamLimit: 0 };

    if (!ctx.user.teamId) return { members: [], teamTotal: 0, teamLimit: 0 };

    // Get the team info
    const [team] = await db.select().from(teams).where(eq(teams.id, ctx.user.teamId)).limit(1);
    if (!team) return { members: [], teamTotal: 0, teamLimit: 0 };

    const teamLimitBytes = team.storageGB * 1024 * 1024 * 1024;

    // Get all team members
    const teamMembers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        storageUsedBytes: users.storageUsedBytes,
      })
      .from(users)
      .where(eq(users.teamId, ctx.user.teamId));

    // Get file counts and actual storage per member from the files table
    const memberFileStats = await db
      .select({
        userId: files.userId,
        fileCount: count(),
        totalSize: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`,
      })
      .from(files)
      .where(
        sql`${files.userId} IN (${teamMembers.length > 0 ? sql.join(teamMembers.map(m => sql`${m.id}`), sql`, `) : sql`-1`})`
      )
      .groupBy(files.userId);

    const fileStatsMap = new Map(memberFileStats.map(s => [s.userId, s]));

    const memberBreakdown = teamMembers.map(m => {
      const stats = fileStatsMap.get(m.id);
      const storageUsed = stats ? Number(stats.totalSize) : 0;
      const fileCount = stats ? Number(stats.fileCount) : 0;
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        avatarUrl: m.avatarUrl,
        storageUsedBytes: storageUsed,
        storageUsedFormatted: formatBytes(storageUsed),
        fileCount,
        percentage: teamLimitBytes > 0 ? Math.round((storageUsed / teamLimitBytes) * 100 * 10) / 10 : 0,
      };
    });

    // Sort by storage used descending
    memberBreakdown.sort((a, b) => b.storageUsedBytes - a.storageUsedBytes);

    const teamTotal = memberBreakdown.reduce((sum, m) => sum + m.storageUsedBytes, 0);

    return {
      members: memberBreakdown,
      teamTotal,
      teamTotalFormatted: formatBytes(teamTotal),
      teamLimit: teamLimitBytes,
      teamLimitFormatted: formatBytes(teamLimitBytes),
      teamPercentage: teamLimitBytes > 0 ? Math.round((teamTotal / teamLimitBytes) * 100 * 10) / 10 : 0,
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

/**
 * Check team storage usage and send alerts at 80% and 90% thresholds.
 * Called after file uploads to notify the team owner.
 */
export async function checkTeamStorageAlerts(teamId: number) {
  try {
    const db = await getDb();
    if (!db) return;

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return;

    const teamLimitBytes = team.storageGB * 1024 * 1024 * 1024;
    if (teamLimitBytes <= 0) return;

    // Calculate actual usage from team members' files
    const teamMembers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.teamId, teamId));

    if (teamMembers.length === 0) return;

    const [storageResult] = await db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`,
      })
      .from(files)
      .where(
        sql`${files.userId} IN (${sql.join(teamMembers.map(m => sql`${m.id}`), sql`, `)})`
      );

    const totalUsed = Number(storageResult?.totalSize || 0);
    const usagePercent = (totalUsed / teamLimitBytes) * 100;

    // Get team owner info
    const [owner] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, team.ownerId))
      .limit(1);

    const now = new Date();
    const cooldownMs = 24 * 60 * 60 * 1000; // 24 hours between alerts of the same type

    // Check 90% threshold first (higher priority)
    if (usagePercent >= 90) {
      const lastSent = team.lastStorageAlert90SentAt;
      if (!lastSent || (now.getTime() - lastSent.getTime()) > cooldownMs) {
        await db.update(teams)
          .set({ lastStorageAlert90SentAt: now })
          .where(eq(teams.id, teamId));

        await logTeamActivity({
          teamId,
          actorId: owner?.id || team.ownerId,
          actorName: "System",
          type: "storage_alert_90",
          details: {
            usagePercent: Math.round(usagePercent * 10) / 10,
            usedFormatted: formatBytes(totalUsed),
            limitFormatted: `${team.storageGB} GB`,
          },
        });

        notifyOwner({
          title: `[Klipz] ⚠️ Critical: Team "${team.name}" storage at ${Math.round(usagePercent)}%`,
          content: [
            `Your team "${team.name}" has used ${formatBytes(totalUsed)} of ${team.storageGB} GB (${Math.round(usagePercent)}%).`,
            "",
            "Storage is critically low. Consider:",
            "• Removing unused files",
            "• Upgrading your team storage plan",
            "",
            "Files cannot be uploaded once storage is full.",
          ].join("\n"),
        }).catch(() => {});
      }
    }
    // Check 80% threshold
    else if (usagePercent >= 80) {
      const lastSent = team.lastStorageAlert80SentAt;
      if (!lastSent || (now.getTime() - lastSent.getTime()) > cooldownMs) {
        await db.update(teams)
          .set({ lastStorageAlert80SentAt: now })
          .where(eq(teams.id, teamId));

        await logTeamActivity({
          teamId,
          actorId: owner?.id || team.ownerId,
          actorName: "System",
          type: "storage_alert_80",
          details: {
            usagePercent: Math.round(usagePercent * 10) / 10,
            usedFormatted: formatBytes(totalUsed),
            limitFormatted: `${team.storageGB} GB`,
          },
        });

        notifyOwner({
          title: `[Klipz] Warning: Team "${team.name}" storage at ${Math.round(usagePercent)}%`,
          content: [
            `Your team "${team.name}" has used ${formatBytes(totalUsed)} of ${team.storageGB} GB (${Math.round(usagePercent)}%).`,
            "",
            "Consider cleaning up unused files or upgrading your storage plan to avoid running out of space.",
          ].join("\n"),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[StorageAlert] Failed to check storage alerts:", err);
  }
}
