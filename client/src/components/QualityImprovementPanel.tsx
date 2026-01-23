import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, Loader2, AlertCircle, Check, X } from "lucide-react";


interface QualityImprovementPanelProps {
  fileId: number;
  currentScore: number | null;
}

export function QualityImprovementPanel({ fileId, currentScore }: QualityImprovementPanelProps) {

  const [selectedEnhancement, setSelectedEnhancement] = useState<string | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Get suggestions
  const { data: suggestions, isLoading } = trpc.qualityImprovement.getSuggestions.useQuery(
    { fileId },
    { enabled: currentScore !== null && currentScore < 70 }
  );

  // Apply enhancement mutation
  const applyEnhancement = trpc.qualityImprovement.applyEnhancement.useMutation({
    onSuccess: (data) => {
      setEnhancedUrl(data.enhancedUrl || null);
      setIsEnhancing(false);
      // Enhancement complete
    },
    onError: (error) => {
      setIsEnhancing(false);
      console.error("Enhancement failed:", error);
    },
  });

  const handleApplyEnhancement = (type: string) => {
    setSelectedEnhancement(type);
    setIsEnhancing(true);
    applyEnhancement.mutate({
      fileId,
      enhancementType: type as any,
    });
  };

  // Don't show panel for high-quality images
  if (currentScore === null || currentScore >= 70) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!suggestions) {
    return null;
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  const getEnhancementIcon = (type: string) => {
    return <Sparkles className="h-4 w-4" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Quality Improvement Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Quality Score */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Current quality score: <strong>{currentScore}/100</strong>
            {currentScore < 40 && " - This image has significant quality issues"}
            {currentScore >= 40 && currentScore < 70 && " - This image could be improved"}
          </AlertDescription>
        </Alert>

        {/* Issues Detected */}
        {suggestions.issues.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Issues Detected:</h4>
            <ul className="space-y-1">
              {suggestions.issues.map((issue: string, index: number) => (
                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                  <X className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Enhancement Suggestions */}
        {suggestions.suggestions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Recommended Enhancements:</h4>
            <div className="space-y-2">
              {suggestions.suggestions.map((suggestion: any, index: number) => (
                <div
                  key={index}
                  className="flex items-start justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="flex items-center gap-2 mb-1">
                      {getEnhancementIcon(suggestion.type)}
                      <span className="text-sm font-medium capitalize">
                        {suggestion.type.replace("_", " ")}
                      </span>
                      <Badge variant={getPriorityColor(suggestion.priority)} className="text-xs">
                        {suggestion.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleApplyEnhancement(suggestion.type)}
                    disabled={isEnhancing}
                  >
                    {isEnhancing && selectedEnhancement === suggestion.type ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Enhancing...
                      </>
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enhanced Preview */}
        {enhancedUrl && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              Enhanced Preview:
            </h4>
            <div className="relative rounded-lg overflow-hidden border border-border">
              <img
                src={enhancedUrl}
                alt="Enhanced preview"
                className="w-full h-auto"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Preview the enhanced image above. You can save this as a new file or replace the original.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
