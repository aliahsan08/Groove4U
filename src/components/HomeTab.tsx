import React, { useState, useEffect, useRef } from 'react';
import { Track, Playlist, UserProfileInfo, TasteProfileItem } from '../types/music';
import { Sparkles, Music, Star, ChevronDown, Check, Plus, AlertCircle, Play, Pause, Loader2, Image as ImageIcon, CheckCircle, Search, Save, ChevronLeft, ChevronRight, Bookmark } from 'lucide-react';
import { RAMMetadataCache } from '../services/metadataCache';
import { ArtworkModal } from './ArtworkModal';
import { fetchOnDemandPreviewUrl } from '../services/api';
import { MarqueeText } from './MarqueeText';

interface HomeTabProps {
  top5Tracks: Track[];
  onGenerateRecommendations: (limit?: number) => void;
  isGenerating: boolean;
  playlists: Playlist[];
  onToggleTrackInPlaylist: (track: Track, playlistId: string) => Promise<void>;
  onCreatePlaylist: (name: string) => Promise<Playlist>;
  userProfile?: UserProfileInfo;
  tasteCount?: number;
  tasteItems: TasteProfileItem[];
  onAddTrackToTasteProfile: (track: Track, rating?: number) => Promise<void>;
  onTogglePlay?: (track: Track) => void;
  currentPlayingTrackId?: string | null;
  isPlaying?: boolean;
  isLoggedIn?: boolean;
  onOpenAuthModal?: () => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({
  top5Tracks,
  onGenerateRecommendations,
  isGenerating,
  playlists,
  onToggleTrackInPlaylist,
  onCreatePlaylist,
  userProfile,
  tasteCount = 0,
  tasteItems,
  onAddTrackToTasteProfile,
  onTogglePlay,
  currentPlayingTrackId,
  isPlaying = false,
  isLoggedIn = false,
  onOpenAuthModal
}) => {
  const [recLimit, setRecLimit] = useState<number>(5);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [openDropdownTrackId, setOpenDropdownTrackId] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);
  const [loadingRatingTrackId, setLoadingRatingTrackId] = useState<string | null>(null);
  const [loadingPlaylistActionKey, setLoadingPlaylistActionKey] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [artworkModalTrack, setArtworkModalTrack] = useState<{ artist: string; title: string; coverUrl?: string } | null>(null);

  useEffect(() => {
    return () => {
      if (audioInstance) {
        audioInstance.pause();
      }
    };
  }, [audioInstance]);

  const handleTogglePlay = async (track: Track) => {
    if (onTogglePlay) {
      onTogglePlay(track);
      return;
    }

    if (playingTrackId === track.id && audioInstance) {
      if (audioInstance.paused) {
        audioInstance.play();
      } else {
        audioInstance.pause();
        setPlayingTrackId(null);
      }
    } else {
      if (audioInstance) {
        audioInstance.pause();
      }

      setLoadingPreviewId(track.id);
      let previewUrl: string | null | undefined = track.previewUrl;
      if (!previewUrl) {
        try {
          previewUrl = await fetchOnDemandPreviewUrl(track.artist, track.title);
        } catch {
          previewUrl = null;
        }
      }
      setLoadingPreviewId(null);

      if (!previewUrl) {
        alert(`No preview available for "${track.title}" by ${track.artist}`);
        return;
      }

      const audio = new Audio(previewUrl);
      audio.play();
      audio.onended = () => {
        setPlayingTrackId(null);
        setAudioInstance(null);
      };
      setAudioInstance(audio);
      setPlayingTrackId(track.id);
    }
  };

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingInline, setIsCreatingInline] = useState<boolean>(false);

  const handleRateTrack = async (track: Track, ratingVal: number) => {
    if (!isLoggedIn) {
      if (onOpenAuthModal) onOpenAuthModal();
      return;
    }
    setLoadingRatingTrackId(track.id);
    try {
      await onAddTrackToTasteProfile(track, ratingVal);
    } finally {
      setLoadingRatingTrackId(null);
    }
  };

  const handleTogglePlaylistAction = async (track: Track, playlistId: string) => {
    const key = `${track.id}-${playlistId}`;
    setLoadingPlaylistActionKey(key);
    try {
      await onToggleTrackInPlaylist(track, playlistId);
    } finally {
      setLoadingPlaylistActionKey(null);
    }
  };

  const handleCreateAndAdd = async (track: Track) => {
    if (!newPlaylistName.trim()) return;
    const created = await onCreatePlaylist(newPlaylistName.trim());
    await handleTogglePlaylistAction(track, created.id);
    setNewPlaylistName('');
    setIsCreatingInline(false);
  };

  return (
    <div style={{ padding: '2.5rem 1.5rem', maxWidth: '1350px', margin: '0 auto' }}>
      {/* Hero Header Banner */}
      <div className="tactile-card" style={{ marginBottom: '2.5rem', padding: '2rem', backgroundColor: 'var(--bg-secondary)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1.25rem' }}>
          <div>
            <span className="badge-neo badge-lime" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>
              RECOMMENDATION ENGINE
            </span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.75rem', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.05, marginTop: '0.85rem' }}>
              <span style={{ color: 'var(--accent-lime)' }}>RECOMMEND TRACKS</span>
            </h2>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.4rem', margin: '0.4rem 0 0 0' }}>
              Discover personalized candidate selections curated from your acoustic taste profile.
            </p>
          </div>

          {/* Recommendation Generator Controls (Shifted below Recommend Tracks text on next line) */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-primary)', border: '2px solid var(--border-color)', padding: '0 0.75rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, paddingRight: '0.5rem', color: 'var(--text-muted)' }}>DECK SIZE:</span>
              <select
                value={recLimit}
                onChange={(e) => setRecLimit(parseInt(e.target.value))}
                style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem',
                  backgroundColor: 'transparent', border: 'none', color: 'var(--accent-lime)',
                  cursor: 'pointer', outline: 'none'
                }}
              >
                {[5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n} style={{ backgroundColor: 'var(--bg-primary)' }}>{n}</option>
                ))}
              </select>
            </div>
            <button
              className="btn-neo btn-neo-lime"
              style={{ padding: '0.85rem 1.75rem', fontSize: '1rem', boxShadow: 'var(--shadow-md)', minWidth: '170px', justifyContent: 'center' }}
              onClick={() => {
                setCurrentSlideIndex(0);
                onGenerateRecommendations(recLimit);
              }}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 size={24} className="animate-spin" />
              ) : (
                <><Sparkles size={18} /> GENERATE</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Top Curated Selections Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800, textTransform: 'uppercase', margin: 0 }}>
          Top Curated Selections
        </h3>
      </div>

      {/* Recommendations Cards Container */}
      {isGenerating ? (
        <div className="tactile-card" style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', border: '3px solid var(--border-color)', boxShadow: '8px 8px 0px var(--accent-lime)' }}>
          <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={56} style={{ color: 'var(--accent-lime)' }} className="rotating-star" />
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent-lime)', margin: 0, letterSpacing: '-0.02em' }}>
            GENERATING RECOMMENDATIONS...
          </h3>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0, maxWidth: '420px' }}>
            The intelligence engine is ranking candidate tracks based on your taste profile...
          </p>
        </div>
      ) : top5Tracks.length === 0 ? (
        <div className="tactile-card" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-muted)' }}>
            No generations yet
          </h3>
        </div>
      ) : (
        <>
          {/* DESKTOP VIEW: Simple Cards Displayed Together in Responsive Grid */}
          <div className="home-desktop-grid">
            {top5Tracks.map((rawTrack, index) => {
              const track = RAMMetadataCache.hydrateTrack(rawTrack);
              const savedInPlaylists = playlists.filter(pl => pl.tracks.some(t => t.id === track.id));
              const isSavedAnywhere = savedInPlaylists.length > 0;
              const isDropdownOpen = openDropdownTrackId === track.id;
              const coverImage = track.coverUrl || (track as any).cover_url || '';
              const previewUrl = track.previewUrl || (track as any).preview_url;
              const isPlayingThis = currentPlayingTrackId ? (currentPlayingTrackId === track.id && isPlaying) : (playingTrackId === track.id);

              return (
                <div
                  key={track.id}
                  className="tactile-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1.25rem',
                    backgroundColor: 'var(--bg-secondary)',
                    position: 'relative'
                  }}
                >
                  {/* Card Main Body */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    {/* Card Header: Rank Badge & Confidence Score */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="badge-neo badge-red" style={{ flexShrink: 0 }}>
                        #{index + 1}
                      </span>
                      {(isLoggedIn && tasteCount >= 5) && (
                        <span className="badge-neo badge-lime" style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          CONFIDENCE: {track.matchScore ?? 85}%
                        </span>
                      )}
                    </div>

                    {/* Album Cover Container */}
                    <div className="home-card-cover-wrapper" style={{
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
                      flexShrink: 0
                    }}>
                      {coverImage ? (
                        <img
                          src={coverImage}
                          alt={`${track.title} cover`}
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

                      {/* View Artwork Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setArtworkModalTrack({ artist: track.artist, title: track.title, coverUrl: coverImage });
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
                          maxWidth: 'calc(100% - 24px)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minHeight: '44px',
                          flexShrink: 0
                        }}
                      >
                        <ImageIcon size={14} style={{ color: 'var(--accent-lime)', flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>VIEW ARTWORK</span>
                      </button>

                      {/* Audio Preview Play/Pause Trigger Overlay */}
                      {previewUrl || loadingPreviewId === track.id ? (
                        <button
                          onClick={() => handleTogglePlay(track)}
                          className="btn-neo"
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            backgroundColor: isPlayingThis ? '#EF4444' : 'var(--accent-lime)',
                            color: isPlayingThis ? '#FFFFFF' : '#000000',
                            padding: '0.5rem 0.85rem',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            boxShadow: 'var(--shadow-sm)',
                            zIndex: 2,
                            maxWidth: 'calc(100% - 24px)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minHeight: '44px',
                            flexShrink: 0
                          }}
                        >
                          {loadingPreviewId === track.id ? (
                            <Loader2 size={16} className="animate-spin" style={{ flexShrink: 0 }} />
                          ) : isPlayingThis ? (
                            <Pause size={16} style={{ flexShrink: 0 }} />
                          ) : (
                            <Play size={16} style={{ flexShrink: 0 }} />
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {loadingPreviewId === track.id ? 'LOADING...' : isPlayingThis ? 'PAUSE PREVIEW' : 'PLAY PREVIEW'}
                          </span>
                        </button>
                      ) : (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            backgroundColor: 'rgba(0,0,0,0.75)',
                            color: 'var(--text-muted)',
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.7rem',
                            fontFamily: 'var(--font-mono)',
                            border: '1px solid var(--border-color)',
                            zIndex: 2,
                            flexShrink: 0
                          }}
                        >
                          No Preview
                        </div>
                      )}
                    </div>

                    {/* Track Title & Artist Name */}
                    <div style={{ marginBottom: '0.4rem', minWidth: 0, overflow: 'hidden' }}>
                      <MarqueeText
                        text={track.title}
                        style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}
                      />
                      <MarqueeText
                        text={track.artist}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--accent-lime)', fontWeight: 700 }}
                      />
                    </div>

                    {/* Saved Playlist Badges */}
                    {isSavedAnywhere && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.75rem' }}>
                        {savedInPlaylists.map(pl => (
                          <span key={pl.id} className="badge-neo badge-dark" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', flexShrink: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ✓ {pl.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Rating Section */}
                    <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
                      {(() => {
                        const tasteMatch = tasteItems.find(
                          t => t.title.trim().toLowerCase() === track.title.trim().toLowerCase() &&
                            t.artist.trim().toLowerCase() === track.artist.trim().toLowerCase()
                        );

                        if (tasteMatch) {
                          return (
                            <div>
                              <span className="badge-neo badge-lime" style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <Check size={14} style={{ flexShrink: 0 }} /> IN TASTE PROFILE ({tasteMatch.rating}/10)
                              </span>
                            </div>
                          );
                        }

                        const isRatingThisTrack = loadingRatingTrackId === track.id;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                              {isRatingThisTrack && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-lime)', flexShrink: 0 }} />}
                              Rate Song (1-10)
                            </span>
                            <select
                              defaultValue=""
                              disabled={!isLoggedIn || isRatingThisTrack}
                              onChange={(e) => {
                                if (isLoggedIn && e.target.value) {
                                  handleRateTrack(track, parseInt(e.target.value));
                                }
                              }}
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                backgroundColor: 'var(--bg-primary)',
                                color: isLoggedIn ? 'var(--accent-lime)' : 'var(--text-muted)',
                                border: '2px solid var(--border-color)',
                                padding: '0.35rem 0.5rem',
                                cursor: (!isLoggedIn || isRatingThisTrack) ? 'not-allowed' : 'pointer',
                                opacity: (!isLoggedIn || isRatingThisTrack) ? 0.5 : 1,
                                width: '100%',
                                minHeight: '44px'
                              }}
                            >
                              <option value="" disabled>
                                {!isLoggedIn ? 'Log in required to rate' : (isRatingThisTrack ? 'Saving rating...' : 'Select Rating...')}
                              </option>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                                <option key={r} value={r}>{r} / 10</option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Playlist Selection Dropdown */}
                  <div style={{ borderTop: '2px solid var(--border-color)', paddingTop: '0.75rem', position: 'relative' }}>
                    <button
                      className={`btn-neo ${isSavedAnywhere ? 'btn-neo-lime' : 'btn-neo-cyan'}`}
                      style={{ width: '100%', fontSize: '0.85rem', justifyContent: 'space-between', minHeight: '44px' }}
                      onClick={() => setOpenDropdownTrackId(isDropdownOpen ? null : track.id)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isSavedAnywhere ? <Check size={16} style={{ flexShrink: 0 }} /> : <Bookmark size={16} style={{ flexShrink: 0 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isSavedAnywhere ? `SAVED IN ${savedInPlaylists.length} PLAYLIST${savedInPlaylists.length > 1 ? 'S' : ''}` : 'ADD TO PLAYLIST'}
                        </span>
                      </span>
                      <ChevronDown size={16} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                    </button>

                    {/* Playlist Checkbox Popover */}
                    {isDropdownOpen && (
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        left: 0,
                        right: 0,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '3px solid var(--border-color)',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 200,
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                            SELECT PLAYLIST(S):
                          </span>
                          <button
                            onClick={() => setOpenDropdownTrackId(null)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 800, minHeight: '44px', minWidth: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >
                            ✕ CLOSE
                          </button>
                        </div>

                        {/* Interactive Playlist Checkboxes */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
                          {playlists.map(pl => {
                            const inThisPlaylist = pl.tracks.some(t => t.id === track.id);
                            const actionKey = `${track.id}-${pl.id}`;
                            const isProcessing = loadingPlaylistActionKey === actionKey;

                            return (
                              <div
                                key={pl.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0.45rem 0.6rem',
                                  border: '2px solid var(--border-color)',
                                  backgroundColor: inThisPlaylist ? 'var(--accent-lime)' : 'var(--bg-primary)',
                                  color: inThisPlaylist ? '#000000' : 'var(--text-main)',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  minHeight: '44px',
                                  gap: '0.5rem',
                                  minWidth: 0
                                }}
                                onClick={() => handleTogglePlaylistAction(track, pl.id)}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                                  {isProcessing ? (
                                    <Loader2 size={14} className="animate-spin" style={{ color: inThisPlaylist ? '#FFF' : 'var(--accent-lime)', flexShrink: 0 }} />
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={inThisPlaylist}
                                      onChange={() => { }}
                                      style={{ accentColor: '#FFFFFF', cursor: 'pointer', flexShrink: 0 }}
                                    />
                                  )}
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {pl.name}
                                  </span>
                                </span>
                                <span style={{ fontSize: '0.7rem', opacity: 0.8, flexShrink: 0 }}>
                                  ({pl.tracks.length})
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Inline Create New Playlist Control */}
                        {!isCreatingInline ? (
                          <button
                            className="btn-neo btn-neo-secondary"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', justifyContent: 'center', width: '100%', marginTop: '0.2rem', minHeight: '44px' }}
                            onClick={() => setIsCreatingInline(true)}
                          >
                            <Plus size={14} style={{ flexShrink: 0 }} /> CREATE NEW PLAYLIST
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                            <input
                              type="text"
                              placeholder="New playlist name..."
                              value={newPlaylistName}
                              onChange={(e) => setNewPlaylistName(e.target.value)}
                              className="input-neo"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', flex: 1, minWidth: 0, minHeight: '44px' }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateAndAdd(track);
                              }}
                            />
                            <button
                              className="btn-neo btn-neo-lime"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', minHeight: '44px', flexShrink: 0 }}
                              onClick={() => handleCreateAndAdd(track)}
                            >
                              ADD
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* MOBILE VIEW: Single Card Deck Carousel View for Phones */}
          <div className="home-mobile-carousel" style={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '400px', gap: '1rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setCurrentSlideIndex(prev => (prev === 0 ? top5Tracks.length - 1 : prev - 1))}
                className="btn-neo"
                style={{ padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer' }}
              >
                <ChevronLeft size={24} />
              </button>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                TRACK {currentSlideIndex + 1} OF {top5Tracks.length}
              </div>
              <button
                onClick={() => setCurrentSlideIndex(prev => (prev === top5Tracks.length - 1 ? 0 : prev + 1))}
                className="btn-neo"
                style={{ padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer' }}
              >
                <ChevronRight size={24} />
              </button>
            </div>

            <div style={{ width: '100%', maxWidth: '400px' }}>
              {(() => {
                const rawTrack = top5Tracks[currentSlideIndex];
                const track = RAMMetadataCache.hydrateTrack(rawTrack);
                const savedInPlaylists = playlists.filter(pl => pl.tracks.some(t => t.id === track.id));
                const isSavedAnywhere = savedInPlaylists.length > 0;
                const isDropdownOpen = openDropdownTrackId === track.id;

                const coverImage = track.coverUrl || (track as any).cover_url || '';
                const previewUrl = track.previewUrl || (track as any).preview_url;
                const isPlayingThis = currentPlayingTrackId ? (currentPlayingTrackId === track.id && isPlaying) : (playingTrackId === track.id);

                return (
                  <div
                    key={track.id}
                    className="tactile-card home-card-mobile"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '1.25rem',
                      backgroundColor: 'var(--bg-secondary)',
                      position: 'relative'
                    }}
                  >
                    {/* Card Main Body */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      {/* Card Header: Rank Badge & Confidence Score */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="badge-neo badge-red" style={{ flexShrink: 0 }}>
                          #{currentSlideIndex + 1}
                        </span>
                        {(isLoggedIn && tasteCount >= 5) && (
                          <span className="badge-neo badge-lime" style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                            CONFIDENCE: {track.matchScore ?? 85}%
                          </span>
                        )}
                      </div>

                      {/* Album Cover Container */}
                      <div className="home-card-cover-wrapper" style={{
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
                        flexShrink: 0
                      }}>
                        {coverImage ? (
                          <img
                            src={coverImage}
                            alt={`${track.title} cover`}
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

                        {/* View Artwork Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setArtworkModalTrack({ artist: track.artist, title: track.title, coverUrl: coverImage });
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
                            maxWidth: 'calc(100% - 24px)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minHeight: '44px',
                            flexShrink: 0
                          }}
                        >
                          <ImageIcon size={14} style={{ color: 'var(--accent-lime)', flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>VIEW ARTWORK</span>
                        </button>

                        {/* Audio Preview Play/Pause Trigger Overlay */}
                        {previewUrl || loadingPreviewId === track.id ? (
                          <button
                            onClick={() => handleTogglePlay(track)}
                            className="btn-neo"
                            style={{
                              position: 'absolute',
                              bottom: '12px',
                              right: '12px',
                              backgroundColor: isPlayingThis ? '#EF4444' : 'var(--accent-lime)',
                              color: isPlayingThis ? '#FFFFFF' : '#000000',
                              padding: '0.5rem 0.85rem',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              boxShadow: 'var(--shadow-sm)',
                              zIndex: 2,
                              maxWidth: 'calc(100% - 24px)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              minHeight: '44px',
                              flexShrink: 0
                            }}
                          >
                            {loadingPreviewId === track.id ? (
                              <Loader2 size={16} className="animate-spin" style={{ flexShrink: 0 }} />
                            ) : isPlayingThis ? (
                              <Pause size={16} style={{ flexShrink: 0 }} />
                            ) : (
                              <Play size={16} style={{ flexShrink: 0 }} />
                            )}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {loadingPreviewId === track.id ? 'LOADING...' : isPlayingThis ? 'PAUSE PREVIEW' : 'PLAY PREVIEW'}
                            </span>
                          </button>
                        ) : (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '12px',
                              right: '12px',
                              backgroundColor: 'rgba(0,0,0,0.75)',
                              color: 'var(--text-muted)',
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.7rem',
                              fontFamily: 'var(--font-mono)',
                              border: '1px solid var(--border-color)',
                              zIndex: 2,
                              flexShrink: 0
                            }}
                          >
                            No Preview
                          </div>
                        )}
                      </div>

                      {/* Track Title & Artist Name */}
                      <div style={{ marginBottom: '0.4rem', minWidth: 0, overflow: 'hidden' }}>
                        <MarqueeText
                          text={track.title}
                          style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}
                        />
                        <MarqueeText
                          text={track.artist}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--accent-lime)', fontWeight: 700 }}
                        />
                      </div>

                      {/* Saved Playlist Badges */}
                      {isSavedAnywhere && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.75rem' }}>
                          {savedInPlaylists.map(pl => (
                            <span key={pl.id} className="badge-neo badge-dark" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', flexShrink: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ✓ {pl.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Rating Section Stuck to the Bottom of Content Area */}
                      <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
                        {(() => {
                          const tasteMatch = tasteItems.find(
                            t => t.title.trim().toLowerCase() === track.title.trim().toLowerCase() &&
                              t.artist.trim().toLowerCase() === track.artist.trim().toLowerCase()
                          );

                          if (tasteMatch) {
                            return (
                              <div>
                                <span className="badge-neo badge-lime" style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <Check size={14} style={{ flexShrink: 0 }} /> IN TASTE PROFILE ({tasteMatch.rating}/10)
                                </span>
                              </div>
                            );
                          }

                          const isRatingThisTrack = loadingRatingTrackId === track.id;

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                                {isRatingThisTrack && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-lime)', flexShrink: 0 }} />}
                                Rate Song (1-10)
                              </span>
                              <select
                                defaultValue=""
                                disabled={!isLoggedIn || isRatingThisTrack}
                                onChange={(e) => {
                                  if (isLoggedIn && e.target.value) {
                                    handleRateTrack(track, parseInt(e.target.value));
                                  }
                                }}
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 800,
                                  fontSize: '0.8rem',
                                  backgroundColor: 'var(--bg-primary)',
                                  color: isLoggedIn ? 'var(--accent-lime)' : 'var(--text-muted)',
                                  border: '2px solid var(--border-color)',
                                  padding: '0.35rem 0.5rem',
                                  cursor: (!isLoggedIn || isRatingThisTrack) ? 'not-allowed' : 'pointer',
                                  opacity: (!isLoggedIn || isRatingThisTrack) ? 0.5 : 1,
                                  width: '100%',
                                  minHeight: '44px'
                                }}
                              >
                                <option value="" disabled>
                                  {!isLoggedIn ? 'Log in required to rate' : (isRatingThisTrack ? 'Saving rating...' : 'Select Rating...')}
                                </option>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                                  <option key={r} value={r}>{r} / 10</option>
                                ))}
                              </select>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Playlist Selection Dropdown */}
                    <div style={{ borderTop: '2px solid var(--border-color)', paddingTop: '0.75rem', position: 'relative' }}>
                      <button
                        className={`btn-neo ${isSavedAnywhere ? 'btn-neo-lime' : 'btn-neo-cyan'}`}
                        style={{ width: '100%', fontSize: '0.85rem', justifyContent: 'space-between', minHeight: '44px' }}
                        onClick={() => setOpenDropdownTrackId(isDropdownOpen ? null : track.id)}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isSavedAnywhere ? <Check size={16} style={{ flexShrink: 0 }} /> : <Bookmark size={16} style={{ flexShrink: 0 }} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isSavedAnywhere ? `SAVED IN ${savedInPlaylists.length} PLAYLIST${savedInPlaylists.length > 1 ? 'S' : ''}` : 'ADD TO PLAYLIST'}
                          </span>
                        </span>
                        <ChevronDown size={16} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                      </button>

                      {/* Playlist Checkbox Popover */}
                      {isDropdownOpen && (
                        <div style={{
                          position: 'absolute',
                          bottom: 'calc(100% + 8px)',
                          left: 0,
                          right: 0,
                          backgroundColor: 'var(--bg-secondary)',
                          border: '3px solid var(--border-color)',
                          boxShadow: 'var(--shadow-lg)',
                          zIndex: 200,
                          padding: '0.85rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.6rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                              SELECT PLAYLIST(S):
                            </span>
                            <button
                              onClick={() => setOpenDropdownTrackId(null)}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 800, minHeight: '44px', minWidth: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                              ✕ CLOSE
                            </button>
                          </div>

                          {/* Interactive Playlist Checkboxes */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
                            {playlists.map(pl => {
                              const inThisPlaylist = pl.tracks.some(t => t.id === track.id);
                              const actionKey = `${track.id}-${pl.id}`;
                              const isProcessing = loadingPlaylistActionKey === actionKey;

                              return (
                                <div
                                  key={pl.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.45rem 0.6rem',
                                    border: '2px solid var(--border-color)',
                                    backgroundColor: inThisPlaylist ? 'var(--accent-lime)' : 'var(--bg-primary)',
                                    color: inThisPlaylist ? '#FFFFFF' : 'var(--text-main)',
                                    cursor: isProcessing ? 'wait' : 'pointer',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    userSelect: 'none',
                                    minHeight: '44px',
                                    gap: '0.5rem',
                                    minWidth: 0
                                  }}
                                  onClick={() => {
                                    if (!isProcessing) {
                                      handleTogglePlaylistAction(track, pl.id);
                                    }
                                  }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                                    {isProcessing ? (
                                      <Loader2 size={14} className="animate-spin" style={{ color: inThisPlaylist ? '#FFF' : 'var(--accent-lime)', flexShrink: 0 }} />
                                    ) : (
                                      <input
                                        type="checkbox"
                                        checked={inThisPlaylist}
                                        onChange={() => { }} // Controlled by outer div click
                                        style={{ accentColor: '#FFFFFF', cursor: 'pointer', flexShrink: 0 }}
                                      />
                                    )}
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {pl.name}
                                    </span>
                                  </span>
                                  <span style={{ fontSize: '0.7rem', opacity: 0.8, flexShrink: 0 }}>
                                    ({pl.tracks.length})
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Inline Create New Playlist Control */}
                          {!isCreatingInline ? (
                            <button
                              className="btn-neo btn-neo-secondary"
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', justifyContent: 'center', width: '100%', marginTop: '0.2rem', minHeight: '44px' }}
                              onClick={() => setIsCreatingInline(true)}
                            >
                              <Plus size={14} style={{ flexShrink: 0 }} /> CREATE NEW PLAYLIST
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                              <input
                                type="text"
                                placeholder="New playlist name..."
                                value={newPlaylistName}
                                onChange={(e) => setNewPlaylistName(e.target.value)}
                                className="input-neo"
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', flex: 1, minWidth: 0, minHeight: '44px' }}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCreateAndAdd(track);
                                }}
                              />
                              <button
                                className="btn-neo btn-neo-lime"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', minHeight: '44px', flexShrink: 0 }}
                                onClick={() => handleCreateAndAdd(track)}
                              >
                                ADD
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </>
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
