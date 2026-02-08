import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Captions,
  Files,
  Loader2,
  ExternalLink,
  Clock,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface VideoCardDetailsProps {
  videoId: number;
  fileId: number | null;
  hasTranscript: boolean; // from video.transcript field
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoCardDetails({ videoId, fileId, hasTranscript }: VideoCardDetailsProps) {
  const [expandedSection, setExpandedSection] = useState<"transcript" | "captions" | "matches" | null>(null);

  // Fetch transcript data when expanded
  const { data: transcript, isLoading: transcriptLoading } = trpc.videoTranscription.getTranscript.useQuery(
    { fileId: fileId! },
    { enabled: expandedSection === "transcript" && !!fileId }
  );

  // Fetch visual captions when expanded
  const { data: captions, isLoading: captionsLoading } = trpc.videoVisualCaptions.getCaptions.useQuery(
    { fileId: fileId! },
    { enabled: (expandedSection === "captions" || expandedSection === "matches") && !!fileId }
  );

  // Fetch file matches when expanded
  const { data: fileMatches, isLoading: matchesLoading } = trpc.videoVisualCaptions.getFileMatches.useQuery(
    { fileId: fileId! },
    { enabled: expandedSection === "matches" && !!fileId }
  );

  // Also fetch transcript-based file suggestions
  const { data: fileSuggestions, isLoading: suggestionsLoading } = trpc.videoTranscription.getFileSuggestions.useQuery(
    { fileId: fileId! },
    { enabled: expandedSection === "matches" && !!fileId }
  );

  const toggleSection = (section: "transcript" | "captions" | "matches") => {
    if (!fileId) {
      toast.error("This video doesn't have a linked file yet. Try clicking Annotate first.");
      return;
    }
    setExpandedSection(expandedSection === section ? null : section);
  };

  const hasAnyData = hasTranscript || !!fileId;

  if (!hasAnyData && !fileId) {
    return null;
  }

  return (
    <div className="space-y-1 pt-1 border-t border-border/50">
      {/* Section toggle buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant={expandedSection === "transcript" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={() => toggleSection("transcript")}
        >
          <FileText className="h-3 w-3" />
          Transcript
          {expandedSection === "transcript" ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )}
        </Button>
        <Button
          variant={expandedSection === "captions" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={() => toggleSection("captions")}
        >
          <Captions className="h-3 w-3" />
          Captions
          {expandedSection === "captions" ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )}
        </Button>
        <Button
          variant={expandedSection === "matches" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={() => toggleSection("matches")}
        >
          <Files className="h-3 w-3" />
          Matched Files
          {expandedSection === "matches" ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )}
        </Button>
      </div>

      {/* Expanded content */}
      {expandedSection === "transcript" && (
        <div className="rounded-md bg-muted/30 p-2 max-h-48 overflow-y-auto">
          {transcriptLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading transcript...
            </div>
          ) : transcript && transcript.status === "completed" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant="outline" className="text-[10px] h-4 bg-green-500/10 text-green-600 border-green-300">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                  Transcribed
                </Badge>
                {transcript.language && (
                  <Badge variant="outline" className="text-[10px] h-4">
                    {transcript.language.toUpperCase()}
                  </Badge>
                )}
              </div>
              {/* Show segments with timestamps */}
              {transcript.segments && Array.isArray(transcript.segments) && (transcript.segments as Array<{ text: string; start: number; end: number }>).length > 0 ? (
                <div className="space-y-1">
                  {(transcript.segments as Array<{ text: string; start: number; end: number }>).map((seg, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-muted-foreground font-mono shrink-0 w-12">
                        {formatTimestamp(seg.start)}
                      </span>
                      <span className="text-foreground">{seg.text}</span>
                    </div>
                  ))}
                </div>
              ) : transcript.fullText ? (
                <p className="text-xs text-foreground whitespace-pre-wrap">{transcript.fullText}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">Transcript is empty</p>
              )}
            </div>
          ) : transcript && transcript.status === "processing" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Transcription in progress...
            </div>
          ) : transcript && transcript.status === "failed" ? (
            <div className="flex items-center gap-2 text-xs text-destructive py-2">
              <AlertCircle className="h-3 w-3" />
              Transcription failed
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-2">
              No transcript available. Select this video and click "Transcribe All" to generate one.
            </div>
          )}
        </div>
      )}

      {expandedSection === "captions" && (
        <div className="rounded-md bg-muted/30 p-2 max-h-48 overflow-y-auto">
          {captionsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading captions...
            </div>
          ) : captions && captions.status === "completed" && captions.captions ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant="outline" className="text-[10px] h-4 bg-blue-500/10 text-blue-600 border-blue-300">
                  <Captions className="h-2.5 w-2.5 mr-0.5" />
                  {(captions.captions as any[]).length} Captions
                </Badge>
              </div>
              <div className="space-y-1.5">
                {(captions.captions as Array<{ timestamp: number; caption: string; entities: string[]; confidence: number }>).map((cap, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex gap-2 text-xs">
                      <span className="text-muted-foreground font-mono shrink-0 w-12 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTimestamp(cap.timestamp)}
                      </span>
                      <span className="text-foreground">{cap.caption}</span>
                    </div>
                    {cap.entities && cap.entities.length > 0 && (
                      <div className="flex gap-1 flex-wrap ml-14">
                        {cap.entities.slice(0, 5).map((entity, j) => (
                          <Badge key={j} variant="outline" className="text-[9px] h-3.5 px-1 bg-purple-500/10 text-purple-600 border-purple-300">
                            {entity}
                          </Badge>
                        ))}
                        {cap.entities.length > 5 && (
                          <span className="text-[9px] text-muted-foreground">+{cap.entities.length - 5} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : captions && captions.status === "processing" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Captioning in progress...
            </div>
          ) : captions && captions.status === "failed" ? (
            <div className="flex items-center gap-2 text-xs text-destructive py-2">
              <AlertCircle className="h-3 w-3" />
              Captioning failed: {captions.errorMessage || "Unknown error"}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-2">
              No visual captions available. Select this video and click "Caption All" to generate them.
            </div>
          )}
        </div>
      )}

      {expandedSection === "matches" && (
        <div className="rounded-md bg-muted/30 p-2 max-h-48 overflow-y-auto">
          {(matchesLoading || suggestionsLoading) ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading matched files...
            </div>
          ) : (
            <div className="space-y-2">
              {/* Visual caption file matches */}
              {fileMatches && fileMatches.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] h-4 bg-orange-500/10 text-orange-600 border-orange-300">
                      <Files className="h-2.5 w-2.5 mr-0.5" />
                      {fileMatches.length} Visual Matches
                    </Badge>
                  </div>
                  {fileMatches.map((match: any) => (
                    <div key={match.id} className="flex items-start gap-2 text-xs p-1.5 rounded bg-background/50 border border-border/30">
                      <span className="text-muted-foreground font-mono shrink-0 w-12">
                        {formatTimestamp(match.timestamp)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium truncate">{match.suggestedFile?.filename || `File #${match.suggestedFileId}`}</span>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0">
                            {Math.round((match.relevanceScore || 0) * 100)}%
                          </Badge>
                        </div>
                        {match.matchReasoning && (
                          <p className="text-muted-foreground text-[10px] line-clamp-2 mt-0.5">{match.matchReasoning}</p>
                        )}
                        {match.matchedEntities && match.matchedEntities.length > 0 && (
                          <div className="flex gap-0.5 flex-wrap mt-0.5">
                            {(match.matchedEntities as string[]).slice(0, 3).map((entity, j) => (
                              <Badge key={j} variant="outline" className="text-[8px] h-3 px-0.5">
                                {entity}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Transcript-based file suggestions */}
              {fileSuggestions && fileSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] h-4 bg-teal-500/10 text-teal-600 border-teal-300">
                      <FileText className="h-2.5 w-2.5 mr-0.5" />
                      {fileSuggestions.length} Transcript Matches
                    </Badge>
                  </div>
                  {fileSuggestions.map((suggestion: any) => (
                    <div key={suggestion.id} className="flex items-start gap-2 text-xs p-1.5 rounded bg-background/50 border border-border/30">
                      <span className="text-muted-foreground font-mono shrink-0 w-12">
                        {formatTimestamp(suggestion.startTime)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium truncate">{suggestion.suggestedFile?.filename || `File #${suggestion.suggestedFileId}`}</span>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0">
                            {Math.round((suggestion.relevanceScore || 0) * 100)}%
                          </Badge>
                        </div>
                        {suggestion.transcriptExcerpt && (
                          <p className="text-muted-foreground text-[10px] line-clamp-2 mt-0.5 italic">
                            "{suggestion.transcriptExcerpt}"
                          </p>
                        )}
                        {suggestion.matchedKeywords && suggestion.matchedKeywords.length > 0 && (
                          <div className="flex gap-0.5 flex-wrap mt-0.5">
                            {(suggestion.matchedKeywords as string[]).slice(0, 3).map((kw, j) => (
                              <Badge key={j} variant="outline" className="text-[8px] h-3 px-0.5">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* No matches found */}
              {(!fileMatches || fileMatches.length === 0) && (!fileSuggestions || fileSuggestions.length === 0) && (
                <div className="text-xs text-muted-foreground py-2">
                  No matched files found. First generate captions or transcripts, then the system can match your uploaded files to video moments.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
