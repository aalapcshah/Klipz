import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FeedbackFormProps {
  trigger?: React.ReactNode;
}

export function FeedbackForm({ trigger }: FeedbackFormProps) {
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'general' | 'bug' | 'feature' | 'improvement' | 'question'>('general');
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  const submitFeedbackMutation = trpc.feedback.submit.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      toast.error("Please enter your feedback message");
      return;
    }

    try {
      await submitFeedbackMutation.mutateAsync({
        type: feedbackType,
        message: message.trim(),
        email: email.trim() || undefined,
      });

      toast.success("Thank you for your feedback!");
      setMessage("");
      setEmail("");
      setFeedbackType("general");
      setOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to submit feedback");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            Feedback
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Help us improve MetaClips by sharing your thoughts, suggestions, or reporting issues.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Feedback Type */}
          <div className="space-y-2">
            <Label htmlFor="feedback-type">Feedback Type</Label>
            <Select value={feedbackType} onValueChange={(value) => setFeedbackType(value as typeof feedbackType)}>
              <SelectTrigger id="feedback-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Feedback</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="improvement">Improvement Suggestion</SelectItem>
                <SelectItem value="question">Question</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="feedback-message">
              Message <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="feedback-message"
              placeholder="Tell us what you think..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              required
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/1000 characters
            </p>
          </div>

          {/* Email (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="feedback-email">
              Email <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="feedback-email"
              type="email"
              placeholder="your.email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Provide your email if you'd like us to follow up with you.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitFeedbackMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitFeedbackMutation.isPending || !message.trim()}
            >
              {submitFeedbackMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Feedback"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
