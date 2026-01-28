import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Sparkles, Crown } from "lucide-react";
import { Link } from "wouter";
import { ReactNode } from "react";

type FeatureAction = 
  | 'uploadVideo'
  | 'annotateVideo'
  | 'useTranscription'
  | 'linkAnnotationsToFiles'
  | 'useAIEnrichment'
  | 'useKnowledgeGraph'
  | 'exportData'
  | 'shareFiles'
  | 'createCollections';

interface FeatureGateProps {
  feature: FeatureAction;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
}

export function FeatureGate({ 
  feature, 
  children, 
  fallback,
  showUpgradePrompt = true 
}: FeatureGateProps) {
  const { user } = useAuth();
  
  const { data: permission, isLoading } = trpc.subscription.checkPermission.useQuery(
    { action: feature },
    { enabled: !!user }
  );
  
  // Not logged in - show children (login will be required elsewhere)
  if (!user) {
    return <>{children}</>;
  }
  
  // Loading
  if (isLoading) {
    return <>{children}</>;
  }
  
  // Feature allowed
  if (permission?.allowed) {
    return <>{children}</>;
  }
  
  // Feature not allowed - show fallback or upgrade prompt
  if (fallback) {
    return <>{fallback}</>;
  }
  
  if (!showUpgradePrompt) {
    return null;
  }
  
  const featureNames: Record<FeatureAction, string> = {
    uploadVideo: 'Video Uploads',
    annotateVideo: 'Video Annotations',
    useTranscription: 'Video Transcription',
    linkAnnotationsToFiles: 'Link Annotations to Files',
    useAIEnrichment: 'AI Enrichment',
    useKnowledgeGraph: 'Knowledge Graph',
    exportData: 'Data Export',
    shareFiles: 'File Sharing',
    createCollections: 'Collections',
  };
  
  return (
    <Card className="border-dashed">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg">{featureNames[feature]} is a Pro Feature</CardTitle>
        <CardDescription>
          {permission?.message || 'Upgrade to Pro to unlock this feature'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {permission?.currentTier === 'free' && (
          <Link href="/pricing">
            <Button variant="default" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Start Free Trial
            </Button>
          </Link>
        )}
        <Link href="/pricing">
          <Button variant="outline" className="gap-2">
            <Crown className="h-4 w-4" />
            View Plans
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * Hook to check if a feature is available
 */
export function useFeatureAccess(feature: FeatureAction) {
  const { user } = useAuth();
  
  const { data: permission, isLoading } = trpc.subscription.checkPermission.useQuery(
    { action: feature },
    { enabled: !!user }
  );
  
  return {
    allowed: !user || permission?.allowed || false,
    loading: isLoading,
    currentTier: permission?.currentTier,
    message: permission?.message,
  };
}

/**
 * Hook to check storage limits before upload
 */
export function useStorageLimit(fileSize: number) {
  const { user } = useAuth();
  
  const { data, isLoading } = trpc.subscription.checkStorageLimit.useQuery(
    { fileSize },
    { enabled: !!user && fileSize > 0 }
  );
  
  return {
    allowed: !user || data?.allowed || false,
    loading: isLoading,
    currentUsage: data?.currentUsage || 0,
    limit: data?.limit || 0,
    message: data?.message,
  };
}

/**
 * Hook to check video upload limits
 */
export function useVideoLimit() {
  const { user } = useAuth();
  
  const { data, isLoading } = trpc.subscription.checkVideoLimit.useQuery(
    undefined,
    { enabled: !!user }
  );
  
  return {
    allowed: !user || data?.allowed || false,
    loading: isLoading,
    currentCount: data?.currentCount || 0,
    limit: data?.limit || 0,
    message: data?.message,
  };
}
