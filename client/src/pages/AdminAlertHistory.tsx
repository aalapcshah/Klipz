import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { History, Loader2, TrendingDown, TrendingUp, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

export function AdminAlertHistory() {
  return (
    <AdminLayout>
      <AlertHistoryContent />
    </AdminLayout>
  );
}

function AlertHistoryContent() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<"triggered" | "resolved" | "acknowledged">("acknowledged");
  const [notes, setNotes] = useState("");

  const { data: logs, isLoading, refetch } = trpc.alertHistory.getAll.useQuery({
    status: statusFilter as any,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: 100,
  });

  const { data: stats } = trpc.alertHistory.getStats.useQuery();

  const updateStatusMutation = trpc.alertHistory.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Alert status updated");
      setSelectedLog(null);
      setNotes("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  const handleUpdateStatus = () => {
    if (!selectedLog) return;
    updateStatusMutation.mutate({
      id: selectedLog.id,
      status: newStatus,
      notes: notes || undefined,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "triggered":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case "resolved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "acknowledged":
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "triggered":
        return "destructive";
      case "resolved":
        return "default";
      case "acknowledged":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <History className="h-8 w-8" />
          Alert Notification History
        </h1>
        <p className="text-muted-foreground mt-2">
          Track all alert triggers and their resolution status
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Triggered</CardDescription>
            <CardTitle className="text-3xl">{stats?.totalTriggered || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Triggered Today</CardDescription>
            <CardTitle className="text-3xl">{stats?.triggeredToday || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-orange-600 dark:text-orange-400">
              Unresolved
            </CardDescription>
            <CardTitle className="text-3xl text-orange-600 dark:text-orange-400">
              {stats?.unresolved || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="triggered">Triggered</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alert History</CardTitle>
          <CardDescription>
            {logs?.length || 0} alert{logs?.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No alert history found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alert Name</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Triggered At</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.alertName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {log.metricType?.toUpperCase()}
                        </Badge>
                        {log.thresholdType === "below" ? (
                          <TrendingDown className="h-4 w-4 text-orange-500" />
                        ) : (
                          <TrendingUp className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(log.triggeredAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {log.metricValue.toFixed(log.metricType?.includes("retention") ? 1 : 0)}
                      {log.metricType?.includes("retention") && "%"}
                    </TableCell>
                    <TableCell>
                      {log.thresholdValue}
                      {log.metricType?.includes("retention") && "%"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(log.status) as any} className="flex items-center gap-1 w-fit">
                        {getStatusIcon(log.status)}
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedLog(log);
                          setNewStatus(log.status === "triggered" ? "acknowledged" : log.status);
                          setNotes(log.notes || "");
                        }}
                      >
                        Update
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Update Status Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Alert Status</DialogTitle>
            <DialogDescription>
              Change the status and add notes for this alert
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Alert</Label>
              <p className="text-sm font-medium mt-1">{selectedLog?.alertName}</p>
              <p className="text-xs text-muted-foreground">
                Triggered at {selectedLog && new Date(selectedLog.triggeredAt).toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="triggered">Triggered</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this alert..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedLog(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateStatus} disabled={updateStatusMutation.isPending}>
                {updateStatusMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update Status
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
