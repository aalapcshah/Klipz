import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useHighlight } from "@/hooks/useHighlight";

interface ApprovalWorkflowProps {
  annotationId: number;
  annotationType: "voice" | "visual";
}

export function ApprovalWorkflow({ annotationId, annotationType }: ApprovalWorkflowProps) {
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [requestComment, setRequestComment] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [rejectComment, setRejectComment] = useState("");

  // Highlight animation for status changes
  const { isHighlighted, trigger: triggerHighlight } = useHighlight(2000);

  // WebSocket for real-time approval updates
  const { isConnected } = useWebSocket({
    onApprovalRequested: (message) => {
      if (message.annotationId === annotationId && message.annotationType === annotationType) {
        console.log("[Approval] Requested:", message);
        utils.annotationApprovals.getApprovalStatus.invalidate();
      }
    },
    onApprovalApproved: (message) => {
      if (message.annotationId === annotationId && message.annotationType === annotationType) {
        console.log("[Approval] Approved:", message);
        utils.annotationApprovals.getApprovalStatus.invalidate();
        toast.success(`Annotation approved by ${message.userName}`);
        triggerHighlight();
      }
    },
    onApprovalRejected: (message) => {
      if (message.annotationId === annotationId && message.annotationType === annotationType) {
        console.log("[Approval] Rejected:", message);
        utils.annotationApprovals.getApprovalStatus.invalidate();
        toast.error(`Annotation rejected by ${message.userName}`);
        triggerHighlight();
      }
    },
    onApprovalCanceled: (message) => {
      if (message.annotationId === annotationId && message.annotationType === annotationType) {
        console.log("[Approval] Canceled:", message);
        utils.annotationApprovals.getApprovalStatus.invalidate();
      }
    },
  });

  const utils = trpc.useUtils();
  const { data: approval, isLoading } = trpc.annotationApprovals.getApprovalStatus.useQuery({
    annotationId,
    annotationType,
  });

  const requestApprovalMutation = trpc.annotationApprovals.requestApproval.useMutation({
    onSuccess: () => {
      toast.success("Approval requested");
      setRequestDialogOpen(false);
      setRequestComment("");
      utils.annotationApprovals.getApprovalStatus.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to request approval: ${error.message}`);
    },
  });

  const approveMutation = trpc.annotationApprovals.approve.useMutation({
    onMutate: async () => {
      await utils.annotationApprovals.getApprovalStatus.cancel();
      const previousApproval = utils.annotationApprovals.getApprovalStatus.getData({ annotationId, annotationType });

      // Optimistically update to approved
      if (previousApproval) {
        utils.annotationApprovals.getApprovalStatus.setData(
          { annotationId, annotationType },
          { ...previousApproval, status: "approved" as const }
        );
      }

      return { previousApproval };
    },
    onSuccess: () => {
      setApproveDialogOpen(false);
      setApproveComment("");
      utils.annotationApprovals.getApprovalStatus.invalidate();
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousApproval) {
        utils.annotationApprovals.getApprovalStatus.setData(
          { annotationId, annotationType },
          context.previousApproval
        );
      }
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const rejectMutation = trpc.annotationApprovals.reject.useMutation({
    onMutate: async () => {
      await utils.annotationApprovals.getApprovalStatus.cancel();
      const previousApproval = utils.annotationApprovals.getApprovalStatus.getData({ annotationId, annotationType });

      // Optimistically update to rejected
      if (previousApproval) {
        utils.annotationApprovals.getApprovalStatus.setData(
          { annotationId, annotationType },
          { ...previousApproval, status: "rejected" as const }
        );
      }

      return { previousApproval };
    },
    onSuccess: () => {
      setRejectDialogOpen(false);
      setRejectComment("");
      utils.annotationApprovals.getApprovalStatus.invalidate();
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousApproval) {
        utils.annotationApprovals.getApprovalStatus.setData(
          { annotationId, annotationType },
          context.previousApproval
        );
      }
      toast.error(`Failed to reject: ${error.message}`);
    },
  });

  const cancelApprovalMutation = trpc.annotationApprovals.cancelApproval.useMutation({
    onSuccess: () => {
      toast.success("Approval request cancelled");
      utils.annotationApprovals.getApprovalStatus.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });

  const handleRequestApproval = () => {
    requestApprovalMutation.mutate({
      annotationId,
      annotationType,
      comment: requestComment || undefined,
    });
  };

  const handleApprove = () => {
    if (!approval) return;
    approveMutation.mutate({
      approvalId: approval.id,
      comment: approveComment || undefined,
    });
  };

  const handleReject = () => {
    if (!approval) return;
    if (!rejectComment.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    rejectMutation.mutate({
      approvalId: approval.id,
      comment: rejectComment,
    });
  };

  const handleCancelApproval = () => {
    if (!approval) return;
    if (confirm("Cancel this approval request?")) {
      cancelApprovalMutation.mutate({ approvalId: approval.id });
    }
  };

  const getStatusBadge = () => {
    if (!approval) return null;

    const statusConfig = {
      pending: {
        icon: Clock,
        text: "Pending Review",
        className: "bg-yellow-100 text-yellow-800 border-yellow-300",
      },
      approved: {
        icon: CheckCircle,
        text: "Approved",
        className: "bg-green-100 text-green-800 border-green-300",
      },
      rejected: {
        icon: XCircle,
        text: "Rejected",
        className: "bg-red-100 text-red-800 border-red-300",
      },
    };

    const config = statusConfig[approval.status];
    const Icon = config.icon;

    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.text}
      </div>
    );
  };

  if (isLoading) {
    return <div className="text-xs text-gray-500">Loading approval status...</div>;
  }

  return (
    <div className={`border-t pt-2 mt-2 transition-colors ${isHighlighted ? 'highlight-flash' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {approval ? (
            <>
              {getStatusBadge()}
              {approval.comment && (
                <div className="text-xs text-gray-600 italic">"{approval.comment}"</div>
              )}
            </>
          ) : (
            <div className="text-xs text-gray-500">No approval request</div>
          )}
        </div>

        <div className="flex gap-1">
          {!approval && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRequestDialogOpen(true)}
              className="text-xs h-7"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Request Approval
            </Button>
          )}

          {approval && approval.status === "pending" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setApproveDialogOpen(true)}
                className="text-xs h-7 text-green-600 hover:text-green-700"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectDialogOpen(true)}
                className="text-xs h-7 text-red-600 hover:text-red-700"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelApproval}
                className="text-xs h-7"
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Request Approval Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Approval</DialogTitle>
            <DialogDescription>
              Submit this annotation for team review and approval
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={requestComment}
              onChange={(e) => setRequestComment(e.target.value)}
              placeholder="Add a note for reviewers (optional)..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRequestApproval}
              disabled={requestApprovalMutation.isPending}
            >
              {requestApprovalMutation.isPending ? "Requesting..." : "Request Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Annotation</DialogTitle>
            <DialogDescription>
              Approve this annotation and mark it as ready for use
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              placeholder="Add approval notes (optional)..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Annotation</DialogTitle>
            <DialogDescription>
              Reject this annotation and provide feedback for improvement
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Please explain why this annotation is being rejected..."
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectComment.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
