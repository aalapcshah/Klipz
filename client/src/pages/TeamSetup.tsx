import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { TeamOnboarding } from "@/components/TeamOnboarding";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export default function TeamSetup() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  const { data: team, isLoading: teamLoading } = trpc.teams.getMyTeam.useQuery(
    undefined,
    { enabled: !!user }
  );

  // If user already has a team, redirect to team management
  useEffect(() => {
    if (!teamLoading && team) {
      navigate("/team");
    }
  }, [team, teamLoading, navigate]);

  // If user is not on team tier, redirect to pricing
  useEffect(() => {
    if (!loading && user && user.subscriptionTier !== "team") {
      navigate("/pricing");
    }
  }, [user, loading, navigate]);

  if (loading || teamLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return <TeamOnboarding />;
}
