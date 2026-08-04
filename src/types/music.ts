export interface AudioFeatures {
  energy: number;       // 0 to 100
  danceability: number; // 0 to 100
  valence: number;      // 0 to 100
  acousticness: number; // 0 to 100
  underground: number;  // 0 to 100
  bpm: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: number;
  genre: string;
  coverUrl: string;
  previewUrl?: string;
  preview_url?: string;
  features: AudioFeatures;
  matchScore?: number; // 0 - 100% computed dynamically
  rawScore?: number;
  matchReasons?: string[];
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  tracks: Track[];
}

export interface TasteProfileItem {
  id: string;
  title: string;
  artist: string;
  genre: string;
  year: number;
  rating: number; // 1 to 10
  coverUrl: string;
  addedAt: string;
}

export interface UserProfileInfo {
  id?: string;
  name: string;
  email: string;
  country: string;
  lastFmUsername: string;
  age?: number;
  gender?: string;
  topGenres: string[];
  topArtists: string[];
  isLastFmSynced: boolean;
}

export interface LastFmUser {
  username: string;
  realname?: string;
  playcount: number;
  topArtists: { name: string; playcount: number; tag: string }[];
  topGenres: { name: string; weight: number }[];
}
