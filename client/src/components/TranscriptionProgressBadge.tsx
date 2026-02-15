import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Loader2, Music, Mic, Upload, CheckCircle2, FileAudio } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface TranscriptionProgressBadgeProps {
  fileId: number;
  /** Compact mode shows just a badge, full mode shows badge + progress bar */
  compact?: boolean;
}

const PHASE_CONFIG: Record<string, { label: string; icon: typeof Loader2; percent: number; color: string }> = {
  extracting_audio: { label: "Extracting audio", icon: Music, percent: 15, color: "text-blue-400" },
  chunking_audio: { label: "Splitting audio", icon: FileAudio, percent: 30, color: "text-blue-400" },
  uploading_audio: { label: "Uploading audio", icon: Upload, percent: 40, color: "text-cyan-400" },
  transcribing_whisper: { label: "Transcribing", icon: Mic, percent: 60, color: "text-emerald-400" },
  transcribing_chunks: { label: "Transcribing chunks", icon: Mic, percent: 65, color: "text-emerald-400" },
  processing_results: { label: "Processing", icon: CheckCircle2, percent: 90, color: "text-amber-400" },
};

export function TranscriptionProgressBadge({ fileId, compact = false }: TranscriptionProgressBadgeProps) {
  const { data: status } = trpc.videoTranscription.getTranscriptionStatus.useQuery(
    { fileId },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 3000;
        if (data.status === "processing" || data.status === "pending") return 2000;
        return false; // Stop polling when done
      },
      staleTime: 1000,
    }
  );

  if (!status || (status.status !== "processing" && status.status !== "pending")) {
    return null;
  }

  const phase = status.phase ? PHASE_CONFIG[status.phase] : null;
  const percent = phase?.percent ?? 10;
  const label = phase?.label ?? "Starting...";
  const Icon = phase?.icon ?? Loader2;
  const color = phase?.color ?? "text-amber-500";

  if (compact) {
    return (
      <Badge variant="outline" className={`text-xs flex items-center gap-1 ${color} border-amber-500/30 bg-amber-500/5`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {label} ({percent}%)
      </Badge>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${status.phase === "processing_results" ? "" : "animate-spin"} ${color}`} />
        <span className={`text-sm font-medium ${color}`}>{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{percent}%</span>
      </div>
      <Progress value={percent} className="h-1.5" />
      {status.method && (
        <p className="text-xs text-muted-foreground">
          Method: {status.method === "whisper_extracted" ? "Audio extraction → Whisper" : status.method === "whisper" ? "Direct Whisper" : status.method === "whisper_chunked" ? "Chunked audio → Whisper" : status.method}
        </p>
      )}
    </div>
  );
}
