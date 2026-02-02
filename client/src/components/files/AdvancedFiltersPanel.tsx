import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  HardDrive,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface AdvancedFilters {
  dateFrom: string;
  dateTo: string;
  fileSizeMin: number;
  fileSizeMax: number;
  enrichmentStatus: string[];
  qualityScore: string[];
}

interface AdvancedFiltersPanelProps {
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const DEFAULT_FILTERS: AdvancedFilters = {
  dateFrom: "",
  dateTo: "",
  fileSizeMin: 0,
  fileSizeMax: 100, // MB
  enrichmentStatus: [],
  qualityScore: [],
};

export function AdvancedFiltersPanel({
  filters,
  onFiltersChange,
  isOpen,
  onToggle,
}: AdvancedFiltersPanelProps) {
  const [fileSizeRange, setFileSizeRange] = useState([
    filters.fileSizeMin,
    filters.fileSizeMax,
  ]);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    date: false,
    size: false,
    enrichment: true,
    quality: false,
  });

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setFileSizeRange([filters.fileSizeMin, filters.fileSizeMax]);
  }, [filters.fileSizeMin, filters.fileSizeMax]);

  const handleEnrichmentStatusChange = (status: string, checked: boolean) => {
    const newStatus = checked
      ? [...filters.enrichmentStatus, status]
      : filters.enrichmentStatus.filter((s) => s !== status);
    onFiltersChange({ ...filters, enrichmentStatus: newStatus });
  };

  const handleQualityScoreChange = (score: string, checked: boolean) => {
    const newScores = checked
      ? [...filters.qualityScore, score]
      : filters.qualityScore.filter((s) => s !== score);
    onFiltersChange({ ...filters, qualityScore: newScores });
  };

  const handleFileSizeChange = (value: number[]) => {
    setFileSizeRange(value);
  };

  const handleFileSizeCommit = (value: number[]) => {
    onFiltersChange({
      ...filters,
      fileSizeMin: value[0],
      fileSizeMax: value[1],
    });
  };

  const clearAllFilters = () => {
    onFiltersChange(DEFAULT_FILTERS);
    setFileSizeRange([0, 100]);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.fileSizeMin > 0 || filters.fileSizeMax < 100) count++;
    if (filters.enrichmentStatus.length > 0) count++;
    if (filters.qualityScore.length > 0) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Mobile: Compact collapsible panel that doesn't take full screen
  if (isMobile) {
    if (!isOpen) return null;

    return (
      <div className="bg-card border-b border-border p-3 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Filters</h3>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="h-7 px-2"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Date Range - Collapsible */}
        <Collapsible open={expandedSections.date} onOpenChange={() => toggleSection('date')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs font-medium">Date Range</span>
                {(filters.dateFrom || filters.dateTo) && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">Active</Badge>
                )}
              </div>
              {expandedSections.date ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 px-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="date-from-mobile" className="text-[10px] text-muted-foreground">From</Label>
                <Input
                  id="date-from-mobile"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="date-to-mobile" className="text-[10px] text-muted-foreground">To</Label>
                <Input
                  id="date-to-mobile"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* File Size - Collapsible */}
        <Collapsible open={expandedSections.size} onOpenChange={() => toggleSection('size')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs font-medium">File Size</span>
                {(filters.fileSizeMin > 0 || filters.fileSizeMax < 100) && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">{fileSizeRange[0]}-{fileSizeRange[1]}MB</Badge>
                )}
              </div>
              {expandedSections.size ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 px-2">
            <Slider
              min={0}
              max={100}
              step={1}
              value={fileSizeRange}
              onValueChange={handleFileSizeChange}
              onValueCommit={handleFileSizeCommit}
              className="w-full"
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
              <span>{fileSizeRange[0]} MB</span>
              <span>{fileSizeRange[1]} MB</span>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Enrichment Status - Collapsible with inline checkboxes */}
        <Collapsible open={expandedSections.enrichment} onOpenChange={() => toggleSection('enrichment')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs font-medium">Enrichment</span>
                {filters.enrichmentStatus.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filters.enrichmentStatus.length}</Badge>
                )}
              </div>
              {expandedSections.enrichment ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 px-2">
            <div className="flex flex-wrap gap-3">
              {["not_enriched", "enriched", "failed"].map((status) => (
                <label key={status} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    id={`enrichment-mobile-${status}`}
                    checked={filters.enrichmentStatus.includes(status)}
                    onCheckedChange={(checked) => handleEnrichmentStatusChange(status, checked as boolean)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs">
                    {status === "not_enriched" ? "Not Enriched" : status === "enriched" ? "Enriched" : "Failed"}
                  </span>
                </label>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Quality Score - Collapsible with inline checkboxes */}
        <Collapsible open={expandedSections.quality} onOpenChange={() => toggleSection('quality')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Quality Score</span>
                {filters.qualityScore.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filters.qualityScore.length}</Badge>
                )}
              </div>
              {expandedSections.quality ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 px-2">
            <div className="flex flex-wrap gap-3">
              {["high", "medium", "low"].map((score) => (
                <label key={score} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    id={`quality-mobile-${score}`}
                    checked={filters.qualityScore.includes(score)}
                    onCheckedChange={(checked) => handleQualityScoreChange(score, checked as boolean)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs capitalize">{score}</span>
                </label>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  // Desktop: Sidebar layout
  return (
    <>
      {isOpen && (
        <div className="w-80 border-r border-border bg-card p-6 space-y-6 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Advanced Filters</h3>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>

          {/* Date Range */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Date Range</Label>
            </div>
            <div className="space-y-2">
              <div>
                <Label htmlFor="date-from" className="text-sm text-muted-foreground">
                  From
                </Label>
                <Input
                  id="date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, dateFrom: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="date-to" className="text-sm text-muted-foreground">
                  To
                </Label>
                <Input
                  id="date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, dateTo: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* File Size */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">File Size (MB)</Label>
            </div>
            <div className="space-y-3">
              <Slider
                min={0}
                max={100}
                step={1}
                value={fileSizeRange}
                onValueChange={handleFileSizeChange}
                onValueCommit={handleFileSizeCommit}
                className="w-full"
              />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{fileSizeRange[0]} MB</span>
                <span>{fileSizeRange[1]} MB</span>
              </div>
            </div>
          </div>

          {/* Enrichment Status */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Enrichment Status</Label>
            </div>
            <div className="space-y-2">
              {["not_enriched", "enriched", "failed"].map((status) => (
                <div key={status} className="flex items-center space-x-2">
                  <Checkbox
                    id={`enrichment-${status}`}
                    checked={filters.enrichmentStatus.includes(status)}
                    onCheckedChange={(checked) =>
                      handleEnrichmentStatusChange(status, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`enrichment-${status}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {status === "not_enriched"
                      ? "Not Enriched"
                      : status === "enriched"
                      ? "Enriched"
                      : "Failed"}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Quality Score */}
          <div className="space-y-3">
            <Label className="font-medium">Quality Score</Label>
            <div className="space-y-2">
              {["high", "medium", "low"].map((score) => (
                <div key={score} className="flex items-center space-x-2">
                  <Checkbox
                    id={`quality-${score}`}
                    checked={filters.qualityScore.includes(score)}
                    onCheckedChange={(checked) =>
                      handleQualityScoreChange(score, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`quality-${score}`}
                    className="text-sm font-normal cursor-pointer capitalize"
                  >
                    {score}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
