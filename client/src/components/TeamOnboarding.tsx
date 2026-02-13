import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  X,
  Loader2,
  Sparkles,
  Mail,
  Crown,
} from "lucide-react";

interface TeamOnboardingProps {
  onComplete?: () => void;
}

export function TeamOnboarding({ onComplete }: TeamOnboardingProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [teamName, setTeamName] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  const [createdTeamId, setCreatedTeamId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const createTeamMutation = trpc.teams.create.useMutation({
    onSuccess: (data) => {
      setCreatedTeamId(data.teamId);
      toast.success("Team created successfully!");
      setStep(2);
      utils.teams.getMyTeam.invalidate();
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const inviteMutation = trpc.teams.inviteMember.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const addEmail = () => {
    const email = currentEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (emails.includes(email)) {
      toast.error("This email is already in the list");
      return;
    }
    if (emails.length >= 4) {
      toast.error("Maximum 4 invites during onboarding (5 seats total including you)");
      return;
    }
    setEmails([...emails, email]);
    setCurrentEmail("");
  };

  const removeEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
  };

  const handleCreateTeam = () => {
    if (!teamName.trim()) {
      toast.error("Please enter a team name");
      return;
    }
    createTeamMutation.mutate({ name: teamName.trim() });
  };

  const handleSendInvites = async () => {
    if (emails.length === 0) {
      setStep(3);
      return;
    }

    let successCount = 0;
    for (const email of emails) {
      try {
        await inviteMutation.mutateAsync({ email });
        successCount++;
      } catch {
        // Error already shown via onError
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} invite${successCount > 1 ? "s" : ""} sent!`);
    }
    setStep(3);
  };

  const handleFinish = () => {
    if (onComplete) {
      onComplete();
    }
    navigate("/team");
  };

  const totalSteps = 3;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i + 1 <= step ? "bg-emerald-500 w-12" : "bg-muted w-8"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Name your team */}
        {step === 1 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Users className="h-8 w-8 text-emerald-500" />
              </div>
              <CardTitle className="text-2xl">Name Your Team</CardTitle>
              <CardDescription>
                Choose a name that represents your team or organization. You can change this later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Input
                  placeholder="e.g., Marketing Team, Acme Corp"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="text-lg h-12"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && teamName.trim()) handleCreateTeam();
                  }}
                />
              </div>
              <Button
                className="w-full h-12 text-base"
                onClick={handleCreateTeam}
                disabled={!teamName.trim() || createTeamMutation.isPending}
              >
                {createTeamMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-5 w-5 mr-2" />
                )}
                Create Team & Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Invite members */}
        {step === 2 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-emerald-500" />
              </div>
              <CardTitle className="text-2xl">Invite Your Team</CardTitle>
              <CardDescription>
                Add up to 4 team members by email. They'll receive an invite to join your team.
                You can also do this later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Email input */}
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={currentEmail}
                  onChange={(e) => setCurrentEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  autoFocus
                />
                <Button
                  variant="outline"
                  onClick={addEmail}
                  disabled={!currentEmail.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Email list */}
              {emails.length > 0 && (
                <div className="space-y-2">
                  {emails.map((email, index) => (
                    <div
                      key={email}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{email}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeEmail(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground text-center">
                    {emails.length} / 4 invites
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(3)}
                >
                  Skip for Now
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSendInvites}
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  {emails.length > 0 ? `Send ${emails.length} Invite${emails.length > 1 ? "s" : ""}` : "Continue"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-emerald-500" />
              </div>
              <CardTitle className="text-2xl">You're All Set!</CardTitle>
              <CardDescription>
                Your team <strong>"{teamName}"</strong> is ready to go.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary */}
              <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Team Name</span>
                  <span className="font-medium">{teamName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Plan</span>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                    <Crown className="h-3 w-3 mr-1" />
                    Team
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Invites Sent</span>
                  <span className="font-medium">{emails.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Available Seats</span>
                  <span className="font-medium">{4 - emails.length} remaining</span>
                </div>
              </div>

              {/* What's next */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">What's next?</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>Invited members will receive an email to join your team</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>All team members share 200 GB of storage</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>Manage your team anytime from the Team page</span>
                  </div>
                </div>
              </div>

              <Button className="w-full h-12 text-base" onClick={handleFinish}>
                <ArrowRight className="h-5 w-5 mr-2" />
                Go to Team Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
