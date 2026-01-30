import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";

// Freesound API base URL
const FREESOUND_API_URL = "https://freesound.org/apiv2";

interface FreesoundSound {
  id: number;
  name: string;
  tags: string[];
  description: string;
  duration: number;
  previews: {
    "preview-hq-mp3": string;
    "preview-lq-mp3": string;
    "preview-hq-ogg": string;
    "preview-lq-ogg": string;
  };
  username: string;
  license: string;
  avg_rating: number;
  num_ratings: number;
  num_downloads: number;
}

interface FreesoundSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FreesoundSound[];
}

// Music track interface for frontend
export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  duration: number; // in seconds
  genre: string;
  mood: string;
  previewUrl: string;
  license: string;
  rating: number;
  downloads: number;
}

// Curated music categories with search terms
const MUSIC_CATEGORIES = {
  corporate: { query: "corporate upbeat background", mood: "Energetic" },
  ambient: { query: "ambient calm relaxing", mood: "Calm" },
  cinematic: { query: "cinematic epic orchestral", mood: "Dramatic" },
  lofi: { query: "lofi chill beats", mood: "Relaxed" },
  electronic: { query: "electronic modern synth", mood: "Modern" },
  acoustic: { query: "acoustic guitar warm", mood: "Warm" },
  jazz: { query: "jazz smooth piano", mood: "Sophisticated" },
  inspiring: { query: "inspiring piano uplifting", mood: "Uplifting" },
  nature: { query: "nature sounds birds water", mood: "Peaceful" },
  happy: { query: "happy cheerful positive", mood: "Joyful" },
};

export const musicLibraryRouter = router({
  // Search for music tracks
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        category: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(15),
      })
    )
    .query(async ({ input }) => {
      const { query, category, page, pageSize } = input;
      
      // Get API key from environment or use demo mode
      const apiKey = process.env.FREESOUND_API_KEY;
      
      // If no API key, return curated preset list
      if (!apiKey) {
        return getCuratedPresets(category);
      }
      
      try {
        // Build search query
        let searchQuery = query || "";
        let mood = "Various";
        
        if (category && MUSIC_CATEGORIES[category as keyof typeof MUSIC_CATEGORIES]) {
          const cat = MUSIC_CATEGORIES[category as keyof typeof MUSIC_CATEGORIES];
          searchQuery = searchQuery || cat.query;
          mood = cat.mood;
        }
        
        // Search Freesound API
        const params = new URLSearchParams({
          query: searchQuery || "background music",
          token: apiKey,
          page: page.toString(),
          page_size: pageSize.toString(),
          fields: "id,name,tags,description,duration,previews,username,license,avg_rating,num_ratings,num_downloads",
          filter: "duration:[30 TO 300]", // 30 seconds to 5 minutes
          sort: "rating_desc",
        });
        
        const response = await fetch(`${FREESOUND_API_URL}/search/text/?${params}`);
        
        if (!response.ok) {
          console.error("Freesound API error:", response.status, response.statusText);
          return getCuratedPresets(category);
        }
        
        const data: FreesoundSearchResponse = await response.json();
        
        // Transform to our format
        const tracks: MusicTrack[] = data.results.map((sound) => ({
          id: `freesound-${sound.id}`,
          name: sound.name.replace(/_/g, " ").replace(/\.[^/.]+$/, ""), // Clean up name
          artist: sound.username,
          duration: Math.round(sound.duration),
          genre: inferGenre(sound.tags),
          mood: mood,
          previewUrl: sound.previews["preview-hq-mp3"] || sound.previews["preview-lq-mp3"],
          license: sound.license,
          rating: sound.avg_rating,
          downloads: sound.num_downloads,
        }));
        
        return {
          tracks,
          total: data.count,
          page,
          pageSize,
          hasMore: data.next !== null,
        };
      } catch (error) {
        console.error("Error fetching from Freesound:", error);
        return getCuratedPresets(category);
      }
    }),

  // Get music categories
  getCategories: publicProcedure.query(() => {
    return Object.entries(MUSIC_CATEGORIES).map(([id, { mood }]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      mood,
    }));
  }),

  // Get a specific track by ID
  getTrack: protectedProcedure
    .input(z.object({ trackId: z.string() }))
    .query(async ({ input }) => {
      const { trackId } = input;
      
      // Check if it's a Freesound track
      if (trackId.startsWith("freesound-")) {
        const soundId = trackId.replace("freesound-", "");
        const apiKey = process.env.FREESOUND_API_KEY;
        
        if (!apiKey) {
          return null;
        }
        
        try {
          const response = await fetch(
            `${FREESOUND_API_URL}/sounds/${soundId}/?token=${apiKey}&fields=id,name,tags,description,duration,previews,username,license,avg_rating,num_downloads`
          );
          
          if (!response.ok) {
            return null;
          }
          
          const sound: FreesoundSound = await response.json();
          
          return {
            id: `freesound-${sound.id}`,
            name: sound.name.replace(/_/g, " ").replace(/\.[^/.]+$/, ""),
            artist: sound.username,
            duration: Math.round(sound.duration),
            genre: inferGenre(sound.tags),
            mood: "Various",
            previewUrl: sound.previews["preview-hq-mp3"] || sound.previews["preview-lq-mp3"],
            license: sound.license,
            rating: sound.avg_rating,
            downloads: sound.num_downloads,
          } as MusicTrack;
        } catch (error) {
          console.error("Error fetching track:", error);
          return null;
        }
      }
      
      // Check curated presets
      const preset = CURATED_PRESETS.find((p) => p.id === trackId);
      return preset || null;
    }),
});

// Helper function to infer genre from tags
function inferGenre(tags: string[]): string {
  const genreMap: Record<string, string[]> = {
    Electronic: ["electronic", "synth", "edm", "techno", "house"],
    Ambient: ["ambient", "atmospheric", "drone", "soundscape"],
    Corporate: ["corporate", "business", "professional", "presentation"],
    Cinematic: ["cinematic", "film", "movie", "epic", "orchestral"],
    "Lo-Fi": ["lofi", "lo-fi", "chill", "chillhop"],
    Acoustic: ["acoustic", "guitar", "folk", "unplugged"],
    Jazz: ["jazz", "smooth", "swing", "bebop"],
    Piano: ["piano", "keys", "keyboard"],
    Rock: ["rock", "guitar", "band"],
    Pop: ["pop", "catchy", "upbeat"],
    Classical: ["classical", "orchestra", "symphony"],
    Nature: ["nature", "birds", "water", "forest"],
  };
  
  const lowercaseTags = tags.map((t) => t.toLowerCase());
  
  for (const [genre, keywords] of Object.entries(genreMap)) {
    if (keywords.some((kw) => lowercaseTags.some((tag) => tag.includes(kw)))) {
      return genre;
    }
  }
  
  return "Background";
}

// Curated presets for when API is not available
const CURATED_PRESETS: MusicTrack[] = [
  {
    id: "preset-upbeat",
    name: "Upbeat Corporate",
    artist: "MetaClips Library",
    duration: 150,
    genre: "Corporate",
    mood: "Energetic",
    previewUrl: "",
    license: "Royalty-Free",
    rating: 4.5,
    downloads: 1000,
  },
  {
    id: "preset-ambient",
    name: "Ambient Dreams",
    artist: "MetaClips Library",
    duration: 195,
    genre: "Ambient",
    mood: "Calm",
    previewUrl: "",
    license: "Royalty-Free",
    rating: 4.3,
    downloads: 850,
  },
  {
    id: "preset-cinematic",
    name: "Epic Cinematic",
    artist: "MetaClips Library",
    duration: 165,
    genre: "Cinematic",
    mood: "Dramatic",
    previewUrl: "",
    license: "Royalty-Free",
    rating: 4.7,
    downloads: 1200,
  },
  {
    id: "preset-lofi",
    name: "Lo-Fi Chill",
    artist: "MetaClips Library",
    duration: 180,
    genre: "Lo-Fi",
    mood: "Relaxed",
    previewUrl: "",
    license: "Royalty-Free",
    rating: 4.4,
    downloads: 950,
  },
  {
    id: "preset-electronic",
    name: "Electronic Pulse",
    artist: "MetaClips Library",
    duration: 140,
    genre: "Electronic",
    mood: "Modern",
    previewUrl: "",
    license: "Royalty-Free",
    rating: 4.2,
    downloads: 780,
  },
  {
    id: "preset-acoustic",
    name: "Acoustic Morning",
    artist: "MetaClips Library",
    duration: 170,
    genre: "Acoustic",
    mood: "Warm",
    previewUrl: "",
    license: "Royalty-Free",
    rating: 4.6,
    downloads: 1100,
  },
  {
    id: "preset-jazz",
    name: "Smooth Jazz",
    artist: "MetaClips Library",
    duration: 210,
    genre: "Jazz",
    mood: "Sophisticated",
    previewUrl: "",
    license: "Royalty-Free",
    rating: 4.5,
    downloads: 920,
  },
  {
    id: "preset-inspiring",
    name: "Inspiring Piano",
    artist: "MetaClips Library",
    duration: 135,
    genre: "Piano",
    mood: "Uplifting",
    previewUrl: "",
    license: "Royalty-Free",
    rating: 4.8,
    downloads: 1350,
  },
];

function getCuratedPresets(category?: string) {
  let tracks = [...CURATED_PRESETS];
  
  if (category) {
    const categoryMood = MUSIC_CATEGORIES[category as keyof typeof MUSIC_CATEGORIES]?.mood;
    if (categoryMood) {
      tracks = tracks.filter((t) => t.mood === categoryMood || t.genre.toLowerCase() === category);
    }
  }
  
  return {
    tracks,
    total: tracks.length,
    page: 1,
    pageSize: tracks.length,
    hasMore: false,
  };
}

export default musicLibraryRouter;
