import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SmartCollectionsManager from "@/components/collections/SmartCollectionsManager";
import { Folder, Sparkles } from "lucide-react";

export default function Collections() {
  const { data: collections = [] } = trpc.collections.list.useQuery();

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Collections</h1>
        <p className="text-muted-foreground">
          Organize your files into collections and smart collections
        </p>
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
              <Card key={collection.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: collection.color || '#6366f1' }}
                    >
                      <Folder className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <CardTitle className="text-lg">{collection.name}</CardTitle>
                  {collection.description && (
                    <CardDescription>{collection.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {(collection as any).fileCount || 0} files
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
    </div>
  );
}
