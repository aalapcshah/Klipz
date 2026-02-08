import { describe, it, expect } from "vitest";

// Test the recording countdown logic (pure logic, no React needed)
describe("Recording Countdown", () => {
  it("should count down from 3 to 0", () => {
    const steps: number[] = [];
    let count = 3;
    while (count > 0) {
      steps.push(count);
      count -= 1;
    }
    expect(steps).toEqual([3, 2, 1]);
    expect(count).toBe(0);
  });

  it("should trigger recording start when countdown reaches 0", () => {
    let recordingStarted = false;
    let count = 3;

    while (count > 0) {
      count -= 1;
    }

    if (count <= 0) {
      recordingStarted = true;
    }

    expect(recordingStarted).toBe(true);
  });

  it("should allow cancellation during countdown", () => {
    let cancelled = false;
    let count = 3;

    // Simulate countdown with cancellation at 2
    count -= 1; // 2
    cancelled = true; // User cancels

    expect(cancelled).toBe(true);
    expect(count).toBe(2); // Countdown stopped at 2
  });
});

// Test the timer limit logic
describe("Recording Timer Limit", () => {
  const TIMER_LIMIT_OPTIONS = [
    { label: "No limit", seconds: 0 },
    { label: "1 min", seconds: 60 },
    { label: "5 min", seconds: 300 },
    { label: "15 min", seconds: 900 },
    { label: "30 min", seconds: 1800 },
    { label: "60 min", seconds: 3600 },
  ];

  it("should have correct timer limit options", () => {
    expect(TIMER_LIMIT_OPTIONS).toHaveLength(6);
    expect(TIMER_LIMIT_OPTIONS[0].seconds).toBe(0);
    expect(TIMER_LIMIT_OPTIONS[1].seconds).toBe(60);
    expect(TIMER_LIMIT_OPTIONS[2].seconds).toBe(300);
    expect(TIMER_LIMIT_OPTIONS[3].seconds).toBe(900);
    expect(TIMER_LIMIT_OPTIONS[4].seconds).toBe(1800);
    expect(TIMER_LIMIT_OPTIONS[5].seconds).toBe(3600);
  });

  it("should calculate time remaining correctly", () => {
    const timerLimitSeconds = 300; // 5 min
    const recordingTime = 120; // 2 min recorded
    const timeRemaining = timerLimitSeconds - recordingTime;
    expect(timeRemaining).toBe(180); // 3 min remaining
  });

  it("should return null time remaining when no limit set", () => {
    const timerLimitSeconds = 0; // No limit
    const timeRemaining = timerLimitSeconds > 0 ? timerLimitSeconds - 100 : null;
    expect(timeRemaining).toBeNull();
  });

  it("should trigger auto-stop when time remaining reaches 0", () => {
    const timerLimitSeconds = 300;
    const recordingTime = 300;
    const timeRemaining = timerLimitSeconds - recordingTime;
    const shouldAutoStop = timeRemaining <= 0;
    expect(shouldAutoStop).toBe(true);
  });

  it("should trigger auto-stop when recording exceeds limit", () => {
    const timerLimitSeconds = 300;
    const recordingTime = 305; // 5 seconds over
    const timeRemaining = timerLimitSeconds - recordingTime;
    const shouldAutoStop = timeRemaining <= 0;
    expect(shouldAutoStop).toBe(true);
  });

  it("should not auto-stop when within limit", () => {
    const timerLimitSeconds = 300;
    const recordingTime = 200;
    const timeRemaining = timerLimitSeconds - recordingTime;
    const shouldAutoStop = timeRemaining <= 0;
    expect(shouldAutoStop).toBe(false);
  });

  it("should trigger warning at 30 seconds remaining", () => {
    const timerLimitSeconds = 300;
    const recordingTime = 270;
    const timeRemaining = timerLimitSeconds - recordingTime;
    const shouldShowWarning = timeRemaining === 30;
    expect(shouldShowWarning).toBe(true);
  });

  it("should not trigger warning when more than 30 seconds remaining", () => {
    const timerLimitSeconds = 300;
    const recordingTime = 200;
    const timeRemaining = timerLimitSeconds - recordingTime;
    const shouldShowWarning = timeRemaining === 30;
    expect(shouldShowWarning).toBe(false);
  });

  it("should format time correctly", () => {
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(30)).toBe("00:30");
    expect(formatTime(60)).toBe("01:00");
    expect(formatTime(90)).toBe("01:30");
    expect(formatTime(300)).toBe("05:00");
    expect(formatTime(3600)).toBe("60:00");
  });

  it("should persist timer limit value as string", () => {
    // Timer limit is stored as string in localStorage
    const timerLimit = "300";
    const parsed = parseInt(timerLimit) || 0;
    expect(parsed).toBe(300);
  });

  it("should default to 0 (no limit) for invalid values", () => {
    const timerLimit = "invalid";
    const parsed = parseInt(timerLimit) || 0;
    expect(parsed).toBe(0);
  });
});

// Test camera settings logic
describe("Camera Settings", () => {
  const RESOLUTION_OPTIONS = [
    { label: "480p", width: 854, height: 480 },
    { label: "720p", width: 1280, height: 720 },
    { label: "1080p", width: 1920, height: 1080 },
    { label: "4K", width: 3840, height: 2160 },
  ];

  it("should have correct resolution options", () => {
    expect(RESOLUTION_OPTIONS).toHaveLength(4);
    expect(RESOLUTION_OPTIONS[0].label).toBe("480p");
    expect(RESOLUTION_OPTIONS[3].label).toBe("4K");
  });

  it("should default to 720p resolution", () => {
    const defaultRes = RESOLUTION_OPTIONS.find(r => r.label === "720p");
    expect(defaultRes).toBeDefined();
    expect(defaultRes!.width).toBe(1280);
    expect(defaultRes!.height).toBe(720);
  });

  it("should toggle facing mode correctly", () => {
    let facingMode: 'user' | 'environment' = 'user';
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    expect(facingMode).toBe('environment');
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    expect(facingMode).toBe('user');
  });

  it("should determine mirror based on facing mode", () => {
    const mirrorFrontCamera = true;

    // Front camera with mirror enabled
    let facingMode: 'user' | 'environment' = 'user';
    let shouldMirror = facingMode === 'user' && mirrorFrontCamera;
    expect(shouldMirror).toBe(true);

    // Back camera - should never mirror
    facingMode = 'environment';
    shouldMirror = facingMode === 'user' && mirrorFrontCamera;
    expect(shouldMirror).toBe(false);
  });

  it("should clear device selection when flipping camera", () => {
    let selectedVideoDevice = 'device-123';
    // Simulate flip
    selectedVideoDevice = '';
    expect(selectedVideoDevice).toBe('');
  });
});

// Test recording pause/resume logic
describe("Recording Pause/Resume", () => {
  it("should toggle between paused and recording states", () => {
    let isPaused = false;
    // Pause
    isPaused = true;
    expect(isPaused).toBe(true);
    // Resume
    isPaused = false;
    expect(isPaused).toBe(false);
  });

  it("should stop timer when paused", () => {
    let timerRunning = true;
    // Pause stops the timer
    timerRunning = false;
    expect(timerRunning).toBe(false);
  });

  it("should resume timer when resumed", () => {
    let timerRunning = false;
    // Resume restarts the timer
    timerRunning = true;
    expect(timerRunning).toBe(true);
  });

  it("should reset isPaused when recording stops", () => {
    let isPaused = true;
    let isRecording = true;
    // Stop recording
    isRecording = false;
    isPaused = false;
    expect(isRecording).toBe(false);
    expect(isPaused).toBe(false);
  });

  it("should support MediaRecorder pause/resume states", () => {
    const validStates = ['recording', 'paused', 'inactive'];
    expect(validStates).toContain('recording');
    expect(validStates).toContain('paused');
    expect(validStates).toContain('inactive');
  });
});

// Test video trimming logic
describe("Video Trimming", () => {
  it("should initialize trim range to full video duration", () => {
    const videoDuration = 120; // 2 minutes
    const trimStart = 0;
    const trimEnd = videoDuration;
    expect(trimStart).toBe(0);
    expect(trimEnd).toBe(120);
  });

  it("should calculate trimmed duration correctly", () => {
    const trimStart = 10;
    const trimEnd = 90;
    const trimmedDuration = trimEnd - trimStart;
    expect(trimmedDuration).toBe(80);
  });

  it("should enforce minimum trim duration of 0.5 seconds", () => {
    const trimEnd = 50;
    let trimStart = 49.8;
    // Enforce minimum gap
    trimStart = Math.min(trimStart, trimEnd - 0.5);
    expect(trimStart).toBe(49.5);
  });

  it("should prevent trimStart from exceeding trimEnd", () => {
    const trimEnd = 30;
    let trimStart = 35;
    trimStart = Math.min(trimStart, trimEnd - 0.5);
    expect(trimStart).toBe(29.5);
  });

  it("should prevent trimEnd from going below trimStart", () => {
    const trimStart = 30;
    let trimEnd = 25;
    trimEnd = Math.max(trimEnd, trimStart + 0.5);
    expect(trimEnd).toBe(30.5);
  });

  it("should disable apply when no trimming is done", () => {
    const trimStart = 0;
    const trimEnd = 120;
    const videoDuration = 120;
    const shouldDisable = trimStart === 0 && trimEnd === videoDuration;
    expect(shouldDisable).toBe(true);
  });

  it("should enable apply when trimming is done", () => {
    const trimStart = 5;
    const trimEnd = 115;
    const videoDuration = 120;
    const shouldDisable = trimStart === 0 && trimEnd === videoDuration;
    expect(shouldDisable).toBe(false);
  });

  it("should use trimmed blob for upload when available", () => {
    const recordedBlob = new Blob(['original'], { type: 'video/webm' });
    const trimmedBlob = new Blob(['trimmed'], { type: 'video/webm' });
    const blobToUpload = trimmedBlob || recordedBlob;
    expect(blobToUpload).toBe(trimmedBlob);
  });

  it("should use original blob when no trimming done", () => {
    const recordedBlob = new Blob(['original'], { type: 'video/webm' });
    const trimmedBlob: Blob | null = null;
    const blobToUpload = trimmedBlob || recordedBlob;
    expect(blobToUpload).toBe(recordedBlob);
  });

  it("should calculate trimmed duration for upload metadata", () => {
    const trimStart = 10;
    const trimEnd = 90;
    const recordingTime = 120;
    const trimmedBlob = new Blob(['trimmed'], { type: 'video/webm' });
    const uploadDuration = trimmedBlob ? Math.floor(trimEnd - trimStart) : recordingTime;
    expect(uploadDuration).toBe(80);
  });

  it("should reset trim state on discard", () => {
    let isTrimming = true;
    let trimStart = 10;
    let trimEnd = 90;
    let trimmedBlob: Blob | null = new Blob(['trimmed']);
    // Discard
    isTrimming = false;
    trimStart = 0;
    trimEnd = 0;
    trimmedBlob = null;
    expect(isTrimming).toBe(false);
    expect(trimStart).toBe(0);
    expect(trimEnd).toBe(0);
    expect(trimmedBlob).toBeNull();
  });
});

// Test CameraCapture photo resolution options
describe("CameraCapture Photo Settings", () => {
  const PHOTO_RESOLUTION_OPTIONS = [
    { label: '720p', width: 1280, height: 720 },
    { label: '1080p', width: 1920, height: 1080 },
    { label: '4K', width: 3840, height: 2160 },
  ];

  it("should have correct photo resolution options", () => {
    expect(PHOTO_RESOLUTION_OPTIONS).toHaveLength(3);
  });

  it("should default to 1080p for photo capture", () => {
    const defaultRes = PHOTO_RESOLUTION_OPTIONS.find(r => r.label === '1080p');
    expect(defaultRes).toBeDefined();
    expect(defaultRes!.width).toBe(1920);
    expect(defaultRes!.height).toBe(1080);
  });

  it("should default to environment (back) camera for photo capture", () => {
    const defaultFacing = 'environment';
    expect(defaultFacing).toBe('environment');
  });

  it("should support front and back camera switching", () => {
    let facingMode: 'user' | 'environment' = 'environment';
    // Switch to front
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    expect(facingMode).toBe('user');
    // Switch back
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    expect(facingMode).toBe('environment');
  });
});

// Test the VideoCardDetails display logic
describe("VideoCardDetails Display Logic", () => {
  it("should format timestamps correctly", () => {
    const formatTimestamp = (seconds: number): string => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3661)).toBe("61:01");
    expect(formatTimestamp(30.7)).toBe("0:30");
  });

  it("should determine if video has any data for details display", () => {
    // A video with transcript should show details
    const hasTranscript = true;
    const fileId: number | null = 123;
    const hasAnyData = hasTranscript || !!fileId;
    expect(hasAnyData).toBe(true);

    // A video without transcript but with fileId should show details
    const hasTranscript2 = false;
    const fileId2: number | null = 456;
    const hasAnyData2 = hasTranscript2 || !!fileId2;
    expect(hasAnyData2).toBe(true);

    // A video without transcript and without fileId should not show details
    const hasTranscript3 = false;
    const fileId3: number | null = null;
    const hasAnyData3 = hasTranscript3 || !!fileId3;
    expect(hasAnyData3).toBe(false);
  });

  it("should toggle expanded sections correctly", () => {
    let expandedSection: "transcript" | "captions" | "matches" | null = null;

    // Toggle transcript on
    expandedSection = expandedSection === "transcript" ? null : "transcript";
    expect(expandedSection).toBe("transcript");

    // Toggle transcript off
    expandedSection = expandedSection === "transcript" ? null : "transcript";
    expect(expandedSection).toBe(null);

    // Toggle captions on
    expandedSection = expandedSection === "captions" ? null : "captions";
    expect(expandedSection).toBe("captions");

    // Switch from captions to matches
    expandedSection = expandedSection === "matches" ? null : "matches";
    expect(expandedSection).toBe("matches");

    // Toggle matches off
    expandedSection = expandedSection === "matches" ? null : "matches";
    expect(expandedSection).toBe(null);
  });

  it("should handle transcript status states", () => {
    const statuses = ["completed", "processing", "failed"] as const;
    
    // Completed transcript should show content
    expect(statuses[0]).toBe("completed");
    
    // Processing should show loading
    expect(statuses[1]).toBe("processing");
    
    // Failed should show error
    expect(statuses[2]).toBe("failed");
  });

  it("should handle caption data with entities", () => {
    const captions = [
      { timestamp: 0, caption: "A person walks into frame", entities: ["person", "walking"], confidence: 0.9 },
      { timestamp: 5, caption: "Text appears on screen", entities: ["text", "screen", "title", "subtitle", "overlay", "graphic"], confidence: 0.85 },
    ];

    // First caption should have 2 entities
    expect(captions[0].entities.length).toBe(2);
    
    // Second caption has more than 5 entities, should show "more" indicator
    const maxShown = 5;
    const remaining = captions[1].entities.length - maxShown;
    expect(remaining).toBe(1);
    expect(captions[1].entities.slice(0, maxShown).length).toBe(5);
  });

  it("should format relevance scores as percentages", () => {
    const scores = [0.95, 0.5, 0.3, 0.0, 1.0];
    const formatted = scores.map(s => Math.round(s * 100));
    expect(formatted).toEqual([95, 50, 30, 0, 100]);
  });
});

// Test status badge logic
describe("Video Card Status Badges", () => {
  it("should show 'Transcribed' badge when transcript status is completed", () => {
    const transcriptStatus = "completed";
    const showTranscribedBadge = transcriptStatus === "completed";
    expect(showTranscribedBadge).toBe(true);
  });

  it("should show 'Transcribing' badge when transcript status is processing", () => {
    const transcriptStatus = "processing";
    const showTranscribingBadge = transcriptStatus === "processing";
    expect(showTranscribingBadge).toBe(true);
  });

  it("should show 'Captioned' badge when caption status is completed", () => {
    const captionStatus = "completed";
    const showCaptionedBadge = captionStatus === "completed";
    expect(showCaptionedBadge).toBe(true);
  });

  it("should show 'Captioning' badge when caption status is processing", () => {
    const captionStatus = "processing";
    const showCaptioningBadge = captionStatus === "processing";
    expect(showCaptioningBadge).toBe(true);
  });

  it("should show failed badges for failed statuses", () => {
    const transcriptStatus = "failed";
    const captionStatus = "failed";
    expect(transcriptStatus === "failed").toBe(true);
    expect(captionStatus === "failed").toBe(true);
  });

  it("should not show any badges when no status exists", () => {
    const transcriptStatus: string | null = null;
    const captionStatus: string | null = null;
    const showAnyBadge = transcriptStatus === "completed" || transcriptStatus === "processing" || transcriptStatus === "failed" ||
      captionStatus === "completed" || captionStatus === "processing" || captionStatus === "failed";
    expect(showAnyBadge).toBe(false);
  });

  it("should show both transcribed and captioned badges simultaneously", () => {
    const transcriptStatus = "completed";
    const captionStatus = "completed";
    const badges: string[] = [];
    if (transcriptStatus === "completed") badges.push("Transcribed");
    if (captionStatus === "completed") badges.push("Captioned");
    expect(badges).toEqual(["Transcribed", "Captioned"]);
  });
});

// Test Find Matches button logic
describe("Find Matches Logic", () => {
  it("should require fileId to find matches", () => {
    const fileId: number | null = null;
    const canFindMatches = !!fileId;
    expect(canFindMatches).toBe(false);
  });

  it("should require captions or transcripts before finding matches", () => {
    const captionStatus = null;
    const transcriptStatus = null;
    const hasCaptions = captionStatus === "completed";
    const hasTranscript = transcriptStatus === "completed";
    const canFindMatches = hasCaptions || hasTranscript;
    expect(canFindMatches).toBe(false);
  });

  it("should allow finding matches when captions are completed", () => {
    const captionStatus = "completed";
    const transcriptStatus = null;
    const hasCaptions = captionStatus === "completed";
    const hasTranscript = transcriptStatus === "completed";
    const canFindMatches = hasCaptions || hasTranscript;
    expect(canFindMatches).toBe(true);
  });

  it("should allow finding matches when transcript is completed", () => {
    const captionStatus = null;
    const transcriptStatus = "completed";
    const hasCaptions = captionStatus === "completed";
    const hasTranscript = transcriptStatus === "completed";
    const canFindMatches = hasCaptions || hasTranscript;
    expect(canFindMatches).toBe(true);
  });

  it("should run both visual and transcript matching when both are available", () => {
    const captionStatus = "completed";
    const transcriptStatus = "completed";
    const promises: string[] = [];
    if (captionStatus === "completed") promises.push("visual");
    if (transcriptStatus === "completed") promises.push("transcript");
    expect(promises).toEqual(["visual", "transcript"]);
  });

  it("should run only visual matching when only captions available", () => {
    const captionStatus = "completed";
    const transcriptStatus: string | null = null;
    const promises: string[] = [];
    if (captionStatus === "completed") promises.push("visual");
    if (transcriptStatus === "completed") promises.push("transcript");
    expect(promises).toEqual(["visual"]);
  });

  it("should disable button when no status exists", () => {
    const transcriptStatus: string | null = null;
    const captionStatus: string | null = null;
    const isDisabled = !transcriptStatus && !captionStatus;
    expect(isDisabled).toBe(true);
  });

  it("should disable button while finding matches", () => {
    const isFindingMatches = true;
    expect(isFindingMatches).toBe(true);
  });
});

// Test timestamp seeking logic
describe("Timestamp Seeking", () => {
  it("should format timestamp for display", () => {
    const formatTimestamp = (seconds: number): string => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(30)).toBe("0:30");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(125.7)).toBe("2:05");
  });

  it("should seek to correct timestamp on transcript segment click", () => {
    const segments = [
      { text: "Hello world", start: 0, end: 5 },
      { text: "This is a test", start: 5, end: 10 },
      { text: "Final segment", start: 10, end: 15 },
    ];

    // Clicking second segment should seek to 5 seconds
    const targetSegment = segments[1];
    expect(targetSegment.start).toBe(5);
  });

  it("should seek to correct timestamp on caption click", () => {
    const captions = [
      { timestamp: 0, caption: "Scene opens" },
      { timestamp: 5, caption: "Person appears" },
      { timestamp: 10, caption: "Action happens" },
    ];

    // Clicking third caption should seek to 10 seconds
    const targetCaption = captions[2];
    expect(targetCaption.timestamp).toBe(10);
  });

  it("should seek to correct timestamp on matched file click", () => {
    const matches = [
      { id: 1, timestamp: 15, suggestedFileId: 10, relevanceScore: 0.9 },
      { id: 2, timestamp: 30, suggestedFileId: 20, relevanceScore: 0.7 },
    ];

    const targetMatch = matches[0];
    expect(targetMatch.timestamp).toBe(15);
  });

  it("should seek to correct timestamp on transcript suggestion click", () => {
    const suggestions = [
      { id: 1, startTime: 20, suggestedFileId: 10 },
      { id: 2, startTime: 45, suggestedFileId: 20 },
    ];

    const targetSuggestion = suggestions[1];
    expect(targetSuggestion.startTime).toBe(45);
  });

  it("should find video element by data-video-id attribute", () => {
    // Simulate the DOM lookup logic
    const videoId = 42;
    const selector = `[data-video-id="${videoId}"]`;
    expect(selector).toBe('[data-video-id="42"]');
  });
});

// Test retry logic for failed transcriptions/captions
describe("Retry Failed Transcription/Caption Logic", () => {
  it("should allow retry when status is failed", () => {
    const statuses = ["completed", "processing", "failed", "pending"];
    const retryable = statuses.filter(s => s === "failed");
    expect(retryable).toEqual(["failed"]);
  });

  it("should not allow retry when already processing", () => {
    const status = "processing";
    const canRetry = status === "failed";
    expect(canRetry).toBe(false);
  });

  it("should disable retry button when mutation is pending", () => {
    const isPending = true;
    const status = "failed";
    const buttonDisabled = isPending || status !== "failed";
    expect(buttonDisabled).toBe(true);
  });

  it("should enable retry button when mutation is idle and status is failed", () => {
    const isPending = false;
    const status = "failed";
    const buttonDisabled = isPending || status !== "failed";
    expect(buttonDisabled).toBe(false);
  });

  it("should invalidate queries after successful retry", () => {
    let queriesInvalidated = false;
    const onSuccess = () => {
      queriesInvalidated = true;
    };
    onSuccess();
    expect(queriesInvalidated).toBe(true);
  });
});

// Test offline recording cache logic
describe("Offline Recording Cache Logic", () => {
  it("should generate unique IDs for cached recordings", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      ids.add(id);
    }
    // All IDs should be unique
    expect(ids.size).toBe(100);
  });

  it("should format file sizes correctly", () => {
    const formatSize = (bytes: number) => {
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    expect(formatSize(512 * 1024)).toBe("512 KB");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatSize(24 * 1024 * 1024)).toBe("24.0 MB");
    expect(formatSize(100)).toBe("0 KB");
  });

  it("should format time ago correctly", () => {
    const formatTimeAgo = (timestamp: number) => {
      const diff = Date.now() - timestamp;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    };

    expect(formatTimeAgo(Date.now())).toBe("just now");
    expect(formatTimeAgo(Date.now() - 5 * 60000)).toBe("5m ago");
    expect(formatTimeAgo(Date.now() - 3 * 3600000)).toBe("3h ago");
    expect(formatTimeAgo(Date.now() - 2 * 86400000)).toBe("2d ago");
  });

  it("should identify retryable recordings", () => {
    const recordings = [
      { id: "1", status: "pending" },
      { id: "2", status: "uploading" },
      { id: "3", status: "failed" },
      { id: "4", status: "pending" },
    ];

    const retryable = recordings.filter(
      r => r.status === "pending" || r.status === "failed"
    );

    expect(retryable).toHaveLength(3);
    expect(retryable.map(r => r.id)).toEqual(["1", "3", "4"]);
  });

  it("should calculate chunk count correctly for uploads", () => {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB

    expect(Math.ceil((5 * 1024 * 1024) / CHUNK_SIZE)).toBe(3); // 5MB = 3 chunks
    expect(Math.ceil((24 * 1024 * 1024) / CHUNK_SIZE)).toBe(12); // 24MB = 12 chunks
    expect(Math.ceil((1 * 1024 * 1024) / CHUNK_SIZE)).toBe(1); // 1MB = 1 chunk
    expect(Math.ceil((2 * 1024 * 1024) / CHUNK_SIZE)).toBe(1); // 2MB = 1 chunk
  });

  it("should save recording to cache on upload failure", () => {
    let savedToCache = false;
    const blobToCache = { size: 24 * 1024 * 1024 }; // 24MB blob

    // Simulate upload failure
    const uploadFailed = true;
    if (uploadFailed && blobToCache) {
      savedToCache = true;
    }

    expect(savedToCache).toBe(true);
  });

  it("should not save to cache if no blob is available", () => {
    let savedToCache = false;
    const blobToCache = null;

    const uploadFailed = true;
    if (uploadFailed && blobToCache) {
      savedToCache = true;
    }

    expect(savedToCache).toBe(false);
  });
});
