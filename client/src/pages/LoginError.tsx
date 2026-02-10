import { useLocation, useSearch } from "wouter";
import { AlertTriangle, RefreshCw, Shield, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";

export default function LoginError() {
  const search = useSearch();
  const [, navigate] = useLocation();

  // Parse error details from query params
  const params = new URLSearchParams(search);
  const errorType = params.get("type") || "unknown";
  const errorMessage = params.get("message") || "An unexpected error occurred during login.";

  const errorDetails: Record<string, { title: string; description: string; suggestion: string }> = {
    google_api: {
      title: "Google Login Temporarily Unavailable",
      description: "Google's authentication service returned an error. This is usually a temporary issue on Google's side.",
      suggestion: "Please wait a moment and try again. If the problem persists, try a different login method or contact the administrator.",
    },
    oauth_failed: {
      title: "Login Failed",
      description: "The authentication process could not be completed.",
      suggestion: "Please try logging in again. If you continue to experience issues, the administrator can grant you access.",
    },
    token_exchange: {
      title: "Authentication Error",
      description: "We couldn't verify your identity with the login provider.",
      suggestion: "Please try logging in again. Clear your browser cookies if the issue persists.",
    },
    unknown: {
      title: "Login Error",
      description: errorMessage,
      suggestion: "Please try again. If the problem continues, contact the site administrator.",
    },
  };

  const details = errorDetails[errorType] || errorDetails.unknown;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Error Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 mx-auto">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>

        {/* Error Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{details.title}</h1>
          <p className="text-muted-foreground">{details.description}</p>
        </div>

        {/* Suggestion */}
        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          {details.suggestion}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Button
            className="w-full"
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/")}
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>

            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/admin/login")}
            >
              <Shield className="w-4 h-4 mr-2" />
              Admin Login
            </Button>
          </div>
        </div>

        {/* Technical Details (collapsed) */}
        <details className="text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground transition-colors">
            Technical details
          </summary>
          <div className="mt-2 bg-muted/30 rounded p-3 font-mono">
            <p>Error type: {errorType}</p>
            {errorMessage !== details.description && <p>Message: {errorMessage}</p>}
            <p>Time: {new Date().toISOString()}</p>
          </div>
        </details>
      </div>
    </div>
  );
}
