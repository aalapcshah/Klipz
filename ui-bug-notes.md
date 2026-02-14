# UI Bug Analysis

## Bug 1: Mobile Selection Toolbar
- File: `client/src/components/files/BulkOperationsToolbar.tsx`
- Lines 309-395: Mobile bottom bar layout
- Current layout: `[N selected X] [Enrich] [Delete] [...]`
- User wants: Move "N selected" to bottom bar (where it currently is), move Delete to where "1 selected" used to be
- Looking at screenshot 1: The floating toolbar has buttons wrapping/overlapping. The "1 selected" text is at top-left, and buttons (Clear, Tag, Edit, Enrich, Quality, Compare, Export, Collection, Delete) are wrapping into multiple rows.
- This appears to be the OLD floating toolbar, not the current compact bottom bar. The current code already has a compact mobile bar.
- But the user is showing the CURRENT state with the bottom bar AND the old floating toolbar visible. Wait - looking again, the bottom bar IS showing at the very bottom. The middle section with overlapping buttons is something else.

Actually re-reading: The user wants to swap positions in the bottom bar:
- Move "1 selected" to a different location (the right side)  
- Move Delete button to where "1 selected" was (the left side)

## Bug 2: Swipe Action Buttons Overlapping
- File: `client/src/components/files/FileGridEnhanced.tsx`
- Lines 1823-1843: Swipe action buttons (Enrich + Delete)
- The outer div at line 1781 has `overflow-hidden` but the swipe actions at line 1824-1826 are `absolute right-0 top-0 bottom-0 w-40`
- The Card at line 1844 uses `translateX(-${swipeOffset}px)` to slide left
- Problem: The swipe action buttons are showing BEHIND the card content but the card is translating, revealing them. However, they appear to overlap the text because the card content is not properly clipped or the z-index is wrong.
- Looking at screenshot 2: The Enrich (teal) and Delete (red) buttons are visible on the selected card but they're overlapping the text content instead of being cleanly revealed behind the card.
- The issue is that the swipe actions div is `absolute` and positioned on top of the card content, not behind it. The card needs a higher z-index or the actions need to be behind.
- Actually the structure is: wrapper div > [action buttons (absolute)] + [Card (relative, translateX)]
- The Card should be on top (z-index wise) and the actions behind. But since Card comes AFTER the actions div in DOM order, it should naturally be on top... unless the Card's translateX is revealing the actions underneath.
- Wait - looking at the screenshot again, the buttons ARE overlapping the card text. This means the actions div is rendering ON TOP of the card, not behind it. Need to add z-index to fix layering.
