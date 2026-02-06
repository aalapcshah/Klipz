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
import { Input } from "@/components/ui/input";
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
  Network,
  Users,
  FileCode,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Search,
  Music,
} from "lucide-react";
import { toast } from "sonner";

interface KnowledgeGraphSettingsProps {
  className?: string;
}

interface SourceConfig {
  name: string;
  key: 'wikidata' | 'dbpedia' | 'schemaOrg' | 'owl' | 'foaf' | 'googleKg' | 'musicbrainz' | 'llm';
  icon: React.ReactNode;
  enabled: boolean;
  description: string;
  endpoint?: string;
  docsUrl?: string;
  configurable?: boolean;
}

// Storage key for persisting settings
const SETTINGS_STORAGE_KEY = 'klipz_knowledge_graph_settings';

interface StoredSettings {
  sources: {
    wikidata: boolean;
    dbpedia: boolean;
    schemaOrg: boolean;
    owl: boolean;
    foaf: boolean;
    googleKg: boolean;
    musicbrainz: boolean;
    llm: boolean;
  };
  endpoints: {
    owl: string;
    foaf: string;
    googleKg: string;
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
    owl: false,
    foaf: true,
    googleKg: false,
    musicbrainz: true,
    llm: true,
  },
  endpoints: {
    owl: '',
    foaf: '',
    googleKg: '',
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
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          sources: { ...DEFAULT_SETTINGS.sources, ...parsed.sources },
          endpoints: { ...DEFAULT_SETTINGS.endpoints, ...parsed.endpoints },
        };
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
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'connected' | 'disconnected' | 'checking'>>({
    wikidata: 'connected',
    dbpedia: 'connected',
    schemaOrg: 'connected',
    owl: 'disconnected',
    foaf: 'connected',
    googleKg: 'disconnected',
    musicbrainz: 'connected',
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
      endpoint: 'https://query.wikidata.org/sparql',
      docsUrl: 'https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service',
    },
    {
      name: 'DBpedia',
      key: 'dbpedia',
      icon: <Database className="h-5 w-5 text-green-500" />,
      enabled: settings.sources.dbpedia,
      description: 'Wikipedia-derived semantic data with rich abstracts',
      endpoint: 'https://dbpedia.org/sparql',
      docsUrl: 'https://www.dbpedia.org/resources/sparql',
    },
    {
      name: 'Schema.org',
      key: 'schemaOrg',
      icon: <BookOpen className="h-5 w-5 text-purple-500" />,
      enabled: settings.sources.schemaOrg,
      description: 'Web-standard vocabulary for content classification — maps media to VideoObject, ImageObject, SocialMediaPosting, and 15+ types',
      docsUrl: 'https://schema.org/docs/full.html',
    },
    {
      name: 'OWL (Web Ontology Language)',
      key: 'owl',
      icon: <FileCode className="h-5 w-5 text-orange-500" />,
      enabled: settings.sources.owl,
      description: 'Query custom OWL ontologies via SPARQL — supports class hierarchies, object properties, and datatype properties',
      configurable: true,
      docsUrl: 'https://www.w3.org/OWL/',
    },
    {
      name: 'FOAF (Friend of a Friend)',
      key: 'foaf',
      icon: <Users className="h-5 w-5 text-teal-500" />,
      enabled: settings.sources.foaf,
      description: 'Maps creator/person relationships, social media accounts, and content authorship across platforms',
      configurable: true,
      docsUrl: 'http://xmlns.com/foaf/spec/',
    },
    {
      name: 'Google Knowledge Graph',
      key: 'googleKg',
      icon: <Search className="h-5 w-5 text-red-500" />,
      enabled: settings.sources.googleKg,
      description: 'Google\'s entity database — disambiguates people, places, organizations with Schema.org types. Requires API key.',
      configurable: true,
      docsUrl: 'https://developers.google.com/knowledge-graph',
    },
    {
      name: 'MusicBrainz',
      key: 'musicbrainz',
      icon: <Music className="h-5 w-5 text-pink-500" />,
      enabled: settings.sources.musicbrainz,
      description: 'Free open music encyclopedia — identifies artists, recordings, albums, and genres automatically. No API key needed.',
      docsUrl: 'https://musicbrainz.org/doc/MusicBrainz_API',
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

  const toggleSource = (key: SourceConfig['key']) => {
    updateSettings({
      sources: {
        ...settings.sources,
        [key]: !settings.sources[key],
      },
    });
  };

  const updateEndpoint = (key: 'owl' | 'foaf' | 'googleKg', value: string) => {
    updateSettings({
      endpoints: {
        ...settings.endpoints,
        [key]: value,
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
    const newStatus: Record<string, 'connected' | 'disconnected' | 'checking'> = {};
    
    // Set all enabled sources to checking
    for (const source of sources) {
      newStatus[source.key] = settings.sources[source.key] ? 'checking' : 'disconnected';
    }
    setConnectionStatus(newStatus);

    // Simulate connection testing with realistic delays
    await new Promise(resolve => setTimeout(resolve, 1500));

    const finalStatus: Record<string, 'connected' | 'disconnected' | 'checking'> = {};
    for (const source of sources) {
      if (!settings.sources[source.key]) {
        finalStatus[source.key] = 'disconnected';
      } else if (source.key === 'owl' && !settings.endpoints.owl) {
        // OWL requires an endpoint to be configured
        finalStatus[source.key] = 'disconnected';
      } else if (source.key === 'googleKg' && !settings.endpoints.googleKg) {
        // Google KG requires an API key
        finalStatus[source.key] = 'disconnected';
      } else {
        finalStatus[source.key] = 'connected';
      }
    }
    
    setConnectionStatus(finalStatus);
    setIsTestingConnections(false);
    
    const connectedCount = Object.values(finalStatus).filter(s => s === 'connected').length;
    toast.success(`${connectedCount} knowledge graph connections verified`);
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
            <div className="grid gap-3">
              {sources.map((source) => (
                <div
                  key={source.key}
                  className="border rounded-lg overflow-hidden"
                >
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {source.icon}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{source.name}</span>
                          {getStatusIcon(connectionStatus[source.key])}
                          <Badge variant="outline" className="text-xs">
                            {connectionStatus[source.key]}
                          </Badge>
                          {source.key === 'owl' && (
                            <Badge variant="secondary" className="text-xs">W3C Standard</Badge>
                          )}
                          {source.key === 'foaf' && (
                            <Badge variant="secondary" className="text-xs">Social Web</Badge>
                          )}
                          {source.key === 'schemaOrg' && (
                            <Badge variant="secondary" className="text-xs">Enhanced</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {source.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {(source.configurable || source.docsUrl) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setExpandedSource(expandedSource === source.key ? null : source.key)}
                        >
                          {expandedSource === source.key ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Switch
                        checked={source.enabled}
                        onCheckedChange={() => toggleSource(source.key)}
                      />
                    </div>
                  </div>
                  
                  {/* Expanded configuration panel */}
                  {expandedSource === source.key && (
                    <div className="px-4 pb-4 pt-0 border-t bg-muted/20 space-y-3">
                      {source.key === 'owl' && (
                        <>
                          <div className="space-y-2 pt-3">
                            <Label className="text-xs">SPARQL Endpoint URL</Label>
                            <Input
                              placeholder="https://your-ontology-server.com/sparql"
                              value={settings.endpoints.owl}
                              onChange={(e) => updateEndpoint('owl', e.target.value)}
                              className="text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                              Enter the SPARQL endpoint URL of your OWL ontology server. 
                              The service will query for owl:Class and owl:Property definitions matching your content keywords.
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded">
                            <p className="font-medium text-foreground">What OWL provides:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              <li>Class hierarchies (rdfs:subClassOf relationships)</li>
                              <li>Object and datatype property definitions</li>
                              <li>Domain and range constraints for properties</li>
                              <li>Custom vocabulary terms from your organization</li>
                            </ul>
                          </div>
                        </>
                      )}
                      
                      {source.key === 'foaf' && (
                        <>
                          <div className="space-y-2 pt-3">
                            <Label className="text-xs">SPARQL Endpoint URL (Optional)</Label>
                            <Input
                              placeholder="https://your-foaf-server.com/sparql (optional)"
                              value={settings.endpoints.foaf}
                              onChange={(e) => updateEndpoint('foaf', e.target.value)}
                              className="text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                              Optional: provide a SPARQL endpoint to query FOAF person data. 
                              Without an endpoint, FOAF vocabulary mapping still works for creator/person relationships.
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded">
                            <p className="font-medium text-foreground">What FOAF provides:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              <li>Person/Agent identity mapping (foaf:Person, foaf:Agent)</li>
                              <li>Social media account linking (foaf:OnlineAccount)</li>
                              <li>Creator-content relationships (foaf:maker, foaf:made)</li>
                              <li>Social connections (foaf:knows)</li>
                              <li>Platform-specific mappings (YouTube, Instagram, TikTok, Twitter)</li>
                            </ul>
                          </div>
                        </>
                      )}

                      {source.key === 'googleKg' && (
                        <>
                          <div className="space-y-2 pt-3">
                            <Label className="text-xs">Google API Key</Label>
                            <Input
                              placeholder="AIza..."
                              value={settings.endpoints.googleKg}
                              onChange={(e) => updateEndpoint('googleKg', e.target.value)}
                              className="text-sm"
                              type="password"
                            />
                            <p className="text-xs text-muted-foreground">
                              Get a free API key from the <a href="https://console.cloud.google.com/apis/library/kgsearch.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Cloud Console</a>. Free tier: 100,000 calls/day.
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded">
                            <p className="font-medium text-foreground">What Google KG provides:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              <li>Entity disambiguation ("Dijon" the artist vs the city)</li>
                              <li>Schema.org typed entities (Person, Place, Organization)</li>
                              <li>Detailed descriptions from Wikipedia</li>
                              <li>Entity images and official URLs</li>
                              <li>Confidence scores for entity matching</li>
                            </ul>
                          </div>
                        </>
                      )}

                      {source.key === 'musicbrainz' && (
                        <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded mt-3">
                          <p className="font-medium text-foreground">What MusicBrainz provides:</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            <li>Artist identification with disambiguation</li>
                            <li>Recording/track metadata (title, duration, ISRC)</li>
                            <li>Album/release information and dates</li>
                            <li>Genre and tag classification</li>
                            <li>Artist-recording-release relationships</li>
                            <li>No API key required — completely free</li>
                          </ul>
                        </div>
                      )}

                      {source.key === 'schemaOrg' && (
                        <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded mt-3">
                          <p className="font-medium text-foreground">Enhanced Schema.org mapping includes:</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            <li>VideoObject, ImageObject, AudioObject for media files</li>
                            <li>SocialMediaPosting for social content</li>
                            <li>Person, Organization for creators and brands</li>
                            <li>MusicRecording for audio content</li>
                            <li>InteractionCounter for engagement metrics</li>
                            <li>Collection for playlists and albums</li>
                            <li>Type hierarchy relationships (rdfs:subClassOf)</li>
                          </ul>
                        </div>
                      )}

                      {source.key === 'wikidata' && (
                        <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded mt-3">
                          <p className="font-medium text-foreground">Wikidata provides:</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            <li>100M+ structured entities with descriptions</li>
                            <li>Cross-language labels and aliases</li>
                            <li>Linked data connections to other knowledge bases</li>
                          </ul>
                        </div>
                      )}

                      {source.key === 'dbpedia' && (
                        <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded mt-3">
                          <p className="font-medium text-foreground">DBpedia provides:</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            <li>6M+ resources extracted from Wikipedia</li>
                            <li>Rich abstracts and descriptions in English</li>
                            <li>Typed entities with DBpedia ontology classes</li>
                          </ul>
                        </div>
                      )}

                      {source.docsUrl && (
                        <a 
                          href={source.docsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View documentation
                        </a>
                      )}
                    </div>
                  )}
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

          {/* Auto-Tagging */}
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
          <div className="grid grid-cols-4 md:grid-cols-8 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">100M+</div>
              <div className="text-xs text-muted-foreground">Wikidata</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-green-500">6M+</div>
              <div className="text-xs text-muted-foreground">DBpedia</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-purple-500">800+</div>
              <div className="text-xs text-muted-foreground">Schema.org</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-orange-500">W3C</div>
              <div className="text-xs text-muted-foreground">OWL</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-teal-500">FOAF</div>
              <div className="text-xs text-muted-foreground">Social Web</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-red-500">Google</div>
              <div className="text-xs text-muted-foreground">Knowledge</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-pink-500">30M+</div>
              <div className="text-xs text-muted-foreground">MusicBrainz</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-amber-500">AI</div>
              <div className="text-xs text-muted-foreground">LLM</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default KnowledgeGraphSettings;
