import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Playlist, Track, TasteProfileItem } from '../types/music';
import { ALL_GENRES } from '../constants/genres';
import { Music, Trash2, Download, Plus, Edit2, BookmarkCheck, FolderPlus, Check, Sparkles, PlusCircle, AlertCircle, CheckCircle, Loader2, Play, Pause, ArrowLeft, Image as ImageIcon, Search, ArrowUpDown } from 'lucide-react';
import { fetchOnDemandPreviewUrl } from '../services/api';
import { RAMMetadataCache } from '../services/metadataCache';
import { ArtworkModal } from './ArtworkModal';
import { MarqueeText } from './MarqueeText';
import { SortMenu } from './SortMenu';

interface PlaylistTabProps {
  playlists: Playlist[];
  activePlaylistId: string;
  setActivePlaylistId: (id: string) => void;
  onCreatePlaylist: (name: string, description?: string) => Playlist | Promise<Playlist>;
  onDeletePlaylist: (id: string) => void;
  onRenamePlaylist: (id: string, newName: string) => void;
  onRemoveFromPlaylist: (trackId: string, playlistId: string) => void;
  onAddSongToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  onAddTrackToTasteProfile: (track: Track, rating?: number) => Promise<void>;
  tasteItems: TasteProfileItem[];
  onTogglePlay?: (track: Track) => void;
  currentPlayingTrackId?: string | null;
  isPlaying?: boolean;
}

export const PlaylistTab: React.FC<PlaylistTabProps> = ({
  playlists,
  activePlaylistId,
  setActivePlaylistId,
  onCreatePlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onRemoveFromPlaylist,
  onAddSongToPlaylist,
  onAddTrackToTasteProfile,
  tasteItems,
  onTogglePlay,
  currentPlayingTrackId,
  isPlaying = false
}) => {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddSongModal, setShowAddSongModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Audio Preview State
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);
  const [artworkModalTrack, setArtworkModalTrack] = useState<{ artist: string; title: string; coverUrl?: string } | null>(null);

  // Search & Sort States
  const [mainSearchQuery, setMainSearchQuery] = useState('');
  const [mainSortBy, setMainSortBy] = useState<'name-asc' | 'name-desc' | 'tracks-desc' | 'tracks-asc'>('name-asc');
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const [trackSortBy, setTrackSortBy] = useState<'default' | 'title-asc' | 'title-desc' | 'artist-asc' | 'artist-desc'>('default');

  useEffect(() => {
    return () => {
      if (audioInstance) {
        audioInstance.pause();
      }
    };
  }, [audioInstance]);

  const handleTogglePlayPlaylistTrack = async (track: Track) => {
    if (onTogglePlay) {
      onTogglePlay(track);
      return;
    }
    if (playingTrackId === track.id) {
      if (audioInstance) audioInstance.pause();
      setPlayingTrackId(null);
      setAudioInstance(null);
      return;
    }

    setLoadingPreviewId(track.id);
    let pUrl: string | null = null;
    try {
      pUrl = await fetchOnDemandPreviewUrl(track.artist, track.title);
    } catch {
      pUrl = null;
    } finally {
      setLoadingPreviewId(null);
    }

    if (!pUrl) {
      alert(`Audio preview not available for "${track.title}" by ${track.artist}`);
      return;
    }

    if (audioInstance) audioInstance.pause();
    const audio = new Audio(pUrl);
    audio.play().catch(err => console.error('[PlaylistTab] Audio play error:', err));
    audio.onended = () => {
      setPlayingTrackId(null);
      setAudioInstance(null);
    };
    setAudioInstance(audio);
    setPlayingTrackId(track.id);
  };

  // Create & Edit Inputs
  const [newPlaylistNameInput, setNewPlaylistNameInput] = useState('');
  const [newPlaylistDescInput, setNewPlaylistDescInput] = useState('');
  const [editTitleInput, setEditTitleInput] = useState('');

  // Single Track Search Input
  const [trackSearchInput, setTrackSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCatalogMatch, setIsCatalogMatch] = useState<boolean | null>(null);

  // Fallback Custom Track Inputs
  const [showCustomFallback, setShowCustomFallback] = useState(false);
  const [customTitleInput, setCustomTitleInput] = useState('');
  const [customArtistInput, setCustomArtistInput] = useState('');
  const [customGenreInput, setCustomGenreInput] = useState(ALL_GENRES[0]);

  const [isSubmittingNewTrack, setIsSubmittingNewTrack] = useState(false);
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const handleRemoveTrackAction = async (trackId: string, playlistId: string) => {
    const key = `remove-${trackId}`;
    setLoadingActionId(key);
    try {
      await onRemoveFromPlaylist(trackId, playlistId);
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleAddTrackToTasteAction = async (track: Track) => {
    const key = `taste-${track.id}`;
    setLoadingActionId(key);
    try {
      await onAddTrackToTasteProfile(track, 8);
    } finally {
      setLoadingActionId(null);
    }
  };

  const activePlaylist = playlists.find(p => p.id === activePlaylistId) || null;
  const activeTracks = activePlaylist ? RAMMetadataCache.hydrateTrackList(activePlaylist.tracks) : [];

  // Search catalog autocomplete with dash-agnostic query normalization
  useEffect(() => {
    if (trackSearchInput.trim().length < 2) {
      setSearchResults([]);
      setIsCatalogMatch(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const backendUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${backendUrl}/api/catalog/search?q=${encodeURIComponent(trackSearchInput.trim())}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);

          const checkRes = await fetch(`${backendUrl}/api/catalog/check?query=${encodeURIComponent(trackSearchInput.trim())}`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            setIsCatalogMatch(checkData.exists);
            // DO NOT automatically force showCustomFallback without user click!
          }
        }
      } catch (err) {
        console.error('Catalog search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [trackSearchInput]);

  const handleSelectSearchResult = (trackStr: string) => {
    setTrackSearchInput(trackStr);
    setSearchResults([]);
    setIsCatalogMatch(true);
    setShowCustomFallback(false);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistNameInput.trim()) return;
    const created = await onCreatePlaylist(newPlaylistNameInput.trim(), newPlaylistDescInput.trim());
    setActivePlaylistId(created.id);
    setNewPlaylistNameInput('');
    setNewPlaylistDescInput('');
    setShowCreateModal(false);
  };

  const handleAddSongSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlaylist) return;

    if (showCustomFallback) {
      if (!customTitleInput.trim() || !customArtistInput.trim()) return;
      setIsSubmittingNewTrack(true);

      try {
        const backendUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${backendUrl}/api/catalog/add_new_track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: customTitleInput.trim(),
            artist: customArtistInput.trim()
          })
        });

        const data = res.ok ? await res.json() : null;
        const finalGenre = data?.enriched?.genre || customGenreInput;

        const newTrack: Track = {
          id: `temp-${Date.now()}`,
          title: customTitleInput.trim(),
          artist: customArtistInput.trim(),
          album: 'Single',
          year: new Date().getFullYear(),
          genre: finalGenre,
          coverUrl: data?.enriched?.coverUrl || data?.enriched?.cover_url || '',
          previewUrl: data?.enriched?.previewUrl || data?.enriched?.preview_url || undefined,
          features: { energy: 75, danceability: 75, valence: 65, acousticness: 20, underground: 50, bpm: 120 }
        };

        await onAddSongToPlaylist(activePlaylist.id, newTrack);
        setCustomTitleInput('');
        setCustomArtistInput('');
        setShowCustomFallback(false);
        setTrackSearchInput('');
        setShowAddSongModal(false);
      } catch (err) {
        console.error('Error adding custom track:', err);
      } finally {
        setIsSubmittingNewTrack(false);
      }
    } else {
      if (!trackSearchInput.trim()) return;

      const parts = trackSearchInput.split(/[-—–]/);
      const title = parts[0].trim();
      const artist = parts.length > 1 ? parts[1].trim() : 'Artist';

      const newTrack: Track = {
        id: `temp-${Date.now()}`,
        title,
        artist,
        album: 'Single',
        year: new Date().getFullYear(),
        genre: customGenreInput,
        coverUrl: '',
        features: { energy: 75, danceability: 75, valence: 65, acousticness: 20, underground: 50, bpm: 120 }
      };

      await onAddSongToPlaylist(activePlaylist.id, newTrack);
      setTrackSearchInput('');
      setIsCatalogMatch(null);
      setShowAddSongModal(false);
    }
  };

  const handleRenameSubmit = () => {
    if (!editTitleInput.trim() || !activePlaylist) return;
    onRenamePlaylist(activePlaylist.id, editTitleInput.trim());
    setIsEditingTitle(false);
  };

  const getFormattedPlaylist = () => {
    if (!activePlaylist) return '';
    const header = `=== PLAYLIST: ${activePlaylist.name.toUpperCase()} (${activeTracks.length} TRACKS) ===\n\n`;
    const tracksText = activeTracks
      .map((t, i) => `${i + 1}. ${t.artist} - ${t.title} [${t.year}]`)
      .join('\n');
    return header + tracksText;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(getFormattedPlaylist());
    setCopiedStatus('COPIED TO CLIPBOARD!');
    setTimeout(() => setCopiedStatus(null), 2500);
  };

  return (
    <div style={{ padding: '2.5rem 1.5rem', maxWidth: '1350px', margin: '0 auto' }}>
      {/* Top-Left Back Button when an active playlist is selected */}
      {activePlaylist && (
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
          <button
            className="btn-neo btn-neo-lime"
            onClick={() => setActivePlaylistId('')}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={18} /> <span className="back-btn-text-full">BACK TO ALL PLAYLISTS</span><span className="back-btn-text-short">Back</span>
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge-neo badge-lime" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>MULTIPLE PLAYLIST LIBRARY</span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, marginTop: '0.85rem' }}>
            MY <span style={{ color: 'var(--accent-lime)' }}>PLAYLISTS</span>
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className={`btn-neo btn-neo-cyan ${activePlaylist ? 'hide-on-mobile-in-playlist' : ''}`}
            onClick={() => setShowCreateModal(true)}
            style={{ padding: '0.75rem 1.25rem' }}
          >
            <FolderPlus size={18} /> + NEW PLAYLIST
          </button>
        </div>
      </div>

      {/* DEFAULT VIEW: Horizontal Playlist Cards Grid when no active playlist is selected */}
      {!activePlaylist ? (
        <div>
          {/* Controls Bar: Search & Sort for Playlists */}
          {playlists.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center', width: '100%' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="input-neo"
                  placeholder="Search playlists by name..."
                  value={mainSearchQuery}
                  onChange={e => setMainSearchQuery(e.target.value)}
                  style={{ paddingLeft: '2.3rem', width: '100%', height: '42px' }}
                />
              </div>
              <SortMenu
                value={mainSortBy}
                onChange={val => setMainSortBy(val as any)}
                options={[
                  { label: 'Name (A-Z)', value: 'name-asc' },
                  { label: 'Name (Z-A)', value: 'name-desc' },
                  { label: 'Most Tracks', value: 'tracks-desc' },
                  { label: 'Fewest Tracks', value: 'tracks-asc' }
                ]}
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {playlists
              .filter(pl => {
                if (!mainSearchQuery.trim()) return true;
                const q = mainSearchQuery.toLowerCase();
                return pl.name.toLowerCase().includes(q) || (pl.description && pl.description.toLowerCase().includes(q));
              })
              .sort((a, b) => {
                if (mainSortBy === 'name-asc') return a.name.localeCompare(b.name);
                if (mainSortBy === 'name-desc') return b.name.localeCompare(a.name);
                if (mainSortBy === 'tracks-desc') return (b.tracks?.length || 0) - (a.tracks?.length || 0);
                if (mainSortBy === 'tracks-asc') return (a.tracks?.length || 0) - (b.tracks?.length || 0);
                return 0;
              })
              .map(pl => {
              const tracks = RAMMetadataCache.hydrateTrackList(pl.tracks);
              const previewCovers = tracks.map(t => t.coverUrl || (t as any).cover_url).filter(Boolean).slice(0, 4);

              return (
                <div
                  key={pl.id}
                  className="tactile-card"
                  style={{
                    padding: '1.5rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1.25rem',
                    backgroundColor: 'var(--bg-secondary)',
                    transition: 'transform 0.2s, box-shadow 0.2s'
                  }}
                  onClick={() => {
                    setActivePlaylistId(pl.id);
                    setIsEditingTitle(false);
                  }}
                >
                  <div>
                    {/* Playlist Cover Art Grid / Single Thumb */}
                    <div style={{
                      width: '100%',
                      height: '180px',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      border: '2px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      marginBottom: '1rem',
                      display: 'grid',
                      gridTemplateColumns: previewCovers.length > 1 ? '1fr 1fr' : '1fr',
                      gridTemplateRows: previewCovers.length > 2 ? '1fr 1fr' : '1fr',
                      gap: '2px'
                    }}>
                      {previewCovers.length > 0 ? (
                        previewCovers.map((img, i) => (
                          <img
                            key={i}
                            src={img}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ))
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', color: 'var(--text-muted)' }}>
                          <Music size={40} />
                        </div>
                      )}
                    </div>

                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.3rem 0', color: 'var(--text-main)' }}>
                      {pl.name}
                    </h3>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      {pl.description || `${pl.tracks.length} saved tracks`}
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    <span className="badge-neo badge-lime" style={{ fontSize: '0.75rem' }}>
                      {pl.tracks.length} TRACKS
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-lime)' }}>
                      OPEN PLAYLIST →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* SINGLE PLAYLIST VIEW: Opened when user clicks a playlist card */
        <div>
          {/* Active Playlist Header & Actions */}
          <div className="tactile-card" style={{ marginBottom: '2rem', padding: '1.75rem', backgroundColor: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
              <div>
                {isEditingTitle ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={editTitleInput}
                      onChange={(e) => setEditTitleInput(e.target.value)}
                      className="input-neo"
                      style={{ fontSize: '1.5rem', fontWeight: 800, padding: '0.25rem 0.5rem', height: '42px', maxWidth: '350px' }}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); }}
                    />
                    <button className="btn-neo btn-neo-lime" onClick={handleRenameSubmit} style={{ padding: '0.4rem 0.75rem' }}>
                      <Check size={16} /> SAVE
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, margin: 0 }}>
                      {activePlaylist.name} <span style={{ color: 'var(--accent-lime)' }}>({activeTracks.length})</span>
                    </h2>
                    <button
                      className="btn-neo btn-neo-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() => {
                        setEditTitleInput(activePlaylist.name);
                        setIsEditingTitle(true);
                      }}
                      title="Rename playlist"
                    >
                      <Edit2 size={14} /> RENAME
                    </button>
                  </div>
                )}
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.4rem', margin: 0 }}>
                  {activePlaylist.description || 'Your saved music collection.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="btn-neo btn-neo-lime"
                  onClick={() => setShowAddSongModal(true)}
                >
                  <PlusCircle size={18} /> + ADD SONG TO PLAYLIST
                </button>

                {activeTracks.length > 0 && (
                  <button
                    className="btn-neo btn-neo-secondary"
                    onClick={() => setShowExportModal(true)}
                  >
                    <Download size={18} /> EXPORT
                  </button>
                )}

                {playlists.length > 1 && (
                  <button
                    className="btn-neo btn-neo-red"
                    onClick={() => onDeletePlaylist(activePlaylist.id)}
                    title="Delete current playlist"
                  >
                    <Trash2 size={18} /> DELETE
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Search & Sort Controls Bar for Specific Playlist Tracks */}
          {activeTracks.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center', width: '100%' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="input-neo"
                  placeholder="Search tracks by title or artist..."
                  value={trackSearchQuery}
                  onChange={e => setTrackSearchQuery(e.target.value)}
                  style={{ paddingLeft: '2.3rem', width: '100%', height: '42px' }}
                />
              </div>
              <SortMenu
                value={trackSortBy}
                onChange={val => setTrackSortBy(val as any)}
                options={[
                  { label: 'Default Order', value: 'default' },
                  { label: 'Title (A-Z)', value: 'title-asc' },
                  { label: 'Title (Z-A)', value: 'title-desc' },
                  { label: 'Artist (A-Z)', value: 'artist-asc' },
                  { label: 'Artist (Z-A)', value: 'artist-desc' }
                ]}
              />
            </div>
          )}

          {/* Active Tracks List */}
          {activeTracks.length === 0 ? (
            <div className="tactile-card" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
              <BookmarkCheck size={48} style={{ color: 'var(--accent-red)', marginBottom: '1rem' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800 }}>
                THIS PLAYLIST IS EMPTY
              </h3>
              <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                Click "+ ADD SONG TO PLAYLIST" above to add tracks into "{activePlaylist.name}".
              </p>
              <button
                className="btn-neo btn-neo-lime"
                onClick={() => setShowAddSongModal(true)}
              >
                <PlusCircle size={18} /> ADD FIRST SONG
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {activeTracks
                .filter(rawTrack => {
                  if (!trackSearchQuery.trim()) return true;
                  const q = trackSearchQuery.toLowerCase();
                  const hydrated = RAMMetadataCache.hydrateTrack(rawTrack);
                  return hydrated.title.toLowerCase().includes(q) || hydrated.artist.toLowerCase().includes(q);
                })
                .sort((a, b) => {
                  if (trackSortBy === 'default') return 0;
                  const hA = RAMMetadataCache.hydrateTrack(a);
                  const hB = RAMMetadataCache.hydrateTrack(b);
                  if (trackSortBy === 'title-asc') return hA.title.localeCompare(hB.title);
                  if (trackSortBy === 'title-desc') return hB.title.localeCompare(hA.title);
                  if (trackSortBy === 'artist-asc') return hA.artist.localeCompare(hB.artist);
                  if (trackSortBy === 'artist-desc') return hB.artist.localeCompare(hA.artist);
                  return 0;
                })
                .map((rawTrack, idx) => {
                const track = RAMMetadataCache.hydrateTrack(rawTrack);
                const isInTaste = tasteItems.some(
                  t => t.title.trim().toLowerCase() === track.title.trim().toLowerCase() &&
                    t.artist.trim().toLowerCase() === track.artist.trim().toLowerCase()
                );
                const coverUrl = track.coverUrl || (track as any).cover_url || '';
                const isPlayingThis = currentPlayingTrackId ? (currentPlayingTrackId === track.id && isPlaying) : (playingTrackId === track.id);

                return (
                  <div
                    key={track.id}
                    className="tactile-card playlist-card-layout"
                  >
                    <div className="playlist-track-info">

                      {/* Album Cover Thumbnail (Empty if no cover - NO Castle/Concert placeholder) */}
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '4px',
                        border: '2px solid var(--border-color)',
                        backgroundColor: 'var(--bg-primary)',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {coverUrl ? (
                          <img
                            src={coverUrl}
                            alt={track.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : null}
                      </div>

                      <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
                        <MarqueeText
                          text={track.title}
                          style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}
                        />
                        <MarqueeText
                          text={track.artist}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-lime)', margin: '0.2rem 0 0 0' }}
                        />
                      </div>
                    </div>

                    <div className="playlist-actions-left">
                      <button
                        className={isPlayingThis ? "btn-neo btn-neo-red playlist-play-btn" : "btn-neo btn-neo-lime playlist-play-btn"}
                        style={{
                          padding: '0.45rem 0.75rem',
                          fontSize: '0.8rem',
                          backgroundColor: isPlayingThis ? '#EF4444' : undefined,
                          color: isPlayingThis ? '#FFFFFF' : undefined
                        }}
                        onClick={() => handleTogglePlayPlaylistTrack(track)}
                      >
                        {loadingPreviewId === track.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : isPlayingThis ? (
                          <><Pause size={14} /> PAUSE PREVIEW</>
                        ) : (
                          <><Play size={14} /> PLAY PREVIEW</>
                        )}
                      </button>

                      <button
                        className="btn-neo playlist-artwork-btn"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', backgroundColor: '#0D0E12', color: '#FFFFFF', border: '2px solid #FFFFFF' }}
                        onClick={() => setArtworkModalTrack({ artist: track.artist, title: track.title, coverUrl: track.coverUrl || (track as any).cover_url })}
                      >
                        <ImageIcon size={14} style={{ color: 'var(--accent-lime)' }} /> VIEW ARTWORK
                      </button>

                      <div className="playlist-actions-middle">
                        {isInTaste ? (
                          <span
                            className="badge-neo badge-lime playlist-taste-btn"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.3rem',
                              width: '100%',
                              padding: '0.45rem 0.75rem',
                              fontSize: '0.8rem',
                              boxSizing: 'border-box'
                            }}
                          >
                            <Check size={14} /> IN TASTE
                          </span>
                        ) : (
                          <button
                            className="btn-neo btn-neo-lime playlist-taste-btn"
                            style={{
                              width: '100%',
                              padding: '0.45rem 0.75rem',
                              fontSize: '0.8rem',
                              justifyContent: 'center'
                            }}
                            onClick={() => handleAddTrackToTasteAction(track)}
                            disabled={loadingActionId === `taste-${track.id}`}
                          >
                            {loadingActionId === `taste-${track.id}` ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <><Sparkles size={14} /> ADD TASTE</>
                            )}
                          </button>
                        )}
                      </div>

                      <div className="playlist-actions-right">
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.2rem' }}
                          onClick={() => handleRemoveTrackAction(track.id, activePlaylist.id)}
                          disabled={loadingActionId === `remove-${track.id}`}
                          title="Remove from playlist"
                        >
                          {loadingActionId === `remove-${track.id}` ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Song Modal */}
      {showAddSongModal && activePlaylist && createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '1rem',
          boxSizing: 'border-box'
        }} onClick={() => setShowAddSongModal(false)}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '3px solid var(--border-color)',
            boxShadow: '8px 8px 0px var(--accent-lime)',
            maxWidth: '520px',
            width: '100%',
            padding: '1.75rem'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span className="badge-neo badge-lime">ADD SONG TO PLAYLIST</span>
              <button
                onClick={() => setShowAddSongModal(false)}
                style={{ background: 'var(--accent-red)', color: '#fff', border: '1px solid #000', fontWeight: 800, padding: '0.2rem 0.6rem', cursor: 'pointer' }}
              >
                X CLOSE
              </button>
            </div>

            <form onSubmit={handleAddSongSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {!showCustomFallback ? (
                <div style={{ position: 'relative' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>
                    Search Catalog Track
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Talk Talk - Charli xcx"
                      value={trackSearchInput}
                      onChange={(e) => setTrackSearchInput(e.target.value)}
                      className="input-neo"
                      required
                      autoFocus
                    />
                    {isSearching && (
                      <Loader2 size={18} className="animate-spin" style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-lime)' }} />
                    )}
                  </div>

                  {/* Autocomplete Suggestions Without Music Icon */}
                  {searchResults.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%', left: 0, right: 0,
                      backgroundColor: 'var(--bg-secondary)',
                      border: '2px solid var(--border-color)',
                      boxShadow: '4px 4px 0px var(--accent-lime)',
                      zIndex: 50,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '0.2rem'
                    }}>
                      {searchResults.map((res, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectSearchResult(res)}
                          style={{
                            padding: '0.6rem 0.8rem',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-secondary)'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-lime-dim, rgba(200,255,0,0.15))'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                        >
                          {res}
                        </div>
                      ))}
                    </div>
                  )}

                  {isCatalogMatch !== null && (
                    <div style={{ marginTop: '0.5rem' }}>
                      {isCatalogMatch ? (
                        <span className="badge-neo badge-lime" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
                          <CheckCircle size={14} /> FOUND IN CATALOG
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                          <span className="badge-neo badge-dark" style={{ color: 'var(--accent-red)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
                            <AlertCircle size={14} /> NOT IN CATALOG
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowCustomFallback(true)}
                            className="btn-neo btn-neo-cyan"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            + ADD CUSTOM SONG
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Fallback Custom Form */
                <div style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-primary)',
                  border: '2px dashed var(--accent-lime)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  marginTop: '0.25rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-start', color: 'var(--accent-lime)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 800 }}>
                    <button
                      type="button"
                      onClick={() => setShowCustomFallback(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 800 }}
                    >
                      <span className="back-btn-text-full">← BACK TO SEARCH</span><span className="back-btn-text-short">← Back</span>
                    </button>
                  </div>

                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>
                      CUSTOM SONG TITLE *
                    </label>
                    <input
                      type="text"
                      className="input-neo"
                      placeholder="Talk Talk"
                      value={customTitleInput}
                      onChange={e => setCustomTitleInput(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>
                      CUSTOM ARTIST NAME *
                    </label>
                    <input
                      type="text"
                      className="input-neo"
                      placeholder="Charli xcx"
                      value={customArtistInput}
                      onChange={e => setCustomArtistInput(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-neo btn-neo-secondary"
                  onClick={() => setShowAddSongModal(false)}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="btn-neo btn-neo-lime"
                  disabled={isSubmittingNewTrack}
                >
                  {isSubmittingNewTrack ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Loader2 size={16} className="animate-spin" /> ADDING...
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <PlusCircle size={16} /> ADD TO PLAYLIST
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '1rem',
          boxSizing: 'border-box'
        }} onClick={() => setShowCreateModal(false)}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '3px solid var(--border-color)',
            boxShadow: '8px 8px 0px var(--accent-lime)',
            maxWidth: '460px',
            width: '100%',
            padding: '1.75rem'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span className="badge-neo badge-lime">CREATE PLAYLIST</span>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'var(--accent-red)', color: '#fff', border: '1px solid #000', fontWeight: 800, padding: '0.2rem 0.6rem', cursor: 'pointer' }}
              >
                X CLOSE
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>
                  PLAYLIST NAME *
                </label>
                <input
                  type="text"
                  placeholder="Late Night Vibes"
                  value={newPlaylistNameInput}
                  onChange={(e) => setNewPlaylistNameInput(e.target.value)}
                  className="input-neo"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>
                  DESCRIPTION (OPTIONAL)
                </label>
                <input
                  type="text"
                  placeholder="Synthwave & Electro Pop selections"
                  value={newPlaylistDescInput}
                  onChange={(e) => setNewPlaylistDescInput(e.target.value)}
                  className="input-neo"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-neo btn-neo-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="btn-neo btn-neo-lime"
                >
                  CREATE PLAYLIST
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <ArtworkModal
        isOpen={!!artworkModalTrack}
        onClose={() => setArtworkModalTrack(null)}
        artist={artworkModalTrack?.artist || ''}
        title={artworkModalTrack?.title || ''}
        currentCoverUrl={artworkModalTrack?.coverUrl}
      />
    </div>
  );
};
