import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XCircle, ArrowLeft, RefreshCw, HelpCircle, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";

export function PaymentCanceled() {
  const [, setLocation] = useLocation();
  const [retrying, setRetrying] = useState(false);
  const createCheckout = trpc.stripe.createCheckoutSession.useMutation();

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const result = await createCheckout.mutateAsync({ tierId: "pro" });
      if (result.checkoutUrl) {
        toast.info("Redirecting to checkout...");
        window.open(result.checkoutUrl, "_blank");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to create checkout session. Please try again.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Main Card */}
        <Card className="border-muted">
          <CardContent className="pt-8 pb-8 text-center space-y-6">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="h-8 w-8 text-muted-foreground" />
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Checkout Not Completed</h1>
              <p className="text-muted-foreground">
                It looks like you left the checkout page before completing your payment. 
                No charges were made to your account.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                onClick={handleRetry}
                disabled={retrying}
                size="lg"
                className="gap-2"
              >
                {retrying ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Starting checkout...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </>
                )}
              </Button>
              <Link href="/pricing">
                <Button variant="outline" size="lg" className="gap-2 w-full">
                  <ArrowLeft className="h-4 w-4" />
                  View Plans
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Reassurance Section */}
        <Card className="border-muted bg-muted/30">
          <CardContent className="pt-6 pb-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">No charges were made</p>
                  <p className="text-xs text-muted-foreground">
                    Your payment method was not charged. You can try again whenever you're ready.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <HelpCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Need help?</p>
                  <p className="text-xs text-muted-foreground">
                    If you experienced an issue during checkout, please contact our support team and we'll help you get set up.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Back to Dashboard */}
        <div className="text-center">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
