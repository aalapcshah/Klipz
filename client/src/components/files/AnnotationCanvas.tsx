import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Pencil, 
  Square, 
  Circle, 
  ArrowRight, 
  Type, 
  Eraser,
  Download,
  Undo,
  Redo,
  Trash2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface AnnotationCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  onSave?: (dataUrl: string) => void;
}

type Tool = "pen" | "rectangle" | "circle" | "arrow" | "text" | "eraser";
type DrawingElement = {
  type: Tool;
  color: string;
  lineWidth: number;
  points?: { x: number; y: number }[];
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
};

export function AnnotationCanvas({ 
  imageUrl, 
  imageWidth, 
  imageHeight,
  onSave 
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#FF0000");
  const [lineWidth, setLineWidth] = useState(3);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [history, setHistory] = useState<DrawingElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
      redraw();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw canvas
  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !imageRef.current || !imageLoaded) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);

    // Draw all elements
    elements.forEach((element) => {
      drawElement(ctx, element);
    });

    // Draw current element
    if (currentElement) {
      drawElement(ctx, currentElement);
    }
  };

  useEffect(() => {
    redraw();
  }, [elements, currentElement, imageLoaded]);

  const drawElement = (ctx: CanvasRenderingContext2D, element: DrawingElement) => {
    ctx.strokeStyle = element.color;
    ctx.fillStyle = element.color;
    ctx.lineWidth = element.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (element.type) {
      case "pen":
        if (element.points && element.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(element.points[0].x, element.points[0].y);
          for (let i = 1; i < element.points.length; i++) {
            ctx.lineTo(element.points[i].x, element.points[i].y);
          }
          ctx.stroke();
        }
        break;

      case "rectangle":
        if (element.startX !== undefined && element.startY !== undefined && 
            element.endX !== undefined && element.endY !== undefined) {
          const width = element.endX - element.startX;
          const height = element.endY - element.startY;
          ctx.strokeRect(element.startX, element.startY, width, height);
        }
        break;

      case "circle":
        if (element.startX !== undefined && element.startY !== undefined && 
            element.endX !== undefined && element.endY !== undefined) {
          const radius = Math.sqrt(
            Math.pow(element.endX - element.startX, 2) + 
            Math.pow(element.endY - element.startY, 2)
          );
          ctx.beginPath();
          ctx.arc(element.startX, element.startY, radius, 0, 2 * Math.PI);
          ctx.stroke();
        }
        break;

      case "arrow":
        if (element.startX !== undefined && element.startY !== undefined && 
            element.endX !== undefined && element.endY !== undefined) {
          const headLength = 15;
          const angle = Math.atan2(element.endY - element.startY, element.endX - element.startX);
          
          // Draw line
          ctx.beginPath();
          ctx.moveTo(element.startX, element.startY);
          ctx.lineTo(element.endX, element.endY);
          ctx.stroke();
          
          // Draw arrowhead
          ctx.beginPath();
          ctx.moveTo(element.endX, element.endY);
          ctx.lineTo(
            element.endX - headLength * Math.cos(angle - Math.PI / 6),
            element.endY - headLength * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(element.endX, element.endY);
          ctx.lineTo(
            element.endX - headLength * Math.cos(angle + Math.PI / 6),
            element.endY - headLength * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
        break;

      case "text":
        if (element.startX !== undefined && element.startY !== undefined && element.text) {
          ctx.font = `${element.lineWidth * 8}px sans-serif`;
          ctx.fillText(element.text, element.startX, element.startY);
        }
        break;
    }
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDrawing(true);

    if (tool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        const newElement: DrawingElement = {
          type: "text",
          color,
          lineWidth,
          startX: pos.x,
          startY: pos.y,
          text,
        };
        addElement(newElement);
      }
      setIsDrawing(false);
      return;
    }

    if (tool === "pen") {
      setCurrentElement({
        type: "pen",
        color,
        lineWidth,
        points: [pos],
      });
    } else {
      setCurrentElement({
        type: tool,
        color,
        lineWidth,
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentElement) return;

    const pos = getMousePos(e);

    if (tool === "pen") {
      setCurrentElement({
        ...currentElement,
        points: [...(currentElement.points || []), pos],
      });
    } else if (tool === "eraser") {
      // Erase elements near cursor
      const eraserRadius = lineWidth * 3;
      setElements((prev) =>
        prev.filter((element) => {
          if (element.type === "pen" && element.points) {
            return !element.points.some(
              (point) =>
                Math.sqrt(Math.pow(point.x - pos.x, 2) + Math.pow(point.y - pos.y, 2)) < eraserRadius
            );
          }
          return true;
        })
      );
    } else {
      setCurrentElement({
        ...currentElement,
        endX: pos.x,
        endY: pos.y,
      });
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentElement && tool !== "eraser") {
      addElement(currentElement);
    }
    setIsDrawing(false);
    setCurrentElement(null);
  };

  const addElement = (element: DrawingElement) => {
    const newElements = [...elements, element];
    setElements(newElements);
    
    // Update history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
    } else {
      setElements([]);
      setHistoryIndex(-1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
    }
  };

  const clear = () => {
    if (confirm("Clear all annotations?")) {
      setElements([]);
      setHistory([]);
      setHistoryIndex(-1);
    }
  };

  const saveAnnotation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    onSave?.(dataUrl);
    
    // Download
    const link = document.createElement("a");
    link.download = "annotated-image.png";
    link.href = dataUrl;
    link.click();
    
    toast.success("Annotation saved");
  };

  const colors = [
    { value: "#FF0000", label: "Red" },
    { value: "#00FF00", label: "Green" },
    { value: "#0000FF", label: "Blue" },
    { value: "#FFFF00", label: "Yellow" },
    { value: "#FF00FF", label: "Magenta" },
    { value: "#00FFFF", label: "Cyan" },
    { value: "#FFFFFF", label: "White" },
    { value: "#000000", label: "Black" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap bg-card p-3 rounded-lg">
        <div className="flex gap-1">
          <Button
            variant={tool === "pen" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("pen")}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "rectangle" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("rectangle")}
          >
            <Square className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "circle" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("circle")}
          >
            <Circle className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "arrow" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("arrow")}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "text" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("text")}
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "eraser" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("eraser")}
          >
            <Eraser className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-6 w-px bg-border" />

        <Select value={color} onValueChange={setColor}>
          <SelectTrigger className="w-32">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: color }}
              />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {colors.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border"
                    style={{ backgroundColor: c.value }}
                  />
                  {c.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={lineWidth.toString()} onValueChange={(v) => setLineWidth(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Thin</SelectItem>
            <SelectItem value="3">Medium</SelectItem>
            <SelectItem value="5">Thick</SelectItem>
            <SelectItem value="8">Very Thick</SelectItem>
          </SelectContent>
        </Select>

        <div className="h-6 w-px bg-border" />

        <Button variant="outline" size="sm" onClick={undo} disabled={historyIndex <= 0}>
          <Undo className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1}>
          <Redo className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={clear} disabled={elements.length === 0}>
          <Trash2 className="h-4 w-4" />
        </Button>

        <div className="h-6 w-px bg-border" />

        <Button variant="default" size="sm" onClick={saveAnnotation}>
          <Download className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>

      {/* Canvas */}
      <div className="relative bg-black/50 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={imageWidth}
          height={imageHeight}
          className="max-w-full h-auto cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
}
