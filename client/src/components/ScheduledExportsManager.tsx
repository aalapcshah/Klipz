import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar, Clock, Download, Plus, Trash2, Edit, History } from "lucide-react";
import { toast } from "sonner";

export function ScheduledExportsManager() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingExport, setEditingExport] = useState<any>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedExportId, setSelectedExportId] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [exportType, setExportType] = useState<"video" | "files" | "metadata">("files");
  const [format, setFormat] = useState<"mp4" | "csv" | "json" | "zip">("csv");
  const [schedule, setSchedule] = useState<"daily" | "weekly" | "monthly">("daily");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [emailNotification, setEmailNotification] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState("");

  const { data: scheduledExports = [], refetch } = trpc.scheduledExports.list.useQuery();
  const { data: history = [] } = trpc.scheduledExports.history.useQuery(
    { scheduledExportId: selectedExportId || undefined, limit: 20 },
    { enabled: historyDialogOpen }
  );

  const createMutation = trpc.scheduledExports.create.useMutation();
  const updateMutation = trpc.scheduledExports.update.useMutation();
  const deleteMutation = trpc.scheduledExports.delete.useMutation();

  const resetForm = () => {
    setName("");
    setExportType("files");
    setFormat("csv");
    setSchedule("daily");
    setScheduleTime("09:00");
    setDayOfWeek(1);
    setDayOfMonth(1);
    setEmailNotification(true);
    setNotificationEmail("");
    setEditingExport(null);
  };

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        name,
        exportType,
        format,
        schedule,
        scheduleTime,
        dayOfWeek: schedule === "weekly" ? dayOfWeek : undefined,
        dayOfMonth: schedule === "monthly" ? dayOfMonth : undefined,
        emailNotification,
        notificationEmail: emailNotification ? notificationEmail : undefined,
      });
      toast.success("Scheduled export created");
      setCreateDialogOpen(false);
      resetForm();
      refetch();
    } catch (error) {
      toast.error("Failed to create scheduled export");
    }
  };

  const handleUpdate = async (id: number, updates: any) => {
    try {
      await updateMutation.mutateAsync({ id, ...updates });
      toast.success("Scheduled export updated");
      refetch();
    } catch (error) {
      toast.error("Failed to update scheduled export");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this scheduled export?")) return;
    
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Scheduled export deleted");
      refetch();
    } catch (error) {
      toast.error("Failed to delete scheduled export");
    }
  };

  const formatSchedule = (exp: any) => {
    const parts = [];
    parts.push(exp.schedule.charAt(0).toUpperCase() + exp.schedule.slice(1));
    
    if (exp.schedule === "weekly" && exp.dayOfWeek !== null) {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      parts.push(`on ${days[exp.dayOfWeek]}`);
    }
    
    if (exp.schedule === "monthly" && exp.dayOfMonth !== null) {
      parts.push(`on day ${exp.dayOfMonth}`);
    }
    
    parts.push(`at ${exp.scheduleTime}`);
    return parts.join(" ");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Scheduled Exports</h2>
          <p className="text-muted-foreground">Automate your file and video exports</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Schedule
        </Button>
      </div>

      {scheduledExports.length === 0 ? (
        <Card className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Scheduled Exports</h3>
          <p className="text-muted-foreground mb-4">
            Create your first scheduled export to automate file exports
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Schedule
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {scheduledExports.map((exp) => (
            <Card key={exp.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{exp.name}</h3>
                    <span className={`px-2 py-1 rounded text-xs ${exp.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
                      {exp.isActive ? "Active" : "Paused"}
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      <span>
                        {exp.exportType.charAt(0).toUpperCase() + exp.exportType.slice(1)} export as {exp.format.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{formatSchedule(exp)}</span>
                    </div>
                    {exp.nextRunAt && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>Next run: {new Date(exp.nextRunAt).toLocaleString()}</span>
                      </div>
                    )}
                    {exp.lastRunAt && (
                      <div className="flex items-center gap-2 text-xs">
                        <History className="h-3 w-3" />
                        <span>
                          Last run: {new Date(exp.lastRunAt).toLocaleString()}
                          {exp.lastRunStatus && ` (${exp.lastRunStatus})`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedExportId(exp.id);
                      setHistoryDialogOpen(true);
                    }}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={exp.isActive}
                    onCheckedChange={(checked) => handleUpdate(exp.id, { isActive: checked })}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(exp.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Scheduled Export</DialogTitle>
            <DialogDescription>
              Set up an automated export that runs on a schedule
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Export Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Daily file backup"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="exportType">Export Type</Label>
                <Select value={exportType} onValueChange={(v: any) => setExportType(v)}>
                  <SelectTrigger id="exportType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="files">Files</SelectItem>
                    <SelectItem value="video">Videos</SelectItem>
                    <SelectItem value="metadata">Metadata Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="format">Format</Label>
                <Select value={format} onValueChange={(v: any) => setFormat(v)}>
                  <SelectTrigger id="format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {exportType === "video" ? (
                      <SelectItem value="mp4">MP4</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="zip">ZIP Archive</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="schedule">Schedule</Label>
                <Select value={schedule} onValueChange={(v: any) => setSchedule(v)}>
                  <SelectTrigger id="schedule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="scheduleTime">Time</Label>
                <Input
                  id="scheduleTime"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>

            {schedule === "weekly" && (
              <div>
                <Label htmlFor="dayOfWeek">Day of Week</Label>
                <Select value={dayOfWeek.toString()} onValueChange={(v) => setDayOfWeek(Number(v))}>
                  <SelectTrigger id="dayOfWeek">
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

            {schedule === "monthly" && (
              <div>
                <Label htmlFor="dayOfMonth">Day of Month</Label>
                <Input
                  id="dayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="emailNotification">Email Notification</Label>
                <Switch
                  id="emailNotification"
                  checked={emailNotification}
                  onCheckedChange={setEmailNotification}
                />
              </div>
              {emailNotification && (
                <Input
                  placeholder="your@email.com"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name || createMutation.isPending}>
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Export History</DialogTitle>
            <DialogDescription>
              View past export executions and their results
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No export history yet</p>
            ) : (
              history.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.status === "completed" ? "bg-green-500/20 text-green-400" :
                          item.status === "failed" ? "bg-red-500/20 text-red-400" :
                          "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {item.status}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {item.itemCount && (
                        <p className="text-sm mt-1">{item.itemCount} items exported</p>
                      )}
                      {item.errorMessage && (
                        <p className="text-sm text-red-400 mt-1">{item.errorMessage}</p>
                      )}
                    </div>
                    {item.fileUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(item.fileUrl!, "_blank")}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
