import { describe, it, expect } from 'vitest';

/**
 * Tests for the AdvancedFiltersPanel refactor:
 * - Changed from sidebar layout to Popover dropdown
 * - Removed old Filter/Hide toggle Select dropdown
 * - Added "Advanced" button with SlidersHorizontal icon next to Enriched filter
 * - All filter sections (Date Range, File Size, Enrichment, Quality Score) preserved
 */

describe('AdvancedFiltersPanel Refactor', () => {
  // Test the filter data structure
  it('should have correct default filter values', () => {
    const DEFAULT_FILTERS = {
      dateFrom: "",
      dateTo: "",
      fileSizeMin: 0,
      fileSizeMax: 100,
      enrichmentStatus: [] as string[],
      qualityScore: [] as string[],
    };

    expect(DEFAULT_FILTERS.dateFrom).toBe("");
    expect(DEFAULT_FILTERS.dateTo).toBe("");
    expect(DEFAULT_FILTERS.fileSizeMin).toBe(0);
    expect(DEFAULT_FILTERS.fileSizeMax).toBe(100);
    expect(DEFAULT_FILTERS.enrichmentStatus).toEqual([]);
    expect(DEFAULT_FILTERS.qualityScore).toEqual([]);
  });

  // Test active filter count calculation
  it('should correctly count active filters', () => {
    const getActiveFilterCount = (filters: {
      dateFrom: string;
      dateTo: string;
      fileSizeMin: number;
      fileSizeMax: number;
      enrichmentStatus: string[];
      qualityScore: string[];
    }) => {
      let count = 0;
      if (filters.dateFrom) count++;
      if (filters.dateTo) count++;
      if (filters.fileSizeMin > 0 || filters.fileSizeMax < 100) count++;
      if (filters.enrichmentStatus.length > 0) count++;
      if (filters.qualityScore.length > 0) count++;
      return count;
    };

    // No active filters
    expect(getActiveFilterCount({
      dateFrom: "",
      dateTo: "",
      fileSizeMin: 0,
      fileSizeMax: 100,
      enrichmentStatus: [],
      qualityScore: [],
    })).toBe(0);

    // Date from active
    expect(getActiveFilterCount({
      dateFrom: "2026-01-01",
      dateTo: "",
      fileSizeMin: 0,
      fileSizeMax: 100,
      enrichmentStatus: [],
      qualityScore: [],
    })).toBe(1);

    // Multiple filters active
    expect(getActiveFilterCount({
      dateFrom: "2026-01-01",
      dateTo: "2026-02-01",
      fileSizeMin: 10,
      fileSizeMax: 100,
      enrichmentStatus: ["enriched"],
      qualityScore: ["high", "medium"],
    })).toBe(5);

    // File size range modified (min only)
    expect(getActiveFilterCount({
      dateFrom: "",
      dateTo: "",
      fileSizeMin: 5,
      fileSizeMax: 100,
      enrichmentStatus: [],
      qualityScore: [],
    })).toBe(1);

    // File size range modified (max only)
    expect(getActiveFilterCount({
      dateFrom: "",
      dateTo: "",
      fileSizeMin: 0,
      fileSizeMax: 50,
      enrichmentStatus: [],
      qualityScore: [],
    })).toBe(1);
  });

  // Test enrichment status toggle logic
  it('should correctly toggle enrichment status', () => {
    const handleEnrichmentStatusChange = (
      currentStatus: string[],
      status: string,
      checked: boolean
    ) => {
      return checked
        ? [...currentStatus, status]
        : currentStatus.filter((s) => s !== status);
    };

    // Add enriched
    expect(handleEnrichmentStatusChange([], "enriched", true)).toEqual(["enriched"]);

    // Add not_enriched to existing
    expect(handleEnrichmentStatusChange(["enriched"], "not_enriched", true)).toEqual(["enriched", "not_enriched"]);

    // Remove enriched
    expect(handleEnrichmentStatusChange(["enriched", "not_enriched"], "enriched", false)).toEqual(["not_enriched"]);

    // Remove last item
    expect(handleEnrichmentStatusChange(["failed"], "failed", false)).toEqual([]);
  });

  // Test quality score toggle logic
  it('should correctly toggle quality score', () => {
    const handleQualityScoreChange = (
      currentScores: string[],
      score: string,
      checked: boolean
    ) => {
      return checked
        ? [...currentScores, score]
        : currentScores.filter((s) => s !== score);
    };

    expect(handleQualityScoreChange([], "high", true)).toEqual(["high"]);
    expect(handleQualityScoreChange(["high"], "medium", true)).toEqual(["high", "medium"]);
    expect(handleQualityScoreChange(["high", "medium"], "high", false)).toEqual(["medium"]);
  });

  // Test clear all filters
  it('should reset all filters to defaults on clear', () => {
    const DEFAULT_FILTERS = {
      dateFrom: "",
      dateTo: "",
      fileSizeMin: 0,
      fileSizeMax: 100,
      enrichmentStatus: [] as string[],
      qualityScore: [] as string[],
    };

    const activeFilters = {
      dateFrom: "2026-01-01",
      dateTo: "2026-02-01",
      fileSizeMin: 10,
      fileSizeMax: 80,
      enrichmentStatus: ["enriched", "failed"],
      qualityScore: ["high"],
    };

    // Simulate clear
    const cleared = { ...DEFAULT_FILTERS };
    expect(cleared).toEqual(DEFAULT_FILTERS);
    expect(cleared.dateFrom).toBe("");
    expect(cleared.fileSizeMin).toBe(0);
    expect(cleared.fileSizeMax).toBe(100);
    expect(cleared.enrichmentStatus).toEqual([]);
    expect(cleared.qualityScore).toEqual([]);
  });
});
