import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, FileJson, Database } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function DataExport() {
  const [exporting, setExporting] = useState(false);

  const exportMutation = trpc.user.exportData.useMutation();

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportMutation.mutateAsync();
      
      // Create downloadable JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `metaclips-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Data exported successfully!");
    } catch (error) {
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle>Export Your Data</CardTitle>
        </div>
        <CardDescription>
          Download all your personal data and files metadata in JSON format (GDPR Right to Data Portability)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Your export will include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account information and profile data</li>
            <li>All file metadata (titles, descriptions, tags)</li>
            <li>Collections and organization data</li>
            <li>Voice annotations and transcriptions</li>
            <li>Activity history and preferences</li>
          </ul>
          <p className="mt-4 text-xs">
            Note: Actual file content is not included in the export. To download your files, use the download button on each file.
          </p>
        </div>

        <Button
          onClick={handleExport}
          disabled={exporting}
          className="w-full sm:w-auto"
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
