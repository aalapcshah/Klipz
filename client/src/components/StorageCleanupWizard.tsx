import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { 
  Copy, 
  TrendingDown, 
  Clock, 
  Trash2,
  CheckCircle2,
  HardDrive
} from "lucide-react";
import { toast } from "sonner";

interface StorageCleanupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface CleanupCategory {
  id: string;
  icon: typeof Copy;
  title: string;
  description: string;
  fileCount: number;
  storageSize: number; // in bytes
  selected: boolean;
}

export function StorageCleanupWizard({ open, onOpenChange, onComplete }: StorageCleanupWizardProps) {
  const [step, setStep] = useState<'scan' | 'select' | 'confirm' | 'complete'>('scan');
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [categories, setCategories] = useState<CleanupCategory[]>([
    {
      id: 'duplicates',
      icon: Copy,
      title: 'Duplicate Files',
      description: 'Files with identical content that can be safely removed',
      fileCount: 0,
      storageSize: 0,
      selected: false
    },
    {
      id: 'low_quality',
      icon: TrendingDown,
      title: 'Low Quality Files',
      description: 'Files with quality score below 50',
      fileCount: 0,
      storageSize: 0,
      selected: false
    },
    {
      id: 'unused',
      icon: Clock,
      title: 'Unused Files',
      description: 'Files not accessed in the last 90 days',
      fileCount: 0,
      storageSize: 0,
      selected: false
    }
  ]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const handleScan = async () => {
    setIsScanning(true);
    
    // Simulate scanning process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock data - in real implementation, this would come from the backend
    setCategories([
      {
        id: 'duplicates',
        icon: Copy,
        title: 'Duplicate Files',
        description: 'Files with identical content that can be safely removed',
        fileCount: 12,
        storageSize: 45 * 1024 * 1024, // 45 MB
        selected: false
      },
      {
        id: 'low_quality',
        icon: TrendingDown,
        title: 'Low Quality Files',
        description: 'Files with quality score below 50',
        fileCount: 8,
        storageSize: 23 * 1024 * 1024, // 23 MB
        selected: false
      },
      {
        id: 'unused',
        icon: Clock,
        title: 'Unused Files',
        description: 'Files not accessed in the last 90 days',
        fileCount: 34,
        storageSize: 156 * 1024 * 1024, // 156 MB
        selected: false
      }
    ]);
    
    setIsScanning(false);
    setStep('select');
  };

  const toggleCategory = (id: string) => {
    setCategories(prev => 
      prev.map(cat => 
        cat.id === id ? { ...cat, selected: !cat.selected } : cat
      )
    );
  };

  const selectedCategories = categories.filter(cat => cat.selected);
  const totalFilesToDelete = selectedCategories.reduce((sum, cat) => sum + cat.fileCount, 0);
  const totalStorageToFree = selectedCategories.reduce((sum, cat) => sum + cat.storageSize, 0);

  const handleConfirm = () => {
    if (selectedCategories.length === 0) {
      toast.error("Please select at least one category to clean up");
      return;
    }
    setStep('confirm');
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    
    // Simulate deletion process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsDeleting(false);
    setStep('complete');
    toast.success(`Successfully freed ${formatBytes(totalStorageToFree)}`);
  };

  const handleClose = () => {
    onOpenChange(false);
    setStep('scan');
    setCategories(prev => prev.map(cat => ({ ...cat, selected: false })));
    if (onComplete && step === 'complete') {
      onComplete();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Storage Cleanup Wizard</DialogTitle>
          <DialogDescription>
            {step === 'scan' && "Scan your files to find storage savings opportunities"}
            {step === 'select' && "Select categories of files to remove"}
            {step === 'confirm' && "Confirm deletion of selected files"}
            {step === 'complete' && "Cleanup completed successfully"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'scan' && (
            <div className="text-center space-y-6">
              <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <HardDrive className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Ready to Free Up Space?</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  We'll scan your files for duplicates, low-quality items, and unused content. 
                  This process may take a few moments.
                </p>
              </div>
              <Button 
                onClick={handleScan} 
                disabled={isScanning}
                size="lg"
                className="gap-2"
              >
                {isScanning ? (
                  <>
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Scanning Files...
                  </>
                ) : (
                  <>Start Scan</>
                )}
              </Button>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-4">
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <Card 
                    key={category.id}
                    className={`cursor-pointer transition-colors ${category.selected ? 'border-primary bg-primary/5' : ''}`}
                    onClick={() => toggleCategory(category.id)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <Checkbox 
                          checked={category.selected}
                          onCheckedChange={() => toggleCategory(category.id)}
                          className="mt-1"
                        />
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold mb-1">{category.title}</h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            {category.description}
                          </p>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">
                              {category.fileCount} files
                            </span>
                            <span className="font-medium text-primary">
                              {formatBytes(category.storageSize)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {selectedCategories.length > 0 && (
                <div className="bg-primary/10 rounded-lg p-4 mt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Total Storage to Free</p>
                      <p className="text-2xl font-bold text-primary">{formatBytes(totalStorageToFree)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">Files to Delete</p>
                      <p className="text-2xl font-bold">{totalFilesToDelete}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-6">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <h4 className="font-semibold text-destructive mb-2">⚠️ Warning: This action cannot be undone</h4>
                <p className="text-sm text-muted-foreground">
                  You are about to permanently delete {totalFilesToDelete} files, 
                  freeing up {formatBytes(totalStorageToFree)} of storage.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Selected Categories:</h4>
                <ul className="space-y-2">
                  {selectedCategories.map((category) => (
                    <li key={category.id} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>{category.title} - {category.fileCount} files ({formatBytes(category.storageSize)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center space-y-6">
              <div className="mx-auto w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Cleanup Complete!</h3>
                <p className="text-sm text-muted-foreground">
                  Successfully deleted {totalFilesToDelete} files and freed up {formatBytes(totalStorageToFree)} of storage.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'select' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={selectedCategories.length === 0}>
                Continue
              </Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                disabled={isDeleting}
                className="gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete Files
                  </>
                )}
              </Button>
            </>
          )}
          {step === 'complete' && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
