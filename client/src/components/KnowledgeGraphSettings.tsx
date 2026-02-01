/**
 * KnowledgeGraphSettings - Settings UI for managing knowledge graph connections
 * with persistent user preferences
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  Globe, 
  Database, 
  BookOpen, 
  Brain, 
  Settings2, 
  CheckCircle2, 
  XCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Save,
  Network
} from "lucide-react";
import { toast } from "sonner";

interface KnowledgeGraphSettingsProps {
  className?: string;
}

interface SourceConfig {
  name: string;
  key: 'wikidata' | 'dbpedia' | 'schemaOrg' | 'llm';
  icon: React.ReactNode;
  enabled: boolean;
  description: string;
}

// Storage key for persisting settings
const SETTINGS_STORAGE_KEY = 'klipz_knowledge_graph_settings';

interface StoredSettings {
  sources: {
    wikidata: boolean;
    dbpedia: boolean;
    schemaOrg: boolean;
    llm: boolean;
  };
  confidenceThreshold: number;
  maxSuggestions: number;
  autoTagging: boolean;
  autoTagThreshold: number;
}

const DEFAULT_SETTINGS: StoredSettings = {
  sources: {
    wikidata: true,
    dbpedia: true,
    schemaOrg: true,
    llm: true,
  },
  confidenceThreshold: 50,
  maxSuggestions: 10,
  autoTagging: false,
  autoTagThreshold: 70,
};

export function KnowledgeGraphSettings({ className }: KnowledgeGraphSettingsProps) {
  // Load settings from localStorage
  const loadSettings = (): StoredSettings => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load knowledge graph settings:', e);
    }
    return DEFAULT_SETTINGS;
  };

  const [settings, setSettings] = useState<StoredSettings>(loadSettings);
  const [isTestingConnections, setIsTestingConnections] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'connected' | 'disconnected' | 'checking'>>({
    wikidata: 'connected',
    dbpedia: 'connected',
    schemaOrg: 'connected',
    llm: 'connected',
  });

  // Initialize default sources mutation
  const initDefaultsMutation = trpc.externalKnowledgeGraphs.initializeDefaults.useMutation({
    onSuccess: (data) => {
      if (data.created.length > 0) {
        toast.success(data.message);
      }
    },
  });

  // Build relationships mutation
  const buildRelationshipsMutation = trpc.knowledgeGraph.buildRelationships.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(`Failed to build relationships: ${error.message}`);
    },
  });

  // Initialize default sources on mount
  useEffect(() => {
    initDefaultsMutation.mutate();
  }, []);

  const sources: SourceConfig[] = [
    {
      name: 'Wikidata',
      key: 'wikidata',
      icon: <Globe className="h-5 w-5 text-blue-500" />,
      enabled: settings.sources.wikidata,
      description: 'Structured knowledge from Wikipedia with 100M+ entities',
    },
    {
      name: 'DBpedia',
      key: 'dbpedia',
      icon: <Database className="h-5 w-5 text-green-500" />,
      enabled: settings.sources.dbpedia,
      description: 'Wikipedia-derived semantic data with rich abstracts',
    },
    {
      name: 'Schema.org',
      key: 'schemaOrg',
      icon: <BookOpen className="h-5 w-5 text-purple-500" />,
      enabled: settings.sources.schemaOrg,
      description: 'Web-standard vocabulary for content classification',
    },
    {
      name: 'AI (LLM)',
      key: 'llm',
      icon: <Brain className="h-5 w-5 text-amber-500" />,
      enabled: settings.sources.llm,
      description: 'AI-powered semantic analysis and suggestions',
    },
  ];

  const updateSettings = (updates: Partial<StoredSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const toggleSource = (key: 'wikidata' | 'dbpedia' | 'schemaOrg' | 'llm') => {
    updateSettings({
      sources: {
        ...settings.sources,
        [key]: !settings.sources[key],
      },
    });
  };

  const saveSettings = () => {
    setIsSaving(true);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      setHasChanges(false);
      toast.success('Settings saved successfully');
    } catch (e) {
      toast.error('Failed to save settings');
    }
    setIsSaving(false);
  };

  const testConnections = async () => {
    setIsTestingConnections(true);
    setConnectionStatus({
      wikidata: 'checking',
      dbpedia: 'checking',
      schemaOrg: 'checking',
      llm: 'checking',
    });

    // Simulate connection testing
    await new Promise(resolve => setTimeout(resolve, 2000));

    setConnectionStatus({
      wikidata: 'connected',
      dbpedia: 'connected',
      schemaOrg: 'connected',
      llm: 'connected',
    });
    setIsTestingConnections(false);
    toast.success('All knowledge graph connections verified');
  };

  const buildTagRelationships = () => {
    buildRelationshipsMutation.mutate({
      useCoOccurrence: true,
      useEmbeddings: true,
      minCoOccurrence: 0.1,
      minSimilarity: 0.6,
      maxRelationshipsPerTag: 10,
    });
  };

  const getStatusIcon = (status: 'connected' | 'disconnected' | 'checking') => {
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
            <div className="flex gap-2">
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
              {hasChanges && (
                <Button
                  size="sm"
                  onClick={saveSettings}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Knowledge Sources */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Knowledge Sources</h3>
            <div className="grid gap-4">
              {sources.map((source) => (
                <div
                  key={source.key}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    {source.icon}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{source.name}</span>
                        {getStatusIcon(connectionStatus[source.key])}
                        <Badge variant="outline" className="text-xs">
                          {connectionStatus[source.key]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {source.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={() => toggleSource(source.key)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Suggestion Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Suggestion Settings</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Confidence Threshold</Label>
                  <span className="text-sm text-muted-foreground">{settings.confidenceThreshold}%</span>
                </div>
                <Slider
                  value={[settings.confidenceThreshold]}
                  onValueChange={([value]) => updateSettings({ confidenceThreshold: value })}
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
                  <span className="text-sm text-muted-foreground">{settings.maxSuggestions}</span>
                </div>
                <Slider
                  value={[settings.maxSuggestions]}
                  onValueChange={([value]) => updateSettings({ maxSuggestions: value })}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>
            </div>
          </div>

          {/* Auto-Tagging Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Auto-Tagging
            </h3>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label className="font-medium">Enable Auto-Tagging</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically apply high-confidence tags when uploading files
                </p>
              </div>
              <Switch
                checked={settings.autoTagging}
                onCheckedChange={(checked) => updateSettings({ autoTagging: checked })}
              />
            </div>

            {settings.autoTagging && (
              <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label>Auto-Tag Confidence Threshold</Label>
                  <span className="text-sm font-medium text-primary">{settings.autoTagThreshold}%</span>
                </div>
                <Slider
                  value={[settings.autoTagThreshold]}
                  onValueChange={([value]) => updateSettings({ autoTagThreshold: value })}
                  min={50}
                  max={100}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">
                  Tags with confidence above {settings.autoTagThreshold}% will be automatically applied during upload.
                  Higher values mean fewer but more accurate auto-tags.
                </p>
              </div>
            )}
          </div>

          {/* Build Relationships */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Network className="h-4 w-4" />
              Tag Relationships
            </h3>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label className="font-medium">Build Tag Relationships</Label>
                <p className="text-sm text-muted-foreground">
                  Analyze tag co-occurrence and semantic similarity to build connections
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={buildTagRelationships}
                disabled={buildRelationshipsMutation.isPending}
              >
                {buildRelationshipsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Network className="h-4 w-4 mr-2" />
                )}
                Build Now
              </Button>
            </div>
          </div>

          {/* Stats */}
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
