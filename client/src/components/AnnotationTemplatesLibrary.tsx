import { useState } from "react";
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
import { toast } from "sonner";
import { Trash2, Save, Library } from "lucide-react";

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

  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.annotationTemplates.getTemplates.useQuery();

  const saveTemplateMutation = trpc.annotationTemplates.saveTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template saved successfully");
      setSaveDialogOpen(false);
      setTemplateName("");
      setTemplateDescription("");
      utils.annotationTemplates.getTemplates.invalidate();
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

  const handleApplyTemplate = (template: any) => {
    const styleData = template.style as {
      tool: string;
      color: string;
      strokeWidth: number;
      text?: string;
    };
    
    onApplyTemplate(styleData);
    setLibraryDialogOpen(false);
    toast.success(`Applied template: ${template.name}`);
  };

  const handleDeleteTemplate = (templateId: number, templateName: string) => {
    if (confirm(`Delete template "${templateName}"?`)) {
      deleteTemplateMutation.mutate({ templateId });
    }
  };

  return (
    <div className="flex gap-2">
      {/* Save Current State as Template */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!currentDrawingState}
            className="flex items-center gap-1"
          >
            <Save className="h-3 w-3" />
            Save as Template
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Annotation Template</DialogTitle>
            <DialogDescription>
              Save your current drawing settings as a reusable template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Red Highlight Box"
              />
            </div>
            <div>
              <Label htmlFor="template-description">Description (Optional)</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Describe when to use this template..."
                rows={3}
              />
            </div>
            {currentDrawingState && (
              <div className="p-3 bg-gray-50 rounded border text-sm space-y-1">
                <div className="font-medium">Current Settings:</div>
                <div>Tool: {currentDrawingState.tool}</div>
                <div className="flex items-center gap-2">
                  Color:
                  <div
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: currentDrawingState.color }}
                  />
                  {currentDrawingState.color}
                </div>
                <div>Stroke Width: {currentDrawingState.strokeWidth}px</div>
                {currentDrawingState.text && <div>Text: {currentDrawingState.text}</div>}
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

      {/* Template Library */}
      <Dialog open={libraryDialogOpen} onOpenChange={setLibraryDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <Library className="h-3 w-3" />
            Template Library
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Annotation Template Library</DialogTitle>
            <DialogDescription>
              Click a template to apply it to your current drawing
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading templates...</div>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {templates.map((template) => {
                const style = template.style as {
                  tool: string;
                  color: string;
                  strokeWidth: number;
                  text?: string;
                };
                return (
                  <div
                    key={template.id}
                    className="border rounded p-3 hover:bg-gray-50 cursor-pointer transition-colors group"
                    onClick={() => handleApplyTemplate(template)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-medium text-sm">{template.name}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(template.id, template.name);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                    {template.description && (
                      <div className="text-xs text-gray-600 mb-2">{template.description}</div>
                    )}
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Tool:</span>
                        <span className="font-mono">{style.tool}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Color:</span>
                        <div
                          className="w-4 h-4 rounded border"
                          style={{ backgroundColor: style.color }}
                        />
                        <span className="font-mono text-xs">{style.color}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Width:</span>
                        <span className="font-mono">{style.strokeWidth}px</span>
                      </div>
                      {style.text && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Text:</span>
                          <span className="font-mono truncate">{style.text}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Used {template.usageCount} times
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No templates saved yet. Create your first template by saving your current drawing
              settings.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
