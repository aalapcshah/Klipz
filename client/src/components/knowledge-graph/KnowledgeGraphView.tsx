import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Network, Tag, FileText } from "lucide-react";
import { toast } from "sonner";

export function KnowledgeGraphView() {
  const { data: graph, isLoading, refetch } = trpc.knowledgeGraph.getGraphData.useQuery(
    { includeFiles: true, minSimilarity: 0.3 }
  );

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("Knowledge graph refreshed!");
    } catch (error) {
      toast.error("Failed to refresh knowledge graph");
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
        <Button onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Build Graph
        </Button>
      </div>
    );
  }

  // Separate tags and files
  const tagNodes = graph.nodes.filter(n => n.type === 'tag');
  const fileNodes = graph.nodes.filter(n => n.type === 'file');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {tagNodes.length} tags • {fileNodes.length} files • {graph.edges.length} connections
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Graph
        </Button>
      </div>

      {/* Simple List View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tags */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags ({tagNodes.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tagNodes.map((node) => {
              const connectionCount = graph.edges.filter(
                (e) => e.source === node.id || e.target === node.id
              ).length;
              
              return (
                <div
                  key={node.id}
                  className="p-3 bg-muted rounded-md flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-sm">{node.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Weight: {node.weight}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {connectionCount} connections
                  </Badge>
                </div>
              );
            })}
            {tagNodes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No tags yet. Add tags to your files to build the graph.
              </p>
            )}
          </div>
        </Card>

        {/* Files */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Files ({fileNodes.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {fileNodes.map((node) => (
              <div
                key={node.id}
                className="p-3 bg-muted rounded-md flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-sm truncate max-w-[200px]">
                    {node.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {node.metadata.fileType}
                  </p>
                </div>
              </div>
            ))}
            {fileNodes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No files yet. Upload files to see them in the graph.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Relationships */}
      {graph.edges.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Tag Relationships</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {graph.edges.map((edge, index) => {
              const sourceNode = graph.nodes.find(n => n.id === edge.source);
              const targetNode = graph.nodes.find(n => n.id === edge.target);

              return (
                <div
                  key={`${edge.source}-${edge.target}-${index}`}
                  className="p-3 bg-muted rounded-md space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">
                        {sourceNode?.label || edge.source}
                      </span>
                      <span className="text-muted-foreground mx-2">↔</span>
                      <span className="font-medium">
                        {targetNode?.label || edge.target}
                      </span>
                    </div>
                    <Badge
                      variant={
                        edge.weight > 0.75
                          ? "default"
                          : edge.weight > 0.5
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {Math.round(edge.weight * 100)}%
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {edge.type}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Info Card */}
      <Card className="p-4 bg-accent/10 border-accent">
        <div className="flex items-start gap-3">
          <Network className="h-5 w-5 text-accent mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">About the Knowledge Graph</p>
            <p className="text-sm text-muted-foreground">
              The knowledge graph shows semantic relationships between your tags and files
              based on shared keywords and AI analysis. Stronger connections indicate 
              higher similarity. Add more tags to your files to build richer relationships.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
