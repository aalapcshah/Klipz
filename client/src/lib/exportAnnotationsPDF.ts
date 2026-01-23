import { jsPDF } from "jspdf";

interface VoiceAnnotation {
  id: number;
  videoTimestamp: number;
  duration: number;
  audioUrl: string;
  transcript?: string | null;
  createdAt: Date;
}

interface VisualAnnotation {
  id: number;
  videoTimestamp: number;
  duration?: number | null;
  imageUrl: string;
  description?: string | null;
  createdAt: Date;
}

interface ExportOptions {
  videoTitle: string;
  voiceAnnotations: VoiceAnnotation[];
  visualAnnotations: VisualAnnotation[];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function exportAnnotationsPDF(options: ExportOptions): Promise<void> {
  const { videoTitle, voiceAnnotations, visualAnnotations } = options;
  
  const doc = new jsPDF();
  let yPosition = 20;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  const lineHeight = 7;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Video Annotations Report", margin, yPosition);
  yPosition += 10;

  // Video title
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(`Video: ${videoTitle}`, margin, yPosition);
  yPosition += 10;

  // Export date
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Exported: ${new Date().toLocaleString()}`, margin, yPosition);
  doc.setTextColor(0);
  yPosition += 15;

  // Voice Annotations Section
  if (voiceAnnotations.length > 0) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Voice Annotations (${voiceAnnotations.length})`, margin, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    for (const annotation of voiceAnnotations) {
      // Check if we need a new page
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      // Timestamp
      doc.setFont("helvetica", "bold");
      doc.text(`[${formatTime(annotation.videoTimestamp)}]`, margin, yPosition);
      doc.setFont("helvetica", "normal");
      yPosition += lineHeight;

      // Duration
      doc.text(`Duration: ${annotation.duration}s`, margin + 5, yPosition);
      yPosition += lineHeight;

      // Transcript
      if (annotation.transcript) {
        doc.text("Transcript:", margin + 5, yPosition);
        yPosition += lineHeight;
        
        const splitText = doc.splitTextToSize(annotation.transcript, 170);
        doc.text(splitText, margin + 10, yPosition);
        yPosition += splitText.length * lineHeight;
      }

      yPosition += 5; // Space between annotations
    }

    yPosition += 10;
  }

  // Visual Annotations Section
  if (visualAnnotations.length > 0) {
    // Check if we need a new page
    if (yPosition > pageHeight - 40) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Drawing Annotations (${visualAnnotations.length})`, margin, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    for (const annotation of visualAnnotations) {
      // Check if we need a new page
      if (yPosition > pageHeight - 80) {
        doc.addPage();
        yPosition = 20;
      }

      // Timestamp
      doc.setFont("helvetica", "bold");
      doc.text(`[${formatTime(annotation.videoTimestamp)}]`, margin, yPosition);
      doc.setFont("helvetica", "normal");
      yPosition += lineHeight;

      // Duration
      if (annotation.duration) {
        doc.text(`Duration: ${annotation.duration}s`, margin + 5, yPosition);
        yPosition += lineHeight;
      }

      // Description
      if (annotation.description) {
        doc.text(`Description: ${annotation.description}`, margin + 5, yPosition);
        yPosition += lineHeight;
      }

      // Add image thumbnail
      try {
        const img = await loadImage(annotation.imageUrl);
        const imgWidth = 60;
        const imgHeight = (img.height / img.width) * imgWidth;
        
        doc.addImage(img, "PNG", margin + 5, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 10;
      } catch (error) {
        console.error("Failed to load image for PDF:", error);
        doc.text("(Image unavailable)", margin + 5, yPosition);
        yPosition += lineHeight;
      }

      yPosition += 5; // Space between annotations
    }
  }

  // Summary footer
  if (yPosition > pageHeight - 30) {
    doc.addPage();
    yPosition = 20;
  }

  yPosition += 10;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Total: ${voiceAnnotations.length} voice notes, ${visualAnnotations.length} drawings`,
    margin,
    yPosition
  );

  // Save the PDF
  const filename = `${videoTitle.replace(/[^a-z0-9]/gi, "_")}_annotations_${Date.now()}.pdf`;
  doc.save(filename);
}

// Helper function to load image as base64
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
