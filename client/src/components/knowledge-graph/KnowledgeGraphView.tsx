import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Network } from "lucide-react";
import { toast } from "sonner";

export function KnowledgeGraphView() {
  const { data: graph, isLoading, refetch } = trpc.knowledgeGraph.get.useQuery();
  const rebuildMutation = trpc.knowledgeGraph.rebuild.useMutation();

  const handleRebuild = async () => {
    try {
      await rebuildMutation.mutateAsync();
      toast.success("Knowledge graph rebuilt!");
      refetch();
    } catch (error) {
      toast.error("Failed to rebuild knowledge graph");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="text-center py-12">
        <Network className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">No knowledge graph yet</h3>
        <p className="text-muted-foreground mb-4">
          Upload and enrich files to build semantic relationships
        </p>
        <Button onClick={handleRebuild} disabled={rebuildMutation.isPending}>
          {rebuildMutation.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          <RefreshCw className="h-4 w-4 mr-2" />
          Build Graph
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {graph.nodes.length} files • {graph.edges.length} connections
          </p>
        </div>
        <Button
          onClick={handleRebuild}
          disabled={rebuildMutation.isPending}
          variant="outline"
        >
          {rebuildMutation.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          <RefreshCw className="h-4 w-4 mr-2" />
          Rebuild Graph
        </Button>
      </div>

      {/* Simple List View (Interactive visualization would require D3.js or similar) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Nodes */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Files in Graph</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {graph.nodes.map((node) => (
              <div
                key={node.id}
                className="p-3 bg-muted rounded-md flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-sm">{node.title}</p>
                  <p className="text-xs text-muted-foreground">{node.type}</p>
                </div>
                <Badge variant="outline">
                  {
                    graph.edges.filter(
                      (e) =>
                        e.sourceFileId === node.id ||
                        e.targetFileId === node.id
                    ).length
                  }{" "}
                  connections
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Edges */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Relationships</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {graph.edges.map((edge) => {
              const sourceNode = graph.nodes.find(
                (n) => n.id === edge.sourceFileId
              );
              const targetNode = graph.nodes.find(
                (n) => n.id === edge.targetFileId
              );

              return (
                <div
                  key={edge.id}
                  className="p-3 bg-muted rounded-md space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">
                        {sourceNode?.title || `File #${edge.sourceFileId}`}
                      </span>
                      <span className="text-muted-foreground mx-2">→</span>
                      <span className="font-medium">
                        {targetNode?.title || `File #${edge.targetFileId}`}
                      </span>
                    </div>
                    <Badge
                      variant={
                        edge.strength > 75
                          ? "default"
                          : edge.strength > 50
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {edge.strength}%
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{edge.relationshipType}</span>
                    {edge.sharedTags && edge.sharedTags.length > 0 && (
                      <>
                        <span>•</span>
                        <div className="flex gap-1">
                          {edge.sharedTags.slice(0, 3).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {edge.sharedTags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{edge.sharedTags.length - 3}
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="p-4 bg-accent/10 border-accent">
        <div className="flex items-start gap-3">
          <Network className="h-5 w-5 text-accent mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">About the Knowledge Graph</p>
            <p className="text-sm text-muted-foreground">
              The knowledge graph shows semantic relationships between your files
              based on shared tags, keywords, and AI analysis. Stronger
              connections indicate higher similarity.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
