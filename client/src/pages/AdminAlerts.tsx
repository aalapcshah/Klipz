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
import { Bell, Play, Trash2, Edit, Plus, Loader2, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

export function AdminAlerts() {
  return (
    <AdminLayout>
      <AlertsContent />
    </AdminLayout>
  );
}

function AlertsContent() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<any>(null);

  const { data: alerts, isLoading, refetch } = trpc.engagementAlerts.getAll.useQuery();
  const createMutation = trpc.engagementAlerts.create.useMutation();
  const updateMutation = trpc.engagementAlerts.update.useMutation();
  const deleteMutation = trpc.engagementAlerts.delete.useMutation();
  const checkNowMutation = trpc.engagementAlerts.checkNow.useMutation();

  const handleCreate = async (data: any) => {
    try {
      await createMutation.mutateAsync(data);
      toast.success("Engagement alert created successfully");
      setIsCreateDialogOpen(false);
      refetch();
    } catch (error) {
      toast.error("Failed to create engagement alert");
    }
  };

  const handleUpdate = async (id: number, data: any) => {
    try {
      await updateMutation.mutateAsync({ id, ...data });
      toast.success("Engagement alert updated successfully");
      setEditingAlert(null);
      refetch();
    } catch (error) {
      toast.error("Failed to update engagement alert");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this engagement alert?")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Engagement alert deleted successfully");
      refetch();
    } catch (error) {
      toast.error("Failed to delete engagement alert");
    }
  };

  const handleCheckNow = async (id: number) => {
    try {
      const result = await checkNowMutation.mutateAsync({ id });
      if (result.triggered) {
        toast.warning(`Alert triggered! Current value: ${result.currentValue}, Threshold: ${result.thresholdValue}`);
      } else {
        toast.success(`Alert checked. Current value: ${result.currentValue} (threshold not crossed)`);
      }
      refetch();
    } catch (error) {
      toast.error("Failed to check alert");
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
          <h1 className="text-3xl font-bold">Engagement Alerts</h1>
          <p className="text-muted-foreground">
            Monitor key metrics and get notified when thresholds are crossed
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Alert
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Engagement Alert</DialogTitle>
              <DialogDescription>
                Set up automatic monitoring for engagement metrics
              </DialogDescription>
            </DialogHeader>
            <AlertForm
              onSubmit={handleCreate}
              onCancel={() => setIsCreateDialogOpen(false)}
              isSubmitting={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {alerts && alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Engagement Alerts</h3>
            <p className="text-muted-foreground mb-4">
              Create your first alert to monitor key engagement metrics
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Alert
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
            <CardDescription>
              Manage your engagement metric monitoring alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Last Value</TableHead>
                  <TableHead>Last Checked</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts?.map((alert) => {
                  const Icon = alert.thresholdType === "below" ? TrendingDown : TrendingUp;
                  const wasTriggered = alert.lastValue !== null && (
                    (alert.thresholdType === "below" && alert.lastValue < alert.thresholdValue) ||
                    (alert.thresholdType === "above" && alert.lastValue > alert.thresholdValue)
                  );
                  
                  return (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">{alert.name}</TableCell>
                      <TableCell className="uppercase">{alert.metricType.replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Icon className="h-4 w-4" />
                          {alert.thresholdValue}
                        </div>
                      </TableCell>
                      <TableCell>
                        {alert.lastValue !== null ? (
                          <span className={wasTriggered ? "text-destructive font-semibold" : ""}>
                            {alert.lastValue}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not checked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {alert.lastCheckedAt
                          ? new Date(alert.lastCheckedAt).toLocaleString()
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={alert.enabled ? "default" : "secondary"}>
                          {alert.enabled ? "Active" : "Disabled"}
                        </Badge>
                        {wasTriggered && alert.enabled && (
                          <Badge variant="destructive" className="ml-2">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Triggered
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCheckNow(alert.id)}
                            disabled={checkNowMutation.isPending}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingAlert(alert)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(alert.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingAlert} onOpenChange={() => setEditingAlert(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Engagement Alert</DialogTitle>
            <DialogDescription>
              Update the configuration for this engagement alert
            </DialogDescription>
          </DialogHeader>
          {editingAlert && (
            <AlertForm
              initialData={editingAlert}
              onSubmit={(data) => handleUpdate(editingAlert.id, data)}
              onCancel={() => setEditingAlert(null)}
              isSubmitting={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AlertFormProps {
  initialData?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function AlertForm({ initialData, onSubmit, onCancel, isSubmitting }: AlertFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    metricType: initialData?.metricType || "dau",
    thresholdType: initialData?.thresholdType || "below",
    thresholdValue: initialData?.thresholdValue?.toString() || "100",
    notifyEmails: initialData?.notifyEmails || "",
    checkFrequency: initialData?.checkFrequency || "daily",
    enabled: initialData?.enabled ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onSubmit({
      name: formData.name,
      description: formData.description || undefined,
      metricType: formData.metricType,
      thresholdType: formData.thresholdType,
      thresholdValue: parseInt(formData.thresholdValue),
      notifyEmails: formData.notifyEmails,
      checkFrequency: formData.checkFrequency,
      enabled: formData.enabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Alert Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Low DAU Alert"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe when this alert should trigger..."
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="metricType">Metric *</Label>
          <Select
            value={formData.metricType}
            onValueChange={(value) => setFormData({ ...formData, metricType: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dau">Daily Active Users (DAU)</SelectItem>
              <SelectItem value="wau">Weekly Active Users (WAU)</SelectItem>
              <SelectItem value="mau">Monthly Active Users (MAU)</SelectItem>
              <SelectItem value="retention_day1">Day 1 Retention %</SelectItem>
              <SelectItem value="retention_day7">Day 7 Retention %</SelectItem>
              <SelectItem value="retention_day30">Day 30 Retention %</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="checkFrequency">Check Frequency *</Label>
          <Select
            value={formData.checkFrequency}
            onValueChange={(value) => setFormData({ ...formData, checkFrequency: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="thresholdType">Condition *</Label>
          <Select
            value={formData.thresholdType}
            onValueChange={(value) => setFormData({ ...formData, thresholdType: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="below">Falls Below</SelectItem>
              <SelectItem value="above">Exceeds</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="thresholdValue">Threshold Value *</Label>
          <Input
            id="thresholdValue"
            type="number"
            min="0"
            value={formData.thresholdValue}
            onChange={(e) => setFormData({ ...formData, thresholdValue: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notifyEmails">Notification Emails (comma-separated) *</Label>
        <Textarea
          id="notifyEmails"
          value={formData.notifyEmails}
          onChange={(e) => setFormData({ ...formData, notifyEmails: e.target.value })}
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
          Enable this alert
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initialData ? "Update Alert" : "Create Alert"}
        </Button>
      </div>
    </form>
  );
}
