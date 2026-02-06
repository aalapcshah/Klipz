import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, Eye, Mic, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MetadataPopupProps {
  description: string;
  maxLength?: number;
  originalUrl?: string;
}

interface ParsedMetadata {
  platform?: string;
  creator?: string;
  originalUrl?: string;
  postedDate?: string;
  stats?: {
    likes?: string;
    comments?: string;
    shares?: string;
    plays?: string;
  };
  caption?: string;
  hashtags?: string[];
  visualAnalysis?: string;
  audioTranscript?: string;
  rawSections: { title: string; content: string }[];
}

function parseDescription(description: string): ParsedMetadata {
  const result: ParsedMetadata = {
    rawSections: [],
  };

  // Try to parse structured social media content
  const lines = description.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];
  let inSection = false;

  for (const line of lines) {
    // Check for section headers (e.g., "--- Caption ---" or "=== CAPTION ===")
    const sectionMatch = line.match(/^[-=]+\s*(.+?)\s*[-=]+$/) || 
                         line.match(/^(CAPTION|VISUAL ANALYSIS|AUDIO TRANSCRIPT|Stats|Hashtags)$/i);
    
    if (sectionMatch) {
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        result.rawSections.push({ title: currentSection, content });
        
        // Map to specific fields
        const sectionLower = currentSection.toLowerCase();
        if (sectionLower.includes('caption')) {
          result.caption = content;
        } else if (sectionLower.includes('visual') || sectionLower.includes('analysis')) {
          result.visualAnalysis = content;
        } else if (sectionLower.includes('audio') || sectionLower.includes('transcript')) {
          result.audioTranscript = content;
        } else if (sectionLower.includes('stats')) {
          // Parse stats
          const statsLines = content.split('\n');
          result.stats = {};
          for (const statLine of statsLines) {
            const [key, value] = statLine.split(':').map(s => s.trim());
            if (key && value) {
              const keyLower = key.toLowerCase();
              if (keyLower.includes('like')) result.stats.likes = value;
              else if (keyLower.includes('comment')) result.stats.comments = value;
              else if (keyLower.includes('share')) result.stats.shares = value;
              else if (keyLower.includes('play') || keyLower.includes('view')) result.stats.plays = value;
            }
          }
        } else if (sectionLower.includes('hashtag')) {
          result.hashtags = content.split(/\s+/).filter(h => h.startsWith('#')).map(h => h.slice(1));
        }
      }
      
      currentSection = sectionMatch[1];
      currentContent = [];
      inSection = true;
      continue;
    }

    // Check for metadata lines at the start
    if (!inSection) {
      const metaMatch = line.match(/^(Platform|Creator|Original URL|URL|Posted|Extracted):\s*(.+)$/i);
      if (metaMatch) {
        const [, key, value] = metaMatch;
        const keyLower = key.toLowerCase();
        if (keyLower === 'platform') result.platform = value;
        else if (keyLower === 'creator') result.creator = value;
        else if (keyLower.includes('url')) result.originalUrl = value;
        else if (keyLower === 'posted') result.postedDate = value;
        continue;
      }
    }

    // Add to current section content
    if (inSection || currentSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection && currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    result.rawSections.push({ title: currentSection, content });
    
    const sectionLower = currentSection.toLowerCase();
    if (sectionLower.includes('caption')) {
      result.caption = content;
    } else if (sectionLower.includes('visual') || sectionLower.includes('analysis')) {
      result.visualAnalysis = content;
    } else if (sectionLower.includes('audio') || sectionLower.includes('transcript')) {
      result.audioTranscript = content;
    }
  }

  // If no sections found, treat the whole description as caption
  if (result.rawSections.length === 0 && description.trim()) {
    result.caption = description;
    result.rawSections.push({ title: 'Description', content: description });
  }

  return result;
}

function hasAIContent(metadata: ParsedMetadata): boolean {
  return !!(metadata.visualAnalysis || metadata.audioTranscript);
}

export function MetadataPopup({ description, maxLength = 50, originalUrl }: MetadataPopupProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const parsedMetadata = useMemo(() => parseDescription(description), [description]);
  const showComparison = hasAIContent(parsedMetadata);
  
  // If description is short enough, just show it without popup
  if (description.length <= maxLength) {
    return <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{description}</p>;
  }

  const truncated = description.slice(0, maxLength) + "...";

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <>
      <p 
        className="text-xs text-muted-foreground line-clamp-2 mt-1 cursor-pointer hover:text-foreground transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Click to view full description"
      >
        {truncated}
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent 
          className={showComparison ? "max-w-4xl max-h-[85vh] overflow-hidden" : "max-w-md"}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2">
              Description
              {showComparison && (
                <Badge variant="secondary" className="ml-2 gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Enhanced
                </Badge>
              )}
            </DialogTitle>
            {parsedMetadata.platform && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="capitalize">{parsedMetadata.platform}</span>
                {parsedMetadata.creator && (
                  <>
                    <span>•</span>
                    <span>{parsedMetadata.creator}</span>
                  </>
                )}
                {(parsedMetadata.originalUrl || originalUrl) && (
                  <a 
                    href={parsedMetadata.originalUrl || originalUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline ml-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Original
                  </a>
                )}
              </div>
            )}
          </DialogHeader>
          
          {showComparison ? (
            <Tabs defaultValue="comparison" className="flex-1 overflow-hidden">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="comparison" className="gap-1">
                  <Eye className="h-3 w-3" />
                  Comparison
                </TabsTrigger>
                <TabsTrigger value="original" className="gap-1">
                  <FileText className="h-3 w-3" />
                  Original
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Analysis
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="comparison" className="mt-4 overflow-auto max-h-[60vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Original Content Column */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold text-sm">Original Content</h3>
                    </div>
                    
                    {parsedMetadata.caption && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Caption</h4>
                        <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                          {parsedMetadata.caption}
                        </p>
                      </div>
                    )}
                    
                    {parsedMetadata.stats && Object.keys(parsedMetadata.stats).length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Engagement</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {parsedMetadata.stats.likes && (
                            <div className="bg-muted/50 p-2 rounded">
                              <span className="text-muted-foreground">Likes:</span> {parsedMetadata.stats.likes}
                            </div>
                          )}
                          {parsedMetadata.stats.comments && (
                            <div className="bg-muted/50 p-2 rounded">
                              <span className="text-muted-foreground">Comments:</span> {parsedMetadata.stats.comments}
                            </div>
                          )}
                          {parsedMetadata.stats.shares && (
                            <div className="bg-muted/50 p-2 rounded">
                              <span className="text-muted-foreground">Shares:</span> {parsedMetadata.stats.shares}
                            </div>
                          )}
                          {parsedMetadata.stats.plays && (
                            <div className="bg-muted/50 p-2 rounded">
                              <span className="text-muted-foreground">Views:</span> {parsedMetadata.stats.plays}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {parsedMetadata.hashtags && parsedMetadata.hashtags.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hashtags</h4>
                        <div className="flex flex-wrap gap-1">
                          {parsedMetadata.hashtags.map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* AI-Enriched Column */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">AI-Enriched</h3>
                    </div>
                    
                    {parsedMetadata.visualAnalysis && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Eye className="h-3 w-3 text-primary" />
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Visual Analysis</h4>
                        </div>
                        <div className="text-sm whitespace-pre-wrap bg-primary/5 border border-primary/20 p-3 rounded-lg">
                          {parsedMetadata.visualAnalysis}
                        </div>
                      </div>
                    )}
                    
                    {parsedMetadata.audioTranscript && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Mic className="h-3 w-3 text-primary" />
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Audio Transcript</h4>
                        </div>
                        <div className="text-sm whitespace-pre-wrap bg-primary/5 border border-primary/20 p-3 rounded-lg">
                          {parsedMetadata.audioTranscript}
                        </div>
                      </div>
                    )}
                    
                    {!parsedMetadata.visualAnalysis && !parsedMetadata.audioTranscript && (
                      <div className="text-sm text-muted-foreground italic p-4 text-center">
                        No AI analysis available for this content.
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="original" className="mt-4 overflow-auto max-h-[60vh]">
                <div className="space-y-4">
                  {parsedMetadata.caption && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Caption</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => handleCopy(parsedMetadata.caption || '')}
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                        {parsedMetadata.caption}
                      </p>
                    </div>
                  )}
                  
                  {parsedMetadata.stats && Object.keys(parsedMetadata.stats).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Engagement Stats</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {parsedMetadata.stats.likes && (
                          <div className="bg-muted/50 p-3 rounded text-center">
                            <div className="text-lg font-semibold">{parsedMetadata.stats.likes}</div>
                            <div className="text-xs text-muted-foreground">Likes</div>
                          </div>
                        )}
                        {parsedMetadata.stats.comments && (
                          <div className="bg-muted/50 p-3 rounded text-center">
                            <div className="text-lg font-semibold">{parsedMetadata.stats.comments}</div>
                            <div className="text-xs text-muted-foreground">Comments</div>
                          </div>
                        )}
                        {parsedMetadata.stats.shares && (
                          <div className="bg-muted/50 p-3 rounded text-center">
                            <div className="text-lg font-semibold">{parsedMetadata.stats.shares}</div>
                            <div className="text-xs text-muted-foreground">Shares</div>
                          </div>
                        )}
                        {parsedMetadata.stats.plays && (
                          <div className="bg-muted/50 p-3 rounded text-center">
                            <div className="text-lg font-semibold">{parsedMetadata.stats.plays}</div>
                            <div className="text-xs text-muted-foreground">Views</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {parsedMetadata.hashtags && parsedMetadata.hashtags.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hashtags</h4>
                      <div className="flex flex-wrap gap-1">
                        {parsedMetadata.hashtags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="ai" className="mt-4 overflow-auto max-h-[60vh]">
                <div className="space-y-4">
                  {parsedMetadata.visualAnalysis && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-primary" />
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Visual Analysis</h4>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => handleCopy(parsedMetadata.visualAnalysis || '')}
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="text-sm whitespace-pre-wrap bg-primary/5 border border-primary/20 p-4 rounded-lg">
                        {parsedMetadata.visualAnalysis}
                      </div>
                    </div>
                  )}
                  
                  {parsedMetadata.audioTranscript && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Mic className="h-4 w-4 text-primary" />
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Audio Transcript</h4>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => handleCopy(parsedMetadata.audioTranscript || '')}
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="text-sm whitespace-pre-wrap bg-primary/5 border border-primary/20 p-4 rounded-lg">
                        {parsedMetadata.audioTranscript}
                      </div>
                    </div>
                  )}
                  
                  {!parsedMetadata.visualAnalysis && !parsedMetadata.audioTranscript && (
                    <div className="text-center py-8">
                      <Sparkles className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                      <p className="text-muted-foreground">No AI analysis available for this content.</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        AI analysis is available for Pro users on social media uploads.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="mt-2 max-h-[60vh] overflow-auto">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{description}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
