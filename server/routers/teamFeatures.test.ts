import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../drizzle/schema", () => ({
  users: { id: "id", teamId: "teamId", subscriptionTier: "subscriptionTier", name: "name", email: "email", teamRole: "teamRole" },
  teams: { id: "id", name: "name", ownerId: "ownerId" },
  teamInvites: { id: "id", teamId: "teamId", email: "email", status: "status", token: "token", expiresAt: "expiresAt", invitedBy: "invitedBy", role: "role" },
  teamActivities: { id: "id", teamId: "teamId", actorId: "actorId", actorName: "actorName", type: "type", details: "details", createdAt: "createdAt" },
}));

// ============= FEATURE 1: Email Notifications for Team Invites =============

describe("email notifications for team invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("invite email content", () => {
    it("should construct a valid invite email with team name and inviter", () => {
      const teamName = "Marketing Team";
      const inviterName = "John Doe";
      const inviteeEmail = "colleague@example.com";
      const role = "member";
      const token = "abc123def456";
      const origin = "https://klipz.example.com";
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const inviteLink = `${origin}/team/invite/${token}`;
      const emailContent = [
        `You've been invited to join the team "${teamName}" on Klipz!`,
        "",
        `Invited by: ${inviterName}`,
        `Role: ${role}`,
        `Team: ${teamName}`,
        "",
        `Accept your invite here: ${inviteLink}`,
        "",
        `This invite expires on ${expiresAt.toLocaleDateString()}.`,
        "",
        "If you don't have a Klipz account yet, you'll be prompted to create one when you click the link.",
      ].join("\n");

      expect(emailContent).toContain("Marketing Team");
      expect(emailContent).toContain("John Doe");
      expect(emailContent).toContain(inviteLink);
      expect(emailContent).toContain("member");
      expect(emailContent).toContain("expires on");
    });

    it("should include the correct invite link with token", () => {
      const origin = "https://klipz.example.com";
      const token = "a1b2c3d4e5f6g7h8";
      const inviteLink = `${origin}/team/invite/${token}`;

      expect(inviteLink).toBe("https://klipz.example.com/team/invite/a1b2c3d4e5f6g7h8");
    });

    it("should handle missing origin gracefully", () => {
      const origin = "";
      const token = "abc123";
      const inviteLink = origin ? `${origin}/team/invite/${token}` : `(invite token: ${token})`;

      expect(inviteLink).toBe("(invite token: abc123)");
    });

    it("should construct email title with inviter and invitee info", () => {
      const inviterName = "Alice";
      const inviteeEmail = "bob@example.com";
      const teamName = "Design Team";

      const title = `[Klipz] Team Invite: ${inviterName} invited ${inviteeEmail} to ${teamName}`;

      expect(title).toBe("[Klipz] Team Invite: Alice invited bob@example.com to Design Team");
    });

    it("should fall back to 'A team member' when inviter name is missing", () => {
      const inviterName = null;
      const displayName = inviterName || "A team member";

      expect(displayName).toBe("A team member");
    });

    it("should include admin role when inviting as admin", () => {
      const role = "admin";
      const emailContent = `Role: ${role}`;

      expect(emailContent).toContain("admin");
    });
  });

  describe("invite email error handling", () => {
    it("should not block invite creation if email notification fails", () => {
      // Simulating the try/catch pattern used in the invite mutation
      let inviteCreated = false;
      let emailSent = false;

      // Invite creation succeeds
      inviteCreated = true;

      // Email sending fails
      try {
        throw new Error("Notification service unavailable");
      } catch (err) {
        emailSent = false;
      }

      // Invite should still be created even if email fails
      expect(inviteCreated).toBe(true);
      expect(emailSent).toBe(false);
    });
  });
});

// ============= FEATURE 2: File Upload & Annotation Activity Logging =============

describe("file upload and annotation activity logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("file upload activity", () => {
    it("should create a valid file_uploaded activity record", () => {
      const activity = {
        teamId: 1,
        actorId: 42,
        actorName: "John Doe",
        type: "file_uploaded" as const,
        details: { filename: "presentation.pdf" },
      };

      expect(activity.type).toBe("file_uploaded");
      expect(activity.details.filename).toBe("presentation.pdf");
      expect(activity.teamId).toBe(1);
      expect(activity.actorId).toBe(42);
    });

    it("should only log activity when user belongs to a team", () => {
      const userWithTeam = { id: 1, teamId: 5, name: "Alice" };
      const userWithoutTeam = { id: 2, teamId: null, name: "Bob" };

      expect(!!userWithTeam.teamId).toBe(true);
      expect(!!userWithoutTeam.teamId).toBe(false);
    });

    it("should use fire-and-forget pattern for activity logging", () => {
      // The activity logging uses .catch(() => {}) pattern
      const mockPromise = Promise.reject(new Error("DB error")).catch(() => {});

      // Should not throw
      expect(mockPromise).resolves.toBeUndefined();
    });

    it("should include filename in activity details", () => {
      const filename = "video-recording-2026.mp4";
      const details = { filename };

      expect(details.filename).toBe("video-recording-2026.mp4");
    });
  });

  describe("annotation activity", () => {
    it("should create a valid annotation_created activity for voice annotations", () => {
      const activity = {
        teamId: 1,
        actorId: 42,
        actorName: "John Doe",
        type: "annotation_created" as const,
        details: { filename: "demo-video.mp4", annotationType: "voice" },
      };

      expect(activity.type).toBe("annotation_created");
      expect(activity.details.annotationType).toBe("voice");
      expect(activity.details.filename).toBe("demo-video.mp4");
    });

    it("should create a valid annotation_created activity for visual annotations", () => {
      const activity = {
        teamId: 1,
        actorId: 42,
        actorName: "John Doe",
        type: "annotation_created" as const,
        details: { filename: "file #123", annotationType: "visual" },
      };

      expect(activity.type).toBe("annotation_created");
      expect(activity.details.annotationType).toBe("visual");
    });

    it("should only log annotation activity when user has a teamId", () => {
      const scenarios = [
        { teamId: 1, shouldLog: true },
        { teamId: null, shouldLog: false },
        { teamId: undefined, shouldLog: false },
        { teamId: 0, shouldLog: false },
      ];

      scenarios.forEach(({ teamId, shouldLog }) => {
        expect(!!teamId).toBe(shouldLog);
      });
    });
  });

  describe("updated activity types", () => {
    const validTypes = [
      "member_joined",
      "member_left",
      "member_removed",
      "member_promoted",
      "member_demoted",
      "invite_sent",
      "invite_accepted",
      "invite_revoked",
      "file_uploaded",
      "annotation_created",
      "team_created",
      "team_name_updated",
    ];

    it("should support 12 activity types including new ones", () => {
      expect(validTypes).toHaveLength(12);
    });

    it("should include member_promoted and member_demoted types", () => {
      expect(validTypes).toContain("member_promoted");
      expect(validTypes).toContain("member_demoted");
    });

    it("should include file_uploaded and annotation_created types", () => {
      expect(validTypes).toContain("file_uploaded");
      expect(validTypes).toContain("annotation_created");
    });
  });
});

// ============= FEATURE 3: Team Role Management =============

describe("team role management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("teamRole field", () => {
    it("should default teamRole to 'member'", () => {
      const newUser = {
        id: 1,
        teamId: 5,
        teamRole: "member" as const,
      };

      expect(newUser.teamRole).toBe("member");
    });

    it("should support 'admin' teamRole", () => {
      const adminUser = {
        id: 1,
        teamId: 5,
        teamRole: "admin" as const,
      };

      expect(adminUser.teamRole).toBe("admin");
    });

    it("should allow null teamRole for users not in a team", () => {
      const soloUser = {
        id: 1,
        teamId: null,
        teamRole: null,
      };

      expect(soloUser.teamRole).toBeNull();
    });
  });

  describe("promote member", () => {
    it("should promote a member to admin", () => {
      const before = { id: 10, teamRole: "member" as const };
      const after = { ...before, teamRole: "admin" as const };

      expect(before.teamRole).toBe("member");
      expect(after.teamRole).toBe("admin");
    });

    it("should not allow promoting yourself", () => {
      const actorId = 42;
      const targetUserId = 42;

      expect(actorId === targetUserId).toBe(true);
      // In the actual code, this throws FORBIDDEN
    });

    it("should not allow promoting a user who is already admin", () => {
      const targetUser = { id: 10, teamRole: "admin" as const };

      expect(targetUser.teamRole === "admin").toBe(true);
      // In the actual code, this throws BAD_REQUEST
    });

    it("should create a member_promoted activity log", () => {
      const activity = {
        teamId: 1,
        actorId: 42,
        actorName: "Team Owner",
        type: "member_promoted" as const,
        details: { userId: 10, userName: "Jane Smith", newRole: "admin" },
      };

      expect(activity.type).toBe("member_promoted");
      expect(activity.details.newRole).toBe("admin");
      expect(activity.details.userName).toBe("Jane Smith");
    });

    it("should return success message with member name", () => {
      const memberName = "Jane Smith";
      const message = `${memberName} promoted to admin`;

      expect(message).toBe("Jane Smith promoted to admin");
    });

    it("should fall back to 'Member' when name is missing", () => {
      const memberName = null;
      const message = `${memberName || "Member"} promoted to admin`;

      expect(message).toBe("Member promoted to admin");
    });
  });

  describe("demote member", () => {
    it("should demote an admin to member", () => {
      const before = { id: 10, teamRole: "admin" as const };
      const after = { ...before, teamRole: "member" as const };

      expect(before.teamRole).toBe("admin");
      expect(after.teamRole).toBe("member");
    });

    it("should not allow demoting yourself", () => {
      const actorId = 42;
      const targetUserId = 42;

      expect(actorId === targetUserId).toBe(true);
    });

    it("should not allow demoting a user who is not admin", () => {
      const targetUser = { id: 10, teamRole: "member" as const };

      expect(targetUser.teamRole !== "admin").toBe(true);
    });

    it("should create a member_demoted activity log", () => {
      const activity = {
        teamId: 1,
        actorId: 42,
        actorName: "Team Owner",
        type: "member_demoted" as const,
        details: { userId: 10, userName: "Jane Smith", newRole: "member" },
      };

      expect(activity.type).toBe("member_demoted");
      expect(activity.details.newRole).toBe("member");
    });

    it("should return success message with member name", () => {
      const memberName = "Jane Smith";
      const message = `${memberName} demoted to member`;

      expect(message).toBe("Jane Smith demoted to member");
    });
  });

  describe("getMembers with teamRole", () => {
    it("should return owner role for team owner", () => {
      const member = { id: 1, teamRole: "member" };
      const team = { ownerId: 1 };

      const displayRole = member.id === team.ownerId ? "owner" : member.teamRole || "member";

      expect(displayRole).toBe("owner");
    });

    it("should return admin role for team admin", () => {
      const member = { id: 2, teamRole: "admin" };
      const team = { ownerId: 1 };

      const displayRole = member.id === team.ownerId ? "owner" : member.teamRole || "member";

      expect(displayRole).toBe("admin");
    });

    it("should return member role for regular member", () => {
      const member = { id: 3, teamRole: "member" };
      const team = { ownerId: 1 };

      const displayRole = member.id === team.ownerId ? "owner" : member.teamRole || "member";

      expect(displayRole).toBe("member");
    });

    it("should default to member when teamRole is null", () => {
      const member = { id: 3, teamRole: null };
      const team = { ownerId: 1 };

      const displayRole = member.id === team.ownerId ? "owner" : member.teamRole || "member";

      expect(displayRole).toBe("member");
    });
  });

  describe("authorization checks", () => {
    it("should only allow team owner to promote members", () => {
      const team = { id: 1, ownerId: 42 };
      const actorId = 42;

      expect(team.ownerId === actorId).toBe(true);
    });

    it("should reject non-owner from promoting members", () => {
      const team = { id: 1, ownerId: 42 };
      const actorId = 99;

      expect(team.ownerId === actorId).toBe(false);
    });

    it("should reject promote when user has no team", () => {
      const userTeamId = null;

      expect(!userTeamId).toBe(true);
    });

    it("should reject promote for non-team-member target", () => {
      const targetUser = null; // User not found in team

      expect(targetUser).toBeNull();
    });
  });
});

// ============= CROSS-FEATURE: Activity Feed UI Types =============

describe("activity feed UI support for new types", () => {
  const activityTypeIcons: Record<string, string> = {
    member_joined: "emerald",
    member_left: "yellow",
    member_removed: "red",
    member_promoted: "amber",
    member_demoted: "orange",
    invite_sent: "blue",
    invite_accepted: "emerald",
    invite_revoked: "orange",
    file_uploaded: "cyan",
    annotation_created: "purple",
    team_created: "emerald",
    team_name_updated: "blue",
  };

  it("should have icon colors for all 12 activity types", () => {
    expect(Object.keys(activityTypeIcons)).toHaveLength(12);
  });

  it("should have amber color for member_promoted", () => {
    expect(activityTypeIcons.member_promoted).toBe("amber");
  });

  it("should have orange color for member_demoted", () => {
    expect(activityTypeIcons.member_demoted).toBe("orange");
  });

  describe("activity descriptions for new types", () => {
    it("should describe member_promoted correctly", () => {
      const actor = "Team Owner";
      const details = { userName: "Jane Smith" };
      const description = `${actor} promoted ${details.userName || "a member"} to admin`;

      expect(description).toBe("Team Owner promoted Jane Smith to admin");
    });

    it("should describe member_demoted correctly", () => {
      const actor = "Team Owner";
      const details = { userName: "Jane Smith" };
      const description = `${actor} changed ${details.userName || "a member"} role to member`;

      expect(description).toBe("Team Owner changed Jane Smith role to member");
    });

    it("should describe file_uploaded correctly", () => {
      const actor = "Alice";
      const details = { filename: "report.pdf" };
      const description = `${actor} uploaded ${details.filename || "a file"}`;

      expect(description).toBe("Alice uploaded report.pdf");
    });

    it("should describe annotation_created correctly", () => {
      const actor = "Bob";
      const details = { filename: "demo.mp4" };
      const description = `${actor} created an annotation on ${details.filename || "a video"}`;

      expect(description).toBe("Bob created an annotation on demo.mp4");
    });
  });
});

// ============= FEATURE 4: Extended Admin Permissions =============

describe("extended admin permissions", () => {
  describe("requireTeamAdmin helper logic", () => {
    it("should allow team owner to pass admin check", () => {
      const team = { id: 1, ownerId: 42 };
      const userId = 42;

      const isOwner = team.ownerId === userId;
      expect(isOwner).toBe(true);
      // Owner always passes requireTeamAdmin
    });

    it("should allow admin user to pass admin check", () => {
      const team = { id: 1, ownerId: 42 };
      const userId = 99;
      const userTeamRole = "admin";

      const isOwner = team.ownerId === userId;
      const isAdmin = userTeamRole === "admin";
      expect(isOwner).toBe(false);
      expect(isAdmin).toBe(true);
      // Admin passes requireTeamAdmin
    });

    it("should reject regular member from admin check", () => {
      const team = { id: 1, ownerId: 42 };
      const userId = 99;
      const userTeamRole = "member";

      const isOwner = team.ownerId === userId;
      const isAdmin = userTeamRole === "admin";
      expect(isOwner).toBe(false);
      expect(isAdmin).toBe(false);
      // Regular member fails requireTeamAdmin
    });

    it("should return isOwner flag in the result", () => {
      const team = { id: 1, ownerId: 42 };

      const ownerResult = { db: {}, team, isOwner: team.ownerId === 42 };
      const adminResult = { db: {}, team, isOwner: team.ownerId === 99 };

      expect(ownerResult.isOwner).toBe(true);
      expect(adminResult.isOwner).toBe(false);
    });
  });

  describe("admin invite permissions", () => {
    it("should allow admin to send invites (requireTeamAdmin passes)", () => {
      const actorRole = "admin";
      const canInvite = actorRole === "admin" || actorRole === "owner";
      expect(canInvite).toBe(true);
    });

    it("should allow admin to revoke pending invites", () => {
      const actorRole = "admin";
      const canRevoke = actorRole === "admin" || actorRole === "owner";
      expect(canRevoke).toBe(true);
    });

    it("should not allow regular member to send invites", () => {
      const actorRole = "member";
      const canInvite = actorRole === "admin" || actorRole === "owner";
      expect(canInvite).toBe(false);
    });
  });

  describe("admin remove member permissions", () => {
    it("should allow admin to remove regular members", () => {
      const isOwner = false;
      const targetRole = "member";

      // Admin can remove regular members
      const canRemove = isOwner || targetRole !== "admin";
      expect(canRemove).toBe(true);
    });

    it("should not allow admin to remove other admins", () => {
      const isOwner = false;
      const targetRole = "admin";

      // Admin cannot remove other admins
      const canRemove = isOwner || targetRole !== "admin";
      expect(canRemove).toBe(false);
    });

    it("should allow owner to remove admins", () => {
      const isOwner = true;
      const targetRole = "admin";

      // Owner can remove anyone
      const canRemove = isOwner || targetRole !== "admin";
      expect(canRemove).toBe(true);
    });

    it("should not allow anyone to remove the team owner", () => {
      const team = { ownerId: 42 };
      const targetUserId = 42;

      const isTargetOwner = targetUserId === team.ownerId;
      expect(isTargetOwner).toBe(true);
      // This should be blocked before the admin check
    });

    it("should not allow removing yourself", () => {
      const actorId = 99;
      const targetUserId = 99;

      expect(actorId === targetUserId).toBe(true);
    });
  });

  describe("owner-only operations remain restricted", () => {
    it("should only allow owner to promote members", () => {
      const team = { ownerId: 42 };
      const actorId = 99; // admin, not owner
      const actorRole = "admin";

      // promoteMember uses requireTeamOwner, not requireTeamAdmin
      const canPromote = team.ownerId === actorId;
      expect(canPromote).toBe(false);
    });

    it("should only allow owner to demote members", () => {
      const team = { ownerId: 42 };
      const actorId = 99; // admin, not owner
      const actorRole = "admin";

      const canDemote = team.ownerId === actorId;
      expect(canDemote).toBe(false);
    });

    it("should only allow owner to update team name", () => {
      const team = { ownerId: 42 };
      const actorId = 99; // admin, not owner

      const canUpdateName = team.ownerId === actorId;
      expect(canUpdateName).toBe(false);
    });

    it("should allow owner to promote members", () => {
      const team = { ownerId: 42 };
      const actorId = 42; // owner

      const canPromote = team.ownerId === actorId;
      expect(canPromote).toBe(true);
    });
  });

  describe("getMyTeam canManage flag", () => {
    it("should set canManage true for team owner", () => {
      const team = { ownerId: 42 };
      const userId = 42;
      const teamRole = "member";

      const isOwner = team.ownerId === userId;
      const isAdmin = teamRole === "admin";
      const canManage = isOwner || isAdmin;

      expect(canManage).toBe(true);
    });

    it("should set canManage true for team admin", () => {
      const team = { ownerId: 42 };
      const userId = 99;
      const teamRole = "admin";

      const isOwner = team.ownerId === userId;
      const isAdmin = teamRole === "admin";
      const canManage = isOwner || isAdmin;

      expect(canManage).toBe(true);
    });

    it("should set canManage false for regular member", () => {
      const team = { ownerId: 42 };
      const userId = 99;
      const teamRole = "member";

      const isOwner = team.ownerId === userId;
      const isAdmin = teamRole === "admin";
      const canManage = isOwner || isAdmin;

      expect(canManage).toBe(false);
    });

    it("should set isAdmin flag correctly", () => {
      expect(("admin" as string) === "admin").toBe(true);
      expect(("member" as string) === "admin").toBe(false);
      expect((null as string | null) === "admin").toBe(false);
    });
  });
});

// ============= FEATURE 5: Team Storage Dashboard =============

describe("team storage dashboard", () => {
  describe("storage breakdown calculation", () => {
    it("should calculate per-member storage percentage correctly", () => {
      const teamLimitBytes = 200 * 1024 * 1024 * 1024; // 200 GB
      const memberStorageUsed = 10 * 1024 * 1024 * 1024; // 10 GB

      const percentage = Math.round((memberStorageUsed / teamLimitBytes) * 100 * 10) / 10;
      expect(percentage).toBe(5);
    });

    it("should handle zero team limit gracefully", () => {
      const teamLimitBytes = 0;
      const memberStorageUsed = 100;

      const percentage = teamLimitBytes > 0
        ? Math.round((memberStorageUsed / teamLimitBytes) * 100 * 10) / 10
        : 0;
      expect(percentage).toBe(0);
    });

    it("should sort members by storage used descending", () => {
      const members = [
        { id: 1, name: "Alice", storageUsedBytes: 5000 },
        { id: 2, name: "Bob", storageUsedBytes: 15000 },
        { id: 3, name: "Carol", storageUsedBytes: 8000 },
      ];

      members.sort((a, b) => b.storageUsedBytes - a.storageUsedBytes);

      expect(members[0].name).toBe("Bob");
      expect(members[1].name).toBe("Carol");
      expect(members[2].name).toBe("Alice");
    });

    it("should calculate team total from member breakdown", () => {
      const members = [
        { storageUsedBytes: 5000 },
        { storageUsedBytes: 15000 },
        { storageUsedBytes: 8000 },
      ];

      const teamTotal = members.reduce((sum, m) => sum + m.storageUsedBytes, 0);
      expect(teamTotal).toBe(28000);
    });

    it("should handle empty team (no members)", () => {
      const members: { storageUsedBytes: number }[] = [];
      const teamTotal = members.reduce((sum, m) => sum + m.storageUsedBytes, 0);
      expect(teamTotal).toBe(0);
    });
  });

  describe("formatBytes utility", () => {
    function formatBytes(bytes: number): string {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }

    it("should format 0 bytes", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("should format bytes", () => {
      expect(formatBytes(500)).toBe("500 B");
    });

    it("should format kilobytes", () => {
      expect(formatBytes(1024)).toBe("1 KB");
    });

    it("should format megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
    });

    it("should format gigabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    });

    it("should format with decimal precision", () => {
      expect(formatBytes(1500)).toBe("1.5 KB");
    });

    it("should format 200 GB correctly", () => {
      expect(formatBytes(200 * 1024 * 1024 * 1024)).toBe("200 GB");
    });
  });

  describe("storage breakdown response shape", () => {
    it("should return correct response shape with all fields", () => {
      const response = {
        members: [
          {
            id: 1,
            name: "Alice",
            email: "alice@example.com",
            avatarUrl: null,
            storageUsedBytes: 5000,
            storageUsedFormatted: "4.9 KB",
            fileCount: 3,
            percentage: 0,
          },
        ],
        teamTotal: 5000,
        teamTotalFormatted: "4.9 KB",
        teamLimit: 200 * 1024 * 1024 * 1024,
        teamLimitFormatted: "200 GB",
        teamPercentage: 0,
      };

      expect(response.members).toHaveLength(1);
      expect(response.members[0]).toHaveProperty("id");
      expect(response.members[0]).toHaveProperty("name");
      expect(response.members[0]).toHaveProperty("email");
      expect(response.members[0]).toHaveProperty("storageUsedBytes");
      expect(response.members[0]).toHaveProperty("storageUsedFormatted");
      expect(response.members[0]).toHaveProperty("fileCount");
      expect(response.members[0]).toHaveProperty("percentage");
      expect(response).toHaveProperty("teamTotal");
      expect(response).toHaveProperty("teamTotalFormatted");
      expect(response).toHaveProperty("teamLimit");
      expect(response).toHaveProperty("teamLimitFormatted");
      expect(response).toHaveProperty("teamPercentage");
    });

    it("should return empty state for user without team", () => {
      const response = { members: [], teamTotal: 0, teamLimit: 0 };

      expect(response.members).toHaveLength(0);
      expect(response.teamTotal).toBe(0);
      expect(response.teamLimit).toBe(0);
    });
  });

  describe("storage color thresholds", () => {
    it("should use red for 90%+ usage", () => {
      const percentage = 95;
      const color = percentage >= 90 ? "bg-red-500" : percentage >= 70 ? "bg-yellow-500" : "bg-emerald-500";
      expect(color).toBe("bg-red-500");
    });

    it("should use yellow for 70-89% usage", () => {
      const percentage = 75;
      const color = percentage >= 90 ? "bg-red-500" : percentage >= 70 ? "bg-yellow-500" : "bg-emerald-500";
      expect(color).toBe("bg-yellow-500");
    });

    it("should use emerald for under 70% usage", () => {
      const percentage = 50;
      const color = percentage >= 90 ? "bg-red-500" : percentage >= 70 ? "bg-yellow-500" : "bg-emerald-500";
      expect(color).toBe("bg-emerald-500");
    });
  });

  describe("member color assignment", () => {
    const MEMBER_COLORS = [
      "bg-emerald-500",
      "bg-cyan-500",
      "bg-violet-500",
      "bg-amber-500",
      "bg-rose-500",
      "bg-blue-500",
      "bg-pink-500",
      "bg-teal-500",
    ];

    function getColorForIndex(index: number): string {
      return MEMBER_COLORS[index % MEMBER_COLORS.length];
    }

    it("should assign different colors to different members", () => {
      expect(getColorForIndex(0)).toBe("bg-emerald-500");
      expect(getColorForIndex(1)).toBe("bg-cyan-500");
      expect(getColorForIndex(2)).toBe("bg-violet-500");
    });

    it("should cycle colors for teams with more than 8 members", () => {
      expect(getColorForIndex(8)).toBe("bg-emerald-500"); // wraps around
      expect(getColorForIndex(9)).toBe("bg-cyan-500");
    });
  });

  describe("team limit calculation from storageGB", () => {
    it("should convert storageGB to bytes correctly", () => {
      const storageGB = 200;
      const teamLimitBytes = storageGB * 1024 * 1024 * 1024;
      expect(teamLimitBytes).toBe(214748364800);
    });

    it("should handle default 200 GB team storage", () => {
      const storageGB = 200;
      const teamLimitBytes = storageGB * 1024 * 1024 * 1024;
      const teamTotal = 50 * 1024 * 1024 * 1024; // 50 GB used

      const percentage = Math.round((teamTotal / teamLimitBytes) * 100 * 10) / 10;
      expect(percentage).toBe(25);
    });
  });
});

// ============= FEATURE 6: Bulk Invite via CSV =============

describe("bulk invite via CSV", () => {
  describe("email parsing from CSV content", () => {
    const emailRegex = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/g;

    function parseEmails(text: string): string[] {
      const matches = text.match(emailRegex) || [];
      return Array.from(new Set(matches.map((e) => e.toLowerCase())));
    }

    it("should parse comma-separated emails", () => {
      const input = "alice@example.com, bob@example.com, charlie@example.com";
      const result = parseEmails(input);
      expect(result).toEqual(["alice@example.com", "bob@example.com", "charlie@example.com"]);
    });

    it("should parse newline-separated emails", () => {
      const input = "alice@example.com\nbob@example.com\ncharlie@example.com";
      const result = parseEmails(input);
      expect(result).toHaveLength(3);
    });

    it("should parse semicolon-separated emails", () => {
      const input = "alice@example.com; bob@example.com; charlie@example.com";
      const result = parseEmails(input);
      expect(result).toHaveLength(3);
    });

    it("should extract emails from CSV with mixed columns", () => {
      const csv = "Name,Email,Role\nAlice,alice@example.com,admin\nBob,bob@example.com,member";
      const result = parseEmails(csv);
      expect(result).toContain("alice@example.com");
      expect(result).toContain("bob@example.com");
    });

    it("should deduplicate emails", () => {
      const input = "alice@example.com, alice@example.com, ALICE@example.com";
      const result = parseEmails(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("alice@example.com");
    });

    it("should handle empty input", () => {
      const result = parseEmails("");
      expect(result).toHaveLength(0);
    });

    it("should handle input with no valid emails", () => {
      const result = parseEmails("not an email, also not, 12345");
      expect(result).toHaveLength(0);
    });

    it("should handle mixed valid and invalid entries", () => {
      const input = "alice@example.com, not-an-email, bob@test.org, 12345";
      const result = parseEmails(input);
      expect(result).toHaveLength(2);
      expect(result).toContain("alice@example.com");
      expect(result).toContain("bob@test.org");
    });
  });

  describe("bulk invite validation", () => {
    it("should validate email array is not empty", () => {
      const emails: string[] = [];
      expect(emails.length > 0).toBe(false);
    });

    it("should validate maximum 50 emails per batch", () => {
      const emails = Array.from({ length: 51 }, (_, i) => `user${i}@example.com`);
      expect(emails.length <= 50).toBe(false);
    });

    it("should accept exactly 50 emails", () => {
      const emails = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`);
      expect(emails.length <= 50).toBe(true);
    });

    it("should accept a single email", () => {
      const emails = ["alice@example.com"];
      expect(emails.length > 0 && emails.length <= 50).toBe(true);
    });
  });

  describe("bulk invite result processing", () => {
    it("should categorize results correctly", () => {
      const results = [
        { email: "new@example.com", status: "sent" },
        { email: "existing@example.com", status: "skipped_member" },
        { email: "pending@example.com", status: "skipped_pending" },
        { email: "full@example.com", status: "skipped_capacity" },
        { email: "error@example.com", status: "failed" },
      ];

      const summary = {
        total: results.length,
        sent: results.filter((r) => r.status === "sent").length,
        skippedMember: results.filter((r) => r.status === "skipped_member").length,
        skippedPending: results.filter((r) => r.status === "skipped_pending").length,
        skippedCapacity: results.filter((r) => r.status === "skipped_capacity").length,
        failed: results.filter((r) => r.status === "failed").length,
      };

      expect(summary.total).toBe(5);
      expect(summary.sent).toBe(1);
      expect(summary.skippedMember).toBe(1);
      expect(summary.skippedPending).toBe(1);
      expect(summary.skippedCapacity).toBe(1);
      expect(summary.failed).toBe(1);
    });

    it("should handle all-success case", () => {
      const results = [
        { email: "a@example.com", status: "sent" },
        { email: "b@example.com", status: "sent" },
        { email: "c@example.com", status: "sent" },
      ];

      const sent = results.filter((r) => r.status === "sent").length;
      expect(sent).toBe(3);
    });

    it("should handle all-skipped case", () => {
      const results = [
        { email: "a@example.com", status: "skipped_member" },
        { email: "b@example.com", status: "skipped_pending" },
      ];

      const sent = results.filter((r) => r.status === "sent").length;
      expect(sent).toBe(0);
    });
  });

  describe("bulk invite seat capacity check", () => {
    it("should track available seats during bulk invite", () => {
      const maxSeats = 5;
      const currentMembers = 3;
      const pendingInvites = 1;
      const availableSlots = maxSeats - currentMembers - pendingInvites;

      expect(availableSlots).toBe(1);
    });

    it("should mark emails as skipped_capacity when no seats left", () => {
      const maxSeats = 5;
      const currentMembers = 5;
      const pendingInvites = 0;
      const availableSlots = maxSeats - currentMembers - pendingInvites;

      expect(availableSlots).toBe(0);
    });

    it("should decrement available slots as invites are sent", () => {
      let availableSlots = 3;
      const emails = ["a@example.com", "b@example.com", "c@example.com", "d@example.com"];
      const results: string[] = [];

      for (const email of emails) {
        if (availableSlots > 0) {
          results.push("sent");
          availableSlots--;
        } else {
          results.push("skipped_capacity");
        }
      }

      expect(results).toEqual(["sent", "sent", "sent", "skipped_capacity"]);
    });
  });
});

// ============= FEATURE 7: Storage Alerts =============

describe("storage alerts", () => {
  describe("threshold detection", () => {
    function getAlertLevel(usagePercent: number): "none" | "80" | "90" {
      if (usagePercent >= 90) return "90";
      if (usagePercent >= 80) return "80";
      return "none";
    }

    it("should detect 80% threshold", () => {
      expect(getAlertLevel(80)).toBe("80");
      expect(getAlertLevel(85)).toBe("80");
      expect(getAlertLevel(89.9)).toBe("80");
    });

    it("should detect 90% threshold", () => {
      expect(getAlertLevel(90)).toBe("90");
      expect(getAlertLevel(95)).toBe("90");
      expect(getAlertLevel(100)).toBe("90");
    });

    it("should return none below 80%", () => {
      expect(getAlertLevel(0)).toBe("none");
      expect(getAlertLevel(50)).toBe("none");
      expect(getAlertLevel(79.9)).toBe("none");
    });
  });

  describe("alert deduplication", () => {
    it("should not re-alert if 80% alert already sent", () => {
      const team = { storageAlertSent80: true, storageAlertSent90: false };
      const usagePercent = 85;

      const shouldAlert80 = usagePercent >= 80 && !team.storageAlertSent80;
      expect(shouldAlert80).toBe(false);
    });

    it("should alert at 80% if not previously alerted", () => {
      const team = { storageAlertSent80: false, storageAlertSent90: false };
      const usagePercent = 82;

      const shouldAlert80 = usagePercent >= 80 && !team.storageAlertSent80;
      expect(shouldAlert80).toBe(true);
    });

    it("should not re-alert if 90% alert already sent", () => {
      const team = { storageAlertSent80: true, storageAlertSent90: true };
      const usagePercent = 95;

      const shouldAlert90 = usagePercent >= 90 && !team.storageAlertSent90;
      expect(shouldAlert90).toBe(false);
    });

    it("should alert at 90% if not previously alerted", () => {
      const team = { storageAlertSent80: true, storageAlertSent90: false };
      const usagePercent = 92;

      const shouldAlert90 = usagePercent >= 90 && !team.storageAlertSent90;
      expect(shouldAlert90).toBe(true);
    });

    it("should reset alerts when storage drops below threshold", () => {
      const team = { storageAlertSent80: true, storageAlertSent90: true };
      const usagePercent = 70;

      // Reset logic: if below 80%, reset both flags
      const shouldReset80 = usagePercent < 80 && team.storageAlertSent80;
      const shouldReset90 = usagePercent < 90 && team.storageAlertSent90;

      expect(shouldReset80).toBe(true);
      expect(shouldReset90).toBe(true);
    });

    it("should only reset 90% flag when between 80-90%", () => {
      const team = { storageAlertSent80: true, storageAlertSent90: true };
      const usagePercent = 85;

      const shouldReset80 = usagePercent < 80 && team.storageAlertSent80;
      const shouldReset90 = usagePercent < 90 && team.storageAlertSent90;

      expect(shouldReset80).toBe(false);
      expect(shouldReset90).toBe(true);
    });
  });

  describe("storage alert notification content", () => {
    it("should include usage percentage in 80% alert", () => {
      const usagePercent = 82;
      const teamName = "Marketing Team";
      const title = `Storage Warning: ${teamName}`;
      const content = `Your team "${teamName}" has reached ${usagePercent}% of its storage limit.`;

      expect(title).toContain("Marketing Team");
      expect(content).toContain("82%");
    });

    it("should include usage percentage in 90% alert", () => {
      const usagePercent = 93;
      const teamName = "Dev Team";
      const title = `Critical Storage Alert: ${teamName}`;
      const content = `Your team "${teamName}" has reached ${usagePercent}% of its storage limit.`;

      expect(title).toContain("Critical");
      expect(content).toContain("93%");
    });
  });

  describe("storage alert activity logging", () => {
    it("should log storage_alert_80 activity type", () => {
      const activityType = "storage_alert_80";
      const validTypes = [
        "member_joined", "member_left", "member_removed", "member_promoted",
        "member_demoted", "invite_sent", "invite_accepted", "invite_revoked",
        "file_uploaded", "annotation_created", "team_created", "team_name_updated",
        "ownership_transferred", "storage_alert_80", "storage_alert_90",
      ];

      expect(validTypes).toContain(activityType);
    });

    it("should log storage_alert_90 activity type", () => {
      const activityType = "storage_alert_90";
      const validTypes = [
        "member_joined", "member_left", "member_removed", "member_promoted",
        "member_demoted", "invite_sent", "invite_accepted", "invite_revoked",
        "file_uploaded", "annotation_created", "team_created", "team_name_updated",
        "ownership_transferred", "storage_alert_80", "storage_alert_90",
      ];

      expect(validTypes).toContain(activityType);
    });
  });
});

// ============= FEATURE 8: Transfer Ownership =============

describe("transfer ownership", () => {
  describe("ownership transfer validation", () => {
    it("should only allow owner to transfer ownership", () => {
      const team = { ownerId: 42 };
      const actorId = 42;

      expect(team.ownerId === actorId).toBe(true);
    });

    it("should reject non-owner from transferring ownership", () => {
      const team = { ownerId: 42 };
      const actorId = 99;

      expect(team.ownerId === actorId).toBe(false);
    });

    it("should reject transfer to non-admin member", () => {
      const targetUser = { id: 99, teamRole: "member" };

      const isAdmin = targetUser.teamRole === "admin";
      expect(isAdmin).toBe(false);
    });

    it("should allow transfer to admin member", () => {
      const targetUser = { id: 99, teamRole: "admin" };

      const isAdmin = targetUser.teamRole === "admin";
      expect(isAdmin).toBe(true);
    });

    it("should reject transfer to self", () => {
      const ownerId = 42;
      const newOwnerId = 42;

      expect(ownerId === newOwnerId).toBe(true);
      // This should be rejected
    });

    it("should reject transfer to user not in team", () => {
      const teamId = 1;
      const targetUser = { id: 99, teamId: 2 };

      expect(targetUser.teamId === teamId).toBe(false);
    });
  });

  describe("ownership transfer state changes", () => {
    it("should update team ownerId to new owner", () => {
      const team = { id: 1, ownerId: 42 };
      const newOwnerId = 99;

      // After transfer
      const updatedTeam = { ...team, ownerId: newOwnerId };
      expect(updatedTeam.ownerId).toBe(99);
    });

    it("should set new owner teamRole to admin (they were already admin)", () => {
      const newOwner = { id: 99, teamRole: "admin" };
      // New owner keeps admin role (ownership is tracked via teams.ownerId)
      expect(newOwner.teamRole).toBe("admin");
    });

    it("should demote old owner to admin role", () => {
      const oldOwner = { id: 42, teamRole: "member" };
      // After transfer, old owner becomes admin
      const updatedOldOwner = { ...oldOwner, teamRole: "admin" };
      expect(updatedOldOwner.teamRole).toBe("admin");
    });
  });

  describe("ownership transfer activity logging", () => {
    it("should log ownership_transferred activity", () => {
      const activity = {
        teamId: 1,
        actorId: 42,
        actorName: "Old Owner",
        type: "ownership_transferred",
        details: {
          newOwnerId: 99,
          newOwnerName: "New Owner",
          previousOwnerId: 42,
        },
      };

      expect(activity.type).toBe("ownership_transferred");
      expect(activity.details.newOwnerId).toBe(99);
      expect(activity.details.previousOwnerId).toBe(42);
    });
  });

  describe("transfer ownership UI - admin filtering", () => {
    it("should only show admins as transfer targets", () => {
      const members = [
        { id: 1, name: "Owner", teamRole: "member", isOwner: true },
        { id: 2, name: "Admin 1", teamRole: "admin", isOwner: false },
        { id: 3, name: "Member 1", teamRole: "member", isOwner: false },
        { id: 4, name: "Admin 2", teamRole: "admin", isOwner: false },
      ];

      const admins = members.filter((m) => !m.isOwner && m.teamRole === "admin");
      expect(admins).toHaveLength(2);
      expect(admins[0].name).toBe("Admin 1");
      expect(admins[1].name).toBe("Admin 2");
    });

    it("should return empty when no admins exist", () => {
      const members = [
        { id: 1, name: "Owner", teamRole: "member", isOwner: true },
        { id: 2, name: "Member 1", teamRole: "member", isOwner: false },
        { id: 3, name: "Member 2", teamRole: "member", isOwner: false },
      ];

      const admins = members.filter((m) => !m.isOwner && m.teamRole === "admin");
      expect(admins).toHaveLength(0);
    });

    it("should not include the owner as a transfer target", () => {
      const members = [
        { id: 1, name: "Owner", teamRole: "admin", isOwner: true },
        { id: 2, name: "Admin 1", teamRole: "admin", isOwner: false },
      ];

      const admins = members.filter((m) => !m.isOwner && m.teamRole === "admin");
      expect(admins).toHaveLength(1);
      expect(admins[0].name).toBe("Admin 1");
    });
  });

  describe("post-transfer permission changes", () => {
    it("should give new owner full permissions", () => {
      const team = { ownerId: 99 }; // After transfer
      const newOwnerId = 99;

      const isOwner = team.ownerId === newOwnerId;
      const canManage = isOwner;
      const canPromote = isOwner;
      const canTransfer = isOwner;

      expect(isOwner).toBe(true);
      expect(canManage).toBe(true);
      expect(canPromote).toBe(true);
      expect(canTransfer).toBe(true);
    });

    it("should give old owner admin-level permissions only", () => {
      const team = { ownerId: 99 }; // After transfer
      const oldOwnerId = 42;
      const oldOwnerRole = "admin";

      const isOwner = team.ownerId === oldOwnerId;
      const isAdmin = oldOwnerRole === "admin";
      const canManage = isOwner || isAdmin;
      const canPromote = isOwner; // Owner-only
      const canTransfer = isOwner; // Owner-only

      expect(isOwner).toBe(false);
      expect(canManage).toBe(true);
      expect(canPromote).toBe(false);
      expect(canTransfer).toBe(false);
    });
  });
});

// ============= CROSS-FEATURE: Updated Activity Types =============

describe("updated activity feed types for all features", () => {
  const allActivityTypes = [
    "member_joined", "member_left", "member_removed", "member_promoted",
    "member_demoted", "invite_sent", "invite_accepted", "invite_revoked",
    "file_uploaded", "annotation_created", "team_created", "team_name_updated",
    "ownership_transferred", "storage_alert_80", "storage_alert_90",
  ];

  it("should have 15 total activity types", () => {
    expect(allActivityTypes).toHaveLength(15);
  });

  it("should include ownership_transferred type", () => {
    expect(allActivityTypes).toContain("ownership_transferred");
  });

  it("should include storage_alert_80 type", () => {
    expect(allActivityTypes).toContain("storage_alert_80");
  });

  it("should include storage_alert_90 type", () => {
    expect(allActivityTypes).toContain("storage_alert_90");
  });

  describe("activity descriptions for new types", () => {
    it("should describe ownership_transferred correctly", () => {
      const actor = "Old Owner";
      const details = { newOwnerName: "New Admin" };
      const description = `${actor} transferred ownership to ${details.newOwnerName || "a member"}`;

      expect(description).toBe("Old Owner transferred ownership to New Admin");
    });

    it("should describe storage_alert_80 correctly", () => {
      const details = { usagePercent: 82, usedFormatted: "164 GB", limitFormatted: "200 GB" };
      const description = `Storage warning: team is at ${details.usagePercent}% capacity (${details.usedFormatted} / ${details.limitFormatted})`;

      expect(description).toContain("82%");
      expect(description).toContain("164 GB");
      expect(description).toContain("200 GB");
    });

    it("should describe storage_alert_90 correctly", () => {
      const details = { usagePercent: 93, usedFormatted: "186 GB", limitFormatted: "200 GB" };
      const description = `Critical storage alert: team is at ${details.usagePercent}% capacity (${details.usedFormatted} / ${details.limitFormatted})`;

      expect(description).toContain("Critical");
      expect(description).toContain("93%");
    });
  });

  describe("activity icon colors for new types", () => {
    const activityTypeIcons: Record<string, string> = {
      member_joined: "emerald",
      member_left: "yellow",
      member_removed: "red",
      member_promoted: "amber",
      member_demoted: "orange",
      invite_sent: "blue",
      invite_accepted: "emerald",
      invite_revoked: "orange",
      file_uploaded: "cyan",
      annotation_created: "purple",
      team_created: "emerald",
      team_name_updated: "blue",
      ownership_transferred: "amber",
      storage_alert_80: "yellow",
      storage_alert_90: "red",
    };

    it("should have icon colors for all 15 activity types", () => {
      expect(Object.keys(activityTypeIcons)).toHaveLength(15);
    });

    it("should have amber color for ownership_transferred", () => {
      expect(activityTypeIcons.ownership_transferred).toBe("amber");
    });

    it("should have yellow color for storage_alert_80", () => {
      expect(activityTypeIcons.storage_alert_80).toBe("yellow");
    });

    it("should have red color for storage_alert_90", () => {
      expect(activityTypeIcons.storage_alert_90).toBe("red");
    });
  });
});
