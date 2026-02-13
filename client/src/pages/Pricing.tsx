import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, Sparkles, Crown, Zap, ArrowRight, Clock, AlertCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

type BillingInterval = "month" | "year";

export default function Pricing() {
  const { user, loading: authLoading } = useAuth();
  const [startingTrial, setStartingTrial] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  
  const { data: plans, isLoading: plansLoading } = trpc.subscription.getPlans.useQuery();
  const { data: pricingOptions } = trpc.stripe.getPricingOptions.useQuery();
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: !!user }
  );
  
  const startTrialMutation = trpc.subscription.startTrial.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchStatus();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  const createCheckoutMutation = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) window.open(data.checkoutUrl, "_blank");
      toast.info("Redirecting to checkout...");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  const handleStartTrial = async () => {
    setStartingTrial(true);
    try {
      await startTrialMutation.mutateAsync();
    } finally {
      setStartingTrial(false);
    }
  };
  
  const handleUpgrade = async (tierId: "pro" | "team") => {
    await createCheckoutMutation.mutateAsync({
      tierId,
      billingInterval,
    });
  };
  
  const isLoading = authLoading || plansLoading || (user && statusLoading);
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  const currentTier = status?.currentTier || "free";
  const isOnTrial = status?.isOnTrial || false;
  const trialExpired = status?.trialExpired || false;
  const trialUsed = status?.trialUsed || false;

  // Get pricing options for each tier
  const proMonthly = pricingOptions?.pro?.find((o: { interval: string }) => o.interval === "month");
  const proAnnual = pricingOptions?.pro?.find((o: { interval: string }) => o.interval === "year");
  const teamMonthly = pricingOptions?.team?.find((o: { interval: string }) => o.interval === "month");
  const teamAnnual = pricingOptions?.team?.find((o: { interval: string }) => o.interval === "year");

  // Determine display prices based on billing interval
  const proPrice = billingInterval === "month" ? "$9.99" : "$8.33";
  const proPriceNote = billingInterval === "year" ? "$99.99 billed annually" : null;
  const teamPrice = billingInterval === "month" ? "$29.99" : "$25.00";
  const teamPriceNote = billingInterval === "year" ? "$299.99 billed annually" : null;
  
  // Plan definitions for the grid
  const planCards = [
    {
      id: "free" as const,
      name: "Free",
      icon: <Zap className="h-5 w-5 text-muted-foreground" />,
      description: "Basic file management for individuals",
      price: "Free",
      priceNote: null,
      priceSubtext: "",
      recommended: false,
      features: [
        "Upload up to 100 files",
        "2 GB storage",
        "Label and organize files",
        "Edit file metadata",
        "Delete files",
        "Create collections",
        "Share files via links",
      ],
    },
    {
      id: "pro" as const,
      name: "Pro",
      icon: <Crown className="h-5 w-5 text-yellow-500" />,
      description: "Full-featured media management for professionals",
      price: proPrice,
      priceNote: proPriceNote,
      priceSubtext: "/month",
      recommended: true,
      features: [
        "Unlimited files",
        "50 GB storage",
        "Unlimited video uploads",
        "Video annotation with transcription",
        "Link annotations to metadata-labeled files",
        "AI-powered file enrichment",
        "Knowledge graph visualization",
        "Export data in multiple formats",
        "Priority support",
      ],
    },
    {
      id: "team" as const,
      name: "Team",
      icon: <Users className="h-5 w-5 text-blue-500" />,
      description: "Collaborative media management for teams",
      price: teamPrice,
      priceNote: teamPriceNote,
      priceSubtext: "/month per seat",
      recommended: false,
      features: [
        "Everything in Pro",
        "200 GB shared storage",
        "Up to 5 team members",
        "Team admin controls",
        "Shared collections & files",
        "Team annotation workflow",
        "Centralized billing",
        "Priority support",
      ],
    },
  ];
  
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Start with our free plan or unlock the full power of MetaClips with Pro or Team features.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span
            className={`text-sm font-medium cursor-pointer transition-colors ${
              billingInterval === "month" ? "text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => setBillingInterval("month")}
          >
            Monthly
          </span>
          <button
            onClick={() =>
              setBillingInterval((prev) => (prev === "month" ? "year" : "month"))
            }
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              billingInterval === "year" ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none block h-5.5 w-5.5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                billingInterval === "year" ? "translate-x-5" : "translate-x-0.5"
              } mt-[1px]`}
            />
          </button>
          <span
            className={`text-sm font-medium cursor-pointer transition-colors ${
              billingInterval === "year" ? "text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => setBillingInterval("year")}
          >
            Annual
          </span>
          {(proAnnual?.savings || teamAnnual?.savings) && (
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
              Save 17%
            </Badge>
          )}
        </div>
        
        {/* Current Status Banner */}
        {user && status && (
          <div className="mb-8">
            {isOnTrial && (
              <Card className="border-primary bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Pro Trial Active</p>
                        <p className="text-sm text-muted-foreground">
                          {status.trialDaysRemaining} days remaining
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => handleUpgrade("pro")} disabled={createCheckoutMutation.isPending}>
                      Upgrade Now <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {trialExpired && (
              <Card className="border-destructive bg-destructive/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      <div>
                        <p className="font-medium">Trial Expired</p>
                        <p className="text-sm text-muted-foreground">
                          Upgrade to Pro or Team to continue using premium features
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => handleUpgrade("pro")} disabled={createCheckoutMutation.isPending}>
                      Upgrade Now <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        
        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {planCards.map((plan) => {
            const isCurrentPlan = currentTier === plan.id;
            
            return (
              <Card 
                key={plan.id} 
                className={`relative ${plan.recommended ? "border-primary shadow-lg" : ""} ${isCurrentPlan ? "ring-2 ring-primary" : ""}`}
              >
                {plan.recommended && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    Most Popular
                  </Badge>
                )}
                
                {isCurrentPlan && (
                  <Badge variant="outline" className="absolute -top-3 right-4">
                    Current Plan
                  </Badge>
                )}
                
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    {plan.icon}
                    <CardTitle>{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.priceSubtext && <span className="text-muted-foreground">{plan.priceSubtext}</span>}
                    {plan.priceNote && (
                      <div className="mt-1">
                        <span className="text-sm text-muted-foreground line-through mr-2">
                          {plan.id === "pro" ? "$9.99/mo" : "$29.99/mo"}
                        </span>
                        <span className="text-sm text-primary font-medium">
                          {plan.priceNote}
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent>
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                
                <CardFooter>
                  {plan.id === "free" && (
                    <div className="w-full space-y-2">
                      <Button 
                        variant={isCurrentPlan ? "outline" : "default"} 
                        className="w-full"
                        disabled={isCurrentPlan}
                      >
                        {isCurrentPlan ? "Current Plan" : "Get Started"}
                      </Button>
                      {!trialUsed && !isOnTrial && currentTier === "free" && user && (
                        <Button 
                          variant="ghost"
                          className="w-full text-primary"
                          disabled={startingTrial}
                          onClick={handleStartTrial}
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          {startingTrial ? "Starting..." : "Start 14-day Pro Trial"}
                        </Button>
                      )}
                    </div>
                  )}
                  
                  {plan.id === "pro" && (
                    <Button 
                      variant={plan.recommended ? "default" : "outline"}
                      className="w-full"
                      disabled={currentTier === "pro" || createCheckoutMutation.isPending}
                      onClick={() => handleUpgrade("pro")}
                    >
                      {currentTier === "pro" ? "Current Plan" : currentTier === "team" ? "Downgrade to Pro" : "Upgrade to Pro"}
                    </Button>
                  )}

                  {plan.id === "team" && (
                    <Button 
                      variant="outline"
                      className="w-full"
                      disabled={currentTier === "team" || createCheckoutMutation.isPending}
                      onClick={() => handleUpgrade("team")}
                    >
                      {currentTier === "team" ? "Current Plan" : "Upgrade to Team"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
        
        {/* Usage Stats (for logged in users) */}
        {user && status && (
          <Card>
            <CardHeader>
              <CardTitle>Your Usage</CardTitle>
              <CardDescription>Current resource consumption on your {status.planName} plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                {/* Storage */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Storage</span>
                    <span className="text-sm text-muted-foreground">
                      {status.usage.storageUsedFormatted} / {status.usage.storageLimitFormatted}
                    </span>
                  </div>
                  <Progress value={status.usage.storagePercentage} className="h-2" />
                </div>
                
                {/* Videos */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Videos</span>
                    <span className="text-sm text-muted-foreground">
                      {status.usage.videoCount} / {status.usage.videoLimit === -1 ? "∞" : status.usage.videoLimit}
                    </span>
                  </div>
                  <Progress 
                    value={status.usage.videoLimit === -1 ? 0 : status.usage.videoPercentage} 
                    className="h-2" 
                  />
                </div>
                
                {/* Files */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Files</span>
                    <span className="text-sm text-muted-foreground">
                      {status.usage.fileCount} / {status.usage.fileLimit === -1 ? "∞" : status.usage.fileLimit}
                    </span>
                  </div>
                  <Progress 
                    value={status.usage.fileLimit === -1 ? 0 : status.usage.filePercentage} 
                    className="h-2" 
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Not logged in CTA */}
        {!user && (
          <div className="text-center mt-8">
            <p className="text-muted-foreground mb-4">
              Sign in to start your free trial or upgrade to Pro
            </p>
            <Link href="/">
              <Button size="lg">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
