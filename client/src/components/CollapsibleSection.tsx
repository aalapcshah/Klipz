import { useState, useCallback } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "collapsible-section:";

function getStoredState(key: string | undefined, fallback: boolean): boolean {
  if (!key) return fallback;
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // localStorage unavailable (SSR, private browsing quota, etc.)
  }
  return fallback;
}

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
  /** When provided, the open/closed state is persisted to localStorage under this key */
  storageKey?: string;
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
  storageKey,
}: CollapsibleSectionProps) {
  const [open, setOpenRaw] = useState(() => getStoredState(storageKey, defaultOpen));

  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setOpenRaw((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        if (storageKey) {
          try {
            localStorage.setItem(STORAGE_PREFIX + storageKey, String(value));
          } catch {
            // quota exceeded or unavailable
          }
        }
        return value;
      });
    },
    [storageKey],
  );

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
