import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  Square,
  Circle,
  ArrowRight,
  Type,
  Eraser,
  Undo,
  Redo,
  Save,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

type DrawingTool = "pen" | "rectangle" | "circle" | "arrow" | "text" | "eraser";

interface Point {
  x: number;
  y: number;
}

interface DrawingElement {
  id: string;
  type: DrawingTool;
  points: Point[];
  color: string;
  strokeWidth: number;
  text?: string;
}

interface VideoDrawingCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTime: number;
  onSaveAnnotation: (imageDataUrl: string, timestamp: number, duration: number) => Promise<void>;
  onDrawingModeChange?: (isDrawing: boolean) => void;
}

export function VideoDrawingCanvas({
  videoRef,
  currentTime,
  onSaveAnnotation,
  onDrawingModeChange,
}: VideoDrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState("#FF0000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [history, setHistory] = useState<DrawingElement[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const [showCanvas, setShowCanvas] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [duration, setDuration] = useState(5); // Duration in seconds

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const videoContainer = video.parentElement;
    
    if (!videoContainer) return;
    
    // Append canvas to video container
    if (showCanvas && !videoContainer.contains(canvas)) {
      videoContainer.appendChild(canvas);
    }
    
    // Add touch event listeners
    const touchStart = (e: TouchEvent) => handleTouchStart(e as any);
    const touchMove = (e: TouchEvent) => handleTouchMove(e as any);
    const touchEnd = () => handleTouchEnd();
    
    if (showCanvas) {
      canvas.addEventListener('touchstart', touchStart, { passive: false });
      canvas.addEventListener('touchmove', touchMove, { passive: false });
      canvas.addEventListener('touchend', touchEnd);
      canvas.addEventListener('touchcancel', touchEnd);
    }
    
    // Match canvas size to video display size
    const resizeCanvas = () => {
      const rect = video.getBoundingClientRect();
      const containerRect = videoContainer.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      // Position canvas over video
      canvas.style.display = 'block';
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      canvas.style.zIndex = '10';
      canvas.style.pointerEvents = showCanvas ? 'auto' : 'none';
      canvas.style.cursor = 'crosshair';
      canvas.style.touchAction = 'none';
      redrawCanvas();
    };
    
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener('touchstart', touchStart);
      canvas.removeEventListener('touchmove', touchMove);
      canvas.removeEventListener('touchend', touchEnd);
      canvas.removeEventListener('touchcancel', touchEnd);
      if (videoContainer.contains(canvas)) {
        videoContainer.removeChild(canvas);
      }
    };
  }, [showCanvas]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    elements.forEach((element) => {
      drawElement(ctx, element);
    });
    
    if (currentElement) {
      drawElement(ctx, currentElement);
    }
  };

  const drawElement = (ctx: CanvasRenderingContext2D, element: DrawingElement) => {
    ctx.strokeStyle = element.color;
    ctx.lineWidth = element.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (element.type === "pen") {
      if (element.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(element.points[0].x, element.points[0].y);
      element.points.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    } else if (element.type === "rectangle") {
      if (element.points.length < 2) return;
      const start = element.points[0];
      const end = element.points[element.points.length - 1];
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (element.type === "circle") {
      if (element.points.length < 2) return;
      const start = element.points[0];
      const end = element.points[element.points.length - 1];
      const radius = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      );
      ctx.beginPath();
      ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (element.type === "arrow") {
      if (element.points.length < 2) return;
      const start = element.points[0];
      const end = element.points[element.points.length - 1];
      
      // Draw line
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      
      // Draw arrowhead
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLength = 15;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLength * Math.cos(angle - Math.PI / 6),
        end.y - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLength * Math.cos(angle + Math.PI / 6),
        end.y - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    } else if (element.type === "text" && element.text) {
      ctx.font = `${element.strokeWidth * 8}px sans-serif`;
      ctx.fillStyle = element.color;
      ctx.fillText(element.text, element.points[0].x, element.points[0].y);
    }
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === "text") {
      const pos = getMousePos(e);
      setTextPosition(pos);
      return;
    }
    
    setIsDrawing(true);
    const pos = getMousePos(e);
    
    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: selectedTool,
      points: [pos],
      color,
      strokeWidth,
    };
    
    setCurrentElement(newElement);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (selectedTool === "text") {
      const pos = getTouchPos(e);
      setTextPosition(pos);
      return;
    }
    
    setIsDrawing(true);
    const pos = getTouchPos(e);
    
    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: selectedTool,
      points: [pos],
      color,
      strokeWidth,
    };
    
    setCurrentElement(newElement);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentElement) return;
    
    const pos = getMousePos(e);
    
    if (selectedTool === "pen") {
      setCurrentElement({
        ...currentElement,
        points: [...currentElement.points, pos],
      });
    } else {
      setCurrentElement({
        ...currentElement,
        points: [currentElement.points[0], pos],
      });
    }
    
    redrawCanvas();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !currentElement) return;
    
    const pos = getTouchPos(e);
    
    if (selectedTool === "pen") {
      setCurrentElement({
        ...currentElement,
        points: [...currentElement.points, pos],
      });
    } else {
      setCurrentElement({
        ...currentElement,
        points: [currentElement.points[0], pos],
      });
    }
    
    redrawCanvas();
  };

  const handleTouchEnd = () => {
    if (!isDrawing || !currentElement) return;
    
    setElements([...elements, currentElement]);
    setCurrentElement(null);
    setIsDrawing(false);
    
    // Add to history
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push([...elements, currentElement]);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentElement) return;
    
    setIsDrawing(false);
    const newElements = [...elements, currentElement];
    setElements(newElements);
    setCurrentElement(null);
    
    // Add to history
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    
    redrawCanvas();
  };

  const handleTextSubmit = () => {
    if (!textInput || !textPosition) return;
    
    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: "text",
      points: [textPosition],
      color,
      strokeWidth: 2,
      text: textInput,
    };
    
    const newElements = [...elements, newElement];
    setElements(newElements);
    
    // Add to history
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    
    setTextInput("");
    setTextPosition(null);
    redrawCanvas();
  };

  const handleUndo = () => {
    if (historyStep === 0) return;
    const newStep = historyStep - 1;
    setHistoryStep(newStep);
    setElements(history[newStep]);
    redrawCanvas();
  };

  const handleRedo = () => {
    if (historyStep >= history.length - 1) return;
    const newStep = historyStep + 1;
    setHistoryStep(newStep);
    setElements(history[newStep]);
    redrawCanvas();
  };

  const handleClear = () => {
    setElements([]);
    setHistory([[]]);
    setHistoryStep(0);
    redrawCanvas();
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    try {
      const imageDataUrl = canvas.toDataURL("image/png");
      await onSaveAnnotation(imageDataUrl, currentTime, duration);
      toast.success(`Drawing saved (${duration}s duration)`);
      handleClear();
      setShowCanvas(false);
    } catch (error) {
      toast.error("Failed to save annotation");
    }
  };
  const toggleCanvas = () => {
    const newShowCanvas = !showCanvas;
    setShowCanvas(newShowCanvas);
    onDrawingModeChange?.(newShowCanvas);
    
    if (newShowCanvas) {
      // Pause video when starting to draw
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  };

  const colors = [
    "#FF0000", // Red
    "#00FF00", // Green
    "#0000FF", // Blue
    "#FFFF00", // Yellow
    "#FF00FF", // Magenta
    "#00FFFF", // Cyan
    "#FFFFFF", // White
    "#000000", // Black
  ];

  const strokeWidths = [1, 2, 3, 5, 8];

  return (
    <div className="space-y-3">
      <Button
        size="default"
        className="md:h-9 md:text-sm"
        variant={showCanvas ? "default" : "outline"}
        onClick={toggleCanvas}
      >
        <Pencil className="h-5 w-5 md:h-4 md:w-4 mr-2" />
        {showCanvas ? "Hide Drawing Tools" : "Draw on Video"}
      </Button>

      {showCanvas && (
        <Card className="p-4 space-y-3">
          {/* Drawing Tools */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "pen" ? "default" : "outline"}
                onClick={() => setSelectedTool("pen")}
              >
                <Pencil className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "rectangle" ? "default" : "outline"}
                onClick={() => setSelectedTool("rectangle")}
              >
                <Square className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "circle" ? "default" : "outline"}
                onClick={() => setSelectedTool("circle")}
              >
                <Circle className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "arrow" ? "default" : "outline"}
                onClick={() => setSelectedTool("arrow")}
              >
                <ArrowRight className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "text" ? "default" : "outline"}
                onClick={() => setSelectedTool("text")}
              >
                <Type className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="sm"
                variant={selectedTool === "eraser" ? "default" : "outline"}
                onClick={() => setSelectedTool("eraser")}
              >
                <Eraser className="h-4 w-4" />
              </Button>

              <Separator orientation="vertical" className="h-8" />

              <Button
                size="sm"
                variant="outline"
                onClick={handleUndo}
                disabled={historyStep === 0}
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRedo}
                disabled={historyStep >= history.length - 1}
              >
                <Redo className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Color Picker */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Color:</span>
              <div className="flex items-center gap-2 flex-wrap">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded border-2 transition-all ${
                      color === c ? "border-primary scale-110" : "border-border"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Stroke Width */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Stroke Width:</span>
              <div className="flex items-center gap-2">
                {strokeWidths.map((width) => (
                  <Button
                    key={width}
                    size="sm"
                    variant={strokeWidth === width ? "default" : "outline"}
                    onClick={() => setStrokeWidth(width)}
                  >
                    {width}px
                  </Button>
                ))}
              </div>
            </div>

            {/* Duration Slider */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Display Duration: {duration}s</span>
              <input
                type="range"
                min="1"
                max="30"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1s</span>
                <span>30s</span>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1" disabled={elements.length === 0}>
                <Save className="h-4 w-4 mr-2" />
                Confirm & Save
              </Button>
            </div>
          </div>

          {/* Text Input Dialog */}
          {textPosition && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter text..."
                className="w-full px-3 py-2 bg-background border border-border rounded"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTextSubmit();
                  if (e.key === "Escape") setTextPosition(null);
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleTextSubmit}>
                  Add Text
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTextPosition(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Hidden canvas element that gets appended to video container */}
          <canvas
            ref={canvasRef}
            style={{ display: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Click and drag to draw on the video</p>
            <p>• Use different tools to add shapes, arrows, and text</p>
            <p>• Your drawing will be saved at the current video timestamp</p>
          </div>
        </Card>
      )}
    </div>
  );
}
