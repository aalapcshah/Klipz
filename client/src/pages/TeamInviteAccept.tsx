import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  LogIn,
  ArrowRight,
  Shield,
  Mail,
} from "lucide-react";

export default function TeamInviteAccept() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/team/invite/:token");
  const token = params?.token || "";

  const {
    data: invite,
    isLoading: inviteLoading,
    error: inviteError,
  } = trpc.teams.getInviteDetails.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const acceptMutation = trpc.teams.acceptInvite.useMutation({
    onSuccess: () => {
      toast.success("You've joined the team!", {
        description: `Welcome to ${invite?.teamName}`,
      });
      setLocation("/team");
    },
    onError: (err) => {
      toast.error("Failed to accept invite", {
        description: err.message,
      });
    },
  });

  const isLoading = authLoading || inviteLoading;

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading invite details...</p>
        </div>
      </div>
    );
  }

  // Invalid or missing token
  if (!match || !token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
            <CardTitle>Invalid Invite Link</CardTitle>
            <CardDescription>
              This invite link appears to be invalid or malformed.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setLocation("/")} variant="outline">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invite not found
  if (inviteError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
            <CardTitle>Invite Not Found</CardTitle>
            <CardDescription>
              This invite link is invalid or has been removed. Please ask the team owner to send a new invite.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setLocation("/")} variant="outline">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invite expired
  if (invite?.status === "expired") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Clock className="w-12 h-12 text-yellow-500 mx-auto mb-2" />
            <CardTitle>Invite Expired</CardTitle>
            <CardDescription>
              This invite to join <strong>{invite.teamName}</strong> has expired.
              Please ask {invite.inviterName} to send a new invite.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-3">
            <div className="text-sm text-muted-foreground">
              Expired on {new Date(invite.expiresAt).toLocaleDateString()}
            </div>
            <Button onClick={() => setLocation("/")} variant="outline">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already accepted
  if (invite?.status === "accepted") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <CardTitle>Already Accepted</CardTitle>
            <CardDescription>
              This invite to join <strong>{invite.teamName}</strong> has already been accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setLocation("/team")}>
              Go to Team <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Revoked
  if (invite?.status === "revoked") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
            <CardTitle>Invite Revoked</CardTitle>
            <CardDescription>
              This invite to join <strong>{invite.teamName}</strong> has been revoked by the team owner.
              Please contact them for a new invite.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setLocation("/")} variant="outline">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not logged in — prompt to log in first
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Users className="w-12 h-12 text-primary mx-auto mb-2" />
            <CardTitle>Team Invite</CardTitle>
            <CardDescription>
              <strong>{invite?.inviterName}</strong> has invited you to join{" "}
              <strong>{invite?.teamName}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Team</div>
                  <div className="text-sm text-muted-foreground">{invite?.teamName}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Invited Email</div>
                  <div className="text-sm text-muted-foreground">{invite?.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Role</div>
                  <Badge variant="secondary" className="capitalize">{invite?.role}</Badge>
                </div>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-200">
                You need to sign in or create an account to accept this invite.
              </p>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                // Store the invite token in sessionStorage so we can redirect back after login
                sessionStorage.setItem("pendingInviteToken", token);
                window.location.href = getLoginUrl();
              }}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign In to Accept Invite
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Logged in — show invite details and accept button
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Users className="w-12 h-12 text-primary mx-auto mb-2" />
          <CardTitle>Join {invite?.teamName}</CardTitle>
          <CardDescription>
            <strong>{invite?.inviterName}</strong> has invited you to join their team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Team</div>
                <div className="text-sm text-muted-foreground">{invite?.teamName}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Invited Email</div>
                <div className="text-sm text-muted-foreground">{invite?.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Your Role</div>
                <Badge variant="secondary" className="capitalize">{invite?.role}</Badge>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground text-center">
            Signed in as <strong>{user.name || user.email}</strong>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLocation("/")}
            >
              Decline
            </Button>
            <Button
              className="flex-1"
              size="lg"
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate({ token })}
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Accept & Join Team
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Invite expires on {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : "N/A"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
