import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Sparkles, Plus, Trash2, RefreshCw, FileImage } from "lucide-react";
import { toast } from "sonner";

interface SmartCollectionRule {
  field: string;
  operator: string;
  value: string;
}

const PREDEFINED_TEMPLATES = [
  {
    id: "large_images",
    name: "Large Images (>5MB)",
    description: "All image files larger than 5MB",
    rules: [
      { field: "mimeType", operator: "startsWith", value: "image/" },
      { field: "fileSize", operator: ">", value: "5242880" }
    ]
  },
  {
    id: "enriched_this_week",
    name: "Enriched This Week",
    description: "Files enriched in the last 7 days",
    rules: [
      { field: "enrichmentStatus", operator: "=", value: "completed" },
      { field: "updatedAt", operator: "withinDays", value: "7" }
    ]
  },
  {
    id: "high_quality_no_tags",
    name: "High Quality Without Tags",
    description: "Files with quality score >70% but no tags",
    rules: [
      { field: "qualityScore", operator: ">", value: "70" },
      { field: "tagCount", operator: "=", value: "0" }
    ]
  },
  {
    id: "videos_over_10mb",
    name: "Large Videos (>10MB)",
    description: "All video files larger than 10MB",
    rules: [
      { field: "mimeType", operator: "startsWith", value: "video/" },
      { field: "fileSize", operator: ">", value: "10485760" }
    ]
  },
  {
    id: "not_enriched",
    name: "Not Yet Enriched",
    description: "Files that haven't been enriched",
    rules: [
      { field: "enrichmentStatus", operator: "!=", value: "completed" }
    ]
  }
];

const FIELD_OPTIONS = [
  { value: "mimeType", label: "File Type" },
  { value: "fileSize", label: "File Size" },
  { value: "enrichmentStatus", label: "Enrichment Status" },
  { value: "qualityScore", label: "Quality Score" },
  { value: "tagCount", label: "Tag Count" },
  { value: "updatedAt", label: "Last Updated" },
  { value: "createdAt", label: "Date Added" }
];

const OPERATOR_OPTIONS: Record<string, { value: string; label: string }[]> = {
  mimeType: [
    { value: "=", label: "equals" },
    { value: "!=", label: "not equals" },
    { value: "startsWith", label: "starts with" },
    { value: "contains", label: "contains" }
  ],
  fileSize: [
    { value: ">", label: "greater than" },
    { value: "<", label: "less than" },
    { value: "=", label: "equals" }
  ],
  enrichmentStatus: [
    { value: "=", label: "equals" },
    { value: "!=", label: "not equals" }
  ],
  qualityScore: [
    { value: ">", label: "greater than" },
    { value: "<", label: "less than" },
    { value: "=", label: "equals" }
  ],
  tagCount: [
    { value: ">", label: "greater than" },
    { value: "<", label: "less than" },
    { value: "=", label: "equals" }
  ],
  updatedAt: [
    { value: "withinDays", label: "within last N days" },
    { value: "olderThanDays", label: "older than N days" }
  ],
  createdAt: [
    { value: "withinDays", label: "within last N days" },
    { value: "olderThanDays", label: "older than N days" }
  ]
};

export default function SmartCollectionsManager() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [rules, setRules] = useState<SmartCollectionRule[]>([
    { field: "mimeType", operator: "=", value: "" }
  ]);
  const [previewCollectionId, setPreviewCollectionId] = useState<number | null>(null);

  const { data: smartCollections = [], refetch } = trpc.smartCollections.list.useQuery();

  const createMutation = trpc.smartCollections.create.useMutation({
    onSuccess: () => {
      toast.success("Smart collection created");
      refetch();
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to create: ${error.message}`);
    }
  });

  const deleteMutation = trpc.smartCollections.delete.useMutation({
    onSuccess: () => {
      toast.success("Smart collection deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    }
  });

  const evaluateMutation = trpc.smartCollections.evaluate.useMutation({
    onSuccess: (result) => {
      toast.success(`Found ${result.fileCount} matching files`);
    }
  });

  const resetForm = () => {
    setCollectionName("");
    setCollectionDescription("");
    setRules([{ field: "mimeType", operator: "=", value: "" }]);
    setSelectedTemplate("");
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = PREDEFINED_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setCollectionName(template.name);
      setCollectionDescription(template.description);
      setRules(template.rules);
    }
  };

  const addRule = () => {
    setRules([...rules, { field: "mimeType", operator: "=", value: "" }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, field: keyof SmartCollectionRule, value: string) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: value };
    
    // Reset operator when field changes
    if (field === "field") {
      const operators = OPERATOR_OPTIONS[value];
      newRules[index].operator = operators?.[0]?.value || "=";
      newRules[index].value = "";
    }
    
    setRules(newRules);
  };

  const handleCreate = () => {
    if (!collectionName.trim()) {
      toast.error("Please enter a collection name");
      return;
    }

    if (rules.some(r => !r.value.trim())) {
      toast.error("Please fill in all rule values");
      return;
    }

    createMutation.mutate({
      name: collectionName,
      description: collectionDescription,
      rules: rules as any
    });
  };

  const handleEvaluate = (id: number) => {
    evaluateMutation.mutate({ id });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Smart Collections</h2>
          <p className="text-muted-foreground">
            Auto-updating collections based on rules
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Smart Collection
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {smartCollections.map((collection) => (
          <Card key={collection.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate({ id: collection.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <CardTitle className="text-lg">{collection.name}</CardTitle>
              <CardDescription>{collection.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  {(typeof collection.rules === 'string' ? JSON.parse(collection.rules) : collection.rules).length} rule(s)
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleEvaluate(collection.id)}
                  disabled={evaluateMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Evaluate Now
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Smart Collection</DialogTitle>
            <DialogDescription>
              Define rules to automatically organize files
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Template Selector */}
            <div className="space-y-2">
              <Label>Start from Template (Optional)</Label>
              <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {PREDEFINED_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Collection Details */}
            <div className="space-y-2">
              <Label htmlFor="name">Collection Name</Label>
              <Input
                id="name"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="e.g., Large Images"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={collectionDescription}
                onChange={(e) => setCollectionDescription(e.target.value)}
                placeholder="e.g., All images larger than 5MB"
              />
            </div>

            {/* Rules Builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Rules (all must match)</Label>
                <Button variant="outline" size="sm" onClick={addRule}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rule
                </Button>
              </div>

              {rules.map((rule, index) => (
                <Card key={index}>
                  <CardContent className="pt-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <Select
                        value={rule.field}
                        onValueChange={(value) => updateRule(index, "field", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={rule.operator}
                        onValueChange={(value) => updateRule(index, "operator", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(OPERATOR_OPTIONS[rule.field] || []).map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        value={rule.value}
                        onChange={(e) => updateRule(index, "value", e.target.value)}
                        placeholder="Value"
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(index)}
                        disabled={rules.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Helper Text */}
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              <p className="font-medium mb-1">Examples:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>File Size &gt; 5242880 (5MB in bytes)</li>
                <li>File Type starts with "image/"</li>
                <li>Quality Score &gt; 70</li>
                <li>Last Updated within last N days 7</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
