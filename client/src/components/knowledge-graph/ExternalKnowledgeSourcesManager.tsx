import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Power, PowerOff, Database, Globe, FileCode } from "lucide-react";
import { toast } from "sonner";

export function ExternalKnowledgeSourcesManager() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceType, setNewSourceType] = useState<"dbpedia" | "wikidata" | "schema_org" | "custom">("wikidata");
  const [newSourceEndpoint, setNewSourceEndpoint] = useState("");
  const [newSourceApiKey, setNewSourceApiKey] = useState("");
  const [newSourceOntologyUrl, setNewSourceOntologyUrl] = useState("");
  const [newSourceNamespacePrefix, setNewSourceNamespacePrefix] = useState("");

  const utils = trpc.useUtils();
  const { data: sources = [], isLoading } = trpc.externalKnowledgeGraphs.list.useQuery();
  const createMutation = trpc.externalKnowledgeGraphs.create.useMutation({
    onSuccess: () => {
      utils.externalKnowledgeGraphs.list.invalidate();
      setShowAddDialog(false);
      resetForm();
      toast.success("External knowledge source added");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const updateMutation = trpc.externalKnowledgeGraphs.update.useMutation({
    onSuccess: () => {
      utils.externalKnowledgeGraphs.list.invalidate();
      toast.success("Source updated");
    },
  });
  const deleteMutation = trpc.externalKnowledgeGraphs.delete.useMutation({
    onSuccess: () => {
      utils.externalKnowledgeGraphs.list.invalidate();
      toast.success("Source deleted");
    },
  });

  const resetForm = () => {
    setNewSourceName("");
    setNewSourceType("wikidata");
    setNewSourceEndpoint("");
    setNewSourceApiKey("");
    setNewSourceOntologyUrl("");
    setNewSourceNamespacePrefix("");
  };

  const handleAddSource = () => {
    if (!newSourceName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    createMutation.mutate({
      name: newSourceName,
      type: newSourceType,
      endpoint: newSourceEndpoint || undefined,
      apiKey: newSourceApiKey || undefined,
      ontologyUrl: newSourceOntologyUrl || undefined,
      namespacePrefix: newSourceNamespacePrefix || undefined,
      enabled: true,
      priority: 0,
    });
  };

  const toggleEnabled = (id: number, currentlyEnabled: boolean) => {
    updateMutation.mutate({ id, enabled: !currentlyEnabled });
  };

  const deleteSource = (id: number) => {
    if (confirm("Are you sure you want to delete this external knowledge source?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "wikidata":
      case "dbpedia":
        return <Globe className="h-5 w-5" />;
      case "schema_org":
        return <Database className="h-5 w-5" />;
      case "custom":
        return <FileCode className="h-5 w-5" />;
      default:
        return <Database className="h-5 w-5" />;
    }
  };

  const presetSources = [
    {
      name: "Wikidata",
      type: "wikidata" as const,
      endpoint: "https://query.wikidata.org/sparql",
      description: "Structured knowledge base with millions of entities",
    },
    {
      name: "DBpedia",
      type: "dbpedia" as const,
      endpoint: "https://dbpedia.org/sparql",
      description: "Structured information from Wikipedia",
    },
    {
      name: "Schema.org",
      type: "schema_org" as const,
      endpoint: "",
      description: "Structured data vocabulary for the web",
    },
  ];

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">External Knowledge Sources</h2>
          <p className="text-muted-foreground">
            Connect to external ontologies and knowledge bases to enrich your file metadata
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Source
        </Button>
      </div>

      {sources.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No External Sources Connected</CardTitle>
            <CardDescription>
              Add external knowledge sources like Wikidata or DBpedia to automatically link your files to broader topic networks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {presetSources.map((preset) => (
                <Card key={preset.type} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => {
                  setNewSourceName(preset.name);
                  setNewSourceType(preset.type);
                  setNewSourceEndpoint(preset.endpoint);
                  setShowAddDialog(true);
                }}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {getSourceIcon(preset.type)}
                      {preset.name}
                    </CardTitle>
                    <CardDescription>{preset.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map((source) => (
            <Card key={source.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getSourceIcon(source.type)}
                    <CardTitle className="text-lg">{source.name}</CardTitle>
                  </div>
                  <Badge variant={source.enabled ? "default" : "secondary"}>
                    {source.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <CardDescription>
                  Type: {source.type}
                  {source.endpoint && <><br />Endpoint: {source.endpoint.substring(0, 40)}...</>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleEnabled(source.id, source.enabled)}
                    className="flex-1"
                  >
                    {source.enabled ? (
                      <>
                        <PowerOff className="h-4 w-4 mr-1" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Power className="h-4 w-4 mr-1" />
                        Enable
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteSource(source.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add External Knowledge Source</DialogTitle>
            <DialogDescription>
              Connect to an external ontology or knowledge base
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="e.g., Wikidata, DBpedia, Custom Ontology"
              />
            </div>
            <div>
              <Label htmlFor="source-type">Type</Label>
              <Select value={newSourceType} onValueChange={(value: any) => setNewSourceType(value)}>
                <SelectTrigger id="source-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wikidata">Wikidata</SelectItem>
                  <SelectItem value="dbpedia">DBpedia</SelectItem>
                  <SelectItem value="schema_org">Schema.org</SelectItem>
                  <SelectItem value="custom">Custom Ontology</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(newSourceType === "wikidata" || newSourceType === "dbpedia" || newSourceType === "custom") && (
              <div>
                <Label htmlFor="source-endpoint">SPARQL Endpoint URL</Label>
                <Input
                  id="source-endpoint"
                  value={newSourceEndpoint}
                  onChange={(e) => setNewSourceEndpoint(e.target.value)}
                  placeholder="https://query.wikidata.org/sparql"
                />
              </div>
            )}
            {newSourceType === "custom" && (
              <>
                <div>
                  <Label htmlFor="ontology-url">Ontology URL (OWL/RDF)</Label>
                  <Input
                    id="ontology-url"
                    value={newSourceOntologyUrl}
                    onChange={(e) => setNewSourceOntologyUrl(e.target.value)}
                    placeholder="https://example.com/ontology.owl"
                  />
                </div>
                <div>
                  <Label htmlFor="namespace-prefix">Namespace Prefix</Label>
                  <Input
                    id="namespace-prefix"
                    value={newSourceNamespacePrefix}
                    onChange={(e) => setNewSourceNamespacePrefix(e.target.value)}
                    placeholder="ex:"
                  />
                </div>
              </>
            )}
            {newSourceType !== "schema_org" && (
              <div>
                <Label htmlFor="api-key">API Key (optional)</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={newSourceApiKey}
                  onChange={(e) => setNewSourceApiKey(e.target.value)}
                  placeholder="Leave blank if not required"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddSource} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add Source"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
