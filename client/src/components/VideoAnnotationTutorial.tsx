import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Pencil, 
  Square, 
  Circle, 
  Type, 
  Palette, 
  Eraser,
  Download,
  Play
} from "lucide-react";

interface VideoAnnotationTutorialProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoAnnotationTutorial({ open, onOpenChange }: VideoAnnotationTutorialProps) {
  const steps = [
    {
      title: "Open a Video File",
      description: "Click on any video file in your library to open the video viewer with annotation tools.",
      icon: Play,
    },
    {
      title: "Select Drawing Tool",
      description: "Choose from pen, shapes (rectangle, circle), text, or eraser tools in the toolbar.",
      icon: Pencil,
    },
    {
      title: "Draw on Video",
      description: "Click and drag on the video to draw. Use the pen for freehand drawing or shapes for structured annotations.",
      icon: Square,
    },
    {
      title: "Customize Colors",
      description: "Select different colors from the color palette to highlight different elements or categories.",
      icon: Palette,
    },
    {
      title: "Add Text Labels",
      description: "Use the text tool to add labels, notes, or timestamps directly on the video frame.",
      icon: Type,
    },
    {
      title: "Erase Mistakes",
      description: "Select the eraser tool to remove unwanted annotations without affecting the video.",
      icon: Eraser,
    },
    {
      title: "Save Your Work",
      description: "Annotations are automatically saved. Export the annotated video using the download button.",
      icon: Download,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Video Annotation Tutorial</DialogTitle>
          <DialogDescription>
            Learn how to draw and annotate on your video files
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm">
              <strong>Pro Tip:</strong> Video annotations are perfect for marking key moments, 
              highlighting important details, or collaborating with team members on video content.
            </p>
          </div>

          <div className="grid gap-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <Card key={index} className="border-2">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">
                          {index + 1}. {step.title}
                        </h3>
                        <p className="text-muted-foreground">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="bg-muted rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">Keyboard Shortcuts</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pen Tool:</span>
                <kbd className="px-2 py-1 bg-background rounded border">P</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rectangle:</span>
                <kbd className="px-2 py-1 bg-background rounded border">R</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Circle:</span>
                <kbd className="px-2 py-1 bg-background rounded border">C</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Text:</span>
                <kbd className="px-2 py-1 bg-background rounded border">T</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Eraser:</span>
                <kbd className="px-2 py-1 bg-background rounded border">E</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Undo:</span>
                <kbd className="px-2 py-1 bg-background rounded border">Ctrl+Z</kbd>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => onOpenChange(false)}>
              Got it!
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
