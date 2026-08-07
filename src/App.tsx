import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Header } from './components/Header';
import { HomeTab } from './components/HomeTab';
import { PlaylistTab } from './components/PlaylistTab';
import { TasteProfileTab } from './components/TasteProfileTab';
import { ProfileTab } from './components/ProfileTab';
import { AuthView } from './components/AuthView';
import { AuthModal } from './components/AuthModal';
import { OnboardingModal } from './components/OnboardingModal';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { Playlist, Track, UserProfileInfo, TasteProfileItem } from './types/music';
import {
  fetchUserProfileFromDB,
  fetchUserPlaylistsFromDB,
  fetchTasteProfileFromDB,
  fetchTracksCatalogFromDB,
  updateUserProfileInDB,
  addTasteItemToDB,
  updateTasteRatingInDB,
  deleteTasteItemFromDB,
  createPlaylistInDB,
  deletePlaylistFromDB,
  renamePlaylistInDB,
  removeTrackFromPlaylistInDB,
  toggleTrackInPlaylistInDB
} from './services/supabaseService';
import { fetchEnrichedAllMetadata, fetchTrackArtworks, fetchOnDemandPreviewUrl } from './services/api';
import { GrooveLogo } from './components/GrooveLogo';
import { recommendationEngine } from './services/recommendationEngine';
import { supabase } from './services/supabaseClient';
import { Radio, Loader2 } from 'lucide-react';
import { RAMMetadataCache } from './services/metadataCache';

export function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'playlist' | 'taste' | 'profile'>('home');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Authentication & Onboarding State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isGuestMode, setIsGuestMode] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isGuestPromptOpen, setIsGuestPromptOpen] = useState<boolean>(false);

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfileInfo>({
    name: '',
    email: '',
    country: '',
    lastFmUsername: '',
    age: 24,
    gender: 'Prefer not to say',
    topGenres: [],
    topArtists: [],
    isLastFmSynced: false
  });

  // Database State
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string>(''); // Default: empty (shows horizontal cards grid)
  const [tasteItems, setTasteItems] = useState<TasteProfileItem[]>([]);
  const [tracksCatalog, setTracksCatalog] = useState<Track[]>([]);

  // Top Recommendations
  const [top5Recommendations, setTop5Recommendations] = useState<Track[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Global Audio Player State
  const [currentPlayingTrack, setCurrentPlayingTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const loadedUserIdRef = React.useRef<string | null>(null);

  // Load user data directly from Supabase Database & Pre-load metadata
  const loadUserDataFromSupabase = async (userId: string, email: string) => {
    if (loadedUserIdRef.current === userId) {
      return; // Already loaded for this session - prevent tab switch loading overlay!
    }
    loadedUserIdRef.current = userId;
    setIsLoggingIn(true);

    try {
      // 1. Fetch Profile
      const profile = await fetchUserProfileFromDB(userId, email);
      setUserProfile(profile);

      if ((!profile.topGenres || profile.topGenres.length === 0) && (!profile.topArtists || profile.topArtists.length === 0)) {
        setIsOnboardingOpen(true);
      }

      // 2. Parallel Fetch Playlists, Taste Profile, & Catalog
      const [userPlaylists, tasteData, catalog] = await Promise.all([
        fetchUserPlaylistsFromDB(userId),
        fetchTasteProfileFromDB(userId),
        fetchTracksCatalogFromDB()
      ]);

      // Instant hydration from RAM memory cache
      const hydratedPlaylists = userPlaylists.map(pl => ({
        ...pl,
        tracks: RAMMetadataCache.hydrateTrackList(pl.tracks || [])
      }));
      const hydratedTaste = RAMMetadataCache.hydrateTrackList(tasteData || []);

      setPlaylists(hydratedPlaylists);
      setTasteItems(hydratedTaste as TasteProfileItem[]);
      setTracksCatalog(catalog);

      // Instant fast-path metadata enrichment in parallel
      if (hydratedTaste.length > 0) {
        fetchEnrichedAllMetadata(hydratedTaste, (fast) => {
          setTasteItems(fast as TasteProfileItem[]);
        }).then(enriched => {
          setTasteItems(enriched as TasteProfileItem[]);
        });
      }

      if (hydratedPlaylists.length > 0) {
        hydratedPlaylists.forEach(pl => {
          if (pl.tracks && pl.tracks.length > 0) {
            fetchEnrichedAllMetadata(pl.tracks, (fast) => {
              setPlaylists(prev => prev.map(p => p.id === pl.id ? { ...p, tracks: fast as Track[] } : p));
            }).then(enriched => {
              setPlaylists(prev => prev.map(p => p.id === pl.id ? { ...p, tracks: enriched as Track[] } : p));
            });
          }
        });
      }
    } catch (err) {
      console.error('Error loading data from Supabase:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Check Supabase session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        setIsLoggedIn(true);
        setAuthToken(session.access_token);
        loadUserDataFromSupabase(session.user.id, session.user.email || '');
      }
      setIsAuthChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) {
        setIsLoggedIn(true);
        setAuthToken(session.access_token);
        // Only trigger initial load if not loaded yet
        if (loadedUserIdRef.current !== session.user.id) {
          loadUserDataFromSupabase(session.user.id, session.user.email || '');
        }
      } else {
        loadedUserIdRef.current = null;
        setIsLoggedIn(false);
        setAuthToken(null);
        setPlaylists([]);
        setTasteItems([]);
      }
      setIsAuthChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSuccess = (profile: UserProfileInfo, token: string) => {
    setIsLoggedIn(true);
    setAuthToken(token);
    if (profile.id && profile.email) {
      loadUserDataFromSupabase(profile.id, profile.email);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    loadedUserIdRef.current = null;
    setIsLoggedIn(false);
    setAuthToken(null);
    setIsGuestMode(false);
    setActiveTab('home');
    setTop5Recommendations([]);
    setUserProfile({
      name: '',
      email: '',
      country: '',
      lastFmUsername: '',
      age: 24,
      gender: 'Prefer not to say',
      topGenres: [],
      topArtists: [],
      isLastFmSynced: false
    });
    setPlaylists([]);
    setTasteItems([]);
    if (audioElement) {
      audioElement.pause();
    }
    setCurrentPlayingTrack(null);
    setIsPlaying(false);
  };

  const handleSaveProfile = async (updatedProfile: UserProfileInfo) => {
    setUserProfile(updatedProfile);
    if (userProfile.id) {
      await updateUserProfileInDB(userProfile.id, updatedProfile);
    }
  };

  const handleCompleteOnboarding = async (topGenres: string[], topArtists: string[]) => {
    const updatedProfile: UserProfileInfo = {
      ...userProfile,
      topGenres,
      topArtists
    };
    setUserProfile(updatedProfile);
    setIsOnboardingOpen(false);
    if (userProfile.id) {
      await updateUserProfileInDB(userProfile.id, updatedProfile);
    }
    // Pass updatedProfile directly to avoid React's async state update delay
    handleGenerateRecommendations(5, updatedProfile);
  };

  const handleCreatePlaylist = async (name: string, description?: string): Promise<Playlist> => {
    if (!userProfile.id) throw new Error('User not logged in');
    const newPl = await createPlaylistInDB(userProfile.id, name, description);
    setPlaylists(prev => [newPl, ...prev]);
    setActivePlaylistId(newPl.id);
    return newPl;
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    setPlaylists(prev => prev.filter(p => p.id !== playlistId));
    await deletePlaylistFromDB(playlistId);
    setActivePlaylistId('');
  };

  const handleRenamePlaylist = async (playlistId: string, newName: string) => {
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, name: newName } : p));
    await renamePlaylistInDB(playlistId, newName);
  };

  const handleRemoveTrackFromPlaylist = async (trackId: string, playlistId: string) => {
    // Optimistic update
    setPlaylists(prev => prev.map(p => {
      if (p.id === playlistId) {
        return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
      }
      return p;
    }));
    await removeTrackFromPlaylistInDB(playlistId, trackId);
  };

  // Sync theme class to document.body for portals
  useEffect(() => {
    if (!isDarkMode) {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [isDarkMode]);

  const handleToggleTrackInPlaylist = async (track: Track, playlistId: string) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id === playlistId) {
        const exists = p.tracks.some(t => t.id === track.id);
        const updatedTracks = exists
          ? p.tracks.filter(t => t.id !== track.id)
          : [...p.tracks, track];
        return { ...p, tracks: updatedTracks };
      }
      return p;
    }));

    await toggleTrackInPlaylistInDB(playlistId, track);
  };

  const handleAddTasteItem = async (newItem: Omit<TasteProfileItem, 'id' | 'addedAt'>) => {
    if (!userProfile.id) return;
    const added = await addTasteItemToDB(userProfile.id, newItem.title, newItem.artist, newItem.genre, newItem.rating);
    setTasteItems(prev => [added, ...prev]);

    fetchEnrichedAllMetadata([added]).then(enriched => {
      if (enriched && enriched.length > 0) {
        setTasteItems(prev => prev.map(item => item.id === added.id ? { ...item, ...enriched[0] } : item));
      }
    });
  };

  const handleUpdateRating = async (itemId: string, newRating: number) => {
    setTasteItems(prev => prev.map(item => item.id === itemId ? { ...item, rating: newRating } : item));
    await updateTasteRatingInDB(itemId, newRating);
  };

  const handleDeleteTasteItem = async (itemId: string) => {
    setTasteItems(prev => prev.filter(item => item.id !== itemId));
    await deleteTasteItemFromDB(itemId);
  };

  const handleGenerateRecommendations = async (limit: number = 5, profileOverride?: UserProfileInfo) => {
    setIsGenerating(true);
    try {
      const recs = await recommendationEngine.generateTopRecommendations(
        profileOverride ?? userProfile,
        tasteItems,
        playlists,
        limit,
        authToken || undefined
      );

      const hydratedRecs = RAMMetadataCache.hydrateTrackList(recs);
      setTop5Recommendations(hydratedRecs as Track[]);

      fetchEnrichedAllMetadata(recs, (fast) => {
        setTop5Recommendations(fast as Track[]);
      }).then(finalEnriched => {
        setTop5Recommendations(finalEnriched as Track[]);
      });

    } catch (err) {
      console.error('Error generating recommendations:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Global Audio Preview Control
  const handleGlobalTogglePlay = (track: Track) => {
    const previewUrl = track.previewUrl || (track as any).preview_url;

    if (!previewUrl) {
      alert(`No audio preview available for "${track.title}" by ${track.artist}`);
      return;
    }

    if (currentPlayingTrack?.id === track.id) {
      if (isPlaying) {
        audioElement?.pause();
        setIsPlaying(false);
      } else {
        audioElement?.play();
        setIsPlaying(true);
      }
    } else {
      if (audioElement) {
        audioElement.pause();
      }
      const audio = new Audio(previewUrl);
      audio.play().catch(err => console.error('[GlobalAudio] Playback error:', err));
      audio.onended = () => {
        setIsPlaying(false);
      };
      setAudioElement(audio);
      setCurrentPlayingTrack(track);
      setIsPlaying(true);
    }
  };

  const handleCloseGlobalPlayer = () => {
    if (audioElement) {
      audioElement.pause();
    }
    setCurrentPlayingTrack(null);
    setIsPlaying(false);
  };

  // Auth checking screen
  if (isAuthChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--accent-lime)'
      }}>
        <Loader2 size={48} className="animate-spin" />
      </div>
    );
  }

  // Not logged in screen (unless Guest Mode is active)
  if (!isLoggedIn && !isGuestMode) {
    return (
      <AuthView
        onAuthSuccess={handleAuthSuccess}
        isDarkMode={isDarkMode}
        onContinueAsGuest={() => setIsGuestMode(true)}
      />
    );
  }

  // Login Loading Screen (showing empty screen saying "Logging in..." with loading animation and 3s max timeout)
  if (isLoggingIn) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-main)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '2rem'
      }}>
        <div style={{
          backgroundColor: 'var(--accent-lime)',
          color: '#000000',
          padding: '1.25rem 2rem',
          borderRadius: '4px',
          border: '3px solid #000000',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '6px 6px 0px rgba(0, 0, 0, 0.4)'
        }}>
          <Radio size={40} style={{ color: '#000000' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 900, margin: 0, color: '#000000' }}>
            GROOVE4U
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-lime)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Logging in...
          </span>
        </div>

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Pre-loading album covers and audio previews...
        </p>
      </div>
    );
  }

  const handleAddTrackToTasteProfile = async (track: Track, rating: number = 8) => {
    if (!userProfile.id) return;
    const addedItem = await addTasteItemToDB(userProfile.id, track.title, track.artist, track.genre, rating);
    setTasteItems(prev => [addedItem, ...prev]);

    fetchEnrichedAllMetadata([addedItem]).then(enriched => {
      if (enriched && enriched.length > 0) {
        setTasteItems(prev => prev.map(item => item.id === addedItem.id ? { ...item, ...enriched[0] } : item));
      }
    });
  };

  return (
    <div className={isDarkMode ? '' : 'light-mode'} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)' }}>
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        playlistCount={playlists.length}
        tasteCount={tasteItems.length}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isLoggedIn={isLoggedIn}
        userName={userProfile.name}
        onOpenAuthModal={() => {
          if (!isLoggedIn) {
            setIsGuestPromptOpen(true);
          } else {
            setIsAuthModalOpen(true);
          }
        }}
        onLogout={handleLogout}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Guest Mode Navigation Prompt Modal */}
      {isGuestPromptOpen && createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '1rem',
          boxSizing: 'border-box'
        }} onClick={() => setIsGuestPromptOpen(false)}>
          <div style={{
            backgroundColor: 'var(--bg-secondary, #16181E)',
            border: '3px solid #FFFFFF',
            boxShadow: '8px 8px 0px #000000',
            borderRadius: '8px',
            maxWidth: '380px',
            width: '100%',
            padding: '1.75rem 1.5rem',
            textAlign: 'center',
            color: '#FFFFFF'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 800,
              margin: '0 0 1.25rem 0',
              lineHeight: 1.4
            }}>
              Do you wish to go to the login page?
            </h3>

            <div style={{ display: 'flex', gap: '0.85rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-neo btn-neo-lime"
                style={{ flex: 1, padding: '0.65rem', justifyContent: 'center' }}
                onClick={() => {
                  setIsGuestPromptOpen(false);
                  setIsGuestMode(false);
                  setTop5Recommendations([]);
                  setActiveTab('home');
                }}
              >
                YES
              </button>

              <button
                type="button"
                className="btn-neo btn-neo-secondary"
                style={{ flex: 1, padding: '0.65rem', justifyContent: 'center' }}
                onClick={() => setIsGuestPromptOpen(false)}
              >
                NO
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        <div key={activeTab} className="tab-entrance">
          {activeTab === 'home' && (
            <HomeTab
              top5Tracks={top5Recommendations}
              onGenerateRecommendations={handleGenerateRecommendations}
              isGenerating={isGenerating}
              playlists={playlists}
              onToggleTrackInPlaylist={handleToggleTrackInPlaylist}
              onCreatePlaylist={handleCreatePlaylist}
              userProfile={userProfile}
              tasteCount={tasteItems.length}
              tasteItems={tasteItems}
              onAddTrackToTasteProfile={handleAddTrackToTasteProfile}
              onTogglePlay={handleGlobalTogglePlay}
              currentPlayingTrackId={currentPlayingTrack?.id}
              isPlaying={isPlaying}
              isLoggedIn={isLoggedIn}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
            />
          )}

          {activeTab === 'playlist' && (
            <PlaylistTab
              playlists={playlists}
              activePlaylistId={activePlaylistId}
              setActivePlaylistId={setActivePlaylistId}
              onCreatePlaylist={handleCreatePlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onRenamePlaylist={handleRenamePlaylist}
              onRemoveFromPlaylist={handleRemoveTrackFromPlaylist}
              onAddSongToPlaylist={async (playlistId, track) => {
                await toggleTrackInPlaylistInDB(playlistId, track);
                if (userProfile.id) {
                  const updatedPlaylists = await fetchUserPlaylistsFromDB(userProfile.id);
                  setPlaylists(updatedPlaylists);
                }
              }}
              onAddTrackToTasteProfile={handleAddTrackToTasteProfile}
              onDeleteTasteItem={handleDeleteTasteItem}
              tasteItems={tasteItems}
              onTogglePlay={handleGlobalTogglePlay}
              currentPlayingTrackId={currentPlayingTrack?.id}
              isPlaying={isPlaying}
            />
          )}

          {activeTab === 'taste' && (
            <TasteProfileTab
              tasteItems={tasteItems}
              onAddTasteItem={handleAddTasteItem}
              onUpdateRating={handleUpdateRating}
              onDeleteTasteItem={handleDeleteTasteItem}
              onTogglePlay={handleGlobalTogglePlay}
              currentPlayingTrackId={currentPlayingTrack?.id}
              isPlaying={isPlaying}
              userProfile={userProfile}
              onSaveProfile={handleSaveProfile}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileTab
              userProfile={userProfile}
              setUserProfile={handleSaveProfile}
            />
          )}
        </div>
      </main>

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        userProfile={userProfile}
        onCompleteOnboarding={handleCompleteOnboarding}
      />

      {/* Floating Audio Player */}
      <AudioPlayerBar
        currentTrack={currentPlayingTrack}
        isPlaying={isPlaying}
        onTogglePlay={handleGlobalTogglePlay}
        onClose={handleCloseGlobalPlayer}
      />

      {/* Footer */}
      <footer style={{
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-muted)',
        borderTop: '2px solid var(--border-color)',
        padding: '1.5rem',
        marginTop: '3rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', maxWidth: '1350px', margin: '0 auto' }}>
          <div>
            GROOVE4U SYSTEM © 2026 // MUSIC DISCOVERY & PLAYLIST DECK
          </div>
        </div>
      </footer>
    </div>
  );
}
