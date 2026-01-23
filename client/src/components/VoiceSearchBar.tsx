import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, MicOff, Loader2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface VoiceSearchBarProps {
  onSearch: (results: any[]) => void;
  placeholder?: string;
}

export function VoiceSearchBar({ onSearch, placeholder = "Search files..." }: VoiceSearchBarProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert("Microphone access denied. Please enable microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsTranscribing(true);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      // Convert blob to base64 data URL
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        // Simulate transcription for demo
        // In production, call transcribeAudio API with uploaded audio URL
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Simulated transcription result
        const transcribedText = "beach photos from last summer";
        
        setSearchQuery(transcribedText);
        setIsTranscribing(false);
        
        // Automatically trigger semantic search
        await performSearch(transcribedText);
      };
    } catch (error) {
      console.error("Transcription failed:", error);
      setIsTranscribing(false);
      alert("Failed to transcribe audio. Please try again.");
    }
  };

  const searchMutation = trpc.semanticSearch.search.useQuery(
    { query: searchQuery },
    { enabled: false }
  );

  const performSearch = async (query: string) => {
    try {
      // Use fetch to call the API directly
      const response = await fetch(`/api/trpc/semanticSearch.search?input=${encodeURIComponent(JSON.stringify({ query }))}`);
      const data = await response.json();
      onSearch(data.result.data.results);
    } catch (error) {
      console.error("Search failed:", error);
      alert("Search failed. Please try again.");
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="pl-10 pr-4"
        />
      </div>
      
      <Button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isTranscribing}
        variant={isRecording ? "destructive" : "outline"}
        size="icon"
        className="flex-shrink-0"
      >
        {isTranscribing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      
      <Button onClick={handleSearch} disabled={!searchQuery.trim()}>
        Search
      </Button>
    </div>
  );
}
