import React, { useRef, useState, useEffect, useCallback } from "react";
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
  Highlighter,
} from "lucide-react";
import { toast } from "sonner";
import { AnnotationTemplatesLibrary } from "./AnnotationTemplatesLibrary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DrawingTool = "pen" | "rectangle" | "circle" | "arrow" | "text" | "eraser" | "highlight" | "select";

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
  layerId: string; // Layer this element belongs to
}

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

interface VideoDrawingCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTime: number;
  onSaveAnnotation: (imageDataUrl: string, timestamp: number, duration: number) => Promise<void>;
  onDrawingModeChange?: (isDrawing: boolean) => void;
  onToggleRequest?: number; // External toggle trigger (counter)
  fileId?: number; // For auto-save draft identification
}

export function VideoDrawingCanvas({
  videoRef,
  currentTime,
  onSaveAnnotation,
  onDrawingModeChange,
  onToggleRequest,
  fileId,
}: VideoDrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>("pen");
  const [isHighlightMode, setIsHighlightMode] = useState(false);
  const [color, setColor] = useState("#FF0000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [history, setHistory] = useState<DrawingElement[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const [showCanvas, setShowCanvas] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [debugTouchPos, setDebugTouchPos] = useState<{x: number, y: number} | null>(null);
  const [touchDetected, setTouchDetected] = useState(false);
  const [duration, setDuration] = useState(5); // Duration in seconds
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const fileIdRef = useRef<string>("");
  
  // Selection and movement state
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  
  // Layer management
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'layer-1', name: 'Layer 1', visible: true, locked: false }
  ]);
  const [currentLayerId, setCurrentLayerId] = useState('layer-1');
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null);
  const [lastPanPosition, setLastPanPosition] = useState<{x: number, y: number} | null>(null);
  
  // Layer reordering handlers
  const handleLayerDragStart = (e: React.DragEvent, layerId: string) => {
    setDraggedLayerId(layerId);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleLayerDragOver = (e: React.DragEvent, targetLayerId: string) => {
    e.preventDefault();
    if (!draggedLayerId || draggedLayerId === targetLayerId) return;
    
    const draggedIndex = layers.findIndex(l => l.id === draggedLayerId);
    const targetIndex = layers.findIndex(l => l.id === targetLayerId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const newLayers = [...layers];
    const [draggedLayer] = newLayers.splice(draggedIndex, 1);
    newLayers.splice(targetIndex, 0, draggedLayer);
    setLayers(newLayers);
  };
  
  const handleLayerDragEnd = () => {
    setDraggedLayerId(null);
  };
  
  // Layer renaming handlers
  const startEditingLayer = (layerId: string, currentName: string) => {
    setEditingLayerId(layerId);
    setEditingName(currentName);
  };
  
  const saveLayerName = () => {
    if (!editingLayerId) return;
    
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      toast.error('Layer name cannot be empty');
      return;
    }
    
    // Check for duplicate names
    const isDuplicate = layers.some(l => l.id !== editingLayerId && l.name === trimmedName);
    if (isDuplicate) {
      toast.error('Layer name already exists');
      return;
    }
    
    setLayers(layers.map(l => 
      l.id === editingLayerId ? { ...l, name: trimmedName } : l
    ));
    setEditingLayerId(null);
    setEditingName('');
    toast.success('Layer renamed');
  };
  
  const cancelEditingLayer = () => {
    setEditingLayerId(null);
    setEditingName('');
  };
  
  // Layer merge handler
  const mergeLayers = () => {
    if (selectedLayerIds.length < 2) {
      toast.error('Select at least 2 layers to merge');
      return;
    }
    
    // Find the first selected layer (will be the target)
    const targetLayerId = selectedLayerIds[0];
    const targetLayer = layers.find(l => l.id === targetLayerId);
    if (!targetLayer) return;
    
    // Collect all elements from selected layers and reassign to target layer
    const mergedElements = elements.map(element => {
      if (selectedLayerIds.includes(element.layerId)) {
        return { ...element, layerId: targetLayerId };
      }
      return element;
    });
    
    // Remove the other selected layers (keep target)
    const newLayers = layers.filter(l => 
      !selectedLayerIds.includes(l.id) || l.id === targetLayerId
    );
    
    setElements(mergedElements);
    setLayers(newLayers);
    setSelectedLayerIds([]);
    
    // Switch to merged layer if current layer was deleted
    if (selectedLayerIds.includes(currentLayerId) && currentLayerId !== targetLayerId) {
      setCurrentLayerId(targetLayerId);
    }
    
    toast.success(`${selectedLayerIds.length} layers merged into ${targetLayer.name}`);
  };

  // Handle external toggle request
  useEffect(() => {
    console.log('[VideoDrawingCanvas] Toggle request changed:', onToggleRequest);
    if (onToggleRequest !== undefined && onToggleRequest > 0) {
      console.log('[VideoDrawingCanvas] Toggling canvas');
      setShowCanvas(prev => {
        console.log('[VideoDrawingCanvas] showCanvas changing from', prev, 'to', !prev);
        return !prev;
      });
    }
  }, [onToggleRequest]);

  useEffect(() => {
    // Get canvas by ID from video container
    const canvas = document.getElementById('drawing-canvas') as HTMLCanvasElement;
    console.log('[VideoDrawingCanvas] Canvas element found:', !!canvas, 'showCanvas:', showCanvas);
    if (!canvas || !videoRef.current) {
      console.log('[VideoDrawingCanvas] Canvas or video not found');
      return;
    }
    
    // Set canvas ref for drawing operations
    canvasRef.current = canvas;
    console.log('[VideoDrawingCanvas] Canvas ref set, attaching event listeners');
    
    // Immediately size the canvas to match video
    const video = videoRef.current;
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    console.log('[VideoDrawingCanvas] Canvas sized to:', rect.width, 'x', rect.height);
    
    // Show alert on mobile to confirm canvas size
    if (showCanvas && /Mobi|Android/i.test(navigator.userAgent)) {
      alert(`Canvas ready! Size: ${rect.width}x${rect.height}. Try drawing now.`);
    }
    
    // Add touch event listeners
    const touchStart = (e: TouchEvent) => {
      console.log('[VideoDrawingCanvas] touchStart fired!', e.touches.length, 'touches');
      setTouchDetected(true);
      e.preventDefault();
      e.stopPropagation();
      // Call handleTouchStart with native TouchEvent
      handleTouchStart(e);
    };
    const touchMove = (e: TouchEvent) => {
      e.preventDefault();
      // Call handleTouchMove with native TouchEvent
      handleTouchMove(e);
    };
    const touchEnd = () => handleTouchEnd();
    
    // Add mouse event listeners
    const mouseDown = (e: MouseEvent) => handleMouseDown(e as any);
    const mouseMove = (e: MouseEvent) => handleMouseMove(e as any);
    const mouseUp = () => handleMouseUp();
    
    if (showCanvas) {
      canvas.addEventListener('touchstart', touchStart, { passive: false });
      canvas.addEventListener('touchmove', touchMove, { passive: false });
      canvas.addEventListener('touchend', touchEnd, { passive: false });
      canvas.addEventListener('touchcancel', touchEnd, { passive: false });
      canvas.addEventListener('mousedown', mouseDown);
      canvas.addEventListener('mousemove', mouseMove);
      canvas.addEventListener('mouseup', mouseUp);
      canvas.addEventListener('mouseleave', mouseUp);
    }
    
    // Match canvas size to video display size
    const resizeCanvas = () => {
      const rect = video.getBoundingClientRect();
      
      // Set canvas internal resolution
      canvas.width = rect.width;
      canvas.height = rect.height;
      
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
      canvas.removeEventListener('mousedown', mouseDown);
      canvas.removeEventListener('mousemove', mouseMove);
      canvas.removeEventListener('mouseup', mouseUp);
      canvas.removeEventListener('mouseleave', mouseUp);
    };
  }, [showCanvas]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw elements layer by layer (bottom to top = first to last in array)
    // This respects the layer order for z-index
    layers.forEach((layer) => {
      if (!layer.visible) return;
      
      // Draw all elements from this layer
      elements
        .filter(element => element.layerId === layer.id)
        .forEach(element => drawElement(ctx, element));
    });
    
    // Always draw current element being created
    if (currentElement) {
      drawElement(ctx, currentElement);
    }
  };

  const drawElement = (ctx: CanvasRenderingContext2D, element: DrawingElement) => {
    ctx.strokeStyle = element.color;
    ctx.lineWidth = element.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (element.type === "highlight") {
      // Draw semi-transparent yellow highlight
      if (element.points.length < 2) return;
      const start = element.points[0];
      const end = element.points[element.points.length - 1];
      ctx.fillStyle = "rgba(255, 255, 0, 0.4)"; // Semi-transparent yellow
      ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
      // Optional: add a subtle border
      ctx.strokeStyle = "rgba(255, 255, 0, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (element.type === "pen") {
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

  // Check if a point is inside a shape's bounds
  const isPointInShape = (point: Point, element: DrawingElement): boolean => {
    if (element.points.length < 2) return false;
    
    const [start, end] = element.points;
    const padding = 10; // Hit detection padding
    
    switch (element.type) {
      case 'rectangle':
      case 'highlight':
        const minX = Math.min(start.x, end.x) - padding;
        const maxX = Math.max(start.x, end.x) + padding;
        const minY = Math.min(start.y, end.y) - padding;
        const maxY = Math.max(start.y, end.y) + padding;
        return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      
      case 'circle':
        const centerX = (start.x + end.x) / 2;
        const centerY = (start.y + end.y) / 2;
        const radiusX = Math.abs(end.x - start.x) / 2 + padding;
        const radiusY = Math.abs(end.y - start.y) / 2 + padding;
        const dx = (point.x - centerX) / radiusX;
        const dy = (point.y - centerY) / radiusY;
        return (dx * dx + dy * dy) <= 1;
      
      case 'arrow':
        // Check if point is near the arrow line
        const distToLine = Math.abs(
          (end.y - start.y) * point.x - (end.x - start.x) * point.y + end.x * start.y - end.y * start.x
        ) / Math.sqrt((end.y - start.y) ** 2 + (end.x - start.x) ** 2);
        return distToLine <= padding;
      
      case 'text':
        // Simple bounding box for text
        const textWidth = 100; // Approximate
        const textHeight = 30;
        return point.x >= start.x - padding && point.x <= start.x + textWidth + padding &&
               point.y >= start.y - textHeight - padding && point.y <= start.y + padding;
      
      case 'pen':
        // Check if point is near any segment of the pen stroke
        for (let i = 0; i < element.points.length - 1; i++) {
          const p1 = element.points[i];
          const p2 = element.points[i + 1];
          const dist = Math.abs(
            (p2.y - p1.y) * point.x - (p2.x - p1.x) * point.y + p2.x * p1.y - p2.y * p1.x
          ) / Math.sqrt((p2.y - p1.y) ** 2 + (p2.x - p1.x) ** 2);
          if (dist <= padding) return true;
        }
        return false;
      
      default:
        return false;
    }
  };

  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement> | TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    // Account for zoom and pan
    const x = (touch.clientX - rect.left - panX) / zoom;
    const y = (touch.clientY - rect.top - panY) / zoom;
    console.log('[VideoDrawingCanvas] getTouchPos:', { clientX: touch.clientX, clientY: touch.clientY, rectLeft: rect.left, rectTop: rect.top, x, y, panX, panY, zoom });
    setDebugTouchPos({ x: Math.round(x), y: Math.round(y) });
    return { x, y };
  };

  // Calculate distance between two touch points for pinch gesture
  const getPinchDistance = (e: React.TouchEvent<HTMLCanvasElement> | TouchEvent): number => {
    if (e.touches.length < 2) return 0;
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Get center point between two touches
  const getPinchCenter = (e: React.TouchEvent<HTMLCanvasElement>): Point => {
    if (e.touches.length < 2) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    return {
      x: ((touch1.clientX + touch2.clientX) / 2) - rect.left,
      y: ((touch1.clientY + touch2.clientY) / 2) - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Check if current layer is locked
    const currentLayer = layers.find(l => l.id === currentLayerId);
    if (currentLayer?.locked) {
      toast.error(`${currentLayer.name} is locked. Unlock to edit.`);
      return;
    }
    
    const pos = getMousePos(e);
    
    // Check if clicking on an existing shape to select/move it
    const clickedElement = [...elements].reverse().find(el => isPointInShape(pos, el));
    
    if (clickedElement) {
      // Select the shape
      setSelectedElementId(clickedElement.id);
      setIsDraggingElement(true);
      
      // Calculate offset from shape's first point
      const shapeStart = clickedElement.points[0];
      setDragOffset({ x: pos.x - shapeStart.x, y: pos.y - shapeStart.y });
      return;
    }
    
    // Deselect if clicking on empty space
    setSelectedElementId(null);
    
    if (selectedTool === "text") {
      setTextPosition(pos);
      return;
    }
    
    setIsDrawing(true);
    
    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: selectedTool,
      points: [pos],
      color,
      strokeWidth,
      layerId: currentLayerId,
    };
    
    setCurrentElement(newElement);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement> | TouchEvent) => {
    e.preventDefault();
    
    // Handle pinch-to-zoom (two fingers)
    if (e.touches.length === 2) {
      const distance = getPinchDistance(e);
      setLastPinchDistance(distance);
      setIsDrawing(false);
      setCurrentElement(null);
      return;
    }
    
    // Handle pan mode when zoomed in (one finger when zoom > 1)
    if (e.touches.length === 1 && zoom > 1) {
      const touch = e.touches[0];
      setLastPanPosition({ x: touch.clientX, y: touch.clientY });
      setIsPanning(true);
      return;
    }
    
    // Check if current layer is locked
    const currentLayer = layers.find(l => l.id === currentLayerId);
    if (currentLayer?.locked) {
      toast.error(`${currentLayer.name} is locked. Unlock to edit.`);
      return;
    }
    
    const pos = getTouchPos(e);
    
    // Only allow shape selection/movement with select tool or when not actively drawing
    if (selectedTool === "select" || selectedTool === "eraser") {
      // Check if tapping on an existing shape to select/move it
      const tappedElement = [...elements].reverse().find(el => isPointInShape(pos, el));
      
      if (tappedElement) {
        // Select the shape
        setSelectedElementId(tappedElement.id);
        setIsDraggingElement(true);
        
        // Calculate offset from shape's first point
        const shapeStart = tappedElement.points[0];
        setDragOffset({ x: pos.x - shapeStart.x, y: pos.y - shapeStart.y });
        return;
      }
      
      // Deselect if tapping on empty space
      setSelectedElementId(null);
    }
    
    if (selectedTool === "text") {
      setTextPosition(pos);
      return;
    }
    
    setIsDrawing(true);   
    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: selectedTool,
      points: [pos],
      color,
      strokeWidth,
      layerId: currentLayerId,
    };
    
    setCurrentElement(newElement);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    
    // Handle dragging an existing shape
    if (isDraggingElement && selectedElementId) {
      const elementIndex = elements.findIndex(el => el.id === selectedElementId);
      if (elementIndex === -1) return;
      
      const element = elements[elementIndex];
      const newStartPoint = { x: pos.x - dragOffset.x, y: pos.y - dragOffset.y };
      
      // Calculate the offset for all points
      const offsetX = newStartPoint.x - element.points[0].x;
      const offsetY = newStartPoint.y - element.points[0].y;
      
      // Move all points by the offset
      const newPoints = element.points.map(p => ({
        x: p.x + offsetX,
        y: p.y + offsetY
      }));
      
      const updatedElements = [...elements];
      updatedElements[elementIndex] = { ...element, points: newPoints };
      setElements(updatedElements);
      redrawCanvas();
      return;
    }
    
    if (!isDrawing || !currentElement) return;
    
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

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement> | TouchEvent) => {
    e.preventDefault();
    const pos = getTouchPos(e);
    
    // Handle dragging an existing shape
    if (isDraggingElement && selectedElementId) {
      const elementIndex = elements.findIndex(el => el.id === selectedElementId);
      if (elementIndex === -1) return;
      
      const element = elements[elementIndex];
      const newStartPoint = { x: pos.x - dragOffset.x, y: pos.y - dragOffset.y };
      
      // Calculate the offset for all points
      const offsetX = newStartPoint.x - element.points[0].x;
      const offsetY = newStartPoint.y - element.points[0].y;
      
      // Move all points by the offset
      const newPoints = element.points.map(p => ({
        x: p.x + offsetX,
        y: p.y + offsetY
      }));
      
      const updatedElements = [...elements];
      updatedElements[elementIndex] = { ...element, points: newPoints };
      setElements(updatedElements);
      redrawCanvas();
      return;
    }
    
    if (!isDrawing || !currentElement) return;
    
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
    // Handle end of dragging
    if (isDraggingElement) {
      setIsDraggingElement(false);
      // Add to history
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(elements);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
      setHasUnsavedChanges(true);
      return;
    }
    
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
    // Handle end of dragging
    if (isDraggingElement) {
      setIsDraggingElement(false);
      // Add to history
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(elements);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
      setHasUnsavedChanges(true);
      return;
    }
    
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
      layerId: currentLayerId,
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
    if (historyStep === 0) {
      toast.info("Nothing to undo");
      return;
    }
    const newStep = historyStep - 1;
    setHistoryStep(newStep);
    setElements(history[newStep]);
    redrawCanvas();
    toast.success("Undid last action");
  };

  const handleRedo = () => {
    if (historyStep >= history.length - 1) {
      toast.info("Nothing to redo");
      return;
    }
    const newStep = historyStep + 1;
    setHistoryStep(newStep);
    setElements(history[newStep]);
    redrawCanvas();
    toast.success("Redid action");
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
      setHasUnsavedChanges(false);
      clearDraft();
      handleClear();
      setShowCanvas(false);
    } catch (error) {
      toast.error("Failed to save annotation");
    }
  };
  const insertTemplate = (templateType: 'highlight' | 'callout' | 'bubble') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const size = 100;

    let newElement: DrawingElement;

    switch (templateType) {
      case 'highlight':
        // Semi-transparent highlight box
        newElement = {
          id: Date.now().toString(),
          type: 'rectangle',
          points: [
            { x: centerX - size, y: centerY - size / 2 },
            { x: centerX + size, y: centerY + size / 2 },
          ],
          color: color + '80', // Add transparency
          strokeWidth: 2,
          layerId: currentLayerId,
        };
        break;
      case 'callout':
        // Arrow pointing to a spot
        newElement = {
          id: Date.now().toString(),
          type: 'arrow',
          points: [
            { x: centerX - size, y: centerY - size },
            { x: centerX, y: centerY },
          ],
          color: color,
          strokeWidth: 4,
          layerId: currentLayerId,
        };
        break;
      case 'bubble':
        // Speech bubble (circle)
        newElement = {
          id: Date.now().toString(),
          type: 'circle',
          points: [
            { x: centerX - size / 2, y: centerY - size / 2 },
            { x: centerX + size / 2, y: centerY + size / 2 },
          ],
          layerId: currentLayerId,
          color: color,
          strokeWidth: 3,
        };
        break;
    }

    const newElements = [...elements, newElement];
    setElements(newElements);
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    redrawCanvas();
    toast.success(`${templateType.charAt(0).toUpperCase() + templateType.slice(1)} template added`);
  };

  // Auto-save draft to localStorage
  const saveDraft = () => {
    if (!fileId) return;
    const draftKey = `drawing-draft-${fileId}`;
    const draft = {
      elements,
      duration,
      timestamp: currentTime,
      savedAt: Date.now(),
      layers,
      currentLayerId,
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  };

  // Restore draft from localStorage
  const restoreDraft = () => {
    if (!fileId) return null;
    const draftKey = `drawing-draft-${fileId}`;
    const draftStr = localStorage.getItem(draftKey);
    if (!draftStr) return null;
    try {
      return JSON.parse(draftStr);
    } catch {
      return null;
    }
  };

  // Clear draft from localStorage
  const clearDraft = () => {
    if (!fileId) return;
    const draftKey = `drawing-draft-${fileId}`;
    localStorage.removeItem(draftKey);
  };

  // Redraw canvas when layer visibility changes
  useEffect(() => {
    if (showCanvas) {
      redrawCanvas();
    }
  }, [layers]);

  // Auto-save whenever elements change
  useEffect(() => {
    if (showCanvas && elements.length > 0) {
      setHasUnsavedChanges(true);
      saveDraft();
    }
  }, [elements, duration]);

  // Restore draft when opening canvas
  useEffect(() => {
    if (showCanvas && elements.length === 0) {
      const draft = restoreDraft();
      if (draft && draft.elements && draft.elements.length > 0) {
        setElements(draft.elements);
        setDuration(draft.duration || 5);
        if (draft.layers) {
          setLayers(draft.layers);
        }
        if (draft.currentLayerId) {
          setCurrentLayerId(draft.currentLayerId);
        }
        const newHistory = [draft.elements];
        setHistory(newHistory);
        setHistoryStep(0);
        toast.info(`Restored draft with ${draft.elements.length} drawing(s)`);
      }
    }
  }, [showCanvas]);

  const handleCancelClick = () => {
    if (hasUnsavedChanges && elements.length > 0) {
      setShowCancelDialog(true);
    } else {
      toggleCanvas();
    }
  };

  const handleConfirmCancel = () => {
    setShowCancelDialog(false);
    setHasUnsavedChanges(false);
    toggleCanvas();
  };

  const toggleCanvas = useCallback(() => {
    console.log('[VideoDrawingCanvas] toggleCanvas called');
    setShowCanvas(prev => {
      const newShowCanvas = !prev;
      console.log('[VideoDrawingCanvas] Calling onDrawingModeChange with:', newShowCanvas);
      onDrawingModeChange?.(newShowCanvas);
      
      if (newShowCanvas) {
        // Pause video when starting to draw
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        // Reset zoom and pan to prevent pan mode interference on mobile
        setZoom(1);
        setPanX(0);
        setPanY(0);
      } else {
        // Clear draft when closing after save
        if (!hasUnsavedChanges) {
          clearDraft();
        }
      }
      
      return newShowCanvas;
    });
  }, [videoRef, onDrawingModeChange, hasUnsavedChanges, clearDraft]);

  const colors = [
    "#FF0000", // Red
    "#00FF00", // Green
    "#0000FF", // Blue
    "#FFFF00", // Yellow
    "#FF00FF", // Magenta
    "#FFFFFF", // White
    "#000000", // Black
  ];

  const strokeWidths = [1, 2, 3, 5, 8];

  return (
    <>
    <div className="space-y-3">
      {!showCanvas && (
        <Button
          size="default"
          className="md:h-9 md:text-sm"
          variant="outline"
          onClick={toggleCanvas}
        >
          <Pencil className="h-5 w-5 md:h-4 md:w-4 mr-2" />
          Draw on Video
        </Button>
      )}

      {showCanvas && (
        <Card className="p-2 space-y-1.5" style={{ position: 'relative', zIndex: 20, backgroundColor: touchDetected ? '#ff0000' : undefined }}>
          {/* Debug Touch Detection */}
          <div className="bg-blue-500 text-white p-2 text-center font-bold text-lg">
            {touchDetected ? 'TOUCH DETECTED!' : 'Waiting for touch...'}
            {debugTouchPos && ` at (${debugTouchPos.x}, ${debugTouchPos.y})`}
          </div>
          
          {/* Duration Slider with Cancel button */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Display Duration: {duration}s</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelClick}
              >
                Cancel
              </Button>
            </div>
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

          {/* Drawing Tools */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "pen" ? "default" : "outline"}
                onClick={() => { setSelectedTool("pen"); setIsHighlightMode(false); }}
              >
                <Pencil className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "rectangle" ? "default" : "outline"}
                onClick={() => { setSelectedTool("rectangle"); setIsHighlightMode(false); }}
              >
                <Square className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "circle" ? "default" : "outline"}
                onClick={() => { setSelectedTool("circle"); setIsHighlightMode(false); }}
              >
                <Circle className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "arrow" ? "default" : "outline"}
                onClick={() => { setSelectedTool("arrow"); setIsHighlightMode(false); }}
              >
                <ArrowRight className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "text" ? "default" : "outline"}
                onClick={() => { setSelectedTool("text"); setIsHighlightMode(false); }}
              >
                <Type className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "eraser" ? "default" : "outline"}
                onClick={() => { setSelectedTool("eraser"); setIsHighlightMode(false); }}
              >
                <Eraser className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant={selectedTool === "highlight" ? "default" : "outline"}
                onClick={() => {
                  setSelectedTool("highlight");
                  setColor("#FFFF00");
                  setIsHighlightMode(true);
                }}
                title="Highlight"
              >
                <Highlighter className="h-5 w-5 md:h-4 md:w-4" />
              </Button>

              <Separator orientation="vertical" className="h-8" />

              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant="outline"
                onClick={handleUndo}
                disabled={historyStep === 0}
                title="Undo"
              >
                <Undo className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button
                size="default"
                className="md:h-9 md:w-9 md:p-0"
                variant="outline"
                onClick={handleRedo}
                disabled={historyStep >= history.length - 1}
                title="Redo"
              >
                <Redo className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
              <Button 
                size="default" 
                className="md:h-9 md:w-9 md:p-0" 
                variant="outline" 
                onClick={handleClear}
                title="Clear All"
              >
                <Trash2 className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
            </div>

            {/* Color Picker */}
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Color:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 md:w-5 md:h-5 rounded border-2 transition-all ${
                      color === c ? "border-primary scale-110" : "border-border"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Stroke Width */}
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Stroke Width:</span>
              <div className="flex items-center gap-1.5">
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

            {/* Save Button */}
            <div className="flex gap-2 pt-0.5">
              <Button onClick={handleSave} className="flex-1" disabled={elements.length === 0}>
                <Save className="h-4 w-4 mr-2" />
                Confirm & Save
              </Button>
            </div>

            {/* Template Management */}
            <AnnotationTemplatesLibrary
              currentDrawingState={{
                tool: selectedTool === "eraser" || selectedTool === "highlight" || selectedTool === "select" ? "pen" : selectedTool,
                color,
                strokeWidth,
                text: textInput || undefined,
              }}
              onApplyTemplate={(templateData) => {
                setSelectedTool(templateData.tool as DrawingTool);
                setColor(templateData.color);
                setStrokeWidth(templateData.strokeWidth);
                if (templateData.text) setTextInput(templateData.text);
              }}
            />
          </div>

          {/* Layer Management */}
          <div className="space-y-2 border-t pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Layers</span>
              <div className="flex gap-1">
                {selectedLayerIds.length >= 2 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={mergeLayers}
                    className="h-7 text-xs"
                  >
                    Merge ({selectedLayerIds.length})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newLayerId = `layer-${Date.now()}`;
                    setLayers([...layers, {
                      id: newLayerId,
                      name: `Layer ${layers.length + 1}`,
                      visible: true,
                      locked: false,
                    }]);
                    setCurrentLayerId(newLayerId);
                    toast.success(`Layer ${layers.length + 1} created`);
                  }}
                  className="h-7 text-xs"
                >
                  + Add
                </Button>
              </div>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  draggable
                  onDragStart={(e) => handleLayerDragStart(e, layer.id)}
                  onDragOver={(e) => handleLayerDragOver(e, layer.id)}
                  onDragEnd={handleLayerDragEnd}
                  className={`flex items-center gap-2 p-2 rounded text-sm cursor-move ${
                    currentLayerId === layer.id
                      ? 'bg-primary/20 border border-primary'
                      : 'bg-muted/50 hover:bg-muted'
                  } ${
                    draggedLayerId === layer.id ? 'opacity-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedLayerIds.includes(layer.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLayerIds([...selectedLayerIds, layer.id]);
                      } else {
                        setSelectedLayerIds(selectedLayerIds.filter(id => id !== layer.id));
                      }
                    }}
                    className="h-3 w-3 md:h-4 md:w-4"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setLayers(layers.map(l =>
                        l.id === layer.id ? { ...l, visible: !l.visible } : l
                      ));
                    }}
                  >
                    {layer.visible ? '👁️' : '🚫'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setLayers(layers.map(l =>
                        l.id === layer.id ? { ...l, locked: !l.locked } : l
                      ));
                      if (!layer.locked) {
                        toast.info(`${layer.name} locked`);
                      } else {
                        toast.info(`${layer.name} unlocked`);
                      }
                    }}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </Button>
                  {editingLayerId === layer.id ? (
                    <div className="flex-1 flex gap-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveLayerName();
                          if (e.key === 'Escape') cancelEditingLayer();
                        }}
                        className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-green-600"
                        onClick={saveLayerName}
                      >
                        ✓
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-600"
                        onClick={cancelEditingLayer}
                      >
                        ×
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="flex-1 text-left"
                      onClick={() => setCurrentLayerId(layer.id)}
                      onDoubleClick={() => startEditingLayer(layer.id, layer.name)}
                    >
                      {layer.name}
                      {currentLayerId === layer.id && (
                        <span className="ml-2 text-xs text-primary">(active)</span>
                      )}
                    </button>
                  )}
                  {layers.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => {
                        if (layers.length === 1) {
                          toast.error('Cannot delete the last layer');
                          return;
                        }
                        // Remove elements from this layer
                        setElements(elements.filter(e => e.layerId !== layer.id));
                        // Remove layer
                        const newLayers = layers.filter(l => l.id !== layer.id);
                        setLayers(newLayers);
                        // Switch to first layer if current layer was deleted
                        if (currentLayerId === layer.id) {
                          setCurrentLayerId(newLayers[0].id);
                        }
                        toast.success(`${layer.name} deleted`);
                      }}
                    >
                      🗑️
                    </Button>
                  )}
                </div>
              ))}
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



          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Click and drag to draw on the video</p>
            <p>• Use different tools to add shapes, arrows, and text</p>
            <p>• Your drawing will be saved at the current video timestamp</p>
          </div>
        </Card>
      )}

      {/* Confirmation Dialog for Unsaved Changes */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved drawing?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved drawings. If you cancel now, your work will be saved as a draft and can be restored when you return.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel}>
              Discard & Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}
