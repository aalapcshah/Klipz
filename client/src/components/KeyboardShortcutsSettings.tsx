import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertCircle, Check, X, RotateCcw } from "lucide-react";

interface ShortcutConfig {
  action: string;
  key: string;
  modifiers: string[];
  label: string;
  description: string;
}

const defaultShortcuts: ShortcutConfig[] = [
  { action: "playPause", key: "Space", modifiers: [], label: "Play/Pause", description: "Toggle video playback" },
  { action: "addComment", key: "c", modifiers: [], label: "Add Comment", description: "Add a comment to annotation" },
  { action: "approve", key: "a", modifiers: [], label: "Approve", description: "Approve selected annotation" },
  { action: "reject", key: "r", modifiers: [], label: "Reject", description: "Reject selected annotation" },
  { action: "toggleDrawing", key: "d", modifiers: [], label: "Toggle Drawing", description: "Enable/disable drawing mode" },
  { action: "undo", key: "z", modifiers: ["ctrl"], label: "Undo", description: "Undo last action" },
  { action: "redo", key: "y", modifiers: ["ctrl"], label: "Redo", description: "Redo last undone action" },
  { action: "save", key: "s", modifiers: ["ctrl"], label: "Save", description: "Save current work" },
  { action: "delete", key: "Delete", modifiers: [], label: "Delete", description: "Delete selected item" },
  { action: "escape", key: "Escape", modifiers: [], label: "Escape", description: "Cancel current operation" },
];

export function KeyboardShortcutsSettings() {
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [capturedKey, setCapturedKey] = useState<string>("");
  const [capturedModifiers, setCapturedModifiers] = useState<string[]>([]);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const { data: customShortcuts, refetch } = trpc.keyboardShortcuts.getShortcuts.useQuery();
  const checkConflictQuery = trpc.keyboardShortcuts.checkConflict.useQuery(
    {
      key: capturedKey,
      modifiers: capturedModifiers,
      excludeAction: editingAction || undefined,
    },
    { enabled: !!capturedKey && !!editingAction }
  );

  const upsertMutation = trpc.keyboardShortcuts.upsertShortcut.useMutation({
    onSuccess: () => {
      refetch();
      setEditingAction(null);
      setCapturedKey("");
      setCapturedModifiers([]);
      setConflictError(null);
    },
  });

  const deleteMutation = trpc.keyboardShortcuts.deleteShortcut.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const resetMutation = trpc.keyboardShortcuts.resetToDefaults.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const getShortcutConfig = (action: string): ShortcutConfig => {
    const custom = customShortcuts?.find((s) => s.action === action);
    const defaultConfig = defaultShortcuts.find((s) => s.action === action)!;

    if (custom) {
      return {
        ...defaultConfig,
        key: custom.key,
        modifiers: (custom.modifiers as string[]) || [],
      };
    }

    return defaultConfig;
  };

  const handleKeyCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    
    const modifiers: string[] = [];
    if (e.ctrlKey || e.metaKey) modifiers.push("ctrl");
    if (e.shiftKey) modifiers.push("shift");
    if (e.altKey) modifiers.push("alt");

    let key = e.key;
    // Normalize special keys
    if (key === " ") key = "Space";
    if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") {
      return; // Don't capture modifier-only presses
    }

    setCapturedKey(key);
    setCapturedModifiers(modifiers);
    setConflictError(null);
  };

  const handleSaveShortcut = () => {
    if (!editingAction || !capturedKey) return;

    if (checkConflictQuery.data?.hasConflict) {
      setConflictError(`Conflicts with: ${checkConflictQuery.data.conflictingAction}`);
      return;
    }

    upsertMutation.mutate({
      action: editingAction,
      key: capturedKey,
      modifiers: capturedModifiers,
    });
  };

  const handleResetShortcut = (action: string) => {
    deleteMutation.mutate({ action });
  };

  const formatShortcut = (config: ShortcutConfig) => {
    const parts = [...config.modifiers.map((m) => m.charAt(0).toUpperCase() + m.slice(1)), config.key];
    return parts.join(" + ");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Keyboard Shortcuts</h2>
          <p className="text-sm text-muted-foreground">
            Customize keyboard shortcuts for quick actions
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset All to Defaults
        </Button>
      </div>

      <div className="grid gap-4">
        {defaultShortcuts.map((defaultConfig) => {
          const config = getShortcutConfig(defaultConfig.action);
          const isEditing = editingAction === config.action;
          const isCustom = customShortcuts?.some((s) => s.action === config.action);

          return (
            <Card key={config.action} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{config.label}</h3>
                    {isCustom && (
                      <Badge variant="secondary" className="text-xs">
                        Custom
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                </div>

                <div className="flex items-center gap-3">
                  {isEditing ? (
                    <>
                      <div className="flex flex-col items-end gap-2">
                        <Input
                          placeholder="Press keys..."
                          value={
                            capturedKey
                              ? formatShortcut({
                                  ...config,
                                  key: capturedKey,
                                  modifiers: capturedModifiers,
                                })
                              : ""
                          }
                          onKeyDown={handleKeyCapture}
                          className="w-48 text-center"
                          autoFocus
                        />
                        {conflictError && (
                          <div className="flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            {conflictError}
                          </div>
                        )}
                        {checkConflictQuery.data?.hasConflict === false && capturedKey && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <Check className="h-3 w-3" />
                            Available
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSaveShortcut}
                        disabled={!capturedKey || checkConflictQuery.data?.hasConflict}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingAction(null);
                          setCapturedKey("");
                          setCapturedModifiers([]);
                          setConflictError(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="font-mono">
                        {formatShortcut(config)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingAction(config.action)}
                      >
                        Edit
                      </Button>
                      {isCustom && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleResetShortcut(config.action)}
                        >
                          Reset
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
