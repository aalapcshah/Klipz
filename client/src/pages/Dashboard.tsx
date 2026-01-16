import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { 
  FileIcon, 
  VideoIcon, 
  NetworkIcon, 
  SettingsIcon, 
  LogOutIcon,
  Sparkles,
  Upload,
  Search as SearchIcon,
  FolderIcon
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6 max-w-md">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold gradient-text">MetaClips</h1>
            <p className="text-muted-foreground">
              AI-Powered Media Management & Video Annotation Platform
            </p>
          </div>
          <Button asChild size="lg" className="w-full">
            <a href={getLoginUrl()}>Sign In to Get Started</a>
          </Button>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/", label: "Files", icon: FileIcon },
    { href: "/search", label: "Search", icon: SearchIcon },
    { href: "/videos", label: "Videos", icon: VideoIcon },
    { href: "/collections", label: "Collections", icon: FolderIcon },
    { href: "/knowledge-graph", label: "Knowledge Graph", icon: NetworkIcon },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/">
              <a className="flex items-center gap-2 font-bold text-xl">
                <Sparkles className="h-6 w-6 text-primary" />
                MetaClips
              </a>
            </Link>
            
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <a
                      className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </a>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.name || user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={() => logout()}>
              <LogOutIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* This will be replaced by route-specific content */}
        {location === "/" && <FilesView />}
        {location === "/videos" && <VideosView />}
        {location === "/collections" && <CollectionsManager />}
        {location === "/knowledge-graph" && <KnowledgeGraphView />}
      </main>
    </div>
  );
}

// File management view
import { FileUploadDialog } from "@/components/files/FileUploadDialog";
import { FileGridEnhanced } from "@/components/files/FileGridEnhanced";
import { FileDetailDialog } from "@/components/files/FileDetailDialog";

function FilesView() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);

  const handleFileClick = (fileId: number) => {
    setSelectedFileId(fileId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Files</h1>
          <p className="text-muted-foreground">
            Manage and enrich your media files with AI
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Files
        </Button>
      </div>

        <FileGridEnhanced onFileClick={handleFileClick} />

      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploadComplete={() => {
          // Refresh file list
        }}
      />

      <FileDetailDialog
        fileId={selectedFileId}
        open={selectedFileId !== null}
        onOpenChange={(open) => !open && setSelectedFileId(null)}
      />
    </div>
  );
}

import { VideoRecorderWithTranscription } from "@/components/videos/VideoRecorderWithTranscription";
import { VideoList } from "@/components/videos/VideoList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function VideosView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Videos</h1>
        <p className="text-muted-foreground">
          Record and annotate videos with AI assistance
        </p>
      </div>

      <Tabs defaultValue="record" className="w-full">
        <TabsList>
          <TabsTrigger value="record">Record New</TabsTrigger>
          <TabsTrigger value="library">Video Library</TabsTrigger>
        </TabsList>
        <TabsContent value="record" className="mt-6">
          <VideoRecorderWithTranscription />
        </TabsContent>
        <TabsContent value="library" className="mt-6">
          <VideoList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { KnowledgeGraphView as KnowledgeGraphComponent } from "@/components/knowledge-graph/KnowledgeGraphView";
import { CollectionsManager } from "@/components/collections/CollectionsManager";

function KnowledgeGraphView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Knowledge Graph</h1>
        <p className="text-muted-foreground">
          Explore semantic relationships between your files
        </p>
      </div>
      
      <KnowledgeGraphComponent />
    </div>
  );
}
