import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquare, Send, Edit2, Trash2, Reply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CommentThreadProps {
  annotationId: number;
  annotationType: "voice" | "visual";
}

interface CommentWithReplies {
  id: number;
  content: string;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
  replies: CommentWithReplies[];
}

export function CommentThread({ annotationId, annotationType }: CommentThreadProps) {
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showComments, setShowComments] = useState(false);

  const utils = trpc.useUtils();
  const { data: comments, isLoading } = trpc.annotationComments.getComments.useQuery(
    { annotationId, annotationType },
    { enabled: showComments }
  );

  const { data: commentCount } = trpc.annotationComments.getCommentCount.useQuery({
    annotationId,
    annotationType,
  });

  const createCommentMutation = trpc.annotationComments.createComment.useMutation({
    onSuccess: () => {
      toast.success("Comment added");
      setNewComment("");
      setReplyingTo(null);
      setReplyContent("");
      utils.annotationComments.getComments.invalidate();
      utils.annotationComments.getCommentCount.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to add comment: ${error.message}`);
    },
  });

  const updateCommentMutation = trpc.annotationComments.updateComment.useMutation({
    onSuccess: () => {
      toast.success("Comment updated");
      setEditingId(null);
      setEditContent("");
      utils.annotationComments.getComments.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to update comment: ${error.message}`);
    },
  });

  const deleteCommentMutation = trpc.annotationComments.deleteComment.useMutation({
    onSuccess: () => {
      toast.success("Comment deleted");
      utils.annotationComments.getComments.invalidate();
      utils.annotationComments.getCommentCount.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete comment: ${error.message}`);
    },
  });

  const handleAddComment = () => {
    if (!newComment.trim()) return;

    createCommentMutation.mutate({
      annotationId,
      annotationType,
      content: newComment,
    });
  };

  const handleReply = (parentId: number) => {
    if (!replyContent.trim()) return;

    createCommentMutation.mutate({
      annotationId,
      annotationType,
      content: replyContent,
      parentCommentId: parentId,
    });
  };

  const handleEdit = (commentId: number) => {
    if (!editContent.trim()) return;

    updateCommentMutation.mutate({
      commentId,
      content: editContent,
    });
  };

  const handleDelete = (commentId: number) => {
    if (confirm("Delete this comment and all its replies?")) {
      deleteCommentMutation.mutate({ commentId });
    }
  };

  const renderComment = (comment: CommentWithReplies, depth: number = 0) => {
    const isEditing = editingId === comment.id;
    const isReplying = replyingTo === comment.id;

    return (
      <div key={comment.id} className={`${depth > 0 ? "ml-6 mt-2" : "mt-3"}`}>
        <div className="border rounded p-2 bg-gray-50">
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleEdit(comment.id)}
                  disabled={updateCommentMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setEditContent("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm mb-1">{comment.content}</div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    onClick={() => setReplyingTo(comment.id)}
                  >
                    <Reply className="h-3 w-3 mr-1" />
                    Reply
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditContent(comment.content);
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-red-500"
                    onClick={() => handleDelete(comment.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {isReplying && (
          <div className="ml-6 mt-2 space-y-2">
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write a reply..."
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleReply(comment.id)}
                disabled={createCommentMutation.isPending}
              >
                <Send className="h-3 w-3 mr-1" />
                Reply
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">{comment.replies.map((reply) => renderComment(reply, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="border-t pt-2 mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowComments(!showComments)}
        className="flex items-center gap-1 mb-2"
      >
        <MessageSquare className="h-3 w-3" />
        Comments ({commentCount?.count || 0})
      </Button>

      {showComments && (
        <div className="space-y-2">
          <div className="space-y-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="text-sm"
            />
            <Button
              size="sm"
              onClick={handleAddComment}
              disabled={createCommentMutation.isPending || !newComment.trim()}
            >
              <Send className="h-3 w-3 mr-1" />
              Comment
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-gray-500">Loading comments...</div>
          ) : comments && comments.length > 0 ? (
            <div>{comments.map((comment) => renderComment(comment))}</div>
          ) : (
            <div className="text-sm text-gray-500">No comments yet</div>
          )}
        </div>
      )}
    </div>
  );
}
