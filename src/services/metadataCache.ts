/**
 * In-Memory RAM Metadata Cache.
 * Stores resolved album cover URLs and audio preview URLs for the entire browser session.
 * Prevents album covers from ever disappearing or re-fetching repeatedly.
 */

export interface CachedMetadata {
  coverUrl?: string;
  previewUrl?: string;
}

const memoryCache = new Map<string, CachedMetadata>();

function getCacheKey(artist: string, title: string): string {
  if (!artist && !title) return '';
  const cleanArtist = (artist || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
  const cleanTitle = (title || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
  return `${cleanArtist}___${cleanTitle}`;
}

export const RAMMetadataCache = {
  get(artist: string, title: string): CachedMetadata | undefined {
    const key = getCacheKey(artist, title);
    if (!key) return undefined;
    return memoryCache.get(key);
  },

  set(artist: string, title: string, metadata: CachedMetadata): void {
    const key = getCacheKey(artist, title);
    if (!key) return;
    const existing = memoryCache.get(key) || {};
    memoryCache.set(key, {
      coverUrl: metadata.coverUrl || (metadata as any).cover_url || existing.coverUrl,
      previewUrl: metadata.previewUrl || (metadata as any).preview_url || existing.previewUrl,
    });
  },

  hydrateTrack<T extends { artist: string; title: string; coverUrl?: string; previewUrl?: string }>(track: T): T {
    const cached = this.get(track.artist, track.title);
    if (!cached) return track;
    return {
      ...track,
      coverUrl: track.coverUrl || cached.coverUrl,
      cover_url: (track as any).cover_url || cached.coverUrl,
      previewUrl: track.previewUrl || cached.previewUrl,
      preview_url: (track as any).preview_url || cached.previewUrl,
    };
  },

  hydrateTrackList<T extends { artist: string; title: string; coverUrl?: string; previewUrl?: string }>(tracks: T[]): T[] {
    if (!tracks) return [];
    return tracks.map(t => this.hydrateTrack(t));
  }
};
