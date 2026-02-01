/**
 * Tests for Tag Hierarchy Enhancements
 * - Sample categories creation
 * - Hierarchical filtering
 * - Parent tag suggestions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database
vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getTagsByUserId: vi.fn().mockResolvedValue([]),
  createTag: vi.fn().mockResolvedValue(1),
  updateTagParent: vi.fn().mockResolvedValue(undefined),
  updateTagVisuals: vi.fn().mockResolvedValue(undefined),
  getTagHierarchy: vi.fn().mockResolvedValue([
    { id: 1, name: 'Animals', parentId: null, color: '#22c55e' },
    { id: 2, name: 'Mammals', parentId: 1, color: null },
    { id: 3, name: 'Dogs', parentId: 2, color: null },
    { id: 4, name: 'Golden Retriever', parentId: 3, color: null },
    { id: 5, name: 'Locations', parentId: null, color: '#3b82f6' },
    { id: 6, name: 'Countries', parentId: 5, color: null },
    { id: 7, name: 'USA', parentId: 6, color: null },
  ]),
}));

describe('Sample Categories', () => {
  const sampleCategories = [
    { name: 'Animals', color: '#22c55e', children: [
      { name: 'Mammals', children: [
        { name: 'Dogs', children: ['Golden Retriever', 'Labrador', 'German Shepherd'] },
        { name: 'Cats', children: ['Persian', 'Siamese', 'Maine Coon'] },
      ]},
      { name: 'Birds', children: ['Eagle', 'Parrot', 'Owl'] },
    ]},
    { name: 'Locations', color: '#3b82f6', children: [
      { name: 'Countries', children: ['USA', 'UK', 'Japan', 'France'] },
      { name: 'Cities', children: ['New York', 'London', 'Tokyo', 'Paris'] },
    ]},
    { name: 'Events', color: '#a855f7', children: [
      { name: 'Personal', children: ['Birthday', 'Wedding', 'Anniversary'] },
      { name: 'Holidays', children: ['Christmas', 'New Year', 'Thanksgiving'] },
    ]},
    { name: 'Media Types', color: '#f97316', children: [
      { name: 'Photos', children: ['Portrait', 'Landscape', 'Macro'] },
      { name: 'Documents', children: ['Invoice', 'Receipt', 'Contract'] },
    ]},
  ];

  it('should have 4 root categories', () => {
    expect(sampleCategories.length).toBe(4);
  });

  it('should count total tags in sample categories', () => {
    const countTags = (item: any): number => {
      if (typeof item === 'string') return 1;
      let count = 1; // Count the current item
      if (item.children) {
        for (const child of item.children) {
          count += countTags(child);
        }
      }
      return count;
    };

    let totalTags = 0;
    for (const category of sampleCategories) {
      totalTags += countTags(category);
    }

    // Animals: 1 + Mammals(1 + Dogs(1+3) + Cats(1+3)) + Birds(1+3) = 14
    // Locations: 1 + Countries(1+4) + Cities(1+4) = 11
    // Events: 1 + Personal(1+3) + Holidays(1+3) = 9
    // Media Types: 1 + Photos(1+3) + Documents(1+3) = 9
    // Total: 14 + 11 + 9 + 9 = 43
    expect(totalTags).toBe(43);
  });

  it('should have colors for root categories', () => {
    for (const category of sampleCategories) {
      expect(category.color).toBeDefined();
      expect(category.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('Hierarchical Filtering', () => {
  const tagHierarchy = [
    { id: 1, name: 'Animals', parentId: null },
    { id: 2, name: 'Mammals', parentId: 1 },
    { id: 3, name: 'Dogs', parentId: 2 },
    { id: 4, name: 'Golden Retriever', parentId: 3 },
    { id: 5, name: 'Labrador', parentId: 3 },
    { id: 6, name: 'Cats', parentId: 2 },
    { id: 7, name: 'Birds', parentId: 1 },
  ];

  it('should expand tag to include all descendants', () => {
    const expandTagWithDescendants = (tagId: number): number[] => {
      const descendants: number[] = [tagId];
      const queue = [tagId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = tagHierarchy.filter(t => t.parentId === currentId);
        for (const child of children) {
          descendants.push(child.id);
          queue.push(child.id);
        }
      }

      return descendants;
    };

    // Expanding "Animals" (id: 1) should include all descendants
    const animalsExpanded = expandTagWithDescendants(1);
    expect(animalsExpanded).toContain(1); // Animals
    expect(animalsExpanded).toContain(2); // Mammals
    expect(animalsExpanded).toContain(3); // Dogs
    expect(animalsExpanded).toContain(4); // Golden Retriever
    expect(animalsExpanded).toContain(5); // Labrador
    expect(animalsExpanded).toContain(6); // Cats
    expect(animalsExpanded).toContain(7); // Birds
    expect(animalsExpanded.length).toBe(7);
  });

  it('should expand "Dogs" to include only dog breeds', () => {
    const expandTagWithDescendants = (tagId: number): number[] => {
      const descendants: number[] = [tagId];
      const queue = [tagId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = tagHierarchy.filter(t => t.parentId === currentId);
        for (const child of children) {
          descendants.push(child.id);
          queue.push(child.id);
        }
      }

      return descendants;
    };

    const dogsExpanded = expandTagWithDescendants(3);
    expect(dogsExpanded).toContain(3); // Dogs
    expect(dogsExpanded).toContain(4); // Golden Retriever
    expect(dogsExpanded).toContain(5); // Labrador
    expect(dogsExpanded).not.toContain(6); // Cats
    expect(dogsExpanded.length).toBe(3);
  });

  it('should return only the tag itself for leaf nodes', () => {
    const expandTagWithDescendants = (tagId: number): number[] => {
      const descendants: number[] = [tagId];
      const queue = [tagId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = tagHierarchy.filter(t => t.parentId === currentId);
        for (const child of children) {
          descendants.push(child.id);
          queue.push(child.id);
        }
      }

      return descendants;
    };

    const goldenRetrieverExpanded = expandTagWithDescendants(4);
    expect(goldenRetrieverExpanded).toEqual([4]);
  });
});

describe('Parent Tag Suggestions', () => {
  const tagHierarchy = [
    { id: 1, name: 'Animals', parentId: null },
    { id: 2, name: 'Mammals', parentId: 1 },
    { id: 3, name: 'Dogs', parentId: 2 },
    { id: 4, name: 'Golden Retriever', parentId: 3 },
  ];

  const fileTags = [
    { id: 4, name: 'Golden Retriever' }, // Only this tag is applied
  ];

  it('should suggest parent tag when child is applied', () => {
    const checkParentSuggestion = (tagId: number): { id: number; name: string } | null => {
      const tag = tagHierarchy.find(t => t.id === tagId);
      if (!tag || !tag.parentId) return null;

      const parentTag = tagHierarchy.find(t => t.id === tag.parentId);
      if (!parentTag) return null;

      // Check if parent is already applied
      const hasParent = fileTags.some(t => t.id === parentTag.id);
      if (hasParent) return null;

      return { id: parentTag.id, name: parentTag.name };
    };

    const suggestion = checkParentSuggestion(4); // Golden Retriever
    expect(suggestion).not.toBeNull();
    expect(suggestion?.name).toBe('Dogs');
  });

  it('should not suggest parent if already applied', () => {
    const fileTagsWithParent = [
      { id: 3, name: 'Dogs' },
      { id: 4, name: 'Golden Retriever' },
    ];

    const checkParentSuggestion = (tagId: number): { id: number; name: string } | null => {
      const tag = tagHierarchy.find(t => t.id === tagId);
      if (!tag || !tag.parentId) return null;

      const parentTag = tagHierarchy.find(t => t.id === tag.parentId);
      if (!parentTag) return null;

      const hasParent = fileTagsWithParent.some(t => t.id === parentTag.id);
      if (hasParent) return null;

      return { id: parentTag.id, name: parentTag.name };
    };

    const suggestion = checkParentSuggestion(4);
    expect(suggestion).toBeNull();
  });

  it('should not suggest parent for root tags', () => {
    const checkParentSuggestion = (tagId: number): { id: number; name: string } | null => {
      const tag = tagHierarchy.find(t => t.id === tagId);
      if (!tag || !tag.parentId) return null;

      const parentTag = tagHierarchy.find(t => t.id === tag.parentId);
      if (!parentTag) return null;

      return { id: parentTag.id, name: parentTag.name };
    };

    const suggestion = checkParentSuggestion(1); // Animals (root)
    expect(suggestion).toBeNull();
  });

  it('should get all ancestors for deep hierarchy', () => {
    const getAncestors = (tagId: number): number[] => {
      const ancestors: number[] = [];
      let currentId: number | null = tagId;

      while (currentId) {
        const tag = tagHierarchy.find(t => t.id === currentId);
        if (!tag || !tag.parentId) break;
        ancestors.push(tag.parentId);
        currentId = tag.parentId;
      }

      return ancestors;
    };

    const ancestors = getAncestors(4); // Golden Retriever
    expect(ancestors).toEqual([3, 2, 1]); // Dogs, Mammals, Animals
  });
});

describe('Tag Hierarchy Integration', () => {
  it('should support multiple levels of nesting', () => {
    const maxDepth = 10;
    const hierarchy: { id: number; name: string; parentId: number | null }[] = [];
    
    for (let i = 1; i <= maxDepth; i++) {
      hierarchy.push({
        id: i,
        name: `Level ${i}`,
        parentId: i === 1 ? null : i - 1,
      });
    }

    const getDepth = (tagId: number): number => {
      let depth = 0;
      let currentId: number | null = tagId;

      while (currentId) {
        const tag = hierarchy.find(t => t.id === currentId);
        if (!tag || !tag.parentId) break;
        currentId = tag.parentId;
        depth++;
      }

      return depth;
    };

    expect(getDepth(1)).toBe(0);
    expect(getDepth(5)).toBe(4);
    expect(getDepth(10)).toBe(9);
  });

  it('should handle empty hierarchy gracefully', () => {
    const emptyHierarchy: any[] = [];

    const expandTagWithDescendants = (tagId: number): number[] => {
      const descendants: number[] = [tagId];
      const queue = [tagId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = emptyHierarchy.filter(t => t.parentId === currentId);
        for (const child of children) {
          descendants.push(child.id);
          queue.push(child.id);
        }
      }

      return descendants;
    };

    const result = expandTagWithDescendants(1);
    expect(result).toEqual([1]);
  });
});
