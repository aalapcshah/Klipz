import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Camera, Mic, MapPin, Smartphone, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { PermissionsDialog } from "@/components/PermissionsDialog";
import { getAllPermissionStatuses, type PermissionStatus, type PermissionType } from "@/lib/permissions";
import { DataExport } from "./DataExport";
import { AccountDeletion } from "./AccountDeletion";

export function AccountSettings() {
  const { data: user } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();

  // Profile fields
  const [name, setName] = useState(user?.name || "");
  const [location, setLocation] = useState(user?.location || "");
  const [age, setAge] = useState(user?.age?.toString() || "");
  const [company, setCompany] = useState(user?.company || "");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [reasonForUse, setReasonForUse] = useState(user?.reasonForUse || "");

  // Email preferences
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [productUpdates, setProductUpdates] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [permissionStatuses, setPermissionStatuses] = useState<Record<PermissionType, PermissionStatus> | null>(null);

  // Load permission statuses on mount
  useEffect(() => {
    loadPermissionStatuses();
  }, []);

  const loadPermissionStatuses = async () => {
    const statuses = await getAllPermissionStatuses();
    setPermissionStatuses(statuses);
  };

  const getStatusBadge = (status: PermissionStatus) => {
    switch (status.state) {
      case 'granted':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            Granted
          </span>
        );
      case 'denied':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <XCircle className="h-3 w-3" />
            Denied
          </span>
        );
      case 'prompt':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
            <HelpCircle className="h-3 w-3" />
            Not requested
          </span>
        );
      case 'unsupported':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <XCircle className="h-3 w-3" />
            Unsupported
          </span>
        );
    }
  };

  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const deactivateAccountMutation = trpc.auth.deactivateAccount.useMutation();

  const handleUpdateProfile = async () => {
    setIsUpdating(true);
    try {
      await updateProfileMutation.mutateAsync({
        name,
        location: location || undefined,
        age: age ? parseInt(age) : undefined,
        company: company || undefined,
        jobTitle: jobTitle || undefined,
        bio: bio || undefined,
        reasonForUse: reasonForUse || undefined,
      });

      await utils.auth.me.invalidate();
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeactivateAccount = async () => {
    setIsDeactivating(true);
    try {
      await deactivateAccountMutation.mutateAsync();
      toast.success("Account deactivated. You will be logged out.");
      // Logout is handled by the mutation
      window.location.href = "/";
    } catch (error) {
      toast.error("Failed to deactivate account");
      console.error(error);
      setIsDeactivating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your personal information and profile details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
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

            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Video Editor"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="reasonForUse">What do you use Klipz for?</Label>
              <Textarea
                id="reasonForUse"
                value={reasonForUse}
                onChange={(e) => setReasonForUse(e.target.value)}
                placeholder="Managing video assets for client projects..."
                rows={3}
              />
            </div>

            <div className="col-span-2">
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

          <Button onClick={handleUpdateProfile} disabled={isUpdating}>
            {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Email Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Email Preferences</CardTitle>
          <CardDescription>
            Manage your email notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="marketing"
              checked={marketingEmails}
              onCheckedChange={(checked) => setMarketingEmails(checked as boolean)}
            />
            <div className="space-y-1">
              <Label htmlFor="marketing" className="font-medium cursor-pointer">
                Marketing emails
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive emails about new features, tips, and special offers
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="product"
              checked={productUpdates}
              onCheckedChange={(checked) => setProductUpdates(checked as boolean)}
            />
            <div className="space-y-1">
              <Label htmlFor="product" className="font-medium cursor-pointer">
                Product updates
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive emails about product updates and new releases
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="security"
              checked={securityAlerts}
              onCheckedChange={(checked) => setSecurityAlerts(checked as boolean)}
              disabled
            />
            <div className="space-y-1">
              <Label htmlFor="security" className="font-medium cursor-pointer text-muted-foreground">
                Security alerts (required)
              </Label>
              <p className="text-sm text-muted-foreground">
                Important security notifications about your account
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            You can unsubscribe from marketing emails at any time using the unsubscribe link in the email footer.
          </p>
        </CardContent>
      </Card>

      {/* Device Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Device Permissions
          </CardTitle>
          <CardDescription>
            Manage device permissions for camera, microphone, and location access
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Klipz works best with access to your device features. Grant permissions to enable features like photo uploads, voice recording, and location tagging.
          </p>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <span>Camera - Take photos and record videos</span>
              </div>
              {permissionStatuses && getStatusBadge(permissionStatuses.camera)}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <span>Microphone - Record audio and voice notes</span>
              </div>
              {permissionStatuses && getStatusBadge(permissionStatuses.microphone)}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>Location - Add location metadata to files</span>
              </div>
              {permissionStatuses && getStatusBadge(permissionStatuses.location)}
            </div>
          </div>

          <Button 
            onClick={() => setShowPermissionsDialog(true)}
            className="w-full sm:w-auto"
          >
            Request Permissions
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Note: If you previously denied permissions, you may need to enable them in your browser settings.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions that affect your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeactivating}>
                <AlertTriangle className="w-4 h-4 mr-2" />
                Deactivate Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action will deactivate your account and log you out. Your data will be preserved but your account will be inaccessible. Contact support to reactivate your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeactivateAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeactivating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Deactivate Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Data Export (GDPR) */}
      <DataExport />

      {/* Account Deletion (GDPR) */}
      <AccountDeletion />

      {/* Permissions Dialog */}
      <PermissionsDialog 
        open={showPermissionsDialog}
        onOpenChange={setShowPermissionsDialog}
        onComplete={() => {
          setShowPermissionsDialog(false);
          // Reload permission statuses after dialog closes
          setTimeout(() => loadPermissionStatuses(), 500);
        }}
      />
    </div>
  );
}
