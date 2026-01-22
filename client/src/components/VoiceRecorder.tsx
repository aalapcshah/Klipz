import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Pause, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { requestMicrophonePermission } from "@/lib/permissions";

interface VoiceRecorderProps {
  onSave: (audioBlob: Blob, duration: number) => void;
  onCancel?: () => void;
  maxDuration?: number; // in seconds
}

export function VoiceRecorder({ onSave, onCancel, maxDuration = 300 }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const permission = await requestMicrophonePermission();
      if (!permission.granted) {
        toast.error("Microphone permission denied");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          const newDuration = prev + 1;
          if (newDuration >= maxDuration) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);
    } catch (error) {
      toast.error("Failed to start recording");
      console.error(error);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playAudio = () => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const deleteRecording = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setDuration(0);
    setIsPlaying(false);
  };

  const handleSave = () => {
    if (audioBlob) {
      onSave(audioBlob, duration);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
        <div className="flex items-center gap-3">
          {!isRecording && !audioBlob && (
            <Button onClick={startRecording} size="sm" className="gap-2">
              <Mic className="h-4 w-4" />
              Start Recording
            </Button>
          )}

          {isRecording && !isPaused && (
            <>
              <Button onClick={pauseRecording} size="sm" variant="outline" className="gap-2">
                <Pause className="h-4 w-4" />
                Pause
              </Button>
              <Button onClick={stopRecording} size="sm" variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Stop
              </Button>
            </>
          )}

          {isRecording && isPaused && (
            <>
              <Button onClick={resumeRecording} size="sm" className="gap-2">
                <Mic className="h-4 w-4" />
                Resume
              </Button>
              <Button onClick={stopRecording} size="sm" variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Stop
              </Button>
            </>
          )}

          {audioBlob && !isRecording && (
            <>
              {!isPlaying ? (
                <Button onClick={playAudio} size="sm" variant="outline" className="gap-2">
                  <Play className="h-4 w-4" />
                  Play
                </Button>
              ) : (
                <Button onClick={pauseAudio} size="sm" variant="outline" className="gap-2">
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
              )}
              <Button onClick={deleteRecording} size="sm" variant="ghost" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm font-mono text-muted-foreground">
            {formatTime(duration)}
            {maxDuration && ` / ${formatTime(maxDuration)}`}
          </span>
          {isRecording && (
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </div>
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {audioBlob && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            Save Voice Note
          </Button>
        </div>
      )}
    </div>
  );
}
