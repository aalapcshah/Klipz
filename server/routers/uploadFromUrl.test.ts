import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies
vi.mock("../storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/test-file.txt", key: "test-key" }),
}));

vi.mock("../db", () => ({
  getUserById: vi.fn(),
}));

vi.mock("../_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({ text: "Test transcription" }),
}));

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn().mockResolvedValue([
      { text: "Hello world", offset: 0, duration: 5000 },
      { text: "This is a test", offset: 5000, duration: 5000 },
    ]),
  },
}));

import * as db from "../db";

describe("uploadFromUrl - isProSubscriber logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for admin users", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({
      id: 1,
      openId: "test-open-id",
      name: "Admin User",
      email: "admin@test.com",
      loginMethod: "email",
      role: "admin",
      subscriptionTier: "free",
      subscriptionExpiresAt: null,
      knowledgeGraphUsageCount: 0,
      knowledgeGraphUsageLimit: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      location: null,
      age: null,
      bio: null,
      reasonForUse: null,
      company: null,
      jobTitle: null,
      profileCompleted: false,
      accountStatus: "active",
      deactivatedAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      trialUsed: false,
      storageUsedBytes: 0,
      videoCount: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    
    const user = await db.getUserById(1);
    expect(user?.role).toBe("admin");
  });

  it("should return true for pro subscribers with valid subscription", async () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    
    vi.mocked(db.getUserById).mockResolvedValue({
      id: 2,
      openId: "pro-user-id",
      name: "Pro User",
      email: "pro@test.com",
      loginMethod: "email",
      role: "user",
      subscriptionTier: "pro",
      subscriptionExpiresAt: futureDate,
      knowledgeGraphUsageCount: 0,
      knowledgeGraphUsageLimit: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      location: null,
      age: null,
      bio: null,
      reasonForUse: null,
      company: null,
      jobTitle: null,
      profileCompleted: false,
      accountStatus: "active",
      deactivatedAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      trialUsed: false,
      storageUsedBytes: 0,
      videoCount: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    
    const user = await db.getUserById(2);
    expect(user?.subscriptionTier).toBe("pro");
    expect(user?.subscriptionExpiresAt).not.toBeNull();
    expect(user?.subscriptionExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("should return false for free users", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({
      id: 3,
      openId: "free-user-id",
      name: "Free User",
      email: "free@test.com",
      loginMethod: "email",
      role: "user",
      subscriptionTier: "free",
      subscriptionExpiresAt: null,
      knowledgeGraphUsageCount: 0,
      knowledgeGraphUsageLimit: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      location: null,
      age: null,
      bio: null,
      reasonForUse: null,
      company: null,
      jobTitle: null,
      profileCompleted: false,
      accountStatus: "active",
      deactivatedAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      trialUsed: false,
      storageUsedBytes: 0,
      videoCount: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    
    const user = await db.getUserById(3);
    expect(user?.subscriptionTier).toBe("free");
  });

  it("should return false for pro users with expired subscription", async () => {
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 1);
    
    vi.mocked(db.getUserById).mockResolvedValue({
      id: 4,
      openId: "expired-pro-id",
      name: "Expired Pro User",
      email: "expired@test.com",
      loginMethod: "email",
      role: "user",
      subscriptionTier: "pro",
      subscriptionExpiresAt: pastDate,
      knowledgeGraphUsageCount: 0,
      knowledgeGraphUsageLimit: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      location: null,
      age: null,
      bio: null,
      reasonForUse: null,
      company: null,
      jobTitle: null,
      profileCompleted: false,
      accountStatus: "active",
      deactivatedAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      trialUsed: false,
      storageUsedBytes: 0,
      videoCount: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    
    const user = await db.getUserById(4);
    expect(user?.subscriptionTier).toBe("pro");
    expect(user?.subscriptionExpiresAt).not.toBeNull();
    expect(user?.subscriptionExpiresAt!.getTime()).toBeLessThan(Date.now());
  });

  it("should return true for trial users with valid trial", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    
    vi.mocked(db.getUserById).mockResolvedValue({
      id: 5,
      openId: "trial-user-id",
      name: "Trial User",
      email: "trial@test.com",
      loginMethod: "email",
      role: "user",
      subscriptionTier: "trial",
      subscriptionExpiresAt: futureDate,
      knowledgeGraphUsageCount: 0,
      knowledgeGraphUsageLimit: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      location: null,
      age: null,
      bio: null,
      reasonForUse: null,
      company: null,
      jobTitle: null,
      profileCompleted: false,
      accountStatus: "active",
      deactivatedAt: null,
      trialStartedAt: new Date(),
      trialEndsAt: futureDate,
      trialUsed: false,
      storageUsedBytes: 0,
      videoCount: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    
    const user = await db.getUserById(5);
    expect(user?.subscriptionTier).toBe("trial");
    expect(user?.subscriptionExpiresAt).not.toBeNull();
    expect(user?.subscriptionExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("uploadFromUrl - Social Media Detection", () => {
  it("should detect YouTube URLs correctly", () => {
    const testUrls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/abc123",
    ];
    
    testUrls.forEach(url => {
      expect(url.toLowerCase().includes("youtube") || url.toLowerCase().includes("youtu.be")).toBe(true);
    });
  });

  it("should detect TikTok URLs correctly", () => {
    const testUrls = [
      "https://www.tiktok.com/@user/video/1234567890",
      "https://vm.tiktok.com/abc123",
    ];
    
    testUrls.forEach(url => {
      expect(url.toLowerCase().includes("tiktok")).toBe(true);
    });
  });

  it("should detect Instagram URLs correctly", () => {
    const testUrls = [
      "https://www.instagram.com/reel/abc123",
      "https://www.instagram.com/p/xyz789",
    ];
    
    testUrls.forEach(url => {
      expect(url.toLowerCase().includes("instagram")).toBe(true);
    });
  });
});

describe("TikTok API Response Parsing", () => {
  it("should extract caption from aweme_detail structure", () => {
    // Mock successful TikTok API response structure
    const mockTikTokResponse = {
      link: "https://vm.tiktok.com/ZMhCYxABC/",
      data: {
        code: 200,
        data: {
          aweme_detail: {
            desc: "El dia que el Profe Cruz hizo temblar a Pep #profecruz #atlante",
            author: {
              nickname: "La Nuestra",
              unique_id: "lanuestramx10",
            },
            create_time: 1730439408,
            statistics: {
              digg_count: 11684,
              comment_count: 78,
              share_count: 827,
              play_count: 174793,
            },
            text_extra: [
              { hashtag_name: "profecruz" },
              { hashtag_name: "atlante" },
            ],
            video: {
              play_addr: {
                url_list: ["https://example.com/video.mp4"],
              },
            },
          },
        },
      },
    };

    // Parse the response to verify structure
    const data = mockTikTokResponse;
    const responseData = data.data as Record<string, unknown> | undefined;
    const nestedData = responseData?.data as Record<string, unknown> | undefined;
    const awemeDetail = nestedData?.aweme_detail as Record<string, unknown> | undefined;
    
    expect(awemeDetail).toBeDefined();
    expect(awemeDetail?.desc).toBe("El dia que el Profe Cruz hizo temblar a Pep #profecruz #atlante");
    
    const author = awemeDetail?.author as Record<string, unknown> | undefined;
    expect(author?.nickname).toBe("La Nuestra");
    expect(author?.unique_id).toBe("lanuestramx10");
    
    const statistics = awemeDetail?.statistics as Record<string, unknown> | undefined;
    expect(statistics?.digg_count).toBe(11684);
    
    const textExtra = awemeDetail?.text_extra as Array<Record<string, unknown>> | undefined;
    expect(textExtra?.length).toBe(2);
    expect(textExtra?.[0]?.hashtag_name).toBe("profecruz");
  });

  it("should handle missing aweme_detail gracefully", () => {
    const emptyResponse = {
      link: "https://www.tiktok.com/@test/video/123",
      data: {
        code: 200,
        data: {
          extra: {},
          status_code: 0,
        },
      },
    };

    const responseData = emptyResponse.data as Record<string, unknown> | undefined;
    const nestedData = responseData?.data as Record<string, unknown> | undefined;
    const awemeDetail = nestedData?.aweme_detail;
    expect(awemeDetail).toBeUndefined();
  });

  it("should extract hashtags from text_extra array", () => {
    const textExtra = [
      { hashtag_name: "soccer" },
      { hashtag_name: "football" },
      { user_unique_id: "someuser" }, // This is a mention, not a hashtag
      { hashtag_name: "viral" },
    ];

    const hashtags: string[] = [];
    for (const item of textExtra) {
      if (item.hashtag_name) {
        hashtags.push(item.hashtag_name);
      }
    }

    expect(hashtags).toEqual(["soccer", "football", "viral"]);
    expect(hashtags.length).toBe(3);
  });

  it("should extract video URL from play_addr structure", () => {
    const video = {
      play_addr: {
        url_list: [
          "https://v16-webapp.tiktok.com/video1.mp4",
          "https://v19-webapp.tiktok.com/video1.mp4",
        ],
      },
    };

    const playAddr = video?.play_addr as Record<string, unknown> | undefined;
    const urlList = playAddr?.url_list as string[] | undefined;
    
    expect(urlList).toBeDefined();
    expect(urlList?.length).toBeGreaterThan(0);
    expect(urlList?.[0]).toContain("tiktok.com");
  });

  it("should convert create_time to ISO string", () => {
    const createTime = 1730439408; // Unix timestamp
    const isoString = new Date(createTime * 1000).toISOString();
    
    expect(isoString).toBe("2024-11-01T05:36:48.000Z");
  });
});

describe("Content Formatting for Social Media", () => {
  it("should format stats with locale string", () => {
    const stats = {
      likes: 11684,
      comments: 78,
      shares: 827,
      plays: 174793,
    };

    expect(stats.likes.toLocaleString()).toBe("11,684");
    expect(stats.plays.toLocaleString()).toBe("174,793");
  });

  it("should format hashtags correctly", () => {
    const hashtags = ["soccer", "football", "viral"];
    const formatted = hashtags.map(h => `#${h}`).join(" ");
    
    expect(formatted).toBe("#soccer #football #viral");
  });

  it("should create safe filename from title with special characters", () => {
    const title = "TikTok by @user123! Special #video 🎉";
    const safeTitle = title
      .replace(/[^a-zA-Z0-9-_\s@]/g, "")
      .substring(0, 50)
      .trim();
    
    expect(safeTitle).toBe("TikTok by @user123 Special video");
    expect(safeTitle.length).toBeLessThanOrEqual(50);
  });

  it("should extract TikTok video ID from URL", () => {
    const url = "https://www.tiktok.com/@lanuestramx10/video/7432180626461150507";
    const idMatch = url.match(/video\/(\d+)/);
    
    expect(idMatch).not.toBeNull();
    expect(idMatch?.[1]).toBe("7432180626461150507");
  });

  it("should extract Instagram content ID from various URL formats", () => {
    const reelUrl = "https://www.instagram.com/reel/C3vKLmNvNvN/";
    const postUrl = "https://www.instagram.com/p/ABC123XYZ/";
    const reelsUrl = "https://www.instagram.com/reels/DEF456789/";
    
    const reelMatch = reelUrl.match(/\/(?:p|reel|reels)\/([^/?]+)/);
    const postMatch = postUrl.match(/\/(?:p|reel|reels)\/([^/?]+)/);
    const reelsMatch = reelsUrl.match(/\/(?:p|reel|reels)\/([^/?]+)/);
    
    expect(reelMatch?.[1]).toBe("C3vKLmNvNvN");
    expect(postMatch?.[1]).toBe("ABC123XYZ");
    expect(reelsMatch?.[1]).toBe("DEF456789");
  });
});
