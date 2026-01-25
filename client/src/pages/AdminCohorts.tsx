import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Loader2, Plus, X, Sparkles, Save, Trash2, FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cohortTemplates, getCohortTemplate } from "@/lib/cohortTemplates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminCohorts() {
  return (
    <AdminLayout>
      <CohortsContent />
    </AdminLayout>
  );
}

interface Cohort {
  name: string;
  startDate: Date;
  endDate: Date;
}

function CohortsContent() {
  const [cohorts, setCohorts] = useState<Cohort[]>([
    {
      name: "January 2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-31"),
    },
  ]);

  const [results, setResults] = useState<any[] | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");

  const compareMutation = trpc.admin.compareCohorts.useMutation();
  const saveMutation = trpc.admin.saveCohortComparison.useMutation();
  const { data: savedComparisons, refetch: refetchSaved } = trpc.admin.getSavedCohortComparisons.useQuery();
  const deleteMutation = trpc.admin.deleteSavedCohortComparison.useMutation();

  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const addCohort = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    setCohorts([
      ...cohorts,
      {
        name: `Cohort ${cohorts.length + 1}`,
        startDate: startOfMonth,
        endDate: endOfMonth,
      },
    ]);
  };

  const addCohortFromTemplate = (templateId: string) => {
    const template = getCohortTemplate(templateId);
    if (!template) return;

    const { startDate, endDate } = template.getDateRange();
    setCohorts([
      ...cohorts,
      {
        name: template.name,
        startDate,
        endDate,
      },
    ]);
    setSelectedTemplate("");
    toast.success(`Added ${template.name} cohort`);
  };

  const removeCohort = (index: number) => {
    setCohorts(cohorts.filter((_, i) => i !== index));
  };

  const updateCohort = (index: number, updates: Partial<Cohort>) => {
    const updated = [...cohorts];
    updated[index] = { ...updated[index], ...updates };
    setCohorts(updated);
  };

  const handleCompare = async () => {
    try {
      const result = await compareMutation.mutateAsync(cohorts);
      setResults(result);
      toast.success("Cohort analysis complete");
    } catch (error) {
      toast.error("Failed to analyze cohorts");
    }
  };

  const handleSave = async () => {
    if (!results || cohorts.length < 2) {
      toast.error("Please run a comparison first");
      return;
    }

    if (!saveName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    try {
      await saveMutation.mutateAsync({
        name: saveName,
        description: saveDescription,
        cohort1Name: cohorts[0].name,
        cohort1StartDate: cohorts[0].startDate.toISOString(),
        cohort1EndDate: cohorts[0].endDate.toISOString(),
        cohort2Name: cohorts[1].name,
        cohort2StartDate: cohorts[1].startDate.toISOString(),
        cohort2EndDate: cohorts[1].endDate.toISOString(),
        results,
      });

      toast.success("Comparison saved successfully");
      setShowSaveDialog(false);
      setSaveName("");
      setSaveDescription("");
      refetchSaved();
    } catch (error) {
      toast.error("Failed to save comparison");
    }
  };

  const handleLoadSaved = (saved: any) => {
    setCohorts([
      {
        name: saved.cohort1Name,
        startDate: new Date(saved.cohort1StartDate),
        endDate: new Date(saved.cohort1EndDate),
      },
      {
        name: saved.cohort2Name,
        startDate: new Date(saved.cohort2StartDate),
        endDate: new Date(saved.cohort2EndDate),
      },
    ]);
    setResults(saved.results);
    toast.success(`Loaded ${saved.name}`);
  };

  const handleDeleteSaved = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Comparison deleted");
      refetchSaved();
    } catch (error) {
      toast.error("Failed to delete comparison");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cohort Analysis</h1>
        <p className="text-muted-foreground">
          Compare user groups side-by-side to identify trends and optimize onboarding
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Define Cohorts</CardTitle>
          <CardDescription>
            Create cohorts based on user signup date ranges
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cohorts.map((cohort, index) => (
            <div key={index} className="flex items-end gap-4 p-4 border rounded-lg">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`name-${index}`}>Cohort Name</Label>
                <Input
                  id={`name-${index}`}
                  value={cohort.name}
                  onChange={(e) => updateCohort(index, { name: e.target.value })}
                  placeholder="January 2026"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`start-${index}`}>Start Date</Label>
                <Input
                  id={`start-${index}`}
                  type="date"
                  value={cohort.startDate.toISOString().split("T")[0]}
                  onChange={(e) =>
                    updateCohort(index, { startDate: new Date(e.target.value) })
                  }
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`end-${index}`}>End Date</Label>
                <Input
                  id={`end-${index}`}
                  type="date"
                  value={cohort.endDate.toISOString().split("T")[0]}
                  onChange={(e) =>
                    updateCohort(index, { endDate: new Date(e.target.value) })
                  }
                />
              </div>
              {cohorts.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCohort(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {/* Template Selector */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <Label className="font-semibold">Quick Add from Template</Label>
            </div>
            <div className="flex gap-2">
              <Select value={selectedTemplate} onValueChange={addCohortFromTemplate}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a preset cohort..." />
                </SelectTrigger>
                <SelectContent>
                  {cohortTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div>
                        <div className="font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {template.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={addCohort}>
              <Plus className="h-4 w-4 mr-2" />
              Add Custom Cohort
            </Button>
            <Button
              onClick={handleCompare}
              disabled={compareMutation.isPending || cohorts.length === 0}
            >
              {compareMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Compare Cohorts
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Saved Comparisons */}
      {savedComparisons && savedComparisons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <FolderOpen className="h-5 w-5 inline mr-2" />
              Saved Comparisons
            </CardTitle>
            <CardDescription>
              Quick load previously saved cohort analyses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedComparisons.map((saved: any) => (
                <div key={saved.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{saved.name}</div>
                    {saved.description && (
                      <div className="text-sm text-muted-foreground">{saved.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {saved.cohort1Name} vs {saved.cohort2Name}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLoadSaved(saved)}
                    >
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSaved(saved.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {results && results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Comparison Results</CardTitle>
              <CardDescription>
                Side-by-side metrics for each cohort
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    {results.map((result, index) => (
                      <TableHead key={index}>{result.cohortName}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Total Users</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>{result.totalUsers}</TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Active Users</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activeUsers} (
                        {result.totalUsers > 0
                          ? Math.round((result.activeUsers / result.totalUsers) * 100)
                          : 0}
                        %)
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Total Activities</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>{result.totalActivities}</TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Avg Activities/User</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.averageActivitiesPerUser}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Day 1 Retention</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>{result.retentionDay1}%</TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Day 7 Retention</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>{result.retentionDay7}%</TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Day 30 Retention</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>{result.retentionDay30}%</TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium" colSpan={results.length + 1}>
                      Activity Breakdown
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Uploads</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activityBreakdown.upload}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Views</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activityBreakdown.view}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Edits</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activityBreakdown.edit}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Tags</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activityBreakdown.tag}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Shares</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activityBreakdown.share}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Deletes</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activityBreakdown.delete}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Enrichments</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activityBreakdown.enrich}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Exports</TableCell>
                    {results.map((result, index) => (
                      <TableCell key={index}>
                        {result.activityBreakdown.export}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setShowSaveDialog(true)}>
                <Save className="h-4 w-4 mr-2" />
                Save Comparison
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Cohort Comparison</DialogTitle>
            <DialogDescription>
              Save this comparison for quick reference later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="save-name">Name</Label>
              <Input
                id="save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Q1 vs Q2 Performance"
              />
            </div>
            <div>
              <Label htmlFor="save-description">Description (optional)</Label>
              <Textarea
                id="save-description"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Comparison notes..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!results && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Results Yet</h3>
            <p className="text-muted-foreground">
              Define cohorts above and click "Compare Cohorts" to see the analysis
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
