import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SmartCollectionsManager from "@/components/collections/SmartCollectionsManager";
import { ShareCollectionDialog } from "@/components/collections/ShareCollectionDialog";
import { Folder, Sparkles, Share2 } from "lucide-react";
import { UsageOverviewCompact } from "@/components/UsageOverviewCompact";

export default function Collections() {
  const { data: collections = [] } = trpc.collections.list.useQuery();
  const [shareCollection, setShareCollection] = useState<{
    id: number;
    name: string;
  } | null>(null);

  return (
    <div className="container py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Collections</h1>
            <p className="text-muted-foreground">
              Organize your files into collections and smart collections
            </p>
          </div>
          <UsageOverviewCompact />
        </div>
      </div>

      <Tabs defaultValue="regular" className="space-y-6">
        <TabsList>
          <TabsTrigger value="regular">
            <Folder className="mr-2 h-4 w-4" />
            Regular Collections
          </TabsTrigger>
          <TabsTrigger value="smart">
            <Sparkles className="mr-2 h-4 w-4" />
            Smart Collections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="regular" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <Card key={collection.id} className="group relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: collection.color || '#6366f1' }}
                    >
                      <Folder className="h-5 w-5 text-white" />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShareCollection({
                          id: collection.id,
                          name: collection.name,
                        });
                      }}
                      title="Share collection"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardTitle className="text-lg">{collection.name}</CardTitle>
                  {collection.description && (
                    <CardDescription>{collection.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {(collection as any).fileCount || 0} files
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShareCollection({
                          id: collection.id,
                          name: collection.name,
                        });
                      }}
                    >
                      <Share2 className="h-3 w-3 mr-1" />
                      Share
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {collections.length === 0 && (
              <div className="col-span-full text-center py-12">
                <Folder className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No collections yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create collections from the Files page to organize your media
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="smart">
          <SmartCollectionsManager />
        </TabsContent>
      </Tabs>

      {shareCollection && (
        <ShareCollectionDialog
          open={!!shareCollection}
          onOpenChange={(open) => {
            if (!open) setShareCollection(null);
          }}
          collectionId={shareCollection.id}
          collectionName={shareCollection.name}
        />
      )}
    </div>
  );
}
