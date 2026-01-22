import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Mic, MapPin, Users, CheckCircle2, XCircle } from "lucide-react";
import { requestAllPermissions, type PermissionResult } from "@/lib/permissions";
import { toast } from "sonner";

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function PermissionsDialog({ open, onOpenChange, onComplete }: PermissionsDialogProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [results, setResults] = useState<Record<string, PermissionResult> | null>(null);

  const handleRequestPermissions = async () => {
    setIsRequesting(true);
    try {
      const permissionResults = await requestAllPermissions();
      setResults(permissionResults);
      
      const grantedCount = Object.values(permissionResults).filter(r => r.granted).length;
      if (grantedCount > 0) {
        toast.success(`${grantedCount} permission(s) granted`);
      }
    } catch (error) {
      toast.error("Failed to request permissions");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (onComplete) {
      onComplete();
    }
  };

  const permissions = [
    {
      key: 'camera',
      icon: Camera,
      title: 'Camera',
      description: 'Take photos and record videos for your media library'
    },
    {
      key: 'microphone',
      icon: Mic,
      title: 'Microphone',
      description: 'Record audio for video annotations and voice tagging'
    },
    {
      key: 'location',
      icon: MapPin,
      title: 'Location',
      description: 'Add location metadata to your files automatically'
    },
    {
      key: 'contacts',
      icon: Users,
      title: 'Contacts',
      description: 'Share collections with contacts (not currently supported)'
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>App Permissions</DialogTitle>
          <DialogDescription>
            MetaClips needs access to certain features to provide the best experience.
            You can manage these permissions anytime in your device settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {permissions.map((permission) => {
            const Icon = permission.icon;
            const result = results?.[permission.key];
            
            return (
              <div
                key={permission.key}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="mt-0.5">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium">{permission.title}</h4>
                    {result && (
                      result.granted ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {permission.description}
                  </p>
                  {result && !result.granted && result.error && (
                    <p className="text-xs text-red-500 mt-1">{result.error}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!results && (
            <Button
              onClick={handleRequestPermissions}
              disabled={isRequesting}
              className="w-full sm:w-auto"
            >
              {isRequesting ? "Requesting..." : "Grant Permissions"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleClose}
            className="w-full sm:w-auto"
          >
            {results ? "Done" : "Skip for Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
