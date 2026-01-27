import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PermissionsDialog } from "@/components/PermissionsDialog";

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingWizard({ open, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  // Profile fields
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [age, setAge] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [bio, setBio] = useState("");
  const [reasonForUse, setReasonForUse] = useState("");

  // Consent fields
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const recordConsentsMutation = trpc.auth.recordConsents.useMutation();
  const utils = trpc.useUtils();

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        toast.error("Please enter your name");
        return;
      }
    }
    if (step === 2) {
      if (!agreeTerms || !agreePrivacy) {
        toast.error("You must agree to Terms of Service and Privacy Policy to continue");
        return;
      }
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      // Update profile
      await updateProfileMutation.mutateAsync({
        name,
        location: location || undefined,
        age: age ? parseInt(age) : undefined,
        company: company || undefined,
        jobTitle: jobTitle || undefined,
        bio: bio || undefined,
        reasonForUse: reasonForUse || undefined,
        profileCompleted: true,
      });

      // Record consents
      await recordConsentsMutation.mutateAsync({
        termsOfService: agreeTerms,
        privacyPolicy: agreePrivacy,
        marketingEmails: agreeMarketing,
      });

      await utils.auth.me.invalidate();
      toast.success("Welcome! Your profile has been set up.");
      onComplete();
    } catch (error) {
      toast.error("Failed to complete onboarding");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Welcome to Synclips!"}
            {step === 2 && "Terms & Consent"}
            {step === 3 && "Device Permissions"}
            {step === 4 && "Tell us about yourself"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Let's get your profile set up"}
            {step === 2 && "Please review and accept our policies"}
            {step === 3 && "Grant permissions for the best experience (optional)"}
            {step === 4 && "Optional: Help us personalize your experience"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>

              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="San Francisco, CA"
                />
              </div>

              <div>
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="25"
                  min="13"
                  max="120"
                />
              </div>
            </div>
          )}

          {/* Step 2: Consents */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="terms"
                  checked={agreeTerms}
                  onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
                />
                <div className="space-y-1">
                  <Label htmlFor="terms" className="font-medium cursor-pointer">
                    I agree to the Terms of Service *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    By checking this box, you agree to our{" "}
                    <a href="/terms" target="_blank" className="underline">
                      Terms of Service
                    </a>
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="privacy"
                  checked={agreePrivacy}
                  onCheckedChange={(checked) => setAgreePrivacy(checked as boolean)}
                />
                <div className="space-y-1">
                  <Label htmlFor="privacy" className="font-medium cursor-pointer">
                    I agree to the Privacy Policy *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    By checking this box, you agree to our{" "}
                    <a href="/privacy" target="_blank" className="underline">
                      Privacy Policy
                    </a>
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="marketing"
                  checked={agreeMarketing}
                  onCheckedChange={(checked) => setAgreeMarketing(checked as boolean)}
                />
                <div className="space-y-1">
                  <Label htmlFor="marketing" className="font-medium cursor-pointer">
                    Send me marketing and product updates (optional)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    You can unsubscribe at any time from your account settings
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Permissions */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Synclips works best with access to your device features. You can skip this step and grant permissions later from Settings.
              </p>
              <Button 
                onClick={() => setShowPermissions(true)}
                className="w-full"
              >
                Request Permissions
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                We'll ask for camera, location, and microphone access
              </p>
            </div>
          )}

          {/* Step 4: Additional Info */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc."
                />
              </div>

              <div>
                <Label htmlFor="jobTitle">Job Title</Label>
                <Input
                  id="jobTitle"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Video Editor"
                />
              </div>

              <div>
                <Label htmlFor="reasonForUse">What will you use Synclips for?</Label>
                <Textarea
                  id="reasonForUse"
                  value={reasonForUse}
                  onChange={(e) => setReasonForUse(e.target.value)}
                  placeholder="Managing video assets for client projects..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us a bit about yourself..."
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1 || isSubmitting}
          >
            Back
          </Button>

          {step < 4 ? (
            <Button onClick={handleNext} disabled={isSubmitting}>
              {step === 3 ? "Skip" : "Next"}
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Complete Setup
            </Button>
          )}
        </div>

        {/* Progress Indicator */}
        <div className="flex justify-center gap-2 pt-4">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-2 w-12 rounded-full ${
                s === step ? "bg-primary" : s < step ? "bg-primary/50" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </DialogContent>

      {/* Permissions Dialog */}
      <PermissionsDialog 
        open={showPermissions} 
        onOpenChange={setShowPermissions}
        onComplete={() => setShowPermissions(false)}
      />
    </Dialog>
  );
}
