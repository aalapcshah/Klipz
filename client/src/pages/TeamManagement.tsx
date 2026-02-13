import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
  Users,
  Crown,
  Mail,
  UserPlus,
  UserMinus,
  Clock,
  HardDrive,
  ArrowLeft,
  Settings,
  XCircle,
  Loader2,
  Shield,
  ShieldCheck,
  ShieldMinus,
  Pencil,
  Check,
  X,
} from "lucide-react";
import TeamActivityFeed from "@/components/TeamActivityFeed";
import { TeamStorageDashboard } from "@/components/TeamStorageDashboard";
import { BulkInviteDialog } from "@/components/BulkInviteDialog";
import { TransferOwnershipDialog } from "@/components/TransferOwnershipDialog";

export default function TeamManagement() {
  const { user, loading: authLoading } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  const utils = trpc.useUtils();

  const { data: team, isLoading: teamLoading } = trpc.teams.getMyTeam.useQuery(
    undefined,
    { enabled: !!user }
  );
  const { data: members = [], isLoading: membersLoading } = trpc.teams.getMembers.useQuery(
    undefined,
    { enabled: !!user && !!team }
  );
  const { data: pendingInvites = [], isLoading: invitesLoading } = trpc.teams.getPendingInvites.useQuery(
    undefined,
    { enabled: !!user && !!(team?.isOwner || team?.canManage) }
  );

  const inviteMutation = trpc.teams.inviteMember.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setInviteEmail("");
      utils.teams.getPendingInvites.invalidate();
      utils.teams.getMyTeam.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeInviteMutation = trpc.teams.revokeInvite.useMutation({
    onSuccess: () => {
      toast.success("Invite revoked");
      utils.teams.getPendingInvites.invalidate();
      utils.teams.getMyTeam.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMemberMutation = trpc.teams.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed from team");
      utils.teams.getMembers.invalidate();
      utils.teams.getMyTeam.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateNameMutation = trpc.teams.updateName.useMutation({
    onSuccess: () => {
      toast.success("Team name updated");
      setIsEditingName(false);
      utils.teams.getMyTeam.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const leaveTeamMutation = trpc.teams.leaveTeam.useMutation({
    onSuccess: () => {
      toast.success("You have left the team");
      utils.teams.getMyTeam.invalidate();
      utils.teams.getMembers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const promoteMutation = trpc.teams.promoteMember.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.teams.getMembers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const demoteMutation = trpc.teams.demoteMember.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.teams.getMembers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (authLoading || teamLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <CardTitle>Sign in to manage your team</CardTitle>
            <CardDescription>You need to be logged in to access team management.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <a href={getLoginUrl()}>
              <Button>Sign In</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No team - show empty state
  if (!team) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl py-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>

          <Card className="text-center py-12">
            <CardContent>
              <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-2xl font-bold mb-2">No Team Yet</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                You're not part of a team. Subscribe to the Team plan to create your own team,
                or ask a team owner to invite you.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/pricing">
                  <Button>
                    <Crown className="h-4 w-4 mr-2" />
                    View Team Plan
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const storagePercent = team.storagePercentage;
  const storageColor = storagePercent >= 90 ? "bg-red-500" : storagePercent >= 70 ? "bg-yellow-500" : "bg-emerald-500";

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8">
        {/* Header */}
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="text-2xl font-bold h-10 w-64"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editedName.trim()) {
                        updateNameMutation.mutate({ name: editedName.trim() });
                      }
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (editedName.trim()) updateNameMutation.mutate({ name: editedName.trim() });
                    }}
                    disabled={updateNameMutation.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setIsEditingName(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-bold">{team.name}</h1>
                  {team.isOwner && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditedName(team.name);
                        setIsEditingName(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {team.memberCount} member{team.memberCount !== 1 ? "s" : ""} · {team.maxSeats} seats
              {team.pendingInvites > 0 && ` · ${team.pendingInvites} pending invite${team.pendingInvites !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
            <Crown className="h-3 w-3 mr-1" />
            Team Plan
          </Badge>
        </div>

        {/* Storage Usage */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Storage Usage</CardTitle>
              </div>
              <span className="text-sm text-muted-foreground">
                {team.storageUsedFormatted} / {team.storageLimitFormatted}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${storageColor}`}
                style={{ width: `${Math.min(storagePercent, 100)}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">{storagePercent}% used</p>
          </CardContent>
        </Card>

        {/* Storage Breakdown per Member */}
        <div className="mb-6">
          <TeamStorageDashboard />
        </div>

        {/* Team Members */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Team Members</CardTitle>
              </div>
              <Badge variant="secondary">
                {team.memberCount} / {team.maxSeats}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No members yet</p>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          (member.name || member.email || "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{member.name || "Unnamed"}</span>
                          {member.isOwner && (
                            <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-xs">
                              <Crown className="h-3 w-3 mr-1" />
                              Owner
                            </Badge>
                          )}
                          {!member.isOwner && (member as any).teamRole === "admin" && (
                            <Badge variant="outline" className="text-cyan-400 border-cyan-400/30 text-xs">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          )}
                          {!member.isOwner && (!((member as any).teamRole) || (member as any).teamRole === "member") && (
                            <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs">
                              Member
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">{member.email}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    {/* Promote/Demote - owner only */}
                    {team.isOwner && !member.isOwner && (
                      <div className="flex items-center gap-1">
                        {(member as any).teamRole === "admin" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-orange-400 hover:text-orange-300"
                            disabled={demoteMutation.isPending}
                            onClick={() => demoteMutation.mutate({ userId: member.id })}
                          >
                            <ShieldMinus className="h-4 w-4 mr-1" />
                            Demote
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-cyan-400 hover:text-cyan-300"
                            disabled={promoteMutation.isPending}
                            onClick={() => promoteMutation.mutate({ userId: member.id })}
                          >
                            <ShieldCheck className="h-4 w-4 mr-1" />
                            Promote
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Remove - owner can remove anyone, admin can remove regular members */}
                    {team.canManage && !member.isOwner && member.id !== user?.id && (
                      // Admins can't remove other admins
                      !(team.isAdmin && !team.isOwner && (member as any).teamRole === "admin") ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
                              <UserMinus className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove <strong>{member.name || member.email}</strong> from your team.
                                They will lose access to team resources and their subscription will revert to Free.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => removeMemberMutation.mutate({ userId: member.id })}
                              >
                                Remove Member
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null
                    )}

                    {/* Leave team button for non-owner members */}
                    {!team.isOwner && member.id === user?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
                            Leave Team
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Leave this team?</AlertDialogTitle>
                            <AlertDialogDescription>
                              You will lose access to team resources and your subscription will revert to Free.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => leaveTeamMutation.mutate()}
                            >
                              Leave Team
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invite Members (owner and admins) */}
        {team.canManage && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Invite Members</CardTitle>
              </div>
              <CardDescription>
                Send an invite link to add new team members. They'll need to create an account and accept the invite.
              </CardDescription>
              <div className="pt-1">
                <BulkInviteDialog />
              </div>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inviteEmail.trim()) {
                    inviteMutation.mutate({ email: inviteEmail.trim() });
                  }
                }}
                className="flex gap-3"
              >
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={inviteMutation.isPending || !inviteEmail.trim()}>
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Send Invite
                </Button>
              </form>

              {/* Pending Invites */}
              {invitesLoading ? (
                <div className="flex justify-center py-4 mt-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : pendingInvites.length > 0 ? (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Pending Invites</h4>
                  <div className="space-y-2">
                    {pendingInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 text-amber-400" />
                          <div>
                            <span className="text-sm font-medium">{invite.email}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              Expires {new Date(invite.expiresAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => revokeInviteMutation.mutate({ inviteId: invite.id })}
                          disabled={revokeInviteMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Activity Feed */}
        <TeamActivityFeed />

        {/* Team Settings (owner only) */}
        {team.isOwner && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Team Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Manage Subscription</p>
                  <p className="text-sm text-muted-foreground">View billing, change plan, or cancel</p>
                </div>
                <Link href="/account/subscription">
                  <Button variant="outline" size="sm">
                    <Shield className="h-4 w-4 mr-2" />
                    Manage
                  </Button>
                </Link>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Upgrade Seats</p>
                  <p className="text-sm text-muted-foreground">
                    Currently {team.maxSeats} seats. Contact support to add more.
                  </p>
                </div>
                <Link href="/contact">
                  <Button variant="outline" size="sm">Contact Us</Button>
                </Link>
              </div>
              <Separator />
              <TransferOwnershipDialog members={members} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
