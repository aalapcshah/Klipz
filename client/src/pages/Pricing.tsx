import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, Sparkles, Crown, Zap, ArrowRight, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function Pricing() {
  const { user, loading: authLoading } = useAuth();
  const [startingTrial, setStartingTrial] = useState(false);
  
  const { data: plans, isLoading: plansLoading } = trpc.subscription.getPlans.useQuery();
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
  
  const handleUpgrade = async () => {
    await createCheckoutMutation.mutateAsync({ tierId: "pro" });
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
  
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Start with our free plan or unlock the full power of MetaClips with Pro features.
          </p>
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
                    <Button onClick={handleUpgrade} disabled={createCheckoutMutation.isPending}>
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
                          Upgrade to Pro to continue using premium features
                        </p>
                      </div>
                    </div>
                    <Button onClick={handleUpgrade} disabled={createCheckoutMutation.isPending}>
                      Upgrade to Pro <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        
        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {plans?.map((plan) => {
            const isCurrentPlan = currentTier === plan.id;
            const isPro = plan.id === "pro";
            const isTrial = plan.id === "trial";
            
            return (
              <Card 
                key={plan.id} 
                className={`relative ${plan.recommended ? "border-primary shadow-lg" : ""} ${isCurrentPlan ? "ring-2 ring-primary" : ""}`}
              >
                {plan.recommended && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    Recommended
                  </Badge>
                )}
                
                {isCurrentPlan && (
                  <Badge variant="outline" className="absolute -top-3 right-4">
                    Current Plan
                  </Badge>
                )}
                
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    {plan.id === "free" && <Zap className="h-5 w-5 text-muted-foreground" />}
                    {plan.id === "trial" && <Sparkles className="h-5 w-5 text-primary" />}
                    {plan.id === "pro" && <Crown className="h-5 w-5 text-yellow-500" />}
                    <CardTitle>{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.priceFormatted}</span>
                    {plan.price > 0 && <span className="text-muted-foreground">/month</span>}
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
                    <Button 
                      variant={isCurrentPlan ? "outline" : "default"} 
                      className="w-full"
                      disabled={isCurrentPlan}
                    >
                      {isCurrentPlan ? "Current Plan" : "Get Started"}
                    </Button>
                  )}
                  
                  {plan.id === "trial" && (
                    <Button 
                      variant="default"
                      className="w-full"
                      disabled={trialUsed || isOnTrial || currentTier === "pro" || startingTrial}
                      onClick={handleStartTrial}
                    >
                      {isOnTrial ? "Trial Active" : trialUsed ? "Trial Used" : "Start Free Trial"}
                    </Button>
                  )}
                  
                  {plan.id === "pro" && (
                    <Button 
                      variant={plan.recommended ? "default" : "outline"}
                      className="w-full"
                      disabled={currentTier === "pro" || createCheckoutMutation.isPending}
                      onClick={handleUpgrade}
                    >
                      {currentTier === "pro" ? "Current Plan" : "Upgrade to Pro"}
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
