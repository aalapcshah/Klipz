import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Loader2,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

interface TeamMember {
  id: number;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  teamRole: string;
  isOwner: boolean;
}

interface TransferOwnershipDialogProps {
  members: TeamMember[];
}

export function TransferOwnershipDialog({ members }: TransferOwnershipDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const utils = trpc.useUtils();

  const transferMutation = trpc.teams.transferOwnership.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setConfirmOpen(false);
      setSelectedUserId(null);
      utils.teams.getMyTeam.invalidate();
      utils.teams.getMembers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Only show admins as transfer targets
  const admins = members.filter((m) => !m.isOwner && m.teamRole === "admin");
  const selectedAdmin = admins.find((m) => m.id === selectedUserId);

  if (admins.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Transfer Ownership</p>
          <p className="text-sm text-muted-foreground">
            No admins available. Promote a member to admin first before transferring ownership.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled>
          <Crown className="h-4 w-4 mr-2" />
          Transfer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">Transfer Ownership</p>
        <p className="text-sm text-muted-foreground">
          Hand over team ownership to an admin. You'll become an admin.
        </p>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Crown className="h-4 w-4 mr-2" />
            Transfer
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Transfer Team Ownership
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This action will transfer all ownership rights to the selected admin.
                You will become an admin and will no longer be able to:
              </span>
              <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                <li>Promote or demote members</li>
                <li>Transfer ownership</li>
                <li>Manage billing and subscription</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-3">
            <p className="text-sm font-medium mb-3">Select new owner:</p>
            <div className="space-y-2">
              {admins.map((admin) => (
                <button
                  key={admin.id}
                  onClick={() => setSelectedUserId(admin.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                    selectedUserId === admin.id
                      ? "border-amber-400/50 bg-amber-500/10"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                    {admin.avatarUrl ? (
                      <img src={admin.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      (admin.name || admin.email || "?").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{admin.name || "Unnamed"}</span>
                      <Badge variant="outline" className="text-cyan-400 border-cyan-400/30 text-xs">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{admin.email}</span>
                  </div>
                  {selectedUserId === admin.id && (
                    <Crown className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUserId(null)}>Cancel</AlertDialogCancel>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!selectedUserId || transferMutation.isPending}
              onClick={() => {
                if (selectedUserId) {
                  transferMutation.mutate({ newOwnerId: selectedUserId });
                }
              }}
            >
              {transferMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Crown className="h-4 w-4 mr-2" />
              )}
              Transfer to {selectedAdmin?.name || "Admin"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
