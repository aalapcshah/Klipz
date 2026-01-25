import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MetadataPopupProps {
  description: string;
  maxLength?: number;
}

export function MetadataPopup({ description, maxLength = 50 }: MetadataPopupProps) {
  const [open, setOpen] = useState(false);
  
  // If description is short enough, just show it without popup
  if (description.length <= maxLength) {
    return <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{description}</p>;
  }

  const truncated = description.slice(0, maxLength) + "...";

  return (
    <>
      <p 
        className="text-xs text-muted-foreground line-clamp-2 mt-1 cursor-pointer hover:text-foreground transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Click to view full description"
      >
        {truncated}
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent 
          className="max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Description</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{description}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
