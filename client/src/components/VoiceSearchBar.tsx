import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, MicOff, Loader2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface VoiceSearchBarProps {
  onSearch: (results: any[]) => void;
  placeholder?: string;
}

export function VoiceSearchBar({ onSearch, placeholder = "Search files..." }: VoiceSearchBarProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Get files list for fallback search
  const { data: filesData } = trpc.files.list.useQuery({ page: 1, pageSize: 200 });

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
      toast.error("Microphone access denied. Please enable microphone permissions.");
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
      toast.error("Failed to transcribe audio. Please try again.");
    }
  };

  // Simple client-side text search as fallback
  const performLocalSearch = (query: string) => {
    const allFiles = filesData?.files || [];
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 1);
    
    const filteredFiles = allFiles.filter((file: any) => {
      const searchableText = [
        file.title || '',
        file.description || '',
        file.filename || '',
        file.aiAnalysis || '',
        ...(file.tags?.map((t: any) => t.name) || [])
      ].join(' ').toLowerCase();
      
      // Check if any search term matches
      return queryTerms.some(term => searchableText.includes(term));
    });
    
    // Sort by relevance (number of matching terms)
    filteredFiles.sort((a: any, b: any) => {
      const aText = [a.title, a.description, a.filename, a.aiAnalysis].join(' ').toLowerCase();
      const bText = [b.title, b.description, b.filename, b.aiAnalysis].join(' ').toLowerCase();
      const aMatches = queryTerms.filter(t => aText.includes(t)).length;
      const bMatches = queryTerms.filter(t => bText.includes(t)).length;
      return bMatches - aMatches;
    });
    
    return filteredFiles;
  };

  const performSearch = async (query: string) => {
    setIsSearching(true);
    
    try {
      // Try semantic search first via API
      const response = await fetch(`/api/trpc/semanticSearch.search?input=${encodeURIComponent(JSON.stringify({ query }))}`);
      const data = await response.json();
      
      // Check for API errors or empty results
      if (data.error || !data.result?.data?.results) {
        console.log("Semantic search unavailable, using local search");
        const localResults = performLocalSearch(query);
        onSearch(localResults);
        if (localResults.length === 0) {
          toast.info("No files found matching your search");
        } else {
          toast.success(`Found ${localResults.length} file(s)`);
        }
        return;
      }
      
      const results = data.result.data.results || [];
      onSearch(results);
      
      if (results.length === 0) {
        // Try local search as backup
        const localResults = performLocalSearch(query);
        if (localResults.length > 0) {
          onSearch(localResults);
          toast.success(`Found ${localResults.length} file(s)`);
        } else {
          toast.info("No files found matching your search");
        }
      } else {
        toast.success(`Found ${results.length} file(s)`);
      }
    } catch (error) {
      console.error("Search error:", error);
      
      // Fall back to local search
      const localResults = performLocalSearch(query);
      onSearch(localResults);
      
      if (localResults.length === 0) {
        toast.info("No files found matching your search");
      } else {
        toast.success(`Found ${localResults.length} file(s)`);
      }
    } finally {
      setIsSearching(false);
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
          disabled={isSearching}
        />
      </div>
      
      <Button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isTranscribing || isSearching}
        variant={isRecording ? "destructive" : "outline"}
        size="icon"
        className="flex-shrink-0"
      >
        {isTranscribing || isSearching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      
      <Button 
        onClick={handleSearch} 
        disabled={!searchQuery.trim() || isSearching} 
        className="hidden md:flex"
        size="sm"
      >
        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
      </Button>
    </div>
  );
}
