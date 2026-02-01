/**
 * TagHierarchyManager - UI for managing tag hierarchies with parent-child relationships
 */

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ChevronRight,
  ChevronDown,
  FolderTree,
  Tag,
  Palette,
  Edit2,
  Trash2,
  Plus,
  Loader2,
  Network,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TagNode {
  id: number;
  name: string;
  parentId: number | null;
  color: string | null;
  icon: string | null;
  source: string;
  children?: TagNode[];
}

interface TagHierarchyManagerProps {
  className?: string;
}

const TAG_COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#22c55e" },
  { name: "Purple", value: "#a855f7" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Red", value: "#ef4444" },
  { name: "Yellow", value: "#eab308" },
];

export function TagHierarchyManager({ className }: TagHierarchyManagerProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [selectedTag, setSelectedTag] = useState<TagNode | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [parentDialogOpen, setParentDialogOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>("#3b82f6");
  const [selectedParentId, setSelectedParentId] = useState<string>("none");

  // Fetch tag hierarchy
  const { data: tags, isLoading, refetch } = trpc.tags.getHierarchy.useQuery();

  // Mutations
  const setParentMutation = trpc.tags.setParent.useMutation({
    onSuccess: () => {
      toast.success("Tag hierarchy updated");
      refetch();
      setParentDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateVisualsMutation = trpc.tags.updateVisuals.useMutation({
    onSuccess: () => {
      toast.success("Tag appearance updated");
      refetch();
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Build tree structure from flat list
  const tagTree = useMemo(() => {
    if (!tags) return [];

    const tagMap = new Map<number, TagNode>();
    const rootTags: TagNode[] = [];

    // First pass: create all nodes
    tags.forEach((tag) => {
      tagMap.set(tag.id, { ...tag, children: [] });
    });

    // Second pass: build tree
    tags.forEach((tag) => {
      const node = tagMap.get(tag.id)!;
      if (tag.parentId && tagMap.has(tag.parentId)) {
        const parent = tagMap.get(tag.parentId)!;
        parent.children = parent.children || [];
        parent.children.push(node);
      } else {
        rootTags.push(node);
      }
    });

    return rootTags;
  }, [tags]);

  const toggleExpand = (tagId: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleSetParent = () => {
    if (!selectedTag) return;
    const parentId = selectedParentId === "none" ? null : parseInt(selectedParentId);
    setParentMutation.mutate({
      tagId: selectedTag.id,
      parentId,
    });
  };

  const handleUpdateColor = () => {
    if (!selectedTag) return;
    updateVisualsMutation.mutate({
      tagId: selectedTag.id,
      color: selectedColor,
    });
  };

  const renderTagNode = (node: TagNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);

    return (
      <div key={node.id} className="select-none">
        <div
          className={cn(
            "flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors",
            selectedTag?.id === node.id && "bg-muted"
          )}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
          onClick={() => setSelectedTag(node)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="p-0.5 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: node.color || "#6b7280" }}
          />
          <span className="flex-1 font-medium">{node.name}</span>
          <Badge variant="outline" className="text-xs">
            {node.source}
          </Badge>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderTagNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Tag Hierarchy
          </CardTitle>
          <CardDescription>
            Organize tags into parent-child relationships for better categorization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tag Tree */}
            <div className="lg:col-span-2 border rounded-lg p-4 max-h-[500px] overflow-y-auto">
              {tagTree.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tags found. Create tags to organize them into hierarchies.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {tagTree.map((tag) => renderTagNode(tag))}
                </div>
              )}
            </div>

            {/* Tag Details Panel */}
            <div className="border rounded-lg p-4">
              {selectedTag ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg"
                      style={{ backgroundColor: selectedTag.color || "#6b7280" }}
                    />
                    <div>
                      <h3 className="font-semibold">{selectedTag.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Source: {selectedTag.source}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Parent Tag</Label>
                    <p className="text-sm text-muted-foreground">
                      {selectedTag.parentId
                        ? tags?.find((t) => t.id === selectedTag.parentId)?.name || "Unknown"
                        : "None (root tag)"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Children</Label>
                    <p className="text-sm text-muted-foreground">
                      {tags?.filter((t) => t.parentId === selectedTag.id).length || 0} child tags
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedParentId(selectedTag.parentId?.toString() || "none");
                        setParentDialogOpen(true);
                      }}
                    >
                      <Network className="h-4 w-4 mr-2" />
                      Set Parent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedColor(selectedTag.color || "#3b82f6");
                        setEditDialogOpen(true);
                      }}
                    >
                      <Palette className="h-4 w-4 mr-2" />
                      Change Color
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select a tag to view details</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Set Parent Dialog */}
      <Dialog open={parentDialogOpen} onOpenChange={setParentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Parent Tag</DialogTitle>
            <DialogDescription>
              Choose a parent tag for "{selectedTag?.name}" to create a hierarchy.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Parent Tag</Label>
            <Select value={selectedParentId} onValueChange={setSelectedParentId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select parent tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (root tag)</SelectItem>
                {tags
                  ?.filter((t) => t.id !== selectedTag?.id)
                  .map((tag) => (
                    <SelectItem key={tag.id} value={tag.id.toString()}>
                      {tag.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSetParent}
              disabled={setParentMutation.isPending}
            >
              {setParentMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Color Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Tag Color</DialogTitle>
            <DialogDescription>
              Choose a color for "{selectedTag?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Color</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {TAG_COLORS.map((color) => (
                <button
                  key={color.value}
                  className={cn(
                    "w-full aspect-square rounded-lg border-2 transition-all",
                    selectedColor === color.value
                      ? "border-primary scale-110"
                      : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: color.value }}
                  onClick={() => setSelectedColor(color.value)}
                  title={color.name}
                />
              ))}
            </div>
            <div className="mt-4">
              <Label>Custom Color</Label>
              <Input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="mt-2 h-10 w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateColor}
              disabled={updateVisualsMutation.isPending}
            >
              {updateVisualsMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TagHierarchyManager;
