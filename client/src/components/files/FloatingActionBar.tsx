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
} from "lucide-react";

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
  onDelete,
  onClose,
}: FloatingActionBarProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-lg shadow-2xl p-4 flex items-center gap-4">
        {/* Selection Info */}
        <div className="flex items-center gap-2 px-3 border-r border-border">
          <span className="font-semibold text-lg">{selectedCount}</span>
          <span className="text-muted-foreground text-sm">
            {selectedCount === 1 ? "file" : "files"} selected
          </span>
        </div>

        {/* Select All/None Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="gap-2"
        >
          {allSelected ? (
            <>
              <Square className="h-4 w-4" />
              Deselect All
            </>
          ) : (
            <>
              <CheckSquare className="h-4 w-4" />
              Select All ({totalCount})
            </>
          )}
        </Button>

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownload}
            className="gap-2"
            title="Download selected files as ZIP"
          >
            <Download className="h-4 w-4" />
            ZIP
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onExportCSV}
            className="gap-2"
            title="Export metadata as CSV"
          >
            <FileText className="h-4 w-4" />
            CSV
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onExportJSON}
            className="gap-2"
            title="Export metadata as JSON"
          >
            <FileJson className="h-4 w-4" />
            JSON
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onTag}
            className="gap-2"
            title="Add tags to selected files"
          >
            <Tag className="h-4 w-4" />
            Tag
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveToCollection}
            className="gap-2"
            title="Move to collection"
          >
            <Folder className="h-4 w-4" />
            Move
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Delete selected files"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
