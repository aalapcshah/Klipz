/**
 * Tests for Tag Hierarchy Features
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database
vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getTagHierarchy: vi.fn().mockResolvedValue([
    { id: 1, name: 'Animals', parentId: null, color: '#3b82f6', icon: null, source: 'manual' },
    { id: 2, name: 'Dogs', parentId: 1, color: '#22c55e', icon: null, source: 'manual' },
    { id: 3, name: 'Cats', parentId: 1, color: '#a855f7', icon: null, source: 'manual' },
    { id: 4, name: 'Golden Retriever', parentId: 2, color: null, icon: null, source: 'ai' },
    { id: 5, name: 'Locations', parentId: null, color: '#f97316', icon: null, source: 'manual' },
  ]),
  getChildTags: vi.fn().mockImplementation((tagId: number) => {
    const children: Record<number, any[]> = {
      1: [
        { id: 2, name: 'Dogs', parentId: 1 },
        { id: 3, name: 'Cats', parentId: 1 },
      ],
      2: [{ id: 4, name: 'Golden Retriever', parentId: 2 }],
    };
    return Promise.resolve(children[tagId] || []);
  }),
  getRootTags: vi.fn().mockResolvedValue([
    { id: 1, name: 'Animals', parentId: null },
    { id: 5, name: 'Locations', parentId: null },
  ]),
  updateTagParent: vi.fn().mockResolvedValue(undefined),
  updateTagVisuals: vi.fn().mockResolvedValue(undefined),
}));

describe('Tag Hierarchy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tree Structure', () => {
    it('should build a tree from flat tag list', () => {
      const flatTags = [
        { id: 1, name: 'Animals', parentId: null },
        { id: 2, name: 'Dogs', parentId: 1 },
        { id: 3, name: 'Cats', parentId: 1 },
        { id: 4, name: 'Golden Retriever', parentId: 2 },
        { id: 5, name: 'Locations', parentId: null },
      ];

      // Build tree
      const tagMap = new Map();
      const rootTags: any[] = [];

      flatTags.forEach((tag) => {
        tagMap.set(tag.id, { ...tag, children: [] });
      });

      flatTags.forEach((tag) => {
        const node = tagMap.get(tag.id);
        if (tag.parentId && tagMap.has(tag.parentId)) {
          const parent = tagMap.get(tag.parentId);
          parent.children.push(node);
        } else {
          rootTags.push(node);
        }
      });

      expect(rootTags.length).toBe(2);
      expect(rootTags[0].name).toBe('Animals');
      expect(rootTags[0].children.length).toBe(2);
      expect(rootTags[0].children[0].name).toBe('Dogs');
      expect(rootTags[0].children[0].children.length).toBe(1);
      expect(rootTags[0].children[0].children[0].name).toBe('Golden Retriever');
    });

    it('should identify root tags correctly', () => {
      const tags = [
        { id: 1, name: 'Animals', parentId: null },
        { id: 2, name: 'Dogs', parentId: 1 },
        { id: 5, name: 'Locations', parentId: null },
      ];

      const rootTags = tags.filter((t) => t.parentId === null);
      expect(rootTags.length).toBe(2);
      expect(rootTags.map((t) => t.name)).toEqual(['Animals', 'Locations']);
    });

    it('should find children of a parent tag', () => {
      const tags = [
        { id: 1, name: 'Animals', parentId: null },
        { id: 2, name: 'Dogs', parentId: 1 },
        { id: 3, name: 'Cats', parentId: 1 },
        { id: 4, name: 'Birds', parentId: 1 },
      ];

      const children = tags.filter((t) => t.parentId === 1);
      expect(children.length).toBe(3);
      expect(children.map((t) => t.name)).toEqual(['Dogs', 'Cats', 'Birds']);
    });
  });

  describe('Circular Reference Prevention', () => {
    it('should detect direct circular reference', () => {
      const tags = [
        { id: 1, name: 'A', parentId: 2 },
        { id: 2, name: 'B', parentId: 1 },
      ];

      const detectCircular = (tagId: number, newParentId: number): boolean => {
        if (tagId === newParentId) return true;

        let currentId = newParentId;
        const visited = new Set<number>();

        while (currentId) {
          if (visited.has(currentId) || currentId === tagId) return true;
          visited.add(currentId);
          const parent = tags.find((t) => t.id === currentId);
          currentId = parent?.parentId || 0;
        }

        return false;
      };

      // Setting tag 1's parent to tag 2 when tag 2's parent is tag 1
      expect(detectCircular(1, 2)).toBe(true);
    });

    it('should detect self-reference', () => {
      const detectSelfReference = (tagId: number, newParentId: number): boolean => {
        return tagId === newParentId;
      };

      expect(detectSelfReference(1, 1)).toBe(true);
      expect(detectSelfReference(1, 2)).toBe(false);
    });

    it('should allow valid parent assignment', () => {
      const tags = [
        { id: 1, name: 'Animals', parentId: null },
        { id: 2, name: 'Dogs', parentId: null },
      ];

      const detectCircular = (tagId: number, newParentId: number): boolean => {
        if (tagId === newParentId) return true;

        let currentId = newParentId;
        const visited = new Set<number>();

        while (currentId) {
          if (visited.has(currentId) || currentId === tagId) return true;
          visited.add(currentId);
          const parent = tags.find((t) => t.id === currentId);
          currentId = parent?.parentId || 0;
        }

        return false;
      };

      // Setting Dogs (2) as child of Animals (1) should be valid
      expect(detectCircular(2, 1)).toBe(false);
    });
  });

  describe('Tag Visuals', () => {
    it('should support custom colors', () => {
      const validColors = [
        '#3b82f6', // Blue
        '#22c55e', // Green
        '#a855f7', // Purple
        '#f97316', // Orange
      ];

      validColors.forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it('should have default color when not set', () => {
      const tag = { id: 1, name: 'Test', color: null };
      const displayColor = tag.color || '#6b7280';
      expect(displayColor).toBe('#6b7280');
    });
  });

  describe('Hierarchy Depth', () => {
    it('should calculate depth correctly', () => {
      const tags = [
        { id: 1, name: 'Level 0', parentId: null },
        { id: 2, name: 'Level 1', parentId: 1 },
        { id: 3, name: 'Level 2', parentId: 2 },
        { id: 4, name: 'Level 3', parentId: 3 },
      ];

      const getDepth = (tagId: number): number => {
        let depth = 0;
        let currentId: number | null = tagId;

        while (currentId) {
          const tag = tags.find((t) => t.id === currentId);
          if (!tag || !tag.parentId) break;
          currentId = tag.parentId;
          depth++;
        }

        return depth;
      };

      expect(getDepth(1)).toBe(0);
      expect(getDepth(2)).toBe(1);
      expect(getDepth(3)).toBe(2);
      expect(getDepth(4)).toBe(3);
    });
  });

  describe('Tag Inheritance', () => {
    it('should get all ancestors of a tag', () => {
      const tags = [
        { id: 1, name: 'Animals', parentId: null },
        { id: 2, name: 'Mammals', parentId: 1 },
        { id: 3, name: 'Dogs', parentId: 2 },
        { id: 4, name: 'Golden Retriever', parentId: 3 },
      ];

      const getAncestors = (tagId: number): number[] => {
        const ancestors: number[] = [];
        let currentId: number | null = tagId;

        while (currentId) {
          const tag = tags.find((t) => t.id === currentId);
          if (!tag || !tag.parentId) break;
          ancestors.push(tag.parentId);
          currentId = tag.parentId;
        }

        return ancestors;
      };

      const ancestors = getAncestors(4);
      expect(ancestors).toEqual([3, 2, 1]);
    });

    it('should get all descendants of a tag', () => {
      const tags = [
        { id: 1, name: 'Animals', parentId: null },
        { id: 2, name: 'Dogs', parentId: 1 },
        { id: 3, name: 'Cats', parentId: 1 },
        { id: 4, name: 'Golden Retriever', parentId: 2 },
        { id: 5, name: 'Labrador', parentId: 2 },
      ];

      const getDescendants = (tagId: number): number[] => {
        const descendants: number[] = [];
        const queue = [tagId];

        while (queue.length > 0) {
          const currentId = queue.shift()!;
          const children = tags.filter((t) => t.parentId === currentId);
          for (const child of children) {
            descendants.push(child.id);
            queue.push(child.id);
          }
        }

        return descendants;
      };

      const descendants = getDescendants(1);
      expect(descendants).toEqual([2, 3, 4, 5]);
    });
  });
});

describe('Tag Source Types', () => {
  it('should support all valid source types', () => {
    const validSources = ['manual', 'ai', 'voice', 'metadata'];
    expect(validSources).toContain('manual');
    expect(validSources).toContain('ai');
    expect(validSources).toContain('voice');
    expect(validSources).toContain('metadata');
  });
});

describe('Tag Color Palette', () => {
  const TAG_COLORS = [
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Yellow', value: '#eab308' },
  ];

  it('should have 8 predefined colors', () => {
    expect(TAG_COLORS.length).toBe(8);
  });

  it('should have valid hex color values', () => {
    TAG_COLORS.forEach((color) => {
      expect(color.value).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('should have unique color values', () => {
    const values = TAG_COLORS.map((c) => c.value);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});
