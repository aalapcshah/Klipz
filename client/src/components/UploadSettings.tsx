import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Gauge, Layers } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SpeedLimitOption, ConcurrencyOption } from "@/hooks/useResumableUpload";
import { SPEED_LIMIT_OPTIONS as SPEED_OPTIONS, CONCURRENCY_OPTIONS as CONCUR_OPTIONS } from "@/hooks/useResumableUpload";



interface UploadSettingsProps {
  speedLimit: SpeedLimitOption;
  concurrency: ConcurrencyOption;
  onSpeedLimitChange: (limit: SpeedLimitOption) => void;
  onConcurrencyChange: (concurrency: ConcurrencyOption) => void;
}

export default function UploadSettings({
  speedLimit,
  concurrency,
  onSpeedLimitChange,
  onConcurrencyChange,
}: UploadSettingsProps) {
  const [open, setOpen] = useState(false);

  const currentSpeedLabel = SPEED_OPTIONS.find(o => o.value === speedLimit)?.label || "Unlimited";
  const currentConcurrencyLabel = CONCUR_OPTIONS.find(o => o.value === concurrency)?.label || "Sequential (1)";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          Settings
          {(speedLimit > 0 || concurrency > 1) && (
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <div className="space-y-4">
          <div className="text-sm font-medium">Upload Settings</div>

          {/* Speed Limit */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" />
              <span>Speed Limit</span>
            </div>
            <Select
              value={String(speedLimit)}
              onValueChange={(val) => onSpeedLimitChange(Number(val) as SpeedLimitOption)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue>{currentSpeedLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SPEED_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Limit upload speed to avoid saturating your connection
            </p>
          </div>

          {/* Concurrency */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              <span>Parallel Chunks</span>
            </div>
            <Select
              value={String(concurrency)}
              onValueChange={(val) => onConcurrencyChange(Number(val) as ConcurrencyOption)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue>{currentConcurrencyLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CONCUR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Upload multiple chunks simultaneously for faster uploads on stable connections. Auto-falls back to sequential on poor networks.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
