import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";

interface HistoryDiffViewerProps {
  oldVersion: Record<string, any>;
  newVersion: Record<string, any>;
  oldTimestamp: Date;
  newTimestamp: Date;
  oldAuthor?: string;
  newAuthor?: string;
}

type ChangeType = "added" | "removed" | "changed" | "unchanged";

interface FieldDiff {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: ChangeType;
}

export function HistoryDiffViewer({
  oldVersion,
  newVersion,
  oldTimestamp,
  newTimestamp,
  oldAuthor,
  newAuthor,
}: HistoryDiffViewerProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Calculate differences
  const diffs: FieldDiff[] = [];
  const allFields = new Set([...Object.keys(oldVersion), ...Object.keys(newVersion)]);

  allFields.forEach((field) => {
    // Skip internal fields
    if (field === "id" || field === "userId" || field === "fileId" || field === "createdAt") {
      return;
    }

    const oldValue = oldVersion[field];
    const newValue = newVersion[field];

    let changeType: ChangeType;
    if (oldValue === undefined && newValue !== undefined) {
      changeType = "added";
    } else if (oldValue !== undefined && newValue === undefined) {
      changeType = "removed";
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changeType = "changed";
    } else {
      changeType = "unchanged";
    }

    diffs.push({ field, oldValue, newValue, changeType });
  });

  const filteredDiffs = showUnchanged ? diffs : diffs.filter((d) => d.changeType !== "unchanged");

  const toggleSection = (field: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(field)) {
      newExpanded.delete(field);
    } else {
      newExpanded.add(field);
    }
    setExpandedSections(newExpanded);
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return "(empty)";
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const getChangeColor = (changeType: ChangeType): string => {
    switch (changeType) {
      case "added":
        return "bg-green-500/10 border-green-500/30";
      case "removed":
        return "bg-red-500/10 border-red-500/30";
      case "changed":
        return "bg-yellow-500/10 border-yellow-500/30";
      default:
        return "bg-muted/50 border-border";
    }
  };

  const getChangeBadge = (changeType: ChangeType) => {
    switch (changeType) {
      case "added":
        return <Badge className="bg-green-500">Added</Badge>;
      case "removed":
        return <Badge className="bg-red-500">Removed</Badge>;
      case "changed":
        return <Badge className="bg-yellow-500">Changed</Badge>;
      default:
        return <Badge variant="secondary">Unchanged</Badge>;
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Version Comparison</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowUnchanged(!showUnchanged)}
        >
          {showUnchanged ? "Hide" : "Show"} Unchanged Fields
        </Button>
      </div>

      {/* Version Headers */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-sm font-medium">Old Version</div>
          <div className="text-xs text-muted-foreground mt-1">
            {oldTimestamp.toLocaleString()}
          </div>
          {oldAuthor && (
            <div className="text-xs text-muted-foreground">By: {oldAuthor}</div>
          )}
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-sm font-medium">New Version</div>
          <div className="text-xs text-muted-foreground mt-1">
            {newTimestamp.toLocaleString()}
          </div>
          {newAuthor && (
            <div className="text-xs text-muted-foreground">By: {newAuthor}</div>
          )}
        </div>
      </div>

      {/* Diff View */}
      <div className="space-y-2">
        {filteredDiffs.map((diff) => {
          const isExpanded = expandedSections.has(diff.field);
          const isComplex =
            typeof diff.oldValue === "object" || typeof diff.newValue === "object";

          return (
            <div
              key={diff.field}
              className={`border rounded-lg ${getChangeColor(diff.changeType)}`}
            >
              <div
                className="p-3 flex items-center justify-between cursor-pointer"
                onClick={() => isComplex && toggleSection(diff.field)}
              >
                <div className="flex items-center gap-2">
                  {isComplex && (
                    <>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </>
                  )}
                  <span className="font-medium capitalize">
                    {diff.field.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  {getChangeBadge(diff.changeType)}
                </div>
              </div>

              {(!isComplex || isExpanded) && (
                <div className="grid grid-cols-2 gap-4 p-3 border-t">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      Old Value
                    </div>
                    <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto">
                      {formatValue(diff.oldValue)}
                    </pre>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      New Value
                    </div>
                    <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto">
                      {formatValue(diff.newValue)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredDiffs.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No changes to display
        </div>
      )}
    </Card>
  );
}
