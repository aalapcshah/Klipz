import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, ArrowRight, CreditCard, Calendar, Crown, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session_id");
    setSessionId(session);
  }, []);

  const { data: subscriptionStatus, isLoading } = trpc.stripe.getSubscriptionStatus.useQuery(
    undefined,
    { refetchInterval: 3000, refetchIntervalInBackground: false }
  );

  const { data: team } = trpc.teams.getMyTeam.useQuery(undefined, {
    enabled: subscriptionStatus?.tier === "team",
  });

  const isActive = subscriptionStatus?.status === "active";
  const isPro = subscriptionStatus?.tier === "pro" && isActive;
  const isTeam = subscriptionStatus?.tier === "team" && isActive;
  const needsTeamSetup = isTeam && !team;

  const periodEnd = subscriptionStatus?.currentPeriodEnd
    ? new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const planName = isTeam ? "MetaClips Team" : isPro ? "MetaClips Pro" : subscriptionStatus?.tier === "trial" ? "Pro Trial" : "Processing...";
  const planPrice = isTeam ? "$29.99/month" : isPro ? "$9.99/month" : "—";

  const features = isTeam
    ? [
        "Everything in Pro",
        "200 GB shared storage",
        "Up to 5 team members",
        "Team admin controls",
        "Shared collections",
        "Priority support",
      ]
    : [
        "Unlimited files",
        "50 GB storage",
        "Unlimited video uploads",
        "Video annotation",
        "AI-powered enrichment",
        "Knowledge graph",
        "Export in all formats",
        "Priority support",
      ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full overflow-hidden">
        {/* Success header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-8 text-center text-white">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">Payment Successful!</h1>
          <p className="text-emerald-100 mt-2">
            Welcome to {isTeam ? "MetaClips Team" : "MetaClips Pro"}
          </p>
        </div>

        <CardContent className="p-6 space-y-6">
          {/* Subscription details */}
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading subscription details...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Subscription Details</h2>
              
              <div className="grid gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {isTeam ? (
                    <Users className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : (
                    <Crown className="h-5 w-5 text-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="text-sm font-medium text-foreground">{planName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <CreditCard className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Billing</p>
                    <p className="text-sm font-medium text-foreground">{planPrice}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Calendar className="h-5 w-5 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Next Billing Date</p>
                    <p className="text-sm font-medium text-foreground">{periodEnd || "—"}</p>
                  </div>
                </div>
              </div>

              {!isActive && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Your subscription is being activated. This page will update automatically.
                </p>
              )}
            </div>
          )}

          {/* Features summary */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">What you now have access to:</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-2">
            {needsTeamSetup ? (
              <Button
                onClick={() => setLocation("/team/setup")}
                className="w-full"
                size="lg"
              >
                <Users className="mr-2 h-4 w-4" />
                Set Up Your Team
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => setLocation(isTeam ? "/team" : "/")}
                className="w-full"
                size="lg"
              >
                {isTeam ? "Go to Team Dashboard" : "Go to Dashboard"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            <Link href="/account/subscription">
              <Button variant="outline" className="w-full">
                <CreditCard className="mr-2 h-4 w-4" />
                Manage Subscription
              </Button>
            </Link>
          </div>

          {sessionId && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              Transaction ID: {sessionId.slice(0, 20)}...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
