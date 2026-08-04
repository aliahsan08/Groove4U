/**
 * @file api.ts
 * @description API client service module for communicating with the backend FastAPI services.
 * Handles metadata enrichment (covers, previews, artworks) and cache hydration.
 */

import { RAMMetadataCache } from './metadataCache';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Checks FastAPI backend service health.
 * @returns Health check response object or null
 */
export async function fetchHealthCheck() {
  try {
    const res = await fetch(`${API_BASE_URL}/`);
    return await res.json();
  } catch (err) {
    console.error('Backend health check error:', err);
    return null;
  }
}

/**
 * Fetches top recommendations for the current session.
 * 
 * @param limit Maximum number of recommendations to retrieve (default: 5)
 * @param authToken Optional Authorization Bearer token
 * @returns Recommendations payload or null
 */
export async function fetchRecommendations(limit: number = 5, authToken?: string) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch(`${API_BASE_URL}/api/recommendations/top5?limit=${limit}`, { headers });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch recommendations from FastAPI backend:', err);
    return null;
  }
}

/**
 * Fetches playlists for an authenticated user.
 * 
 * @param authToken User session access token
 * @returns User playlists array
 */
export async function fetchUserPlaylists(authToken?: string) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch(`${API_BASE_URL}/api/playlists`, { headers });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch playlists from FastAPI backend:', err);
    return [];
  }
}

/**
 * Fetches taste profile items for an authenticated user.
 * 
 * @param authToken User session access token
 * @returns User taste profile items array
 */
export async function fetchTasteProfile(authToken?: string) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch(`${API_BASE_URL}/api/taste-profile`, { headers });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch taste profile from FastAPI backend:', err);
    return [];
  }
}

/**
 * On-demand preview fetcher for playing track audio previews.
 * 
 * @param artist Artist name
 * @param title Track title
 * @returns Preview URL string or null
 */
export async function fetchOnDemandPreviewUrl(artist: string, title: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/track/preview?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
    if (res.ok) {
      const data = await res.json();
      return data.previewUrl || data.preview_url || null;
    }
  } catch (err) {
    console.error('Failed to fetch on-demand preview from backend:', err);
  }
  return null;
}

/**
 * Fetches multiple high-res album artworks for a specific track.
 * 
 * @param artist Artist name
 * @param title Track title
 * @param currentCover Optional current cover image URL
 * @returns Array of artwork URLs
 */
export async function fetchTrackArtworks(artist: string, title: string, currentCover?: string): Promise<string[]> {
  try {
    let url = `${API_BASE_URL}/api/track/artworks?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    if (currentCover) {
      url += `&currentCover=${encodeURIComponent(currentCover)}`;
    }
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.artworks) && data.artworks.length > 0) {
        return data.artworks;
      }
    }
  } catch (err) {
    console.error('Failed to fetch track artworks from backend:', err);
  }
  return currentCover ? [currentCover] : [];
}

/**
 * Enriches track objects with high-resolution album cover artwork URLs.
 * 
 * @param tracks Track objects array
 * @returns Enriched track objects array
 */
export async function fetchEnrichedCovers<T extends { title: string; artist: string }>(tracks: T[]): Promise<T[]> {
  if (!tracks || tracks.length === 0) return tracks;
  try {
    const res = await fetch(`${API_BASE_URL}/api/tracks/enrich_covers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks })
    });
    if (res.ok) {
      const data = await res.json();
      return data.tracks || tracks;
    }
  } catch (err) {
    console.error('Failed to fetch enriched album covers from backend:', err);
  }
  return tracks;
}

/**
 * Enriches track objects with 30-second audio preview URLs.
 * 
 * @param tracks Track objects array
 * @returns Enriched track objects array
 */
export async function fetchEnrichedPreviews<T extends { title: string; artist: string }>(tracks: T[]): Promise<T[]> {
  if (!tracks || tracks.length === 0) return tracks;
  try {
    const res = await fetch(`${API_BASE_URL}/api/tracks/enrich_previews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks })
    });
    if (res.ok) {
      const data = await res.json();
      return data.tracks || tracks;
    }
  } catch (err) {
    console.error('Failed to fetch enriched audio previews from backend:', err);
  }
  return tracks;
}

/**
 * Complete 2-Phase metadata enrichment (Fast Deezer pass + iTunes fallback pass).
 * Hydrates results into memory cache for sub-millisecond future lookups.
 * 
 * @param tracks Track items requiring enrichment
 * @param onFastResult Optional callback invoked immediately after Phase 1 fast enrichment completes
 * @returns Promise resolving to fully enriched track array
 */
export async function fetchEnrichedAllMetadata<T extends { title: string; artist: string; coverUrl?: string; previewUrl?: string }>(
  tracks: T[],
  onFastResult?: (enriched: T[]) => void
): Promise<T[]> {
  if (!tracks || tracks.length === 0) return tracks;

  // Hydrate existing metadata from RAM cache
  let enriched = RAMMetadataCache.hydrateTrackList(tracks);

  // Filter tracks missing cover or preview metadata
  const needsEnrichment = enriched.filter(t => !t.coverUrl || !t.previewUrl);
  if (needsEnrichment.length === 0) {
    if (onFastResult) onFastResult(enriched);
    return enriched;
  }

  // Phase 1: Fast Deezer Metadata Pass (~1 second execution)
  try {
    const fastRes = await fetch(`${API_BASE_URL}/api/tracks/enrich_fast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: needsEnrichment })
    });
    if (fastRes.ok) {
      const data = await fastRes.json();
      const fastTracks: T[] = data.tracks || [];
      const fastMap = new Map<string, T>();
      for (const ft of fastTracks) {
        RAMMetadataCache.set(ft.artist, ft.title, { coverUrl: ft.coverUrl, previewUrl: ft.previewUrl });
        fastMap.set(`${ft.title?.toLowerCase()}--${ft.artist?.toLowerCase()}`, ft);
      }
      enriched = enriched.map(t => {
        const key = `${t.title?.toLowerCase()}--${t.artist?.toLowerCase()}`;
        const f = fastMap.get(key);
        if (f) {
          return {
            ...t,
            coverUrl: t.coverUrl || f.coverUrl,
            cover_url: (t as any).cover_url || (f as any).cover_url,
            previewUrl: t.previewUrl || f.previewUrl,
            preview_url: (t as any).preview_url || (f as any).preview_url
          };
        }
        return t;
      });
      if (onFastResult) onFastResult([...enriched]);
    }
  } catch (err) {
    console.error('Fast metadata enrichment failed:', err);
  }

  // Phase 2: iTunes Fallback Pass for tracks missing metadata
  const missing = enriched.filter(t => !t.coverUrl || !t.previewUrl);
  if (missing.length > 0) {
    try {
      const fallbackRes = await fetch(`${API_BASE_URL}/api/tracks/enrich_fallback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: missing })
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        const fallbackTracks: T[] = data.tracks || [];
        const fallbackMap = new Map<string, T>();
        for (const ft of fallbackTracks) {
          RAMMetadataCache.set(ft.artist, ft.title, { coverUrl: ft.coverUrl, previewUrl: ft.previewUrl });
          fallbackMap.set(`${ft.title?.toLowerCase()}--${ft.artist?.toLowerCase()}`, ft);
        }
        enriched = enriched.map(t => {
          const key = `${t.title?.toLowerCase()}--${t.artist?.toLowerCase()}`;
          const fb = fallbackMap.get(key);
          if (fb) {
            return {
              ...t,
              coverUrl: t.coverUrl || fb.coverUrl,
              cover_url: (t as any).cover_url || (fb as any).cover_url,
              previewUrl: t.previewUrl || fb.previewUrl,
              preview_url: (t as any).preview_url || (fb as any).preview_url
            };
          }
          return t;
        });
      }
    } catch (err) {
      console.error('Fallback metadata enrichment failed:', err);
    }
  }

  return enriched;
}
