import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Play, Trash2, Edit, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AdminScheduledReports() {
  return (
    <AdminLayout>
      <ScheduledReportsContent />
    </AdminLayout>
  );
}

function ScheduledReportsContent() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<any>(null);

  const { data: reports, isLoading, refetch } = trpc.scheduledReports.getAll.useQuery();
  const createMutation = trpc.scheduledReports.create.useMutation();
  const updateMutation = trpc.scheduledReports.update.useMutation();
  const deleteMutation = trpc.scheduledReports.delete.useMutation();
  const runNowMutation = trpc.scheduledReports.runNow.useMutation();

  const handleCreate = async (data: any) => {
    try {
      await createMutation.mutateAsync(data);
      toast.success("Scheduled report created successfully");
      setIsCreateDialogOpen(false);
      refetch();
    } catch (error) {
      toast.error("Failed to create scheduled report");
    }
  };

  const handleUpdate = async (id: number, data: any) => {
    try {
      await updateMutation.mutateAsync({ id, ...data });
      toast.success("Scheduled report updated successfully");
      setEditingReport(null);
      refetch();
    } catch (error) {
      toast.error("Failed to update scheduled report");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this scheduled report?")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Scheduled report deleted successfully");
      refetch();
    } catch (error) {
      toast.error("Failed to delete scheduled report");
    }
  };

  const handleRunNow = async (id: number) => {
    try {
      await runNowMutation.mutateAsync({ id });
      toast.success("Report is being generated and will be sent shortly");
      refetch();
    } catch (error) {
      toast.error("Failed to run report");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scheduled Reports</h1>
          <p className="text-muted-foreground">
            Automate activity report delivery on a recurring schedule
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Scheduled Report</DialogTitle>
              <DialogDescription>
                Configure a recurring activity report to be emailed automatically
              </DialogDescription>
            </DialogHeader>
            <ReportForm
              onSubmit={handleCreate}
              onCancel={() => setIsCreateDialogOpen(false)}
              isSubmitting={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {reports && reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Scheduled Reports</h3>
            <p className="text-muted-foreground mb-4">
              Create your first scheduled report to automate activity report delivery
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Schedule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Active Schedules</CardTitle>
            <CardDescription>
              Manage your automated activity report schedules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports?.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.name}</TableCell>
                    <TableCell className="capitalize">{report.frequency}</TableCell>
                    <TableCell className="uppercase">{report.format}</TableCell>
                    <TableCell>
                      {report.recipients.split(",").length} recipient(s)
                    </TableCell>
                    <TableCell>
                      {report.nextRunAt
                        ? new Date(report.nextRunAt).toLocaleString()
                        : "Not scheduled"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={report.enabled ? "default" : "secondary"}>
                        {report.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRunNow(report.id)}
                          disabled={runNowMutation.isPending}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingReport(report)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(report.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingReport} onOpenChange={() => setEditingReport(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Scheduled Report</DialogTitle>
            <DialogDescription>
              Update the configuration for this scheduled report
            </DialogDescription>
          </DialogHeader>
          {editingReport && (
            <ReportForm
              initialData={editingReport}
              onSubmit={(data) => handleUpdate(editingReport.id, data)}
              onCancel={() => setEditingReport(null)}
              isSubmitting={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ReportFormProps {
  initialData?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function ReportForm({ initialData, onSubmit, onCancel, isSubmitting }: ReportFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    frequency: initialData?.frequency || "weekly",
    dayOfWeek: initialData?.dayOfWeek?.toString() || "1",
    dayOfMonth: initialData?.dayOfMonth?.toString() || "1",
    timeOfDay: initialData?.timeOfDay || "09:00",
    recipients: initialData?.recipients || "",
    format: initialData?.format || "excel",
    enabled: initialData?.enabled ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data: any = {
      name: formData.name,
      description: formData.description || undefined,
      frequency: formData.frequency as "daily" | "weekly" | "monthly",
      timeOfDay: formData.timeOfDay,
      recipients: formData.recipients,
      format: formData.format as "csv" | "excel",
      enabled: formData.enabled,
    };

    if (formData.frequency === "weekly") {
      data.dayOfWeek = parseInt(formData.dayOfWeek);
    } else if (formData.frequency === "monthly") {
      data.dayOfMonth = parseInt(formData.dayOfMonth);
    }

    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Report Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Weekly Activity Report"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe what this report includes..."
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="frequency">Frequency *</Label>
          <Select
            value={formData.frequency}
            onValueChange={(value) => setFormData({ ...formData, frequency: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.frequency === "weekly" && (
          <div className="space-y-2">
            <Label htmlFor="dayOfWeek">Day of Week *</Label>
            <Select
              value={formData.dayOfWeek}
              onValueChange={(value) => setFormData({ ...formData, dayOfWeek: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sunday</SelectItem>
                <SelectItem value="1">Monday</SelectItem>
                <SelectItem value="2">Tuesday</SelectItem>
                <SelectItem value="3">Wednesday</SelectItem>
                <SelectItem value="4">Thursday</SelectItem>
                <SelectItem value="5">Friday</SelectItem>
                <SelectItem value="6">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {formData.frequency === "monthly" && (
          <div className="space-y-2">
            <Label htmlFor="dayOfMonth">Day of Month *</Label>
            <Input
              id="dayOfMonth"
              type="number"
              min="1"
              max="31"
              value={formData.dayOfMonth}
              onChange={(e) => setFormData({ ...formData, dayOfMonth: e.target.value })}
              required
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="timeOfDay">Time of Day *</Label>
          <Input
            id="timeOfDay"
            type="time"
            value={formData.timeOfDay}
            onChange={(e) => setFormData({ ...formData, timeOfDay: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="format">Format *</Label>
          <Select
            value={formData.format}
            onValueChange={(value) => setFormData({ ...formData, format: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="excel">Excel</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recipients">Recipients (comma-separated emails) *</Label>
        <Textarea
          id="recipients"
          value={formData.recipients}
          onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
          placeholder="admin@example.com, manager@example.com"
          rows={2}
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={formData.enabled}
          onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          className="rounded"
        />
        <Label htmlFor="enabled" className="cursor-pointer">
          Enable this schedule
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initialData ? "Update Schedule" : "Create Schedule"}
        </Button>
      </div>
    </form>
  );
}
