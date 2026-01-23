import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, Crown, Building2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export default function Upgrade() {
  const [loading, setLoading] = useState<string | null>(null);
  const createCheckout = trpc.stripe.createCheckoutSession.useMutation();

  const handleUpgrade = async (tierId: string) => {
    if (tierId === "free") return;
    
    setLoading(tierId);
    try {
      const result = await createCheckout.mutateAsync({ tierId: tierId as "pro" | "enterprise" });
      
      if (result.checkoutUrl) {
        toast.info("Redirecting to checkout...");
        window.open(result.checkoutUrl, "_blank");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to create checkout session. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const tiers = [
    {
      name: "Free",
      icon: Zap,
      price: "$0",
      period: "forever",
      storage: "10 GB",
      features: [
        "10 GB storage",
        "Unlimited file uploads",
        "AI enrichment",
        "Basic search",
        "Collections",
        "Video annotations",
        "Mobile access"
      ],
      current: true,
      cta: "Current Plan",
      variant: "outline" as const
    },
    {
      name: "Pro",
      icon: Crown,
      price: "$9",
      period: "per month",
      storage: "100 GB",
      features: [
        "100 GB storage",
        "Everything in Free",
        "Advanced AI enrichment",
        "Priority processing",
        "Advanced search filters",
        "Batch operations",
        "Export to multiple formats",
        "Email support"
      ],
      popular: true,
      cta: "Upgrade to Pro",
      variant: "default" as const
    },
    {
      name: "Enterprise",
      icon: Building2,
      price: "$49",
      period: "per month",
      storage: "1 TB",
      features: [
        "1 TB storage",
        "Everything in Pro",
        "Custom AI models",
        "API access",
        "Team collaboration",
        "SSO authentication",
        "Advanced analytics",
        "Dedicated support",
        "Custom integrations"
      ],
      cta: "Upgrade to Enterprise",
      variant: "default" as const
    }
  ];

  return (
    <div className="container max-w-7xl py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Upgrade Your Storage</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Choose the plan that fits your needs. Upgrade or downgrade anytime.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mb-12">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          return (
            <Card 
              key={tier.name}
              className={`relative ${tier.popular ? 'border-primary shadow-lg scale-105' : ''}`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              
              <CardHeader className="text-center pb-8">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">{tier.name}</CardTitle>
                <CardDescription className="text-sm mt-2">
                  {tier.storage} storage
                </CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-muted-foreground ml-2">/{tier.period}</span>
                </div>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={tier.variant}
                  disabled={tier.current || loading === tier.name.toLowerCase()}
                  onClick={() => handleUpgrade(tier.name.toLowerCase())}
                >
                  {loading === tier.name.toLowerCase() ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    tier.cta
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="bg-muted/50 rounded-lg p-8">
        <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium mb-2">Can I change plans anytime?</h3>
            <p className="text-sm text-muted-foreground">
              Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">What happens to my files if I downgrade?</h3>
            <p className="text-sm text-muted-foreground">
              Your files remain safe. You'll need to reduce storage usage to match your new plan's limit before uploading new files.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">Do you offer refunds?</h3>
            <p className="text-sm text-muted-foreground">
              Yes, we offer a 30-day money-back guarantee for all paid plans. No questions asked.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">Is my payment information secure?</h3>
            <p className="text-sm text-muted-foreground">
              Absolutely. We use Stripe for payment processing, which is PCI-DSS compliant and trusted by millions.
            </p>
          </div>
        </div>
      </div>

      <div className="text-center mt-8">
        <Link href="/settings">
          <Button variant="ghost">
            Back to Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}
