import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFontSize } from "@/contexts/FontSizeContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Edit2, CheckCircle2, XCircle, Network } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountSettings } from "@/components/AccountSettings";
import { NotificationPreferencesSettings } from "@/components/NotificationPreferencesSettings";

type KnowledgeGraphType = "dbpedia" | "wikidata" | "schema_org" | "custom";

function FontSizePreference() {
  const { fontSize, setFontSize } = useFontSize();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Font Size</CardTitle>
        <CardDescription>
          Adjust the base font size for better readability
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Label>Choose your preferred font size</Label>
          <div className="grid gap-3">
            <button
              onClick={() => setFontSize("compact")}
              className={`p-4 border rounded-lg text-left transition-colors ${
                fontSize === "compact"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-semibold">Compact (14-15px)</div>
              <div className="text-sm text-muted-foreground mt-1">
                Smaller text for more content on screen
              </div>
            </button>
            <button
              onClick={() => setFontSize("standard")}
              className={`p-4 border rounded-lg text-left transition-colors ${
                fontSize === "standard"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-semibold">Standard (15-16px)</div>
              <div className="text-sm text-muted-foreground mt-1">
                Default size for balanced readability
              </div>
            </button>
            <button
              onClick={() => setFontSize("large")}
              className={`p-4 border rounded-lg text-left transition-colors ${
                fontSize === "large"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-semibold">Large (17-18px)</div>
              <div className="text-sm text-muted-foreground mt-1">
                Larger text for improved accessibility
              </div>
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface KnowledgeGraphForm {
  name: string;
  type: KnowledgeGraphType;
  endpoint: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
  ontologyUrl: string;
  namespacePrefix: string;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState("account");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState<KnowledgeGraphForm>({
    name: "",
    type: "dbpedia",
    endpoint: "",
    apiKey: "",
    enabled: true,
    priority: 0,
    ontologyUrl: "",
    namespacePrefix: "",
  });

  const { data: knowledgeGraphs, isLoading, refetch } = trpc.externalKnowledgeGraphs.list.useQuery();
  const createMutation = trpc.externalKnowledgeGraphs.create.useMutation();
  const updateMutation = trpc.externalKnowledgeGraphs.update.useMutation();
  const deleteMutation = trpc.externalKnowledgeGraphs.delete.useMutation();
  const restartTutorialMutation = trpc.onboarding.restartTutorial.useMutation({
    onSuccess: () => {
      toast.success("Tutorial will start on next page load. Refresh the page to begin.");
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: () => {
      toast.error("Failed to restart tutorial");
    },
  });
  const testMutation = trpc.externalKnowledgeGraphs.testConnection.useMutation();

  const resetForm = () => {
    setFormData({
      name: "",
      type: "dbpedia",
      endpoint: "",
      apiKey: "",
      enabled: true,
      priority: 0,
      ontologyUrl: "",
      namespacePrefix: "",
    });
    setEditingId(null);
  };

  const handleAdd = () => {
    setIsAddDialogOpen(true);
    resetForm();
  };

  const handleEdit = (kg: any) => {
    setFormData({
      name: kg.name,
      type: kg.type,
      endpoint: kg.endpoint || "",
      apiKey: kg.apiKey || "",
      enabled: kg.enabled,
      priority: kg.priority,
      ontologyUrl: kg.ontologyUrl || "",
      namespacePrefix: kg.namespacePrefix || "",
    });
    setEditingId(kg.id);
    setIsAddDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...formData,
        });
        toast.success("Knowledge graph updated successfully");
      } else {
        await createMutation.mutateAsync(formData);
        toast.success("Knowledge graph added successfully");
      }
      setIsAddDialogOpen(false);
      resetForm();
      refetch();
    } catch (error) {
      toast.error("Failed to save knowledge graph");
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this knowledge graph connection?")) return;
    
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Knowledge graph deleted");
      refetch();
    } catch (error) {
      toast.error("Failed to delete knowledge graph");
      console.error(error);
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    try {
      const result = await testMutation.mutateAsync({ id });
      if (result.success) {
        toast.success(`Connection successful! Response time: ${result.responseTime}ms`);
      } else {
        toast.error("Connection failed");
      }
    } catch (error) {
      toast.error("Connection test failed");
      console.error(error);
    } finally {
      setTestingId(null);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      dbpedia: "DBpedia",
      wikidata: "Wikidata",
      schema_org: "Schema.org",
      custom: "Custom Ontology",
    };
    return labels[type] || type;
  };

  const getDefaultEndpoint = (type: KnowledgeGraphType) => {
    const endpoints: Record<KnowledgeGraphType, string> = {
      dbpedia: "https://dbpedia.org/sparql",
      wikidata: "https://query.wikidata.org/sparql",
      schema_org: "https://schema.org",
      custom: "",
    };
    return endpoints[type];
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account and application settings
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="knowledge-graphs">Knowledge Graphs</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-6 mt-6">
          <AccountSettings />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6 mt-6">
          <NotificationPreferencesSettings />
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6 mt-6">
          <FontSizePreference />
          
          <Card>
            <CardHeader>
              <CardTitle>Tutorial & Onboarding</CardTitle>
              <CardDescription>
                Restart the interactive tutorial to review key features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => restartTutorialMutation.mutate()}
                variant="outline"
                disabled={restartTutorialMutation.isPending}
              >
                {restartTutorialMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Restarting...
                  </>
                ) : (
                  "Restart Tutorial"
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge-graphs" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">External Knowledge Graphs</h2>
              <p className="text-muted-foreground mt-2">
                Manage external knowledge graph connections for enhanced AI enrichment
              </p>
            </div>
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Connection
            </Button>
          </div>

      {/* Premium Feature Badge */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            External Knowledge Graphs (Premium Feature)
          </CardTitle>
          <CardDescription>
            Connect to external ontologies like DBpedia, Wikidata, and Schema.org to enhance your AI-powered
            file enrichment with semantic knowledge from trusted sources.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Knowledge Graphs List */}
      <div className="grid gap-4">
        {!knowledgeGraphs || knowledgeGraphs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Network className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No knowledge graphs configured</h3>
              <p className="text-muted-foreground mb-4">
                Add your first external knowledge graph connection to enhance AI enrichment
              </p>
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Connection
              </Button>
            </CardContent>
          </Card>
        ) : (
          knowledgeGraphs.map((kg) => (
            <Card key={kg.id} className={!kg.enabled ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {kg.name}
                      {kg.enabled ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {getTypeLabel(kg.type)} • Priority: {kg.priority}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(kg.id)}
                      disabled={testingId === kg.id}
                    >
                      {testingId === kg.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Test"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(kg)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(kg.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Endpoint:</span>
                    <p className="font-mono text-xs mt-1 truncate">{kg.endpoint || "N/A"}</p>
                  </div>
                  {kg.type === "custom" && kg.ontologyUrl && (
                    <div>
                      <span className="text-muted-foreground">Ontology URL:</span>
                      <p className="font-mono text-xs mt-1 truncate">{kg.ontologyUrl}</p>
                    </div>
                  )}
                  {kg.lastUsedAt && (
                    <div>
                      <span className="text-muted-foreground">Last Used:</span>
                      <p className="text-xs mt-1">
                        {new Date(kg.lastUsedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Usage Count:</span>
                    <p className="text-xs mt-1">{kg.usageCount || 0} queries</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Knowledge Graph" : "Add Knowledge Graph"}
            </DialogTitle>
            <DialogDescription>
              Configure an external knowledge graph connection for AI enrichment
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Connection Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My DBpedia Connection"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Knowledge Graph Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: KnowledgeGraphType) => {
                  setFormData({
                    ...formData,
                    type: value,
                    endpoint: getDefaultEndpoint(value),
                  });
                }}
              >
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dbpedia">DBpedia</SelectItem>
                  <SelectItem value="wikidata">Wikidata</SelectItem>
                  <SelectItem value="schema_org">Schema.org</SelectItem>
                  <SelectItem value="custom">Custom Ontology</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endpoint">SPARQL Endpoint / API URL</Label>
              <Input
                id="endpoint"
                value={formData.endpoint}
                onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                placeholder="https://dbpedia.org/sparql"
              />
            </div>

            {formData.type === "custom" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ontologyUrl">Ontology URL (OWL/RDF)</Label>
                  <Input
                    id="ontologyUrl"
                    value={formData.ontologyUrl}
                    onChange={(e) => setFormData({ ...formData, ontologyUrl: e.target.value })}
                    placeholder="https://example.com/ontology.owl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="namespacePrefix">Namespace Prefix</Label>
                  <Input
                    id="namespacePrefix"
                    value={formData.namespacePrefix}
                    onChange={(e) => setFormData({ ...formData, namespacePrefix: e.target.value })}
                    placeholder="ex:"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key (Optional)</Label>
              <Input
                id="apiKey"
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="Enter API key if required"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority (Higher = Queried First)</Label>
              <Input
                id="priority"
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
              <Label htmlFor="enabled">Enable this connection</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || !formData.endpoint || createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {editingId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
