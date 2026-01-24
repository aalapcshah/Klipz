import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { userOnboarding } from "../../drizzle/schema";
import { getDb } from "../db";
import { eq } from "drizzle-orm";

export const onboardingRouter = router({
  /**
   * Get user's onboarding progress
   */
  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get or create onboarding record using select
    const results = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.userId, userId))
      .limit(1);

    let progress = results[0];

    if (!progress) {
      // Create initial onboarding record
      await db.insert(userOnboarding).values({
        userId,
      });
      
      const newResults = await db
        .select()
        .from(userOnboarding)
        .where(eq(userOnboarding.userId, userId))
        .limit(1);
      
      progress = newResults[0];
    }

    return progress;
  }),

  /**
   * Update onboarding progress
   */
  updateProgress: protectedProcedure
    .input(
      z.object({
        tutorialCompleted: z.boolean().optional(),
        uploadFileCompleted: z.boolean().optional(),
        createAnnotationCompleted: z.boolean().optional(),
        useTemplateCompleted: z.boolean().optional(),
        addCommentCompleted: z.boolean().optional(),
        approveAnnotationCompleted: z.boolean().optional(),
        useKeyboardShortcutCompleted: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get or create onboarding record
      const results = await db
        .select()
        .from(userOnboarding)
        .where(eq(userOnboarding.userId, userId))
        .limit(1);

      if (results.length === 0) {
        await db.insert(userOnboarding).values({
          userId,
        });
      }

      // Update progress
      const updateData: any = {
        ...input,
        lastStepCompletedAt: new Date(),
      };

      if (input.tutorialCompleted) {
        updateData.tutorialCompletedAt = new Date();
      }

      await db
        .update(userOnboarding)
        .set(updateData)
        .where(eq(userOnboarding.userId, userId));

      return { success: true };
    }),

  /**
   * Skip tutorial
   */
  skipTutorial: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get or create onboarding record
    const results = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.userId, userId))
      .limit(1);

    if (results.length === 0) {
      await db.insert(userOnboarding).values({
        userId,
        tutorialSkipped: true,
      });
    } else {
      await db
        .update(userOnboarding)
        .set({ tutorialSkipped: true })
        .where(eq(userOnboarding.userId, userId));
    }

    return { success: true };
  }),

  /**
   * Restart tutorial
   */
  restartTutorial: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db
      .update(userOnboarding)
      .set({
        tutorialCompleted: false,
        tutorialSkipped: false,
        tutorialStartedAt: new Date(),
      })
      .where(eq(userOnboarding.userId, userId));

    return { success: true };
  }),

  /**
   * Mark specific step as completed
   */
  completeStep: protectedProcedure
    .input(
      z.object({
        step: z.enum([
          "uploadFile",
          "createAnnotation",
          "useTemplate",
          "addComment",
          "approveAnnotation",
          "useKeyboardShortcut",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const stepFieldMap = {
        uploadFile: "uploadFileCompleted",
        createAnnotation: "createAnnotationCompleted",
        useTemplate: "useTemplateCompleted",
        addComment: "addCommentCompleted",
        approveAnnotation: "approveAnnotationCompleted",
        useKeyboardShortcut: "useKeyboardShortcutCompleted",
      };

      const field = stepFieldMap[input.step];

      await db
        .update(userOnboarding)
        .set({
          [field]: true,
          lastStepCompletedAt: new Date(),
        })
        .where(eq(userOnboarding.userId, userId));

      return { success: true };
    }),
});
