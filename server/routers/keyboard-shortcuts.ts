import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { keyboardShortcuts } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const keyboardShortcutsRouter = router({
  /**
   * Get all keyboard shortcuts for the current user
   */
  getShortcuts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(keyboardShortcuts)
      .where(eq(keyboardShortcuts.userId, ctx.user.id));
  }),

  /**
   * Get default keyboard shortcuts
   */
  getDefaults: protectedProcedure.query(async () => {
    return [
      { action: "playPause", key: "Space", modifiers: [] },
      { action: "addComment", key: "c", modifiers: [] },
      { action: "approve", key: "a", modifiers: [] },
      { action: "reject", key: "r", modifiers: [] },
      { action: "toggleDrawing", key: "d", modifiers: [] },
      { action: "undo", key: "z", modifiers: ["ctrl"] },
      { action: "redo", key: "y", modifiers: ["ctrl"] },
      { action: "save", key: "s", modifiers: ["ctrl"] },
      { action: "delete", key: "Delete", modifiers: [] },
      { action: "escape", key: "Escape", modifiers: [] },
    ];
  }),

  /**
   * Create or update a keyboard shortcut
   */
  upsertShortcut: protectedProcedure
    .input(
      z.object({
        action: z.string(),
        key: z.string(),
        modifiers: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if shortcut already exists for this user and action
      const existing = await db
        .select()
        .from(keyboardShortcuts)
        .where(
          and(
            eq(keyboardShortcuts.userId, ctx.user.id),
            eq(keyboardShortcuts.action, input.action)
          )
        );

      if (existing.length > 0) {
        // Update existing shortcut
        await db
          .update(keyboardShortcuts)
          .set({
            key: input.key,
            modifiers: input.modifiers || [],
          })
          .where(eq(keyboardShortcuts.id, existing[0].id));

        return { ...existing[0], key: input.key, modifiers: input.modifiers || [] };
      } else {
        // Create new shortcut
        const result = await db.insert(keyboardShortcuts).values({
          userId: ctx.user.id,
          action: input.action,
          key: input.key,
          modifiers: input.modifiers || [],
        });

        return {
          id: 0, // ID will be assigned by database
          userId: ctx.user.id,
          action: input.action,
          key: input.key,
          modifiers: input.modifiers || [],
        };
      }
    }),

  /**
   * Delete a keyboard shortcut (revert to default)
   */
  deleteShortcut: protectedProcedure
    .input(z.object({ action: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .delete(keyboardShortcuts)
        .where(
          and(
            eq(keyboardShortcuts.userId, ctx.user.id),
            eq(keyboardShortcuts.action, input.action)
          )
        );
      return { success: true };
    }),

  /**
   * Reset all shortcuts to defaults
   */
  resetToDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
      .delete(keyboardShortcuts)
      .where(eq(keyboardShortcuts.userId, ctx.user.id));
    return { success: true };
  }),

  /**
   * Check for conflicts with existing shortcuts
   */
  checkConflict: protectedProcedure
    .input(
      z.object({
        key: z.string(),
        modifiers: z.array(z.string()).optional(),
        excludeAction: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get all shortcuts for this user
      const shortcuts = await db
        .select()
        .from(keyboardShortcuts)
        .where(eq(keyboardShortcuts.userId, ctx.user.id));

      // Check for conflicts
      const conflict = shortcuts.find((shortcut) => {
        if (input.excludeAction && shortcut.action === input.excludeAction) {
          return false;
        }
        
        const shortcutModifiers = (shortcut.modifiers as string[]) || [];
        const inputModifiers = input.modifiers || [];
        
        return (
          shortcut.key === input.key &&
          JSON.stringify(shortcutModifiers.sort()) === JSON.stringify(inputModifiers.sort())
        );
      });

      return {
        hasConflict: !!conflict,
        conflictingAction: conflict?.action,
      };
    }),
});
