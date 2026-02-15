import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Activity, TrendingUp, TrendingDown, Gauge, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SpeedDataPoint {
  timestamp: number;
  speed: number; // bytes per second
}

interface UploadSpeedGraphProps {
  /** Current upload speed in bytes/sec */
  currentSpeed: number;
  /** Whether an upload is actively in progress */
  isActive: boolean;
  /** Optional label for the upload */
  label?: string;
  /** Max data points to keep (default: 60 = ~1 minute of data) */
  maxPoints?: number;
  /** Compact mode for embedding in smaller spaces */
  compact?: boolean;
}

function formatSpeedValue(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "0/s";
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatSpeedShort(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "0";
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadSpeedGraph({
  currentSpeed,
  isActive,
  label,
  maxPoints = 60,
  compact = false,
}: UploadSpeedGraphProps) {
  const [dataPoints, setDataPoints] = useState<SpeedDataPoint[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const lastUpdateRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSpeedRef = useRef(currentSpeed);
  // Track whether we've ever been active to avoid resetting data on brief flickers
  const hasBeenActiveRef = useRef(false);
  // Track the last time we received a non-zero speed to detect stalls vs active uploads
  const lastNonZeroSpeedRef = useRef<number>(0);
  const lastNonZeroSpeedValueRef = useRef<number>(0);

  // Keep ref in sync
  useEffect(() => {
    currentSpeedRef.current = currentSpeed;
    if (currentSpeed > 0) {
      lastNonZeroSpeedRef.current = Date.now();
      lastNonZeroSpeedValueRef.current = currentSpeed;
    }
  }, [currentSpeed]);

  // Sample speed data every second when active
  useEffect(() => {
    if (isActive) {
      hasBeenActiveRef.current = true;
      
      // Add initial point
      const now = Date.now();
      if (now - lastUpdateRef.current >= 900) {
        setDataPoints(prev => {
          const newPoints = [...prev, { timestamp: now, speed: currentSpeedRef.current }];
          return newPoints.slice(-maxPoints);
        });
        lastUpdateRef.current = now;
      }

      intervalRef.current = setInterval(() => {
        const ts = Date.now();
        let speedToRecord = currentSpeedRef.current;
        
        // If currentSpeed is 0 but we had a non-zero speed recently (within 10s),
        // use a decaying estimate based on the last known speed.
        // This handles the gap between chunk completions where speed reads as 0
        // even though the upload is actively transferring data.
        if (speedToRecord === 0 && lastNonZeroSpeedRef.current > 0) {
          const timeSinceLastSpeed = (ts - lastNonZeroSpeedRef.current) / 1000;
          if (timeSinceLastSpeed < 10) {
            // Decay the last known speed over time to show the upload is still working
            // but we don't have a fresh measurement yet
            const decayFactor = Math.max(0, 1 - (timeSinceLastSpeed / 10));
            speedToRecord = lastNonZeroSpeedValueRef.current * decayFactor;
          }
        }
        
        setDataPoints(prev => {
          const newPoints = [...prev, { timestamp: ts, speed: speedToRecord }];
          return newPoints.slice(-maxPoints);
        });
        lastUpdateRef.current = ts;
      }, 1000);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      // When not active, clear the interval but keep data
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isActive, maxPoints]);

  // Only reset data when a genuinely NEW upload starts (not on brief isActive flickers)
  // We detect a new upload by checking if isActive transitions from false to true
  // AND we haven't been active recently (> 5 seconds gap)
  const wasActiveRef = useRef(false);
  const lastActiveTimeRef = useRef(0);
  useEffect(() => {
    if (isActive) {
      if (!wasActiveRef.current) {
        // Transitioning to active — only reset if it's been a while since last active
        const timeSinceLastActive = Date.now() - lastActiveTimeRef.current;
        if (timeSinceLastActive > 5000 && !hasBeenActiveRef.current) {
          // Genuinely new upload session, reset data
          setDataPoints([]);
        }
        // If timeSinceLastActive <= 5000, this is likely a flicker — keep existing data
      }
      lastActiveTimeRef.current = Date.now();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  // Compute stats
  const stats = useMemo(() => {
    if (dataPoints.length === 0) {
      return { avg: 0, peak: 0, current: 0, min: 0 };
    }
    const speeds = dataPoints.map(d => d.speed).filter(s => s > 0);
    if (speeds.length === 0) {
      return { avg: 0, peak: 0, current: currentSpeed, min: 0 };
    }
    const sum = speeds.reduce((a, b) => a + b, 0);
    return {
      avg: sum / speeds.length,
      peak: Math.max(...speeds),
      current: currentSpeed,
      min: Math.min(...speeds),
    };
  }, [dataPoints, currentSpeed]);

  // Build chart data
  const chartData = useMemo(() => {
    const labels = dataPoints.map((_, i) => {
      const secsAgo = dataPoints.length - 1 - i;
      return secsAgo === 0 ? "now" : `-${secsAgo}s`;
    });

    const speeds = dataPoints.map(d => d.speed / (1024 * 1024)); // Convert to MB/s

    return {
      labels,
      datasets: [
        {
          label: "Speed (MB/s)",
          data: speeds,
          borderColor: "oklch(0.65 0.15 180)", // teal primary
          backgroundColor: "oklch(0.65 0.15 180 / 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 2,
        },
      ],
    };
  }, [dataPoints]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 300,
    },
    interaction: {
      intersect: false,
      mode: "index" as const,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleFont: { size: 11 },
        bodyFont: { size: 11 },
        callbacks: {
          label: (ctx: any) => {
            const mbps = ctx.raw as number;
            if (mbps < 0.001) return `${(mbps * 1024).toFixed(1)} KB/s`;
            return `${mbps.toFixed(2)} MB/s`;
          },
        },
      },
    },
    scales: {
      x: {
        display: !compact,
        grid: {
          display: false,
        },
        ticks: {
          maxTicksLimit: 6,
          font: { size: 9 },
          color: "oklch(0.65 0.01 240)",
        },
      },
      y: {
        display: true,
        beginAtZero: true,
        grid: {
          color: "oklch(0.25 0.01 240 / 0.3)",
        },
        ticks: {
          maxTicksLimit: compact ? 3 : 5,
          font: { size: 9 },
          color: "oklch(0.65 0.01 240)",
          callback: (value: any) => {
            if (value < 0.001) return `${(value * 1024).toFixed(0)} KB`;
            return `${Number(value).toFixed(1)} MB`;
          },
        },
      },
    },
  }), [compact]);

  // Don't render if no data and not active
  if (!isActive && dataPoints.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span>Speed</span>
          </div>
          <span className="text-xs font-mono font-medium text-primary">
            {formatSpeedValue(currentSpeed)}
          </span>
        </div>
        <div style={{ height: "60px" }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-border bg-card p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {label ? `Upload Speed — ${label}` : "Upload Speed"}
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-green-500 bg-green-500/10">
              LIVE
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {!isCollapsed && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</div>
              <div className="text-sm font-mono font-semibold text-primary">
                {formatSpeedShort(stats.current)}/s
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-0.5">
                <Gauge className="h-2.5 w-2.5" /> Avg
              </div>
              <div className="text-sm font-mono font-semibold">
                {formatSpeedShort(stats.avg)}/s
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-0.5">
                <TrendingUp className="h-2.5 w-2.5" /> Peak
              </div>
              <div className="text-sm font-mono font-semibold text-green-500">
                {formatSpeedShort(stats.peak)}/s
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-0.5">
                <TrendingDown className="h-2.5 w-2.5" /> Min
              </div>
              <div className="text-sm font-mono font-semibold text-amber-500">
                {formatSpeedShort(stats.min)}/s
              </div>
            </div>
          </div>

          {/* Chart */}
          <div style={{ height: "120px" }}>
            <Line data={chartData} options={chartOptions} />
          </div>

          {/* Data point count */}
          <div className="text-[10px] text-muted-foreground text-right mt-1">
            {dataPoints.length} samples · {dataPoints.length > 0 ? `${Math.round((Date.now() - dataPoints[0].timestamp) / 1000)}s window` : ""}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Hook to collect speed data from multiple upload sessions
 * and provide aggregated speed for the graph.
 * Uses recentSpeeds array as a fallback when instantaneous speed is 0
 * (which happens between chunk completions).
 */
export function useAggregatedUploadSpeed(
  sessions: Array<{ speed: number; status: string; recentSpeeds?: number[] }>
): { totalSpeed: number; isActive: boolean } {
  const totalSpeed = useMemo(() => {
    return sessions
      .filter(s => s.status === "active")
      .reduce((sum, s) => {
        // Use the session's current speed if available
        if (s.speed > 0) return sum + s.speed;
        // Fallback: use the average of recent chunk speeds if available
        // This provides a reasonable estimate between chunk completions
        if (s.recentSpeeds && s.recentSpeeds.length > 0) {
          const recentAvg = s.recentSpeeds.reduce((a, b) => a + b, 0) / s.recentSpeeds.length;
          return sum + recentAvg;
        }
        return sum;
      }, 0);
  }, [sessions]);

  const isActive = sessions.some(s => s.status === "active");

  return { totalSpeed, isActive };
}
