import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
} from "lucide-react";

interface BulkInviteDialogProps {
  onSuccess?: () => void;
}

export function BulkInviteDialog({ onSuccess }: BulkInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [rawInput, setRawInput] = useState("");
  const [step, setStep] = useState<"input" | "preview" | "results">("input");
  const [results, setResults] = useState<{
    results: { email: string; status: string }[];
    summary: {
      total: number;
      sent: number;
      skippedMember: number;
      skippedPending: number;
      skippedCapacity: number;
      failed: number;
    };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const bulkInviteMutation = trpc.teams.bulkInvite.useMutation({
    onSuccess: (data) => {
      setResults(data);
      setStep("results");
      utils.teams.getPendingInvites.invalidate();
      utils.teams.getMyTeam.invalidate();
      onSuccess?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const parseEmails = (text: string): string[] => {
    // Split by commas, newlines, semicolons, or whitespace
    const raw = text.split(/[,;\n\r\s]+/).filter(Boolean);
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = raw.filter((e) => emailRegex.test(e.trim().toLowerCase()));
    // Deduplicate
    return Array.from(new Set(valid.map((e) => e.trim().toLowerCase())));
  };

  const handleTextChange = (text: string) => {
    setRawInput(text);
    setEmails(parseEmails(text));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      // For CSV, extract emails from each row (first column or any column with @)
      const lines = text.split(/\r?\n/);
      const foundEmails: string[] = [];
      const emailRegex = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/g;

      for (const line of lines) {
        const matches = line.match(emailRegex);
        if (matches) {
          foundEmails.push(...matches);
        }
      }

      const uniqueEmails = Array.from(new Set(foundEmails.map((e) => e.toLowerCase())));
      setRawInput(uniqueEmails.join("\n"));
      setEmails(uniqueEmails);
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendInvites = () => {
    if (emails.length === 0) return;
    bulkInviteMutation.mutate({ emails });
  };

  const handleClose = () => {
    setOpen(false);
    // Reset state after animation
    setTimeout(() => {
      setStep("input");
      setEmails([]);
      setRawInput("");
      setResults(null);
    }, 200);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case "skipped_member":
        return <AlertCircle className="h-4 w-4 text-yellow-400" />;
      case "skipped_pending":
        return <AlertCircle className="h-4 w-4 text-blue-400" />;
      case "skipped_capacity":
        return <AlertCircle className="h-4 w-4 text-orange-400" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "sent":
        return "Invited";
      case "skipped_member":
        return "Already a member";
      case "skipped_pending":
        return "Already invited";
      case "skipped_capacity":
        return "No seats available";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Bulk Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {step === "input" && (
          <>
            <DialogHeader>
              <DialogTitle>Bulk Invite Members</DialogTitle>
              <DialogDescription>
                Paste email addresses or upload a CSV file to invite multiple people at once.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Textarea
                  placeholder={"Paste emails here (one per line, or comma/semicolon separated)\n\nalice@company.com\nbob@company.com\ncharlie@company.com"}
                  value={rawInput}
                  onChange={(e) => handleTextChange(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
                {emails.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {emails.length} valid email{emails.length !== 1 ? "s" : ""} detected
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV File
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Accepts .csv, .txt, or .tsv files. Emails will be extracted automatically.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={emails.length === 0}
              >
                <Users className="h-4 w-4 mr-2" />
                Preview ({emails.length})
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Bulk Invite</DialogTitle>
              <DialogDescription>
                Review the email addresses below before sending invites.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-3">
                {emails.map((email, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 py-1 px-2 rounded text-sm"
                  >
                    <span className="text-muted-foreground text-xs w-6 text-right">{i + 1}.</span>
                    <span className="font-mono">{email}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                {emails.length} invite{emails.length !== 1 ? "s" : ""} will be sent. Existing members and pending invites will be skipped.
              </p>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button
                onClick={handleSendInvites}
                disabled={bulkInviteMutation.isPending}
              >
                {bulkInviteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Send {emails.length} Invite{emails.length !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "results" && results && (
          <>
            <DialogHeader>
              <DialogTitle>Bulk Invite Results</DialogTitle>
              <DialogDescription>
                {results.summary.sent} of {results.summary.total} invites sent successfully.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              {/* Summary badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {results.summary.sent > 0 && (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {results.summary.sent} Sent
                  </Badge>
                )}
                {results.summary.skippedMember > 0 && (
                  <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">
                    {results.summary.skippedMember} Already Members
                  </Badge>
                )}
                {results.summary.skippedPending > 0 && (
                  <Badge variant="outline" className="text-blue-400 border-blue-400/30">
                    {results.summary.skippedPending} Already Invited
                  </Badge>
                )}
                {results.summary.skippedCapacity > 0 && (
                  <Badge variant="outline" className="text-orange-400 border-orange-400/30">
                    {results.summary.skippedCapacity} No Seats
                  </Badge>
                )}
                {results.summary.failed > 0 && (
                  <Badge variant="outline" className="text-red-400 border-red-400/30">
                    {results.summary.failed} Failed
                  </Badge>
                )}
              </div>

              {/* Detailed results */}
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-3">
                {results.results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1 px-2 rounded text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(r.status)}
                      <span className="font-mono text-xs">{r.email}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {getStatusLabel(r.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
