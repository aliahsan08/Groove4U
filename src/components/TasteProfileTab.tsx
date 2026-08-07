import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TasteProfileItem, Track, UserProfileInfo } from '../types/music';
import { Star, Plus, Trash2, CheckCircle, AlertCircle, Loader2, ArrowLeft, Maximize2, Play, Pause, Music, User, Sparkles, Image as ImageIcon, X, ChevronDown, Search, ArrowUpDown } from 'lucide-react';
import { fetchOnDemandPreviewUrl } from '../services/api';
import { RAMMetadataCache } from '../services/metadataCache';
import { ArtworkModal } from './ArtworkModal';
import { MarqueeText } from './MarqueeText';
import { SortMenu } from './SortMenu';
import { findOrCreateArtist, searchGenresFromDB, validateGenreInDB, searchArtistsFromDB } from '../services/supabaseService';

interface TasteProfileTabProps {
  tasteItems: TasteProfileItem[];
  onAddTasteItem: (item: Omit<TasteProfileItem, 'id' | 'addedAt'>) => void;
  onUpdateRating: (itemId: string, newRating: number) => void;
  onDeleteTasteItem: (itemId: string) => void;
  onTogglePlay?: (track: Track) => void;
  currentPlayingTrackId?: string | null;
  isPlaying?: boolean;
  userProfile?: UserProfileInfo;
  onSaveProfile?: (updatedProfile: UserProfileInfo) => Promise<void>;
}

export const TasteProfileTab: React.FC<TasteProfileTabProps> = ({
  tasteItems,
  onAddTasteItem,
  onUpdateRating,
  onDeleteTasteItem,
  onTogglePlay,
  currentPlayingTrackId,
  isPlaying = false,
  userProfile,
  onSaveProfile
}) => {
  const [isFullDeckView, setIsFullDeckView] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'songs' | 'genres' | 'artists'>('songs');
  const [isSubTabDropdownOpen, setIsSubTabDropdownOpen] = useState(false);
  const [customGenre, setCustomGenre] = useState('');
  const [artworkModalTrack, setArtworkModalTrack] = useState<{ artist: string; title: string; coverUrl?: string } | null>(null);

  // Search & Sort States
  const [fullDeckSearchQuery, setFullDeckSearchQuery] = useState('');
  const [fullDeckSortBy, setFullDeckSortBy] = useState<'rating-desc' | 'rating-asc' | 'title-asc' | 'title-desc' | 'artist-asc' | 'artist-desc'>('rating-desc');
  const [genresFilterQuery, setGenresFilterQuery] = useState('');
  const [genresSortBy, setGenresSortBy] = useState<'name-asc' | 'name-desc'>('name-asc');
  const [artistsFilterQuery, setArtistsFilterQuery] = useState('');
  const [artistsSortBy, setArtistsSortBy] = useState<'name-asc' | 'name-desc'>('name-asc');

  // Input states
  const [newArtistInput, setNewArtistInput] = useState('');
  const [newGenreInput, setNewGenreInput] = useState('');

  // Live DB Auto-suggest & validation states
  const [genreSuggestions, setGenreSuggestions] = useState<string[]>([]);
  const [artistSuggestions, setArtistSuggestions] = useState<string[]>([]);
  const [genreErrorMessage, setGenreErrorMessage] = useState<string | null>(null);

  // Live Genre DB Search Effect
  useEffect(() => {
    if (!newGenreInput.trim()) {
      setGenreSuggestions([]);
      setGenreErrorMessage(null);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchGenresFromDB(newGenreInput);
      setGenreSuggestions(results);
    }, 180);
    return () => clearTimeout(timer);
  }, [newGenreInput]);

  // Live Artist DB Search Effect
  useEffect(() => {
    if (!newArtistInput.trim()) {
      setArtistSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchArtistsFromDB(newArtistInput);
      setArtistSuggestions(results);
    }, 180);
    return () => clearTimeout(timer);
  }, [newArtistInput]);

  // Audio Preview Player State
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioInstance) {
        audioInstance.pause();
      }
    };
  }, [audioInstance]);

  const handleTogglePlayTaste = async (artist: string, title: string, itemId: string, itemGenre?: string, itemCover?: string) => {
    setLoadingPreviewId(itemId);
    let pUrl: string | null = null;
    try {
      pUrl = await fetchOnDemandPreviewUrl(artist, title);
    } catch {
      pUrl = null;
    } finally {
      setLoadingPreviewId(null);
    }

    if (onTogglePlay) {
      const trackObj: Track = {
        id: itemId,
        title,
        artist,
        genre: itemGenre || 'Music',
        year: 2024,
        album: 'Single',
        coverUrl: itemCover || RAMMetadataCache.get(artist, title)?.coverUrl || '',
        previewUrl: pUrl || undefined,
        features: { energy: 75, danceability: 75, valence: 65, acousticness: 20, underground: 50, bpm: 120 }
      };
      onTogglePlay(trackObj);
      return;
    }

    if (playingTrackId === itemId) {
      if (audioInstance) audioInstance.pause();
      setPlayingTrackId(null);
      setAudioInstance(null);
      return;
    }

    if (!pUrl) {
      alert(`Audio preview not available for "${title}" by ${artist}`);
      return;
    }

    if (audioInstance) audioInstance.pause();
    const audio = new Audio(pUrl);
    audio.play().catch(err => console.error('[TasteProfile] Audio play error:', err));
    audio.onended = () => {
      setPlayingTrackId(null);
      setAudioInstance(null);
    };
    setAudioInstance(audio);
    setPlayingTrackId(itemId);
  };

  // Search input state
  const [trackSearchInput, setTrackSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCatalogMatch, setIsCatalogMatch] = useState<boolean | null>(null);

  // Custom Track Fallback state
  const [showCustomFallback, setShowCustomFallback] = useState(false);
  const [customTitleInput, setCustomTitleInput] = useState('');
  const [customArtistInput, setCustomArtistInput] = useState('');
  const [customGenreInput, setCustomGenreInput] = useState('');

  const [selectedRating, setSelectedRating] = useState<number>(8);
  const [isSubmittingNewTrack, setIsSubmittingNewTrack] = useState(false);

  // Search catalog autocomplete with dash-agnostic normalization
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

  const handleSelectSearchResult = async (trackStr: string) => {
    setSearchResults([]);
    setIsCatalogMatch(true);
    setShowCustomFallback(false);
    setTrackSearchInput('');

    const parts = trackStr.split(/[-—–]/);
    const title = parts[0]?.trim() || trackStr;
    const artist = parts.length > 1 ? parts[1]?.trim() : 'Various Artists';

    await onAddTasteItem({
      title,
      artist,
      genre: customGenreInput || 'Music',
      year: 2024,
      rating: selectedRating,
      coverUrl: ''
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (showCustomFallback) {
      if (!customTitleInput.trim() || !customArtistInput.trim()) return;

      setIsSubmittingNewTrack(true);
      try {
        // Auto-save custom track artist to Supabase artists table if missing
        try {
          await findOrCreateArtist(customArtistInput.trim());
        } catch (err) {
          console.warn('[TasteProfile] Auto-save custom track artist error:', err);
        }

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
        const finalGenre = data?.enriched?.genre || customGenreInput || 'Music';

        onAddTasteItem({
          title: customTitleInput.trim(),
          artist: customArtistInput.trim(),
          genre: finalGenre,
          year: new Date().getFullYear(),
          rating: selectedRating,
          coverUrl: data?.enriched?.coverUrl || data?.enriched?.cover_url || ''
        });

        setCustomTitleInput('');
        setCustomArtistInput('');
        setCustomGenreInput('');
        setShowCustomFallback(false);
        setTrackSearchInput('');
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

      onAddTasteItem({
        title,
        artist,
        genre: customGenreInput || 'Music',
        year: 2024,
        rating: selectedRating,
        coverUrl: ''
      });

      setTrackSearchInput('');
      setIsCatalogMatch(null);
      setSearchResults([]);
    }
  };

  // Full Dedicated View
  if (isFullDeckView) {
    const hydratedItems = tasteItems.map(item => {
      const cached = RAMMetadataCache.get(item.artist, item.title);
      return {
        ...item,
        coverUrl: item.coverUrl || cached?.coverUrl || ''
      };
    });

    return (
      <div style={{ padding: '2.5rem 1.5rem', maxWidth: '1350px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
          <button
            className="btn-neo btn-neo-lime"
            onClick={() => setIsFullDeckView(false)}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={18} /> <span className="back-btn-text-full">BACK TO TASTE PROFILE</span><span className="back-btn-text-short">Back</span>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <span className="badge-neo badge-lime" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>DEDICATED VIEW</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, marginTop: '0.85rem' }}>
              ALL RATED SONGS <span style={{ color: 'var(--accent-lime)' }}>({tasteItems.length})</span>
            </h2>
          </div>
        </div>

        {/* Controls Bar: Search & Sort for Full Deck View */}
        {hydratedItems.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center', width: '100%' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input-neo"
                placeholder="Search rated songs, artists, genres..."
                value={fullDeckSearchQuery}
                onChange={e => setFullDeckSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.3rem', width: '100%', height: '42px' }}
              />
            </div>
            <SortMenu
              value={fullDeckSortBy}
              onChange={val => setFullDeckSortBy(val as any)}
              options={[
                { label: 'Highest Rated', value: 'rating-desc' },
                { label: 'Lowest Rated', value: 'rating-asc' },
                { label: 'Title (A-Z)', value: 'title-asc' },
                { label: 'Title (Z-A)', value: 'title-desc' },
                { label: 'Artist (A-Z)', value: 'artist-asc' },
                { label: 'Artist (Z-A)', value: 'artist-desc' }
              ]}
            />
          </div>
        )}

        {hydratedItems.length === 0 ? (
          <div className="tactile-card" style={{ padding: '4rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            NO RATED SONGS IN YOUR DECK YET.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {hydratedItems
              .filter(item => {
                if (!fullDeckSearchQuery.trim()) return true;
                const q = fullDeckSearchQuery.toLowerCase();
                return item.title.toLowerCase().includes(q) ||
                  item.artist.toLowerCase().includes(q) ||
                  item.genre.toLowerCase().includes(q);
              })
              .sort((a, b) => {
                if (fullDeckSortBy === 'rating-desc') return b.rating - a.rating;
                if (fullDeckSortBy === 'rating-asc') return a.rating - b.rating;
                if (fullDeckSortBy === 'title-asc') return a.title.localeCompare(b.title);
                if (fullDeckSortBy === 'title-desc') return b.title.localeCompare(a.title);
                if (fullDeckSortBy === 'artist-asc') return a.artist.localeCompare(b.artist);
                if (fullDeckSortBy === 'artist-desc') return b.artist.localeCompare(a.artist);
                return 0;
              })
              .map(item => (
              <div
                key={item.id}
                className="tactile-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '1.25rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span className="badge-neo badge-lime" style={{ fontSize: '0.75rem' }}>
                      RATING: {item.rating} / 10
                    </span>
                    <button
                      onClick={() => onDeleteTasteItem(item.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}
                      title="Delete song rating"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {/* Album Cover Container */}
                  {(() => {
                    const coverImage = item.coverUrl;
                    const isPlayingThis = currentPlayingTrackId ? (currentPlayingTrackId === item.id && isPlaying) : (playingTrackId === item.id);

                    return (
                      <div style={{
                        position: 'relative',
                        marginBottom: '1rem',
                        width: '100%',
                        height: '210px',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: '2px solid var(--border-color)',
                        backgroundColor: 'var(--bg-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      onClick={() => setArtworkModalTrack({ artist: item.artist, title: item.title, coverUrl: item.coverUrl })}
                      title="Click to view artwork"
                      >
                        {coverImage ? (
                          <img
                            src={coverImage}
                            alt={`${item.title} cover`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                              filter: isPlayingThis ? 'brightness(0.85)' : 'none',
                              transition: 'filter 0.3s'
                            }}
                          />
                        ) : (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            NO COVER
                          </div>
                        )}

                        {/* Top Right View Artwork Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setArtworkModalTrack({ artist: item.artist, title: item.title, coverUrl: item.coverUrl });
                          }}
                          className="btn-neo"
                          style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            backgroundColor: '#0D0E12',
                            color: '#FFFFFF',
                            border: '2px solid #FFFFFF',
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            boxShadow: '2px 2px 0px #000000',
                            zIndex: 3,
                            cursor: 'pointer'
                          }}
                        >
                          <ImageIcon size={14} style={{ color: 'var(--accent-lime)' }} /> VIEW ARTWORK
                        </button>

                        {/* Audio Preview Trigger Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlayTaste(item.artist, item.title, item.id, item.genre, item.coverUrl);
                          }}
                          className="btn-neo"
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            backgroundColor: isPlayingThis ? 'var(--accent-red)' : 'var(--accent-lime)',
                            color: '#000',
                            padding: '0.5rem 0.85rem',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            boxShadow: 'var(--shadow-sm)',
                            zIndex: 2
                          }}
                        >
                          {isPlayingThis ? <Pause size={16} /> : <Play size={16} />}
                          {isPlayingThis ? 'PAUSE PREVIEW' : 'PLAY PREVIEW'}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Track Title & Artist Name with Smart Marquee */}
                  <div style={{ marginBottom: '0.4rem' }}>
                    <MarqueeText
                      text={item.title}
                      style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}
                    />
                    <MarqueeText
                      text={item.artist}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--accent-lime)', fontWeight: 700 }}
                    />
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div style={{ borderTop: '2px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button
                    className="btn-neo btn-neo-lime"
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                      justifyContent: 'center',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      cursor: 'pointer'
                    }}
                    onClick={() => setArtworkModalTrack({ artist: item.artist, title: item.title, coverUrl: item.coverUrl })}
                  >
                    <ImageIcon size={16} /> VIEW ARTWORK
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      CHANGE RATING:
                    </span>
                    <select
                      value={item.rating}
                      onChange={e => onUpdateRating(item.id, parseInt(e.target.value))}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--accent-lime)',
                        border: '2px solid var(--border-color)',
                        padding: '0.25rem 0.5rem',
                        cursor: 'pointer'
                      }}
                    >
                      {[1,2,3,4,5,6,7,8,9,10].map(r => (
                        <option key={r} value={r}>{r} / 10</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
  }

  // Genre Handlers
  const handleAddGenreInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGenreInput.trim() || !userProfile || !onSaveProfile) return;
    const inputClean = newGenreInput.trim();

    // STRICT VALIDATION AGAINST SUPABASE GENRES TABLE
    const matchedGenre = await validateGenreInDB(inputClean);
    if (!matchedGenre) {
      setGenreErrorMessage(`Genre "${inputClean}" is not recognized in our database. Only database genres are allowed.`);
      return;
    }

    setGenreErrorMessage(null);
    const current = userProfile.topGenres || [];
    if (!current.some(g => g.toLowerCase() === matchedGenre.toLowerCase())) {
      await onSaveProfile({ ...userProfile, topGenres: [...current, matchedGenre] });
    }
    setNewGenreInput('');
    setGenreSuggestions([]);
  };

  const handleRemoveGenre = async (genre: string) => {
    if (!userProfile || !onSaveProfile) return;
    const updated = (userProfile.topGenres || []).filter(g => g !== genre);
    await onSaveProfile({ ...userProfile, topGenres: updated });
  };

  // Artist Handlers
  const handleAddArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArtistInput.trim() || !userProfile || !onSaveProfile) return;
    const name = newArtistInput.trim();

    // CUSTOM ARTIST ALLOWED -> AUTOMATICALLY SAVE/UPSERT ARTIST TO SUPABASE ARTISTS TABLE!
    try {
      await findOrCreateArtist(name);
    } catch (err) {
      console.warn('[TasteProfile] Auto-save artist error:', err);
    }

    const current = userProfile.topArtists || [];
    if (!current.some(a => a.toLowerCase() === name.toLowerCase())) {
      await onSaveProfile({ ...userProfile, topArtists: [...current, name] });
    }
    setNewArtistInput('');
    setArtistSuggestions([]);
  };

  const handleRemoveArtist = async (artist: string) => {
    if (!userProfile || !onSaveProfile) return;
    const updated = (userProfile.topArtists || []).filter(a => a !== artist);
    await onSaveProfile({ ...userProfile, topArtists: updated });
  };

  return (
    <div style={{ padding: '2.5rem 1.5rem', maxWidth: '1350px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <span className="badge-neo badge-lime" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>ALGORITHM VECTOR CALIBRATION</span>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, marginTop: '0.85rem' }}>
          TASTE PROFILE <span style={{ color: 'var(--accent-lime)' }}>DECK</span>
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Manage your rated songs, favorite genres, and top artists.
        </p>
      </div>

      {/* Desktop Sub-Tabs Navigation */}
      <div className="sub-tabs-desktop sub-tabs-container" style={{ gap: '0.75rem', paddingBottom: '0.75rem', marginBottom: '2rem', borderBottom: '2px solid var(--border-color)' }}>
        <button
          className={`sub-tab-btn ${activeSubTab === 'songs' ? 'sub-tab-active' : ''}`}
          onClick={() => setActiveSubTab('songs')}
          style={{ flexShrink: 0 }}
        >
          <Music size={16} /> RATED SONGS ({tasteItems.length})
        </button>

        <button
          className={`sub-tab-btn ${activeSubTab === 'genres' ? 'sub-tab-active' : ''}`}
          onClick={() => setActiveSubTab('genres')}
          style={{ flexShrink: 0 }}
        >
          <Sparkles size={16} /> TOP GENRES ({(userProfile?.topGenres || []).length})
        </button>

        <button
          className={`sub-tab-btn ${activeSubTab === 'artists' ? 'sub-tab-active' : ''}`}
          onClick={() => setActiveSubTab('artists')}
          style={{ flexShrink: 0 }}
        >
          <User size={16} /> TOP ARTISTS ({(userProfile?.topArtists || []).length})
        </button>
      </div>

      {/* Mobile Sub-Tabs Dropdown */}
      <div className="sub-tabs-mobile" style={{ marginBottom: '2rem', position: 'relative' }}>
        <button 
          className="btn-neo"
          style={{ width: '100%', justifyContent: 'space-between', backgroundColor: 'var(--bg-secondary)', padding: '1rem', color: 'var(--text-main)' }}
          onClick={() => setIsSubTabDropdownOpen(!isSubTabDropdownOpen)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {activeSubTab === 'songs' && <><Music size={18} /> RATED SONGS ({tasteItems.length})</>}
            {activeSubTab === 'genres' && <><Sparkles size={18} /> TOP GENRES ({(userProfile?.topGenres || []).length})</>}
            {activeSubTab === 'artists' && <><User size={18} /> TOP ARTISTS ({(userProfile?.topArtists || []).length})</>}
          </div>
          <ChevronDown size={20} style={{ transform: isSubTabDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {isSubTabDropdownOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.5rem',
            backgroundColor: 'var(--bg-secondary)',
            border: '2px solid var(--border-color)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <button
              onClick={() => { setActiveSubTab('songs'); setIsSubTabDropdownOpen(false); }}
              style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: activeSubTab === 'songs' ? 'var(--bg-card-hover)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              <Music size={16} /> RATED SONGS ({tasteItems.length})
            </button>
            <button
              onClick={() => { setActiveSubTab('genres'); setIsSubTabDropdownOpen(false); }}
              style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: activeSubTab === 'genres' ? 'var(--bg-card-hover)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              <Sparkles size={16} /> TOP GENRES ({(userProfile?.topGenres || []).length})
            </button>
            <button
              onClick={() => { setActiveSubTab('artists'); setIsSubTabDropdownOpen(false); }}
              style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: activeSubTab === 'artists' ? 'var(--bg-card-hover)' : 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              <User size={16} /> TOP ARTISTS ({(userProfile?.topArtists || []).length})
            </button>
          </div>
        )}
      </div>

      {/* SUB-TAB 1: RATED SONGS */}
      {activeSubTab === 'songs' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '2rem' }}>
          {/* Left Column: Adder Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="tactile-card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800, marginBottom: '1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                ADD RATED SONG TO PROFILE
              </h3>

              <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {!showCustomFallback ? (
                  <div style={{ position: 'relative' }}>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                      Search Catalog Track
                    </label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        type="text"
                        className="input-neo"
                        placeholder="Talk Talk - Charli xcx"
                        value={trackSearchInput}
                        onChange={e => setTrackSearchInput(e.target.value)}
                        required
                        style={{ paddingRight: '2.5rem', width: '100%' }}
                      />
                      {isSearching && (
                        <Loader2 size={18} className="animate-spin" style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-lime)' }} />
                      )}
                    </div>

                    {/* Autocomplete Dropdown Without Music Icon */}
                    {searchResults.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%', left: 0, right: 0,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '2px solid var(--border-color)',
                        boxShadow: '4px 4px 0px var(--accent-lime)',
                        zIndex: 50,
                        maxHeight: '220px',
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
                  /* Custom Song Form */
                  <div style={{
                    padding: '1rem',
                    backgroundColor: 'var(--bg-primary)',
                    border: '2px dashed var(--accent-lime)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
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

                {/* Rating Input */}
                <div>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    YOUR RATING: <strong style={{ color: 'var(--accent-lime)' }}>{selectedRating} / 10</strong>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={selectedRating}
                    onChange={e => setSelectedRating(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-lime)', cursor: 'pointer' }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-neo btn-neo-lime"
                  disabled={isSubmittingNewTrack}
                  style={{ marginTop: '0.5rem', justifyContent: 'center' }}
                >
                  {isSubmittingNewTrack ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Loader2 size={16} className="animate-spin" /> SAVING...
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Plus size={16} /> SAVE TO TASTE PROFILE
                    </span>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: User Rated Taste Deck */}
          <div>
            <div className="tactile-card" style={{ minHeight: '520px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800 }}>
                  RATED SONGS DECK <span style={{ color: 'var(--accent-lime)' }}>({tasteItems.length})</span>
                </h3>
                {tasteItems.length > 0 && (
                  <button
                    className="btn-neo btn-neo-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                    onClick={() => setIsFullDeckView(true)}
                  >
                    <Maximize2 size={14} /> VIEW MORE
                  </button>
                )}
              </div>

              {tasteItems.length === 0 ? (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  NO RATED SONGS YET.<br />
                  Search a track to add your ratings.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {tasteItems.slice(0, 3).map(rawItem => {
                    const item = RAMMetadataCache.hydrateTrack(rawItem);
                    const coverUrl = item.coverUrl || (item as any).cover_url || '';

                    return (
                      <div
                        key={item.id}
                        className="taste-card-layout tactile-card"
                      >
                        <div className="taste-track-info">
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-secondary)',
                            overflow: 'hidden',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {coverUrl ? (
                              <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : null}
                          </div>
                          <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
                            <MarqueeText
                              text={item.title}
                              style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}
                            />
                            <MarqueeText
                              text={item.artist}
                              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-lime)', fontWeight: 700, margin: 0 }}
                            />
                          </div>
                        </div>

                        <div className="taste-actions-left">
                          {(() => {
                            const isPlayingThis = currentPlayingTrackId ? (currentPlayingTrackId === item.id && isPlaying) : (playingTrackId === item.id);
                            return (
                              <>
                                <button
                                  className="btn-neo taste-play-btn"
                                  style={{
                                    padding: '0.3rem 0.6rem',
                                    fontSize: '0.75rem',
                                    backgroundColor: isPlayingThis ? '#EF4444' : 'var(--accent-lime)',
                                    color: isPlayingThis ? '#FFFFFF' : '#000000',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                  }}
                                  onClick={() => handleTogglePlayTaste(item.artist, item.title, item.id, item.genre, item.coverUrl)}
                                  disabled={loadingPreviewId === item.id}
                                >
                                  {loadingPreviewId === item.id ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : isPlayingThis ? (
                                    <><Pause size={13} /> PAUSE</>
                                  ) : (
                                    <><Play size={13} /> PLAY</>
                                  )}
                                </button>

                                <button
                                  className="btn-neo taste-artwork-btn"
                                  style={{
                                    padding: '0.3rem 0.6rem',
                                    fontSize: '0.75rem',
                                    backgroundColor: '#0D0E12',
                                    color: '#FFFFFF',
                                    border: '2px solid #FFFFFF',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                  }}
                                  onClick={() => setArtworkModalTrack({ artist: item.artist, title: item.title, coverUrl: coverUrl })}
                                >
                                  <ImageIcon size={13} style={{ color: 'var(--accent-lime)' }} /> VIEW ARTWORK
                                </button>
                              </>
                            );
                          })()}
                        </div>

                        <div className="taste-actions-middle">
                          <div className="taste-rating-dropdown" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Star size={16} style={{ color: 'var(--accent-lime)', fill: 'var(--accent-lime)' }} />
                            <select
                              value={item.rating}
                              onChange={e => onUpdateRating(item.id, parseInt(e.target.value))}
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 800,
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--accent-lime)',
                                border: '1px solid var(--border-color)',
                                padding: '0.2rem 0.4rem',
                                cursor: 'pointer'
                              }}
                            >
                              {[1,2,3,4,5,6,7,8,9,10].map(r => (
                                <option key={r} value={r}>{r} / 10</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="taste-actions-right">
                          <button
                            onClick={() => onDeleteTasteItem(item.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.2rem' }}
                            title="Delete song rating"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {tasteItems.length > 3 && (
                    <button
                      className="btn-neo btn-neo-lime"
                      style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center' }}
                      onClick={() => setIsFullDeckView(true)}
                    >
                      <Maximize2 size={16} /> VIEW MORE ({tasteItems.length - 3} MORE SONGS)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TOP GENRES (TYPABLE INPUT FIELD) */}
      {activeSubTab === 'genres' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="tactile-card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800, marginBottom: '1.25rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              YOUR TOP GENRES <span style={{ color: 'var(--accent-lime)' }}>({(userProfile?.topGenres || []).length})</span>
            </h3>

            {/* Typable Free-Text Genre Input Form with Live DB Auto-Suggest & Strict Enforcement */}
            <form onSubmit={handleAddGenreInput} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                <input
                  type="text"
                  className="input-neo"
                  placeholder="Search database genres (e.g. Hip-Hop, R&B, Pop)"
                  value={newGenreInput}
                  onChange={e => {
                    setNewGenreInput(e.target.value);
                    setGenreErrorMessage(null);
                  }}
                  style={{ width: '100%' }}
                />
                {/* Database Suggestions Dropdown */}
                {genreSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)',
                    borderRadius: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                  }}>
                    {genreSuggestions.map((g, i) => (
                      <div
                        key={g}
                        onClick={() => {
                          const selectedG = g;
                          setNewGenreInput('');
                          setGenreSuggestions([]);
                          setGenreErrorMessage(null);
                          if (userProfile && onSaveProfile && !userProfile.topGenres?.includes(selectedG)) {
                            const updatedGenres = [...(userProfile.topGenres || []), selectedG];
                            onSaveProfile({ ...userProfile, topGenres: updatedGenres });
                          }
                        }}
                        style={{
                          padding: '0.65rem 0.85rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                          fontSize: '0.825rem', borderBottom: i < genreSuggestions.length - 1 ? '1px solid var(--border-color)' : 'none',
                          backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                          transition: 'background-color 0.15s, color 0.15s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--accent-lime)';
                          e.currentTarget.style.color = '#000000';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                      >
                        {g}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" className="btn-neo btn-neo-lime" style={{ padding: '0.65rem 1.25rem' }}>
                <Plus size={16} /> ADD GENRE
              </button>

              {/* Mismatch Error Warning Banner */}
              {genreErrorMessage && (
                <div style={{
                  width: '100%', padding: '0.65rem 0.85rem', backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '2px solid var(--accent-red)', borderRadius: '4px', color: 'var(--accent-red)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem'
                }}>
                  <AlertCircle size={16} /> {genreErrorMessage}
                </div>
              )}
            </form>

            {/* Active Selected Top Genres Cards Grid */}
            {(userProfile?.topGenres || []).length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                NO FAVORITE GENRES ADDED YET. TYPE A GENRE ABOVE TO ADD.
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center', width: '100%' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="input-neo"
                      placeholder="Filter top genres..."
                      value={genresFilterQuery}
                      onChange={e => setGenresFilterQuery(e.target.value)}
                      style={{ paddingLeft: '2.3rem', width: '100%', height: '42px' }}
                    />
                  </div>
                  <SortMenu
                    value={genresSortBy}
                    onChange={val => setGenresSortBy(val as any)}
                    options={[
                      { label: 'Sort: A-Z', value: 'name-asc' },
                      { label: 'Sort: Z-A', value: 'name-desc' }
                    ]}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {(userProfile?.topGenres || [])
                    .filter(g => {
                      if (!genresFilterQuery.trim()) return true;
                      return g.toLowerCase().includes(genresFilterQuery.toLowerCase());
                    })
                    .sort((a, b) => {
                      if (genresSortBy === 'name-asc') return a.localeCompare(b);
                      return b.localeCompare(a);
                    })
                    .map(g => (
                  <div
                    key={g}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1rem',
                      backgroundColor: 'var(--bg-primary)',
                      border: '2px solid var(--border-color)',
                      borderRadius: '4px'
                    }}
                  >
                    <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-lime)', margin: 0 }}>
                      {g}
                    </h4>

                    <button
                      onClick={() => handleRemoveGenre(g)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.25rem' }}
                      title="Remove genre"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: TOP ARTISTS */}
      {activeSubTab === 'artists' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="tactile-card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800, marginBottom: '1.25rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              YOUR TOP ARTISTS <span style={{ color: 'var(--accent-lime)' }}>({(userProfile?.topArtists || []).length})</span>
            </h3>

            {/* Add Artist Form with Live DB Auto-Suggest & Custom Artist Auto-Save */}
            <form onSubmit={handleAddArtist} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                <input
                  type="text"
                  className="input-neo"
                  placeholder="Search or enter artist (e.g. A$AP Rocky, Beach House, Alex Turner)"
                  value={newArtistInput}
                  onChange={e => setNewArtistInput(e.target.value)}
                  style={{ width: '100%' }}
                />
                {/* Database Artist Suggestions Dropdown */}
                {artistSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)',
                    borderRadius: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                  }}>
                    {artistSuggestions.map((a, i) => (
                      <div
                        key={a}
                        onClick={() => {
                          const selectedA = a;
                          setNewArtistInput('');
                          setArtistSuggestions([]);
                          if (userProfile && onSaveProfile && !userProfile.topArtists?.includes(selectedA)) {
                            const updatedArtists = [...(userProfile.topArtists || []), selectedA];
                            onSaveProfile({ ...userProfile, topArtists: updatedArtists });
                          }
                        }}
                        style={{
                          padding: '0.65rem 0.85rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                          fontSize: '0.825rem', borderBottom: i < artistSuggestions.length - 1 ? '1px solid var(--border-color)' : 'none',
                          backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                          transition: 'background-color 0.15s, color 0.15s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--accent-lime)';
                          e.currentTarget.style.color = '#000000';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                      >
                        {a}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" className="btn-neo btn-neo-lime" style={{ padding: '0.65rem 1.25rem' }}>
                <Plus size={16} /> ADD ARTIST
              </button>
            </form>

            {(userProfile?.topArtists || []).length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                NO FAVORITE ARTISTS ADDED YET. ADD ARTISTS ABOVE.
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center', width: '100%' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="input-neo"
                      placeholder="Filter top artists..."
                      value={artistsFilterQuery}
                      onChange={e => setArtistsFilterQuery(e.target.value)}
                      style={{ paddingLeft: '2.3rem', width: '100%', height: '42px' }}
                    />
                  </div>
                  <SortMenu
                    value={artistsSortBy}
                    onChange={val => setArtistsSortBy(val as any)}
                    options={[
                      { label: 'Sort: A-Z', value: 'name-asc' },
                      { label: 'Sort: Z-A', value: 'name-desc' }
                    ]}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {(userProfile?.topArtists || [])
                    .filter(a => {
                      if (!artistsFilterQuery.trim()) return true;
                      return a.toLowerCase().includes(artistsFilterQuery.toLowerCase());
                    })
                    .sort((a, b) => {
                      if (artistsSortBy === 'name-asc') return a.localeCompare(b);
                      return b.localeCompare(a);
                    })
                    .map(artist => (
                  <div
                    key={artist}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1rem',
                      backgroundColor: 'var(--bg-primary)',
                      border: '2px solid var(--border-color)',
                      borderRadius: '4px'
                    }}
                  >
                    <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-lime)', margin: 0 }}>
                      {artist}
                    </h4>

                    <button
                      onClick={() => handleRemoveArtist(artist)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.25rem' }}
                      title="Remove artist"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Deck Expanded View Modal */}
      {isFullDeckView && createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99990,
          padding: '1.5rem',
          boxSizing: 'border-box',
          overflowY: 'auto'
        }} onClick={() => setIsFullDeckView(false)}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '3px solid var(--border-color)',
            boxShadow: '10px 10px 0px #000000',
            borderRadius: '8px',
            maxWidth: '850px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            color: 'var(--text-main)',
            position: 'relative',
            margin: 'auto'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
                ALL RATED SONGS DECK <span style={{ color: 'var(--accent-lime)' }}>({tasteItems.length})</span>
              </h3>
              <button
                onClick={() => setIsFullDeckView(false)}
                className="btn-neo btn-neo-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                <X size={18} /> CLOSE
              </button>
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: '0.5rem' }}>
              {tasteItems.map(rawItem => {
                const item = RAMMetadataCache.hydrateTrack(rawItem);
                const coverUrl = item.coverUrl || (item as any).cover_url || '';
                const isPlayingThis = currentPlayingTrackId ? (currentPlayingTrackId === item.id && isPlaying) : (playingTrackId === item.id);

                return (
                  <div
                    key={item.id}
                    className="taste-card-layout tactile-card"
                  >
                    <div className="taste-track-info">
                      {/* Clickable Album Cover Thumbnail */}
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '4px',
                          border: '2px solid var(--border-color)',
                          backgroundColor: 'var(--bg-secondary)',
                          overflow: 'hidden',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        onClick={() => setArtworkModalTrack({ artist: item.artist, title: item.title, coverUrl: coverUrl })}
                        title="Click to view artwork"
                      >
                        {coverUrl ? (
                          <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : null}
                      </div>

                      <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
                        <MarqueeText
                          text={item.title}
                          style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}
                        />
                        <MarqueeText
                          text={item.artist}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-lime)', fontWeight: 700, margin: 0 }}
                        />
                      </div>
                    </div>
                    <div className="taste-actions-left">
                      <button
                        className="btn-neo taste-play-btn"
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.75rem',
                          backgroundColor: isPlayingThis ? '#EF4444' : 'var(--accent-lime)',
                          color: isPlayingThis ? '#FFFFFF' : '#000000',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                        onClick={() => handleTogglePlayTaste(item.artist, item.title, item.id, item.genre, item.coverUrl)}
                        disabled={loadingPreviewId === item.id}
                      >
                        {loadingPreviewId === item.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : isPlayingThis ? (
                          <><Pause size={13} /> PAUSE</>
                        ) : (
                          <><Play size={13} /> PLAY</>
                        )}
                      </button>

                      <button
                        className="btn-neo taste-artwork-btn"
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.75rem',
                          backgroundColor: '#0D0E12',
                          color: '#FFFFFF',
                          border: '2px solid #FFFFFF',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                        onClick={() => setArtworkModalTrack({ artist: item.artist, title: item.title, coverUrl: coverUrl })}
                      >
                        <ImageIcon size={13} style={{ color: 'var(--accent-lime)' }} /> VIEW ARTWORK
                      </button>
                    </div>

                    <div className="taste-actions-middle">
                      <div className="taste-rating-dropdown" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Star size={16} style={{ color: 'var(--accent-lime)', fill: 'var(--accent-lime)' }} />
                        <select
                          value={item.rating}
                          onChange={e => onUpdateRating(item.id, parseInt(e.target.value))}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--accent-lime)',
                            border: '1px solid var(--border-color)',
                            padding: '0.2rem 0.4rem',
                            cursor: 'pointer'
                          }}
                        >
                          {[1,2,3,4,5,6,7,8,9,10].map(r => (
                            <option key={r} value={r}>{r} / 10</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="taste-actions-right">
                      <button
                        onClick={() => onDeleteTasteItem(item.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.2rem' }}
                        title="Delete song rating"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Artwork Modal rendered AFTER isFullDeckView portal so it always appends on top in document.body */}
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
