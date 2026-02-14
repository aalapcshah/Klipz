import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  /** Extra elements rendered on the right side of the header (e.g. action buttons) */
  headerActions?: React.ReactNode;
  /** If true, the section border/wrapper is omitted — just the toggle header + content */
  bare?: boolean;
}

export function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
  className,
  headerClassName,
  headerActions,
  bare = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <div className={cn(
        "flex items-center justify-between",
        !bare && "mb-0",
        headerClassName,
      )}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity py-1"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                open && "rotate-0",
                !open && "-rotate-90",
              )}
            />
            {icon}
            <span className="text-sm font-semibold">{title}</span>
          </button>
        </CollapsibleTrigger>
        {headerActions && (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {headerActions}
          </div>
        )}
      </div>
      <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className={cn(!bare && "pt-2")}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
