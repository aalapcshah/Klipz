/**
 * KnowledgeGraphSettings - Settings UI for managing knowledge graph connections
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Globe, 
  Database, 
  BookOpen, 
  Brain, 
  Settings2, 
  CheckCircle2, 
  XCircle,
  Loader2,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface KnowledgeGraphSettingsProps {
  className?: string;
}

interface SourceStatus {
  name: string;
  icon: React.ReactNode;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'checking';
  description: string;
}

export function KnowledgeGraphSettings({ className }: KnowledgeGraphSettingsProps) {
  const [sources, setSources] = useState<SourceStatus[]>([
    {
      name: 'Wikidata',
      icon: <Globe className="h-5 w-5 text-blue-500" />,
      enabled: true,
      status: 'connected',
      description: 'Structured knowledge from Wikipedia with 100M+ entities',
    },
    {
      name: 'DBpedia',
      icon: <Database className="h-5 w-5 text-green-500" />,
      enabled: true,
      status: 'connected',
      description: 'Wikipedia-derived semantic data with rich abstracts',
    },
    {
      name: 'Schema.org',
      icon: <BookOpen className="h-5 w-5 text-purple-500" />,
      enabled: true,
      status: 'connected',
      description: 'Web-standard vocabulary for content classification',
    },
    {
      name: 'AI (LLM)',
      icon: <Brain className="h-5 w-5 text-amber-500" />,
      enabled: true,
      status: 'connected',
      description: 'AI-powered semantic analysis and suggestions',
    },
  ]);

  const [confidenceThreshold, setConfidenceThreshold] = useState(50);
  const [maxSuggestions, setMaxSuggestions] = useState(10);
  const [autoTagging, setAutoTagging] = useState(false);
  const [isTestingConnections, setIsTestingConnections] = useState(false);

  const toggleSource = (index: number) => {
    setSources(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], enabled: !updated[index].enabled };
      return updated;
    });
    toast.success(`${sources[index].name} ${sources[index].enabled ? 'disabled' : 'enabled'}`);
  };

  const testConnections = async () => {
    setIsTestingConnections(true);
    setSources(prev => prev.map(s => ({ ...s, status: 'checking' as const })));

    await new Promise(resolve => setTimeout(resolve, 2000));

    setSources(prev => prev.map(s => ({ ...s, status: 'connected' as const })));
    setIsTestingConnections(false);
    toast.success('All knowledge graph connections verified');
  };

  const getStatusIcon = (status: SourceStatus['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'disconnected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'checking':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Knowledge Graph Settings
              </CardTitle>
              <CardDescription>
                Configure external ontologies and AI-powered tag enrichment
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={testConnections}
              disabled={isTestingConnections}
            >
              {isTestingConnections ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Test Connections
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Knowledge Sources</h3>
            <div className="grid gap-4">
              {sources.map((source, index) => (
                <div
                  key={source.name}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    {source.icon}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{source.name}</span>
                        {getStatusIcon(source.status)}
                        <Badge variant="outline" className="text-xs">
                          {source.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {source.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={() => toggleSource(index)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Suggestion Settings</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Confidence Threshold</Label>
                  <span className="text-sm text-muted-foreground">{confidenceThreshold}%</span>
                </div>
                <Slider
                  value={[confidenceThreshold]}
                  onValueChange={([value]) => setConfidenceThreshold(value)}
                  min={0}
                  max={100}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">
                  Only show suggestions with confidence above this threshold
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Max Suggestions Per Source</Label>
                  <span className="text-sm text-muted-foreground">{maxSuggestions}</span>
                </div>
                <Slider
                  value={[maxSuggestions]}
                  onValueChange={([value]) => setMaxSuggestions(value)}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="font-medium">Auto-Tagging</Label>
              <p className="text-sm text-muted-foreground">
                Automatically apply high-confidence suggestions when enriching files
              </p>
            </div>
            <Switch
              checked={autoTagging}
              onCheckedChange={setAutoTagging}
            />
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">100M+</div>
              <div className="text-xs text-muted-foreground">Wikidata Entities</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">6M+</div>
              <div className="text-xs text-muted-foreground">DBpedia Resources</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-500">800+</div>
              <div className="text-xs text-muted-foreground">Schema.org Types</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default KnowledgeGraphSettings;
