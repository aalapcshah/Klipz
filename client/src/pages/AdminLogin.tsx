import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Shield, Eye, EyeOff, AlertCircle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getCsrfHeaders } from "@/lib/csrf";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const rateLimitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [, navigate] = useLocation();

  // Countdown timer for rate limiting
  useEffect(() => {
    if (rateLimitSeconds > 0) {
      rateLimitTimerRef.current = setInterval(() => {
        setRateLimitSeconds((prev) => {
          if (prev <= 1) {
            if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
            setError("");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
    };
  }, [rateLimitSeconds > 0]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Admin access granted", {
          description: "Redirecting to admin control panel...",
        });
        // Small delay for toast to show
        setTimeout(() => navigate("/admin/control"), 500);
      } else if (res.status === 429) {
        const retryAfter = data.retryAfterSeconds || 60;
        setRateLimitSeconds(retryAfter);
        setError(`Too many login attempts. Please wait before trying again.`);
      } else {
        setError(data.error || "Authentication failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Admin Access</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your admin password to continue
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Admin password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="pr-10 h-12 text-base"
              autoFocus
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {rateLimitSeconds > 0 ? (
                <Clock className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>
                {error}
                {rateLimitSeconds > 0 && (
                  <span className="font-mono ml-1">
                    ({Math.floor(rateLimitSeconds / 60)}:{String(rateLimitSeconds % 60).padStart(2, "0")})
                  </span>
                )}
              </span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base font-medium"
            disabled={loading || !password || rateLimitSeconds > 0}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Authenticating...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        {/* Footer */}
        <p className="text-xs text-muted-foreground text-center mt-6">
          This login is independent of OAuth.{" "}
          <button
            onClick={() => navigate("/")}
            className="text-primary hover:underline"
          >
            Back to app
          </button>
        </p>
      </div>
    </div>
  );
}
