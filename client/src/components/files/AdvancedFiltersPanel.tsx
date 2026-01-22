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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

  return (
    <>
      {/* Toggle Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="relative"
      >
        {isOpen ? (
          <>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Hide Filters
          </>
        ) : (
          <>
            <ChevronRight className="w-4 h-4 mr-2" />
            Show Filters
          </>
        )}
        {!isOpen && activeFilterCount > 0 && (
          <Badge
            variant="default"
            className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center"
          >
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      {/* Filters Panel */}
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
