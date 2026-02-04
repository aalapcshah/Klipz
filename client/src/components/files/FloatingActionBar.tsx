import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  Tag,
  Folder,
  Trash2,
  X,
  CheckSquare,
  Square,
  FileText,
  FileJson,
  Sparkles,
  MoreHorizontal,
  ChevronUp,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FloatingActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDownload: () => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onTag: () => void;
  onMoveToCollection: () => void;
  onBulkEnrich: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FloatingActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDownload,
  onExportCSV,
  onExportJSON,
  onTag,
  onMoveToCollection,
  onBulkEnrich,
  onDelete,
  onClose,
}: FloatingActionBarProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300 w-[calc(100%-2rem)] max-w-2xl">
      <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Main toolbar row */}
        <div className="p-2 md:p-3 flex items-center gap-2 md:gap-3">
          {/* Selection count */}
          <div className="flex items-center gap-1 px-2 md:px-3 py-1 bg-primary/10 rounded-lg">
            <span className="font-bold text-sm md:text-base text-primary">{selectedCount}</span>
            <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">
              {selectedCount === 1 ? "file" : "files"}
            </span>
          </div>

          {/* Primary actions - always visible */}
          <div className="flex items-center gap-1 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDownload}
              className="h-8 px-2 md:px-3 gap-1"
              title="Download as ZIP"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">ZIP</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onMoveToCollection}
              className="h-8 px-2 md:px-3 gap-1"
              title="Move to collection"
            >
              <Folder className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Move</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onBulkEnrich}
              className="h-8 px-2 md:px-3 gap-1 text-primary hover:text-primary hover:bg-primary/10"
              title="Enrich with AI"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Enrich</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-8 px-2 md:px-3 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Delete</span>
            </Button>

            {/* More actions dropdown - mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 md:hidden"
                  title="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onTag}>
                  <Tag className="h-4 w-4 mr-2" />
                  Add Tags
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportCSV}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportJSON}>
                  <FileJson className="h-4 w-4 mr-2" />
                  Export JSON
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={allSelected ? onDeselectAll : onSelectAll}>
                  {allSelected ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Select All ({totalCount})
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Additional actions - desktop only */}
            <div className="hidden md:flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onTag}
                className="h-8 px-3 gap-1"
                title="Add tags"
              >
                <Tag className="h-4 w-4" />
                <span className="text-xs">Tag</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={onExportCSV}
                className="h-8 px-3 gap-1"
                title="Export as CSV"
              >
                <FileText className="h-4 w-4" />
                <span className="text-xs">CSV</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={onExportJSON}
                className="h-8 px-3 gap-1"
                title="Export as JSON"
              >
                <FileJson className="h-4 w-4" />
                <span className="text-xs">JSON</span>
              </Button>

              <div className="h-6 w-px bg-border mx-1" />

              <Button
                variant="ghost"
                size="sm"
                onClick={allSelected ? onDeselectAll : onSelectAll}
                className="h-8 px-3 gap-1"
              >
                {allSelected ? (
                  <>
                    <Square className="h-4 w-4" />
                    <span className="text-xs">Deselect</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-4 w-4" />
                    <span className="text-xs">All ({totalCount})</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 flex-shrink-0"
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
