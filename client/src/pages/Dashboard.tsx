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
  Wrench,
  Link2,
  Crown
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
import { triggerHaptic } from "@/lib/haptics";
import { GlobalUploadProgress } from "@/components/GlobalUploadProgress";
import { StorageAlertBanner } from "@/components/StorageAlertBanner";
import { TrialBanner } from "@/components/TrialBanner";
import { UsageDashboardWidget } from "@/components/UsageDashboardWidget";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { UsageOverviewCompact } from "@/components/UsageOverviewCompact";
import { VideosFAB } from "@/components/FloatingActionButton";

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const { data: stats } = trpc.activity.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const storageLimit = 10 * 1024 * 1024 * 1024; // 10GB limit

  // Swipe gesture handlers
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isRightSwipe && mobileMenuOpen) {
      triggerHaptic('light');
      setMobileMenuOpen(false);
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

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
            <h1 className="text-4xl font-bold gradient-text">Klipz</h1>
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
    { href: "/my-shares", label: "My Shares", icon: Link2 },
    { href: "/pricing", label: "Subscription", icon: Crown },
  ];

  const insightsMenuItems = [
    { href: "/knowledge-graph", label: "Knowledge Graph", icon: NetworkIcon },
    { href: "/activity", label: "Activity", icon: Activity },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ];

  const allNavItems = [...mainNavItems, ...toolsMenuItems, ...insightsMenuItems, { href: "/settings", label: "Settings", icon: SettingsIcon }];

  return (
    <div className="min-h-screen bg-background">
      {/* Storage Alert Banner */}
      <StorageAlertBanner />
      <TrialBanner />
      
      {/* Top Navigation */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center h-16 px-4">
          {/* Mobile: Hamburger (left) + Logo (center) + Logout (right) */}
          <div className="md:hidden flex items-center justify-between w-full">
            {/* Mobile Menu Button - Far Left */}
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={() => {
                triggerHaptic('light');
                setMobileMenuOpen(!mobileMenuOpen);
              }}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              <span className="text-sm">Menu</span>
            </Button>
            
            {/* Logo - Centered */}
            <Link href="/" className="flex items-center gap-1.5 font-bold text-lg absolute left-1/2 transform -translate-x-1/2">
              <img src="/klipz-icon.png" alt="Klipz" className="h-6 w-6" />
              <span>Klipz</span>
            </Link>
            
            {/* Quick Action Buttons - Right */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="h-9 w-9"
              >
                <Link href="/search">
                  <SearchIcon className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  triggerHaptic('light');
                  // Trigger upload - will be handled by Files page
                  window.location.href = '/?upload=true';
                }}
                className="h-9 w-9"
              >
                <Upload className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Desktop: Logo (left) + Nav (center) + User Info (right) */}
          <div className="hidden md:flex items-center gap-8 w-full">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl">
              <img src="/klipz-icon.png" alt="Klipz" className="h-7 w-7" />
              <span>Klipz</span>
            </Link>
            
            {/* Desktop Navigation with dropdown menus */}
            <nav className="flex items-center gap-2">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    id={item.label === "Files" ? "files-nav" : item.label === "Collections" ? "collections-nav" : undefined}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm ${
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
          
            <div className="flex items-center gap-2 ml-auto">
            {/* Usage Overview Compact */}
            <UsageOverviewCompact />
            
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.name || user?.email}
            </span>
            
            {/* Global Upload Progress Indicator */}
            <GlobalUploadProgress />
            
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
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="md:hidden fixed inset-0 bg-black/50 z-30" 
            onClick={() => setMobileMenuOpen(false)}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
          {/* Menu Panel */}
          <div className="md:hidden fixed top-16 left-0 right-0 bottom-0 bg-card z-40 overflow-y-auto border-t border-border">
            {/* User Profile Section */}
            <div className="border-b border-border px-4 py-4 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-lg">
                  {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{user?.name || 'User'}</p>
                  <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
            </div>
            
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
            <button
              className="flex items-center gap-3 px-4 py-3 rounded-md transition-colors hover:bg-muted text-muted-foreground hover:text-foreground w-full text-left"
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
            >
              <LogOutIcon className="h-5 w-5" />
              Sign Out
            </button>
          </nav>
        </div>
        </>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Main Content */}
      <main className="container py-2 md:py-8 pb-20 md:pb-8">
        {/* Storage Alert - show on main pages */}
        {(location === "/" || location === "/videos" || location === "/collections") && stats && (
          <div className="mb-6">
            <StorageAlert 
              totalStorage={stats.totalStorage} 
              storageLimit={storageLimit}
            />
          </div>
        )}
        
        {/* Storage Alert for other pages */}
        {!(location === "/" || location === "/videos" || location === "/collections") && stats && (
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
        {location === "/upload-history" && <UploadHistoryView />}
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
import { VideoUploadSection } from "@/components/VideoUploadSection";
import { RecentlyRecorded } from "@/components/videos/RecentlyRecorded";
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
          <TabsTrigger value="upload">Upload Video</TabsTrigger>
          <TabsTrigger value="library">Video Library</TabsTrigger>
        </TabsList>
        <TabsContent value="record" className="mt-6">
          <VideoRecorderWithTranscription />
        </TabsContent>
        <TabsContent value="upload" className="mt-6">
          <VideoUploadSection />
        </TabsContent>
        <TabsContent value="library" className="mt-6">
          <VideoList />
        </TabsContent>
      </Tabs>

      {/* Recently Recorded Section - At Bottom */}
      <div className="mt-8 pt-6 border-t">
        <RecentlyRecorded />
      </div>

      {/* Floating Action Button for Mobile */}
      <VideosFAB
        onRecordClick={() => {
          // Switch to record tab
          const recordTab = document.querySelector('[value="record"]') as HTMLButtonElement;
          if (recordTab) recordTab.click();
        }}
        onUploadClick={() => {
          // Switch to upload tab
          const uploadTab = document.querySelector('[value="upload"]') as HTMLButtonElement;
          if (uploadTab) uploadTab.click();
        }}
      />
    </div>
  );
}

import { KnowledgeGraphView as KnowledgeGraphComponent } from "@/components/knowledge-graph/KnowledgeGraphView";
import { ExternalKnowledgeSourcesManager } from "@/components/knowledge-graph/ExternalKnowledgeSourcesManager";
import KnowledgeGraphPageComponent from "@/pages/KnowledgeGraphPage";
import { KnowledgeGraphSettings } from "@/components/KnowledgeGraphSettings";
import SettingsPage from "./Settings";
import { Analytics as AnalyticsPage } from "./Analytics";
import CollectionsPage from "./Collections";
import { ScheduledExportsManager } from "@/components/ScheduledExportsManager";
import EnrichmentQueuePage from "./EnrichmentQueue";
import UploadHistory from "./UploadHistory";

function UploadHistoryView() {
  return <UploadHistory />;
}

function KnowledgeGraphView() {
  const [activeTab, setActiveTab] = useState<"graph" | "sources" | "settings">("graph");
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Knowledge Graph</h1>
        <p className="text-muted-foreground">
          Explore semantic relationships between your files, tags, and external knowledge sources
        </p>
      </div>
      
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTab === "graph" ? "default" : "outline"}
          onClick={() => setActiveTab("graph")}
        >
          <NetworkIcon className="h-4 w-4 mr-2" />
          Interactive Graph
        </Button>
        <Button
          variant={activeTab === "sources" ? "default" : "outline"}
          onClick={() => setActiveTab("sources")}
        >
          <Link2 className="h-4 w-4 mr-2" />
          External Sources
        </Button>
        <Button
          variant={activeTab === "settings" ? "default" : "outline"}
          onClick={() => setActiveTab("settings")}
        >
          <SettingsIcon className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>
      
      {activeTab === "graph" && <KnowledgeGraphPageComponent />}
      {activeTab === "sources" && <ExternalKnowledgeSourcesManager />}
      {activeTab === "settings" && <KnowledgeGraphSettings />}
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
