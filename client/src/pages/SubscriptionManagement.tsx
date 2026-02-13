import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Crown,
  CreditCard,
  Calendar,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Receipt,
  ExternalLink,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function SubscriptionManagement() {
  const [, setLocation] = useLocation();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: subscriptionStatus, isLoading: statusLoading } =
    trpc.stripe.getSubscriptionStatus.useQuery();

  const { data: billingHistory, isLoading: billingLoading } =
    trpc.stripe.getBillingHistory.useQuery(undefined, {
      enabled: !!subscriptionStatus?.tier && subscriptionStatus.tier !== "free",
    });

  const cancelMutation = trpc.stripe.cancelSubscription.useMutation({
    onSuccess: (data) => {
      toast.success(
        "Subscription Canceled",
        {
          description: data.cancelAt
            ? `Your subscription will remain active until ${new Date(data.cancelAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`
            : "Your subscription has been canceled.",
        }
      );
      utils.stripe.getSubscriptionStatus.invalidate();
      setCancelDialogOpen(false);
    },
    onError: (error) => {
      toast.error(
        "Error",
        { description: error.message || "Failed to cancel subscription." }
      );
    },
  });

  const portalMutation = trpc.stripe.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.portalUrl) {
        window.open(data.portalUrl, "_blank");
        toast.info("Opening billing portal...");
      }
    },
    onError: (error) => {
      toast.error(
        "Error",
        { description: error.message || "Failed to open billing portal." }
      );
    },
  });

  const resumeMutation = trpc.stripe.resumeSubscription.useMutation({
    onSuccess: () => {
      toast.success(
        "Subscription Resumed",
        { description: "Your subscription has been reactivated. You will continue to be billed." }
      );
      utils.stripe.getSubscriptionStatus.invalidate();
    },
    onError: (error) => {
      toast.error(
        "Error",
        { description: error.message || "Failed to resume subscription." }
      );
    },
  });

  const isPro = subscriptionStatus?.tier === "pro";
  const isTrial = subscriptionStatus?.tier === "trial";
  const isFree = subscriptionStatus?.tier === "free" || !subscriptionStatus?.tier;
  const isActive = subscriptionStatus?.status === "active";
  const isCanceledButActive = isActive && subscriptionStatus?.cancelAtPeriodEnd;

  const periodEnd = subscriptionStatus?.currentPeriodEnd
    ? new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const getStatusBadge = () => {
    if (isCanceledButActive) {
      return <Badge variant="outline" className="border-amber-500 text-amber-500">Canceling</Badge>;
    }
    if (isActive && isPro) {
      return <Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>;
    }
    if (isTrial) {
      return <Badge className="bg-purple-500 hover:bg-purple-600">Trial</Badge>;
    }
    if (subscriptionStatus?.status === "past_due") {
      return <Badge variant="destructive">Past Due</Badge>;
    }
    return <Badge variant="secondary">Inactive</Badge>;
  };

  if (statusLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/settings")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Subscription</h1>
            <p className="text-sm text-muted-foreground">
              Manage your plan and billing
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Current Plan Card */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {isPro ? (
                    <Crown className="h-5 w-5 text-amber-500" />
                  ) : isTrial ? (
                    <Zap className="h-5 w-5 text-purple-500" />
                  ) : (
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                  )}
                  Current Plan
                </CardTitle>
                {getStatusBadge()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {isPro ? "MetaClips Pro" : isTrial ? "Pro Trial" : "Free"}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isPro
                      ? "Full-featured media management for professionals"
                      : isTrial
                        ? "14-day free trial of all Pro features"
                        : "Basic file management for individuals"}
                  </p>
                </div>
                {isPro && (
                  <div className="text-right">
                    <p className="text-2xl font-bold text-foreground">$9.99</p>
                    <p className="text-sm text-muted-foreground">/month</p>
                  </div>
                )}
              </div>

              {/* Billing details */}
              {(isPro || isTrial) && periodEnd && (
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {isCanceledButActive
                          ? "Access ends on"
                          : isPro
                            ? "Next billing date"
                            : "Trial ends on"}
                      </p>
                      <p className="text-sm font-medium text-foreground">{periodEnd}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Canceled notice */}
              {isCanceledButActive && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Subscription ending
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Your subscription has been canceled and will end on {periodEnd}. You can resume it anytime before then to keep your Pro features.
                    </p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                {isFree && (
                  <Button onClick={() => setLocation("/pricing")} className="gap-2">
                    <Crown className="h-4 w-4" />
                    Upgrade to Pro
                  </Button>
                )}

                {isTrial && (
                  <Button onClick={() => setLocation("/pricing")} className="gap-2">
                    <Crown className="h-4 w-4" />
                    Upgrade to Pro
                  </Button>
                )}

                {isPro && isActive && !isCanceledButActive && (
                  <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="gap-2 text-destructive hover:text-destructive">
                        <XCircle className="h-4 w-4" />
                        Cancel Subscription
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your Pro features will remain active until the end of your current billing period
                          {periodEnd ? ` (${periodEnd})` : ""}. After that, your account will be downgraded to the Free plan.
                          You can resume your subscription at any time before it expires.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => cancelMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={cancelMutation.isPending}
                        >
                          {cancelMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Canceling...
                            </>
                          ) : (
                            "Yes, Cancel"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {isCanceledButActive && (
                  <Button
                    onClick={() => resumeMutation.mutate()}
                    className="gap-2"
                    disabled={resumeMutation.isPending}
                  >
                    {resumeMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resuming...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Resume Subscription
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Manage Billing via Stripe Portal */}
              {isPro && (
                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending}
                  >
                    {portalMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        Manage Billing
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Update payment method, download invoices, and manage billing details
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pro Features */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {isPro ? "Your Pro Features" : "Pro Features"}
              </CardTitle>
              <CardDescription>
                {isPro
                  ? "Everything included in your plan"
                  : "Upgrade to unlock all features"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { name: "Unlimited files", included: true },
                  { name: "50 GB storage", included: true },
                  { name: "Unlimited video uploads", included: true },
                  { name: "Video annotation with transcription", included: true },
                  { name: "Link annotations to metadata-labeled files", included: true },
                  { name: "AI-powered file enrichment", included: true },
                  { name: "Knowledge graph visualization", included: true },
                  { name: "Export data in multiple formats", included: true },
                  { name: "Priority support", included: true },
                ].map((feature) => (
                  <div key={feature.name} className="flex items-center gap-2">
                    <CheckCircle2
                      className={`h-4 w-4 shrink-0 ${
                        isPro ? "text-emerald-500" : "text-muted-foreground"
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        isPro ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {feature.name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Billing History */}
          {(isPro || (isTrial && billingHistory && billingHistory.length > 0)) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Billing History
                </CardTitle>
                <CardDescription>
                  Your recent invoices and payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {billingLoading ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading billing history...</span>
                  </div>
                ) : billingHistory && billingHistory.length > 0 ? (
                  <div className="space-y-3">
                    {billingHistory.map((invoice: any) => (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-2 rounded-lg ${
                              invoice.status === "paid"
                                ? "bg-emerald-100 dark:bg-emerald-900/30"
                                : "bg-red-100 dark:bg-red-900/30"
                            }`}
                          >
                            {invoice.status === "paid" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {invoice.description || "MetaClips Pro Subscription"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(invoice.date).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-medium text-foreground">
                            {invoice.amountFormatted}
                          </span>
                          {invoice.receiptUrl && (
                            <a
                              href={invoice.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No billing history yet.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Back to settings */}
          <div className="text-center pt-4">
            <Link href="/settings">
              <Button variant="ghost" className="gap-2 text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />
                Back to Settings
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
