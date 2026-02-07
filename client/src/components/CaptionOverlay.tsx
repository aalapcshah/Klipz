import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";

interface CaptionOverlayProps {
  fileId: number;
  currentTime: number;
}

interface Caption {
  timestamp: number;
  caption: string;
  entities: string[];
  confidence: number;
}

export function CaptionOverlay({ fileId, currentTime }: CaptionOverlayProps) {
  const [visible, setVisible] = useState(true);

  const { data: captionData } = trpc.videoVisualCaptions.getCaptions.useQuery(
    { fileId },
    { staleTime: 60000 }
  );

  const captions: Caption[] = useMemo(() => {
    if (!captionData?.captions) return [];
    return (captionData.captions as Caption[]).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }, [captionData]);

  // Find the active caption based on current video time
  const activeCaption = useMemo(() => {
    if (captions.length === 0) return null;

    // Find the caption whose timestamp is closest but not more than the next caption's timestamp
    for (let i = captions.length - 1; i >= 0; i--) {
      if (captions[i].timestamp <= currentTime) {
        // Check if we're within the caption's display window
        const nextTimestamp = captions[i + 1]?.timestamp ?? captions[i].timestamp + 10;
        const captionDuration = nextTimestamp - captions[i].timestamp;
        if (currentTime <= captions[i].timestamp + captionDuration) {
          return captions[i];
        }
        return null;
      }
    }

    // If currentTime is before the first caption, show nothing
    return null;
  }, [captions, currentTime]);

  // Fade effect when caption changes
  useEffect(() => {
    if (activeCaption) {
      setVisible(false);
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    }
  }, [activeCaption?.timestamp]);

  if (!activeCaption || captionData?.status !== "completed") return null;

  // Truncate long captions for subtitle display (max ~120 chars)
  const displayText =
    activeCaption.caption.length > 140
      ? activeCaption.caption.substring(0, 137) + "..."
      : activeCaption.caption;

  return (
    <div
      className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[90%] md:max-w-[80%]"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease-in-out",
      }}
    >
      <div
        className="px-4 py-2 rounded-lg text-center"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(4px)",
        }}
      >
        <p className="text-white text-sm md:text-base font-medium leading-snug drop-shadow-lg">
          {displayText}
        </p>
      </div>
    </div>
  );
}
