import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Save, Library, Globe, Lock, Users, Copy, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWebSocket } from "@/hooks/useWebSocket";

interface AnnotationTemplatesLibraryProps {
  currentDrawingState?: {
    tool: "pen" | "rectangle" | "circle" | "arrow" | "text";
    color: string;
    strokeWidth: number;
    text?: string;
  };
  onApplyTemplate: (templateData: {
    tool: string;
    color: string;
    strokeWidth: number;
    text?: string;
  }) => void;
}

export function AnnotationTemplatesLibrary({
  currentDrawingState,
  onApplyTemplate,
}: AnnotationTemplatesLibraryProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [selectedVisibility, setSelectedVisibility] = useState<"private" | "team" | "public">("private");
  const [activeTab, setActiveTab] = useState<"my-templates" | "public-templates">("my-templates");
  const [searchQuery, setSearchQuery] = useState("");

  // WebSocket for real-time updates
  const { isConnected } = useWebSocket({
    onTemplateCreated: (message) => {
      console.log("[Template] Created:", message);
      utils.annotationTemplates.getTemplates.invalidate();
      utils.annotationTemplates.getPublicTemplates.invalidate();
      toast.success(`${message.userName} created a new template`);
    },
    onTemplateUpdated: (message) => {
      console.log("[Template] Updated:", message);
      utils.annotationTemplates.getTemplates.invalidate();
      utils.annotationTemplates.getPublicTemplates.invalidate();
    },
    onTemplateDeleted: (message) => {
      console.log("[Template] Deleted:", message);
      utils.annotationTemplates.getTemplates.invalidate();
      utils.annotationTemplates.getPublicTemplates.invalidate();
      toast.info(`${message.userName} deleted a template`);
    },
  });

  const utils = trpc.useUtils();
  
  // Get user's templates
  const { data: myTemplates = [], isLoading: loadingMyTemplates } = 
    trpc.annotationTemplates.getTemplates.useQuery({ includeShared: false });

  // Get public templates
  const { data: publicTemplates = [], isLoading: loadingPublicTemplates } = 
    trpc.annotationTemplates.getPublicTemplates.useQuery({ limit: 50 });

  const saveTemplateMutation = trpc.annotationTemplates.saveTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template saved successfully");
      setSaveDialogOpen(false);
      setTemplateName("");
      setTemplateDescription("");
      setSelectedVisibility("private");
      utils.annotationTemplates.getTemplates.invalidate();
      utils.annotationTemplates.getPublicTemplates.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to save template: ${error.message}`);
    },
  });

  const deleteTemplateMutation = trpc.annotationTemplates.deleteTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.annotationTemplates.getTemplates.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete template: ${error.message}`);
    },
  });

  const updateVisibilityMutation = trpc.annotationTemplates.updateVisibility.useMutation({
    onSuccess: () => {
      toast.success("Visibility updated");
      utils.annotationTemplates.getTemplates.invalidate();
      utils.annotationTemplates.getPublicTemplates.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to update visibility: ${error.message}`);
    },
  });

  const incrementUsageMutation = trpc.annotationTemplates.incrementUsage.useMutation();

  const handleSaveTemplate = () => {
    if (!currentDrawingState) {
      toast.error("No drawing state to save");
      return;
    }

    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    saveTemplateMutation.mutate({
      name: templateName,
      description: templateDescription || undefined,
      templateData: currentDrawingState,
    });
  };

  const handleApplyTemplate = (template: any, isPublic: boolean = false) => {
    const styleData = template.style as {
      tool: string;
      color: string;
      strokeWidth: number;
      text?: string;
    };
    
    onApplyTemplate(styleData);
    setLibraryDialogOpen(false);
    toast.success(`Applied template: ${template.name}`);

    // Increment usage count
    if (isPublic) {
      incrementUsageMutation.mutate({ templateId: template.id });
    }
  };

  const handleDeleteTemplate = (templateId: number, templateName: string) => {
    if (confirm(`Delete template "${templateName}"?`)) {
      deleteTemplateMutation.mutate({ templateId });
    }
  };

  const handleVisibilityChange = (templateId: number, visibility: "private" | "team" | "public") => {
    updateVisibilityMutation.mutate({ templateId, visibility });
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case "public":
        return <Globe className="h-3 w-3" />;
      case "team":
        return <Users className="h-3 w-3" />;
      default:
        return <Lock className="h-3 w-3" />;
    }
  };

  const getVisibilityLabel = (visibility: string) => {
    switch (visibility) {
      case "public":
        return "Public";
      case "team":
        return "Team";
      default:
        return "Private";
    }
  };

  const filteredMyTemplates = myTemplates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredPublicTemplates = publicTemplates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderTemplateCard = (template: any, isOwn: boolean = false) => (
    <div
      key={template.id}
      className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-medium text-sm">{template.name}</h4>
          {template.description && (
            <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
          )}
        </div>
        <div className="flex gap-1">
          {isOwn && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleDeleteTemplate(template.id, template.name)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded border-2"
          style={{
            backgroundColor: template.style.color,
            borderColor: template.style.color,
          }}
        />
        <div className="text-xs text-muted-foreground">
          {template.style.tool} • {template.style.strokeWidth}px
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOwn && (
            <Select
              value={template.visibility || "private"}
              onValueChange={(value: "private" | "team" | "public") =>
                handleVisibilityChange(template.id, value)
              }
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3 w-3" />
                    Private
                  </div>
                </SelectItem>
                <SelectItem value="team">
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3" />
                    Team
                  </div>
                </SelectItem>
                <SelectItem value="public">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3" />
                    Public
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          {!isOwn && template.visibility && (
            <Badge variant="secondary" className="text-xs">
              {getVisibilityIcon(template.visibility)}
              <span className="ml-1">{getVisibilityLabel(template.visibility)}</span>
            </Badge>
          )}
          {template.usageCount > 0 && (
            <Badge variant="outline" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" />
              {template.usageCount}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => handleApplyTemplate(template, !isOwn)}
          className="h-7"
        >
          Apply
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex gap-2">
      {/* Save Template Button */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!currentDrawingState}
            title="Save current drawing as template"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Template
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Annotation Template</DialogTitle>
            <DialogDescription>
              Save your current drawing style as a reusable template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Red Circle Highlight"
              />
            </div>
            <div>
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
            {currentDrawingState && (
              <div className="p-3 bg-accent rounded-lg">
                <p className="text-sm font-medium mb-2">Preview:</p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded border-2"
                    style={{
                      backgroundColor: currentDrawingState.color,
                      borderColor: currentDrawingState.color,
                    }}
                  />
                  <div className="text-sm text-muted-foreground">
                    <div>Tool: {currentDrawingState.tool}</div>
                    <div>Stroke: {currentDrawingState.strokeWidth}px</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending}>
              {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Library Button */}
      <Dialog open={libraryDialogOpen} onOpenChange={setLibraryDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Library className="h-4 w-4 mr-2" />
            Template Library
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Annotation Templates</DialogTitle>
            <DialogDescription>
              Browse and apply saved annotation templates
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="my-templates">
                  My Templates ({myTemplates.length})
                </TabsTrigger>
                <TabsTrigger value="public-templates">
                  Public Templates ({publicTemplates.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="my-templates" className="mt-4">
                <ScrollArea className="h-96">
                  {loadingMyTemplates ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Loading templates...
                    </div>
                  ) : filteredMyTemplates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchQuery ? "No templates found" : "No templates saved yet"}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {filteredMyTemplates.map((template) => renderTemplateCard(template, true))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="public-templates" className="mt-4">
                <ScrollArea className="h-96">
                  {loadingPublicTemplates ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Loading public templates...
                    </div>
                  ) : filteredPublicTemplates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchQuery ? "No templates found" : "No public templates available"}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {filteredPublicTemplates.map((template) => renderTemplateCard(template, false))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
