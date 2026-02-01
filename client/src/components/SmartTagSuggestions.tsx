/**
 * SmartTagSuggestions - AI-powered tag suggestions from knowledge graphs
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, Plus, Database, Brain, Globe, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface SmartTagSuggestionsProps {
  existingTags: string[];
  context?: string;
  onAddTag: (tag: string) => void;
  className?: string;
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  'wikidata': <Globe className="h-3 w-3" />,
  'dbpedia': <Database className="h-3 w-3" />,
  'schema.org': <BookOpen className="h-3 w-3" />,
  'llm': <Brain className="h-3 w-3" />,
};

const SOURCE_COLORS: Record<string, string> = {
  'wikidata': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'dbpedia': 'bg-green-500/10 text-green-600 border-green-500/20',
  'schema.org': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'llm': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
};

export function SmartTagSuggestions({
  existingTags,
  context,
  onAddTag,
  className,
}: SmartTagSuggestionsProps) {
  const [addedTags, setAddedTags] = useState<Set<string>>(new Set());

  const getSuggestions = trpc.knowledgeGraph.getSuggestions.useMutation();

  const handleGetSuggestions = () => {
    getSuggestions.mutate({
      existingTags,
      context,
    });
  };

  const handleAddTag = (tag: string) => {
    onAddTag(tag);
    setAddedTags(prev => new Set([...Array.from(prev), tag.toLowerCase()]));
  };

  const getSourceKey = (source: string): string => {
    if (source.startsWith('wikidata')) return 'wikidata';
    if (source.startsWith('dbpedia')) return 'dbpedia';
    if (source.startsWith('schema.org')) return 'schema.org';
    if (source.startsWith('llm')) return 'llm';
    return 'llm';
  };

  const formatConfidence = (confidence: number): string => {
    return `${Math.round(confidence * 100)}%`;
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Smart Tag Suggestions
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGetSuggestions}
            disabled={getSuggestions.isPending}
          >
            {getSuggestions.isPending ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                Get Suggestions
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!getSuggestions.data ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click "Get Suggestions" to analyze your tags with Wikidata, DBpedia, Schema.org, and AI
          </p>
        ) : getSuggestions.data.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No additional suggestions found. Your tags are comprehensive!
          </p>
        ) : (
          <div className="space-y-3">
            {['wikidata', 'dbpedia', 'schema.org', 'llm'].map(sourceKey => {
              const sourceSuggestions = getSuggestions.data.suggestions.filter(
                (s: { tag: string; source: string; confidence: number }) => getSourceKey(s.source) === sourceKey
              );
              
              if (sourceSuggestions.length === 0) return null;

              return (
                <div key={sourceKey} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {SOURCE_ICONS[sourceKey]}
                    <span className="capitalize">{sourceKey === 'llm' ? 'AI Generated' : sourceKey}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sourceSuggestions.map((suggestion: { tag: string; source: string; confidence: number }, idx: number) => {
                      const isAdded = addedTags.has(suggestion.tag.toLowerCase());
                      return (
                        <Badge
                          key={`${sourceKey}-${idx}`}
                          variant="outline"
                          className={cn(
                            "cursor-pointer transition-all hover:scale-105",
                            SOURCE_COLORS[sourceKey],
                            isAdded && "opacity-50 cursor-not-allowed"
                          )}
                          onClick={() => !isAdded && handleAddTag(suggestion.tag)}
                        >
                          {isAdded ? (
                            <span className="mr-1">✓</span>
                          ) : (
                            <Plus className="h-3 w-3 mr-1" />
                          )}
                          {suggestion.tag}
                          <span className="ml-1 opacity-60 text-[10px]">
                            {formatConfidence(suggestion.confidence)}
                          </span>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 pt-3 border-t flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Globe className="h-3 w-3 text-blue-500" />
            Wikidata
          </div>
          <div className="flex items-center gap-1">
            <Database className="h-3 w-3 text-green-500" />
            DBpedia
          </div>
          <div className="flex items-center gap-1">
            <BookOpen className="h-3 w-3 text-purple-500" />
            Schema.org
          </div>
          <div className="flex items-center gap-1">
            <Brain className="h-3 w-3 text-amber-500" />
            AI
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default SmartTagSuggestions;
