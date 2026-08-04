/**
 * @file recommendationEngine.ts
 * @description Client-side recommendation service for GROOVE4U. Handles hybrid vector recommendation 
 * fetching from backend endpoint APIs (/api/recommendations/top5 and /api/recommendations/guest) 
 * with automatic fallback logic when offline.
 */

import { Track, TasteProfileItem, UserProfileInfo } from '../types/music';

/**
 * Computes local score-weighted recommendations based on user genre/artist preferences.
 * Used as a zero-downtime client-side fallback if the remote backend service is unreachable.
 * 
 * @param userProfile User metadata containing top genres and artists
 * @param tasteItems User rated song items in Taste Profile
 * @param candidateCatalog Array of candidate tracks to score
 * @returns Top 5 scored track recommendations
 */
export function computeTop5Recommendations(
  userProfile: UserProfileInfo,
  tasteItems: TasteProfileItem[],
  candidateCatalog: Track[] = []
): Track[] {
  let candidates = candidateCatalog;

  // Convert taste items into track candidates if candidate catalog is empty
  if (candidates.length === 0 && tasteItems.length > 0) {
    candidates = tasteItems.map(item => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: 'Taste Profile Selection',
      year: item.year,
      genre: item.genre,
      coverUrl: item.coverUrl,
      features: { energy: 75, danceability: 75, valence: 65, acousticness: 15, underground: 50, bpm: 124 }
    }));
  }

  // Return empty list if no candidate tracks are available
  if (candidates.length === 0) {
    return [];
  }

  // Score candidates against user profile preferences
  const scored = candidates.map(track => {
    let score = 75;
    const reasons: string[] = [];

    // Apply genre preference boost (+15 points)
    if (userProfile.topGenres && userProfile.topGenres.length > 0) {
      const match = userProfile.topGenres.find(
        g => g.toLowerCase() === track.genre.toLowerCase()
      );
      if (match) {
        score += 15;
      }
    }

    // Apply favorite artist boost (+20 points)
    if (userProfile.topArtists && userProfile.topArtists.length > 0) {
      const match = userProfile.topArtists.find(
        a => a.toLowerCase() === track.artist.toLowerCase()
      );
      if (match) {
        score += 20;
      }
    }

    // Clamp score within standard 65 - 99 range
    const finalScore = Math.min(99, Math.max(65, Math.round(score)));

    return {
      ...track,
      matchScore: finalScore,
      matchReasons: reasons
    };
  });

  // Sort candidate tracks descending by confidence score and return top 5
  return scored
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    .slice(0, 5);
}

/**
 * Primary Recommendation Engine API Module
 */
export const recommendationEngine = {
  /**
   * Generates top recommendations by calling the backend API service endpoints.
   * Seamlessly handles authenticated vs guest sessions and applies fallback if needed.
   * 
   * @param userProfile Active user profile
   * @param tasteItems Active user taste profile items
   * @param playlists User playlist items
   * @param limit Maximum recommendations to fetch (default: 5)
   * @param authToken Optional Bearer authorization token
   * @returns Promise resolving to an array of recommended tracks
   */
  generateTopRecommendations: async (
    userProfile: UserProfileInfo,
    tasteItems: TasteProfileItem[],
    playlists: any[],
    limit: number = 5,
    authToken?: string
  ): Promise<Track[]> => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || '';
    const artistsParam = encodeURIComponent((userProfile.topArtists || []).join(','));
    const genresParam  = encodeURIComponent((userProfile.topGenres  || []).join(','));

    try {
      if (authToken) {
        // Authenticated user session endpoint call
        const url = `${API_BASE_URL}/api/recommendations/top5?limit=${limit}&top_artists=${artistsParam}&top_genres=${genresParam}`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.recommendations?.length > 0) return data.recommendations;
        }
      } else {
        // Guest / unauthenticated session endpoint call
        const url = `${API_BASE_URL}/api/recommendations/guest?limit=${limit}&top_artists=${artistsParam}&top_genres=${genresParam}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data?.recommendations?.length > 0) return data.recommendations;
        }
      }
    } catch (err) {
      console.warn('[recommendationEngine] Remote backend service offline, utilizing local fallback engine:', err);
    }

    // Fallback to local computation algorithm if backend is unreachable
    return computeTop5Recommendations(userProfile, tasteItems, []);
  }
};
