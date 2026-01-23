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
  FolderIcon,
  Menu,
  BarChart3,
  X,
  Mail,
  ListChecks,
  Calendar,
  Activity,
  ChevronDown,
  Wrench
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { StorageAlert } from "@/components/StorageAlert";

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: stats } = trpc.activity.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const storageLimit = 10 * 1024 * 1024 * 1024; // 10GB limit

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

  const mainNavItems = [
    { href: "/", label: "Files", icon: FileIcon },
    { href: "/search", label: "Search", icon: SearchIcon },
    { href: "/videos", label: "Videos", icon: VideoIcon },
    { href: "/collections", label: "Collections", icon: FolderIcon },
  ];

  const toolsMenuItems = [
    { href: "/enrichment-queue", label: "Enrichment Queue", icon: ListChecks },
    { href: "/scheduled-exports", label: "Scheduled Exports", icon: Calendar },
  ];

  const insightsMenuItems = [
    { href: "/knowledge-graph", label: "Knowledge Graph", icon: NetworkIcon },
    { href: "/activity", label: "Activity", icon: Activity },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ];

  const allNavItems = [...mainNavItems, ...toolsMenuItems, ...insightsMenuItems, { href: "/settings", label: "Settings", icon: SettingsIcon }];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2 md:gap-8">
            <Link href="/" className="flex items-center gap-1.5 font-bold text-lg md:text-xl">
              <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              <span className="hidden sm:inline">MetaClips</span>
            </Link>
            
            {/* Desktop Navigation with dropdown menus */}
            <nav className="hidden md:flex items-center gap-2">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm whitespace-nowrap ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })}
              
              {/* Tools Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={toolsMenuItems.some(item => location === item.href) ? "default" : "ghost"}
                    size="sm"
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <Wrench className="h-4 w-4" />
                    <span className="hidden lg:inline">Tools</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {toolsMenuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Insights Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={insightsMenuItems.some(item => location === item.href) ? "default" : "ghost"}
                    size="sm"
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden lg:inline">Insights</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {insightsMenuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Settings */}
              <Link 
                href="/settings"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm whitespace-nowrap ${
                  location === "/settings"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <SettingsIcon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">Settings</span>
              </Link>
            </nav>
            
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden flex items-center gap-1.5"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              <span className="text-sm">Menu</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.name || user?.email}
            </span>
            <Button 
              variant="ghost" 
              size="sm"
              className="hidden sm:flex"
              asChild
            >
              <a href="mailto:aalap.c.shah@gmail.com" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Contact Us
              </a>
            </Button>

            <Button variant="ghost" size="icon" onClick={() => logout()}>
              <LogOutIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="md:hidden fixed inset-0 bg-black/50 z-30" 
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Menu Panel */}
          <div className="md:hidden fixed top-16 left-0 right-0 bottom-0 bg-card z-40 overflow-y-auto border-t border-border">
            <nav className="container py-4 flex flex-col gap-2">
            {allNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
            <a 
              href="mailto:aalap.c.shah@gmail.com"
              className="flex items-center gap-3 px-4 py-3 rounded-md transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Mail className="h-5 w-5" />
              Contact Us
            </a>
          </nav>
        </div>
        </>
      )}

      {/* Main Content */}
      <main className="container py-8">
        {/* Storage Alert */}
        {stats && (
          <div className="mb-6">
            <StorageAlert 
              totalStorage={stats.totalStorage} 
              storageLimit={storageLimit}
            />
          </div>
        )}
        
        {/* This will be replaced by route-specific content */}
        {location === "/" && <FilesView />}
        {location === "/search" && <SearchView />}
        {location === "/videos" && <VideosView />}
        {location === "/collections" && <CollectionsPage />}
        {location === "/enrichment-queue" && <EnrichmentQueueView />}
        {location === "/knowledge-graph" && <KnowledgeGraphView />}
        {location === "/analytics" && <AnalyticsView />}
        {location === "/scheduled-exports" && <ScheduledExportsView />}
        {location === "/settings" && <SettingsView />}
      </main>
    </div>
  );
}

// File management view
import FilesView from "./FilesView";

import SearchWithSaved from "./SearchWithSaved";

function SearchView() {
  return <SearchWithSaved />;
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
import { ExternalKnowledgeSourcesManager } from "@/components/knowledge-graph/ExternalKnowledgeSourcesManager";
import SettingsPage from "./Settings";
import { Analytics as AnalyticsPage } from "./Analytics";
import CollectionsPage from "./Collections";
import { ScheduledExportsManager } from "@/components/ScheduledExportsManager";
import EnrichmentQueuePage from "./EnrichmentQueue";

function KnowledgeGraphView() {
  const [showExternalSources, setShowExternalSources] = useState(false);
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Knowledge Graph</h1>
        <p className="text-muted-foreground">
          Explore semantic relationships between your files
        </p>
      </div>
      
      <div className="flex gap-2">
        <Button
          variant={!showExternalSources ? "default" : "outline"}
          onClick={() => setShowExternalSources(false)}
        >
          Internal Graph
        </Button>
        <Button
          variant={showExternalSources ? "default" : "outline"}
          onClick={() => setShowExternalSources(true)}
        >
          External Knowledge Sources
        </Button>
      </div>
      
      {!showExternalSources ? (
        <KnowledgeGraphComponent />
      ) : (
        <ExternalKnowledgeSourcesManager />
      )}
    </div>
  );
}

function EnrichmentQueueView() {
  return <EnrichmentQueuePage />;
}

function AnalyticsView() {
  return <AnalyticsPage />;
}

function SettingsView() {
  return <SettingsPage />;
}

function ScheduledExportsView() {
  return (
    <div className="container py-8">
      <ScheduledExportsManager />
    </div>
  );
}
