import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session_id");
    setSessionId(session);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Payment Successful!
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Thank you for subscribing to MetaClips. Your account has been upgraded.
          </p>
        </div>

        {sessionId && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Session ID
            </p>
            <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all mt-1">
              {sessionId}
            </p>
          </div>
        )}

        <div className="space-y-3 pt-4">
          <Button
            onClick={() => setLocation("/files")}
            className="w-full"
            size="lg"
          >
            Go to Files
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          
          <Link href="/settings">
            <Button variant="outline" className="w-full">
              View Account Settings
            </Button>
          </Link>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 pt-4">
          You'll receive a confirmation email shortly with your subscription details.
        </p>
      </Card>
    </div>
  );
}
