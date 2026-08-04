import { supabase } from './supabaseClient';
import { UserProfileInfo, Playlist, TasteProfileItem, Track } from '../types/music';

// ==========================================
// HELPER: Log and rethrow Supabase errors
// ==========================================
function logSupabaseError(context: string, error: any) {
  console.error(`[SupabaseService] ${context}:`, error?.message || error?.code || error);
  if (error?.details) console.error(`  Details:`, error.details);
  if (error?.hint) console.error(`  Hint:`, error.hint);
}

// ==========================================
// 1. ARTISTS & GENRES HELPERS
// ==========================================

export function normalizeArtistName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export async function findOrCreateArtist(artistName: string): Promise<number> {
  const name = artistName.trim();
  const normalized = normalizeArtistName(name);

  const { data: existing, error: findErr } = await supabase
    .from('artists')
    .select('artist_id')
    .or(`normalized_name.eq.${normalized},artist_name.ilike.${name}`)
    .limit(1)
    .maybeSingle();

  if (findErr) logSupabaseError('findOrCreateArtist SELECT', findErr);

  if (existing) {
    return existing.artist_id;
  }

  const { data: created, error } = await supabase
    .from('artists')
    .insert({
      artist_name: name,
      normalized_name: normalized
    })
    .select('artist_id')
    .single();

  if (error || !created) {
    logSupabaseError('findOrCreateArtist INSERT', error);
    throw error || new Error('Failed to create artist');
  }

  return created.artist_id;
}

export async function searchGenresFromDB(query: string): Promise<string[]> {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim();
  const { data, error } = await supabase
    .from('genres')
    .select('genre_name')
    .ilike('genre_name', `${q}%`)
    .limit(15);

  if (error || !data) return [];
  return data.map((r: any) => r.genre_name);
}

export async function validateGenreInDB(genreName: string): Promise<string | null> {
  if (!genreName || !genreName.trim()) return null;
  const { data } = await supabase
    .from('genres')
    .select('genre_name')
    .ilike('genre_name', genreName.trim())
    .maybeSingle();

  return data?.genre_name || null;
}

export async function searchArtistsFromDB(query: string): Promise<string[]> {
  if (!query || query.trim().length === 0) return [];
  const qClean = query.trim();
  const qNorm = normalizeArtistName(qClean);

  const { data, error } = await supabase
    .from('artists')
    .select('artist_name, normalized_name')
    .or(`artist_name.ilike.%${qClean}%,normalized_name.ilike.%${qNorm}%`)
    .limit(15);

  if (error || !data) return [];
  return data.map((r: any) => r.artist_name);
}

export async function findOrCreateGenre(genreName: string): Promise<number> {
  const name = genreName.trim();

  const { data: existing, error: findErr } = await supabase
    .from('genres')
    .select('genre_id')
    .ilike('genre_name', name)
    .maybeSingle();

  if (findErr) logSupabaseError('findOrCreateGenre SELECT', findErr);

  if (existing) {
    return existing.genre_id;
  }

  const { data: created, error } = await supabase
    .from('genres')
    .insert({ genre_name: name })
    .select('genre_id')
    .single();

  if (error || !created) {
    logSupabaseError('findOrCreateGenre INSERT', error);
    throw error || new Error('Failed to create genre');
  }

  return created.genre_id;
}

export async function findOrCreateTrack(title: string, artistName: string, genreName: string): Promise<Track> {
  const artistId = await findOrCreateArtist(artistName);
  const genreId = await findOrCreateGenre(genreName);
  const cleanTitle = title.trim();

  // Search if track already exists for this artist and title
  const { data: existingTrack, error: findErr } = await supabase
    .from('tracks')
    .select('track_id, qdrant_point_id, title, artist_id, genre_id')
    .eq('artist_id', artistId)
    .ilike('title', cleanTitle)
    .maybeSingle();

  if (findErr) logSupabaseError('findOrCreateTrack SELECT', findErr);

  if (existingTrack) {
    return {
      id: String(existingTrack.track_id),
      title: existingTrack.title,
      artist: artistName,
      album: 'Single',
      year: new Date().getFullYear(),
      genre: genreName,
      coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
      features: { energy: 70, danceability: 70, valence: 60, acousticness: 20, underground: 50, bpm: 120 }
    };
  }

  // Insert new track row
  const { data: createdTrack, error } = await supabase
    .from('tracks')
    .insert({
      title: cleanTitle,
      artist_id: artistId,
      genre_id: genreId
    })
    .select('track_id, title')
    .single();

  if (error || !createdTrack) {
    logSupabaseError('findOrCreateTrack INSERT', error);
    throw error || new Error('Failed to create track');
  }

  return {
    id: String(createdTrack.track_id),
    title: createdTrack.title,
    artist: artistName,
    album: 'Single',
    year: new Date().getFullYear(),
    genre: genreName,
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    features: { energy: 70, danceability: 70, valence: 60, acousticness: 20, underground: 50, bpm: 120 }
  };
}

// ==========================================
// 2. USER PROFILE DATA SERVICE
// ==========================================

export async function fetchUserProfileFromDB(userId: string, email: string): Promise<UserProfileInfo> {
  console.log('[SupabaseService] fetchUserProfileFromDB called for', userId);

  // Fetch main user row from public.users table
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (userErr) logSupabaseError('fetchUserProfile SELECT users', userErr);

  // If user row is missing in public.users, fetch auth metadata and upsert row
  if (!userRow) {
    console.log('[SupabaseService] No user row found, creating from auth metadata...');
    const { data: authUser } = await supabase.auth.getUser();
    const meta = authUser?.user?.user_metadata || {};

    const initialProfile = {
      user_id: userId,
      name: meta.name || email.split('@')[0],
      email: email,
      country: meta.country || '',
      lastfm_username: meta.lastFmUsername || '',
      is_lastfm_synced: false,
      age: meta.age ? parseInt(meta.age) : 24,
      gender: meta.gender || 'Prefer not to say'
    };

    const { error: upsertErr } = await supabase.from('users').upsert(initialProfile);
    if (upsertErr) logSupabaseError('fetchUserProfile UPSERT users', upsertErr);
    else console.log('[SupabaseService] User row created successfully');

    // Fetch top artists
    const { data: artistsData } = await supabase
      .from('user_top_artists')
      .select('artists(artist_name)')
      .eq('user_id', userId);

    const topArtists = (artistsData || [])
      .map(item => item.artists ? (item.artists as any).artist_name : null)
      .filter(Boolean);

    // Fetch top genres
    const { data: genresData } = await supabase
      .from('user_top_genres')
      .select('genres(genre_name)')
      .eq('user_id', userId);

    const topGenres = (genresData || [])
      .map(item => item.genres ? (item.genres as any).genre_name : null)
      .filter(Boolean);

    return {
      id: userId,
      name: initialProfile.name,
      email: initialProfile.email,
      country: initialProfile.country,
      lastFmUsername: initialProfile.lastfm_username,
      isLastFmSynced: false,
      age: initialProfile.age,
      gender: initialProfile.gender,
      topArtists,
      topGenres
    };
  }

  console.log('[SupabaseService] User row found:', userRow.name);

  // Fetch top artists
  const { data: artistsData } = await supabase
    .from('user_top_artists')
    .select('artists(artist_name)')
    .eq('user_id', userId);

  const topArtists = (artistsData || [])
    .map(item => item.artists ? (item.artists as any).artist_name : null)
    .filter(Boolean);

  // Fetch top genres
  const { data: genresData } = await supabase
    .from('user_top_genres')
    .select('genres(genre_name)')
    .eq('user_id', userId);

  const topGenres = (genresData || [])
    .map(item => item.genres ? (item.genres as any).genre_name : null)
    .filter(Boolean);

  return {
    id: userId,
    name: userRow.name || email.split('@')[0],
    email: userRow.email || email,
    country: userRow.country || '',
    lastFmUsername: userRow.lastfm_username || '',
    isLastFmSynced: userRow.is_lastfm_synced || false,
    age: userRow.age || 24,
    gender: userRow.gender || 'Prefer not to say',
    topArtists,
    topGenres
  };
}

export async function updateUserProfileInDB(userId: string, updated: UserProfileInfo): Promise<void> {
  console.log('[SupabaseService] updateUserProfileInDB called for', userId);

  const payload = {
    user_id: userId,
    name: updated.name,
    email: updated.email,
    country: updated.country,
    lastfm_username: updated.lastFmUsername,
    is_lastfm_synced: updated.isLastFmSynced,
    age: updated.age,
    gender: updated.gender,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('users')
    .upsert(payload);

  if (error) {
    logSupabaseError('updateUserProfileInDB UPSERT users', error);
  } else {
    console.log('[SupabaseService] User profile row saved successfully');
  }

  // Sync Top Artists
  if (Array.isArray(updated.topArtists)) {
    // Clear old top artists for this user
    const { error: delErr } = await supabase.from('user_top_artists').delete().eq('user_id', userId);
    if (delErr) logSupabaseError('syncTopArtists DELETE', delErr);

    // Insert new top artists
    for (const artistName of updated.topArtists) {
      if (artistName && artistName.trim()) {
        try {
          const artistId = await findOrCreateArtist(artistName.trim());
          const { error: insErr } = await supabase
            .from('user_top_artists')
            .upsert({ user_id: userId, artist_id: artistId }, { onConflict: 'user_id,artist_id' });
          if (insErr) logSupabaseError('syncTopArtists UPSERT', insErr);
        } catch (e) {
          console.error('[SupabaseService] Error syncing top artist:', artistName, e);
        }
      }
    }
  }

  // Sync Top Genres
  if (Array.isArray(updated.topGenres)) {
    // Clear old top genres for this user
    const { error: delErr } = await supabase.from('user_top_genres').delete().eq('user_id', userId);
    if (delErr) logSupabaseError('syncTopGenres DELETE', delErr);

    // Insert new top genres
    for (const genreName of updated.topGenres) {
      if (genreName && genreName.trim()) {
        try {
          const genreId = await findOrCreateGenre(genreName.trim());
          const { error: insErr } = await supabase
            .from('user_top_genres')
            .upsert({ user_id: userId, genre_id: genreId }, { onConflict: 'user_id,genre_id' });
          if (insErr) logSupabaseError('syncTopGenres UPSERT', insErr);
        } catch (e) {
          console.error('[SupabaseService] Error syncing top genre:', genreName, e);
        }
      }
    }
  }
}

export async function addUserTopArtistInDB(userId: string, artistName: string): Promise<void> {
  const artistId = await findOrCreateArtist(artistName);
  const { error } = await supabase
    .from('user_top_artists')
    .upsert({ user_id: userId, artist_id: artistId });
  if (error) logSupabaseError('addUserTopArtist UPSERT', error);
}

export async function removeUserTopArtistFromDB(userId: string, artistName: string): Promise<void> {
  const { data: artist } = await supabase
    .from('artists')
    .select('artist_id')
    .eq('normalized_name', artistName.trim().toLowerCase())
    .maybeSingle();

  if (artist) {
    const { error } = await supabase
      .from('user_top_artists')
      .delete()
      .eq('user_id', userId)
      .eq('artist_id', artist.artist_id);
    if (error) logSupabaseError('removeUserTopArtist DELETE', error);
  }
}

export async function addUserTopGenreInDB(userId: string, genreName: string): Promise<void> {
  const genreId = await findOrCreateGenre(genreName);
  const { error } = await supabase
    .from('user_top_genres')
    .upsert({ user_id: userId, genre_id: genreId });
  if (error) logSupabaseError('addUserTopGenre UPSERT', error);
}

export async function removeUserTopGenreFromDB(userId: string, genreName: string): Promise<void> {
  const { data: genre } = await supabase
    .from('genres')
    .select('genre_id')
    .eq('genre_name', genreName.trim())
    .maybeSingle();

  if (genre) {
    const { error } = await supabase
      .from('user_top_genres')
      .delete()
      .eq('user_id', userId)
      .eq('genre_id', genre.genre_id);
    if (error) logSupabaseError('removeUserTopGenre DELETE', error);
  }
}

// ==========================================
// 3. PLAYLISTS DATA SERVICE
// ==========================================

export async function fetchUserPlaylistsFromDB(userId: string): Promise<Playlist[]> {
  console.log('[SupabaseService] fetchUserPlaylistsFromDB called for', userId);

  const { data: playlistsData, error } = await supabase
    .from('playlists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logSupabaseError('fetchUserPlaylists SELECT', error);
    return [];
  }
  if (!playlistsData || playlistsData.length === 0) {
    console.log('[SupabaseService] No playlists found for user');
    return [];
  }

  console.log('[SupabaseService] Found', playlistsData.length, 'playlists');

  const playlists: Playlist[] = [];

  for (const pl of playlistsData) {
    const { data: tracksData, error: trackErr } = await supabase
      .from('playlist_tracks')
      .select('tracks(track_id, title, artists(artist_name), genres(genre_name))')
      .eq('playlist_id', pl.playlist_id);

    if (trackErr) logSupabaseError(`fetchUserPlaylists tracks for playlist ${pl.playlist_id}`, trackErr);

    const tracks: Track[] = (tracksData || [])
      .filter(pt => pt.tracks)
      .map(pt => {
        const tr = pt.tracks as any;
        return {
          id: String(tr.track_id),
          title: tr.title,
          artist: tr.artists?.artist_name || 'Unknown Artist',
          album: 'Single',
          year: new Date().getFullYear(),
          genre: tr.genres?.genre_name || 'Unknown Genre',
          coverUrl: '',
          features: { energy: 75, danceability: 75, valence: 65, acousticness: 15, underground: 50, bpm: 124 }
        };
      });

    playlists.push({
      id: String(pl.playlist_id),
      name: pl.name,
      description: pl.description || '',
      createdAt: new Date(pl.created_at).getTime(),
      tracks
    });
  }

  return playlists;
}

export async function createPlaylistInDB(userId: string, name: string, description?: string): Promise<Playlist> {
  console.log('[SupabaseService] createPlaylistInDB called:', name);

  const { data, error } = await supabase
    .from('playlists')
    .insert({
      user_id: userId,
      name: name.trim(),
      description: description || ''
    })
    .select('*')
    .single();

  if (error || !data) {
    logSupabaseError('createPlaylistInDB INSERT', error);
    throw error || new Error('Failed to create playlist');
  }

  console.log('[SupabaseService] Playlist created:', data.playlist_id);

  return {
    id: String(data.playlist_id),
    name: data.name,
    description: data.description || '',
    createdAt: new Date(data.created_at).getTime(),
    tracks: []
  };
}

export async function renamePlaylistInDB(playlistId: string, newName: string): Promise<void> {
  console.log('[SupabaseService] renamePlaylistInDB:', playlistId, '->', newName);

  const { error } = await supabase
    .from('playlists')
    .update({ name: newName.trim(), updated_at: new Date().toISOString() })
    .eq('playlist_id', playlistId);

  if (error) logSupabaseError('renamePlaylistInDB UPDATE', error);
}

export async function deletePlaylistInDB(playlistId: string): Promise<void> {
  console.log('[SupabaseService] deletePlaylistInDB:', playlistId);

  // Delete playlist_tracks first (foreign key)
  const { error: ptErr } = await supabase
    .from('playlist_tracks')
    .delete()
    .eq('playlist_id', playlistId);

  if (ptErr) logSupabaseError('deletePlaylistInDB DELETE playlist_tracks', ptErr);

  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('playlist_id', playlistId);

  if (error) logSupabaseError('deletePlaylistInDB DELETE playlists', error);
}

export const deletePlaylistFromDB = deletePlaylistInDB;

export async function removeTrackFromPlaylistInDB(playlistId: string, trackId: string): Promise<void> {
  console.log('[SupabaseService] removeTrackFromPlaylistInDB:', playlistId, trackId);
  const dbTrackId = parseInt(trackId);
  if (isNaN(dbTrackId)) return;

  const { error } = await supabase
    .from('playlist_tracks')
    .delete()
    .eq('playlist_id', playlistId)
    .eq('track_id', dbTrackId);

  if (error) logSupabaseError('removeTrackFromPlaylist DELETE', error);
}

export async function toggleTrackInPlaylistInDB(playlistId: string, track: Track): Promise<void> {
  console.log('[SupabaseService] toggleTrackInPlaylistInDB:', playlistId, track.title);

  // Ensure track exists in DB
  const trackObj = await findOrCreateTrack(track.title, track.artist, track.genre);
  const dbTrackId = parseInt(trackObj.id);

  if (isNaN(dbTrackId)) {
    console.error('[SupabaseService] Invalid track ID:', trackObj.id);
    return;
  }

  console.log('[SupabaseService] Resolved IDs - playlistId:', playlistId, '(UUID) trackId:', dbTrackId, '(int)');

  const { data: existing, error: findErr } = await supabase
    .from('playlist_tracks')
    .select('playlist_id')
    .eq('playlist_id', playlistId)
    .eq('track_id', dbTrackId)
    .maybeSingle();

  if (findErr) logSupabaseError('toggleTrackInPlaylist SELECT', findErr);

  if (existing) {
    const { error } = await supabase
      .from('playlist_tracks')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('track_id', dbTrackId);
    if (error) logSupabaseError('toggleTrackInPlaylist DELETE', error);
    else console.log('[SupabaseService] Track removed from playlist');
  } else {
    const { error } = await supabase
      .from('playlist_tracks')
      .insert({ playlist_id: playlistId, track_id: dbTrackId });
    if (error) logSupabaseError('toggleTrackInPlaylist INSERT', error);
    else console.log('[SupabaseService] Track added to playlist');
  }
}

// ==========================================
// 4. TASTE PROFILE RATINGS SERVICE
// ==========================================

export async function fetchTasteProfileFromDB(userId: string): Promise<TasteProfileItem[]> {
  console.log('[SupabaseService] fetchTasteProfileFromDB called for', userId);

  let { data, error } = await supabase
    .from('taste_profile')
    .select('taste_id, rating, playlist_id, added_at, tracks(title, artists(artist_name), genres(genre_name))')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (error) {
    logSupabaseError('fetchTasteProfile SELECT', error);
    return [];
  }

  // Fallback: If current userId has no taste profile items in DB, fetch primary catalog taste items
  if (!data || data.length === 0) {
    console.log('[SupabaseService] No taste profile items found for user, applying catalog fallback');
    const fallbackRes = await supabase
      .from('taste_profile')
      .select('taste_id, rating, playlist_id, added_at, tracks(title, artists(artist_name), genres(genre_name))')
      .order('added_at', { ascending: false })
      .limit(60);

    if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.length > 0) {
      data = fallbackRes.data;
    }
  }

  if (!data || data.length === 0) {
    console.log('[SupabaseService] No taste profile items found');
    return [];
  }

  console.log('[SupabaseService] Found', data.length, 'taste profile items');

  return data.map(item => {
    const tr = item.tracks as any;
    return {
      id: String(item.taste_id),
      title: tr?.title || 'Unknown Track',
      artist: tr?.artists?.artist_name || 'Unknown Artist',
      genre: tr?.genres?.genre_name || 'Unknown Genre',
      year: new Date().getFullYear(),
      rating: item.rating,
      coverUrl: '',
      addedAt: new Date(item.added_at).toISOString().split('T')[0]
    };
  });
}

export async function addTasteItemToDB(
  userId: string,
  title: string,
  artistName: string,
  genreName: string,
  rating: number
): Promise<TasteProfileItem> {
  console.log('[SupabaseService] addTasteItemToDB:', title, 'by', artistName, 'rating:', rating);

  const trackObj = await findOrCreateTrack(title, artistName, genreName);
  const numericTrackId = parseInt(trackObj.id);

  const { data, error } = await supabase
    .from('taste_profile')
    .upsert({
      user_id: userId,
      track_id: numericTrackId,
      rating: rating
    })
    .select('taste_id, rating, added_at')
    .single();

  if (error || !data) {
    logSupabaseError('addTasteItemToDB UPSERT', error);
    throw error || new Error('Failed to record taste rating');
  }

  console.log('[SupabaseService] Taste item saved, taste_id:', data.taste_id);

  return {
    id: String(data.taste_id),
    title: title.trim(),
    artist: artistName.trim(),
    genre: genreName.trim(),
    year: new Date().getFullYear(),
    rating: data.rating,
    coverUrl: '',
    addedAt: new Date(data.added_at).toISOString().split('T')[0]
  };
}

export async function updateTasteRatingInDB(tasteId: string, rating: number): Promise<void> {
  console.log('[SupabaseService] updateTasteRatingInDB:', tasteId, '->', rating);

  const { error } = await supabase
    .from('taste_profile')
    .update({ rating })
    .eq('taste_id', tasteId);

  if (error) logSupabaseError('updateTasteRating UPDATE', error);
  else console.log('[SupabaseService] Taste rating updated');
}

export async function deleteTasteItemFromDB(tasteId: string): Promise<void> {
  console.log('[SupabaseService] deleteTasteItemFromDB:', tasteId);

  const { error } = await supabase
    .from('taste_profile')
    .delete()
    .eq('taste_id', tasteId);

  if (error) logSupabaseError('deleteTasteItem DELETE', error);
  else console.log('[SupabaseService] Taste item deleted');
}

// ==========================================
// 5. MASTER TRACK CATALOG SERVICE
// ==========================================

export async function fetchTracksCatalogFromDB(): Promise<Track[]> {
  console.log('[SupabaseService] fetchTracksCatalogFromDB called');

  const { data, error } = await supabase
    .from('tracks')
    .select('track_id, qdrant_point_id, title, artists(artist_name), genres(genre_name)')
    .limit(100);

  if (error) {
    logSupabaseError('fetchTracksCatalog SELECT', error);
    return [];
  }
  if (!data) return [];

  console.log('[SupabaseService] Fetched', data.length, 'catalog tracks');

  return data.map((tr: any) => ({
    id: String(tr.track_id),
    title: tr.title,
    artist: tr.artists?.artist_name || 'Unknown Artist',
    album: 'Catalog Track',
    year: 2024,
    genre: tr.genres?.genre_name || 'General',
    coverUrl: '',
    features: { energy: 75, danceability: 75, valence: 60, acousticness: 20, underground: 50, bpm: 120 }
  }));
}
