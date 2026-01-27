import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getShortcutLabel } from "@/hooks/useKeyboardShortcuts";

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    key: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    description: string;
  }>;
}

const defaultShortcuts: ShortcutGroup[] = [
  {
    title: "Video Playback",
    shortcuts: [
      { key: " ", description: "Play/Pause video" },
      { key: "ArrowLeft", description: "Rewind 5 seconds" },
      { key: "ArrowRight", description: "Forward 5 seconds" },
      { key: "m", description: "Toggle mute" },
    ],
  },
  {
    title: "Annotations",
    shortcuts: [
      { key: "c", description: "Add comment to annotation" },
      { key: "a", description: "Approve annotation" },
      { key: "r", description: "Reject annotation" },
      { key: "d", description: "Toggle drawing mode" },
      { key: "v", description: "Start voice annotation" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { key: "t", description: "Toggle timeline view" },
      { key: "h", description: "Show annotation history" },
      { key: "?", shiftKey: true, description: "Show keyboard shortcuts" },
    ],
  },
];

export function KeyboardShortcutsHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Keyboard className="h-4 w-4" />
          Shortcuts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate and interact with Synclips more efficiently
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {defaultShortcuts.map((group) => (
            <div key={group.title}>
              <h3 className="font-semibold mb-3">{group.title}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                    <kbd className="px-3 py-1.5 text-sm font-mono bg-muted rounded border">
                      {getShortcutLabel(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
