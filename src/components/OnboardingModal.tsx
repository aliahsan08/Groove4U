import React, { useState, useEffect } from 'react';
import { UserProfileInfo } from '../types/music';
import { Disc, Music, User, Plus, CheckCircle, AlertCircle, Sparkles, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { findOrCreateArtist, searchGenresFromDB, validateGenreInDB, searchArtistsFromDB } from '../services/supabaseService';

interface OnboardingModalProps {
  isOpen: boolean;
  userProfile: UserProfileInfo;
  onCompleteOnboarding: (topGenres: string[], topArtists: string[]) => Promise<void>;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  userProfile,
  onCompleteOnboarding
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1); // Step 1: Welcome, 2: Artists, 3: Genres, 4: Summary

  const [selectedGenres, setSelectedGenres] = useState<string[]>(userProfile.topGenres || []);
  const [selectedArtists, setSelectedArtists] = useState<string[]>(userProfile.topArtists || []);

  const [genreInput, setGenreInput] = useState('');
  const [artistInput, setArtistInput] = useState('');

  const [genreSuggestions, setGenreSuggestions] = useState<string[]>([]);
  const [artistSuggestions, setArtistSuggestions] = useState<string[]>([]);
  const [genreError, setGenreError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live Genre Search Effect
  useEffect(() => {
    if (!genreInput.trim()) {
      setGenreSuggestions([]);
      setGenreError(null);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchGenresFromDB(genreInput);
      setGenreSuggestions(res);
    }, 180);
    return () => clearTimeout(timer);
  }, [genreInput]);

  // Live Artist Search Effect
  useEffect(() => {
    if (!artistInput.trim()) {
      setArtistSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchArtistsFromDB(artistInput);
      setArtistSuggestions(res);
    }, 180);
    return () => clearTimeout(timer);
  }, [artistInput]);

  if (!isOpen) return null;

  const handleAddGenre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genreInput.trim()) return;
    const clean = genreInput.trim();

    const matched = await validateGenreInDB(clean);
    if (!matched) {
      setGenreError(`"${clean}" is not recognized in our database. Select a valid genre from suggestions.`);
      return;
    }

    setGenreError(null);
    if (!selectedGenres.some(g => g.toLowerCase() === matched.toLowerCase())) {
      setSelectedGenres(prev => [...prev, matched]);
    }
    setGenreInput('');
    setGenreSuggestions([]);
  };

  const handleRemoveGenre = (genre: string) => {
    setSelectedGenres(prev => prev.filter(g => g !== genre));
  };

  const handleAddArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artistInput.trim()) return;
    const name = artistInput.trim();

    try {
      await findOrCreateArtist(name);
    } catch {}

    if (!selectedArtists.some(a => a.toLowerCase() === name.toLowerCase())) {
      setSelectedArtists(prev => [...prev, name]);
    }
    setArtistInput('');
    setArtistSuggestions([]);
  };

  const handleRemoveArtist = (artist: string) => {
    setSelectedArtists(prev => prev.filter(a => a !== artist));
  };

  const handleSubmitFinal = async () => {
    setIsSubmitting(true);
    try {
      await onCompleteOnboarding(selectedGenres, selectedArtists);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(8px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
    }}>
      <div className="tactile-card" style={{
        maxWidth: '680px', width: '100%', minHeight: '460px',
        backgroundColor: 'var(--bg-card)', border: '3px solid var(--border-color)',
        padding: '2.25rem', boxShadow: '0 16px 40px rgba(0,0,0,0.5)', position: 'relative',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
      }}>
        {/* Step Indicator Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <span className="badge-neo badge-lime" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={14} /> STEP {currentStep} OF 4
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[1, 2, 3, 4].map(s => (
                <div
                  key={s}
                  style={{
                    width: '28px', height: '6px', borderRadius: '3px',
                    backgroundColor: s <= currentStep ? 'var(--accent-lime)' : 'var(--border-color)',
                    transition: 'background-color 0.3s'
                  }}
                />
              ))}
            </div>
          </div>

          {/* STEP 1: WELCOME & INTRO */}
          {currentStep === 1 && (
            <div style={{ padding: '1rem 0' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.1, marginBottom: '1rem' }}>
                WELCOME TO <span style={{ color: 'var(--accent-lime)' }}>GROOVE4U</span>
              </h2>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                Groove4U uses an advanced AI two-tower neural network and LightGBM recommendation engine to discover tracks aligned with your personal taste.
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                In the next two quick steps, we'll calibrate your baseline recommendations by asking for your favorite artists and genres.
              </p>
            </div>
          )}

          {/* STEP 2: TOP ARTISTS */}
          {currentStep === 2 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                SELECT YOUR <span style={{ color: 'var(--accent-lime)' }}>TOP ARTISTS</span>
              </h2>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Add your favorite musical artists. Type to search our database or enter custom names.
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', position: 'relative' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    className="input-neo"
                    placeholder="Search artist (e.g. A$AP Rocky, Beach House, Alex Turner)"
                    value={artistInput}
                    onChange={e => setArtistInput(e.target.value)}
                    style={{ width: '100%', minHeight: '44px' }}
                  />
                  {artistSuggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                      backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)',
                      borderRadius: '4px', zIndex: 110, maxHeight: '160px', overflowY: 'auto',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                    }}>
                      {artistSuggestions.map((a, i) => (
                        <div
                          key={a}
                          onClick={() => {
                            if (!selectedArtists.some(sa => sa.toLowerCase() === a.toLowerCase())) {
                              setSelectedArtists(prev => [...prev, a]);
                            }
                            setArtistInput('');
                            setArtistSuggestions([]);
                          }}
                          style={{
                            padding: '0.6rem 0.85rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                            fontSize: '0.825rem', borderBottom: i < artistSuggestions.length - 1 ? '1px solid var(--border-color)' : 'none',
                            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                            minHeight: '44px', display: 'flex', alignItems: 'center'
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
                <button type="button" onClick={handleAddArtist} className="btn-neo btn-neo-lime" style={{ padding: '0.65rem 1rem', minHeight: '44px', minWidth: '44px', flexShrink: 0 }}>
                  <Plus size={16} style={{ flexShrink: 0 }} /> ADD
                </button>
              </div>

              {/* Selected Artists Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '60px', padding: '0.65rem', backgroundColor: 'var(--bg-primary)', border: '2px solid var(--border-color)', borderRadius: '4px' }}>
                {selectedArtists.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', alignSelf: 'center' }}>
                    No artists added yet. Type above to add.
                  </span>
                ) : (
                  selectedArtists.map(a => (
                    <button
                      key={a}
                      type="button"
                      className="btn-neo btn-neo-lime"
                      onClick={() => handleRemoveArtist(a)}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: '44px', flexShrink: 0 }}
                    >
                      {a} ×
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* STEP 3: TOP GENRES */}
          {currentStep === 3 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                SELECT YOUR <span style={{ color: 'var(--accent-lime)' }}>TOP GENRES</span>
              </h2>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Choose your favorite musical genres from our 2,000+ database genres.
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', position: 'relative' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    className="input-neo"
                    placeholder="Search database genres (e.g. Hip-Hop, R&B, Pop)"
                    value={genreInput}
                    onChange={e => {
                      setGenreInput(e.target.value);
                      setGenreError(null);
                    }}
                    style={{ width: '100%', minHeight: '44px' }}
                  />
                  {genreSuggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                      backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)',
                      borderRadius: '4px', zIndex: 110, maxHeight: '160px', overflowY: 'auto',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                    }}>
                      {genreSuggestions.map((g, i) => (
                        <div
                          key={g}
                          onClick={() => {
                            if (!selectedGenres.some(sg => sg.toLowerCase() === g.toLowerCase())) {
                              setSelectedGenres(prev => [...prev, g]);
                            }
                            setGenreInput('');
                            setGenreSuggestions([]);
                          }}
                          style={{
                            padding: '0.6rem 0.85rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                            fontSize: '0.825rem', borderBottom: i < genreSuggestions.length - 1 ? '1px solid var(--border-color)' : 'none',
                            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                            minHeight: '44px', display: 'flex', alignItems: 'center'
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
                <button type="button" onClick={handleAddGenre} className="btn-neo btn-neo-lime" style={{ padding: '0.65rem 1rem', minHeight: '44px', minWidth: '44px', flexShrink: 0 }}>
                  <Plus size={16} style={{ flexShrink: 0 }} /> ADD
                </button>
              </div>

              {genreError && (
                <div style={{
                  padding: '0.5rem 0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '2px solid var(--accent-red)', borderRadius: '4px', color: 'var(--accent-red)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem'
                }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} /> {genreError}
                </div>
              )}

              {/* Selected Genres Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '60px', padding: '0.65rem', backgroundColor: 'var(--bg-primary)', border: '2px solid var(--border-color)', borderRadius: '4px' }}>
                {selectedGenres.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', alignSelf: 'center' }}>
                    No genres added yet. Type above to add.
                  </span>
                ) : (
                  selectedGenres.map(g => (
                    <button
                      key={g}
                      type="button"
                      className="btn-neo btn-neo-lime"
                      onClick={() => handleRemoveGenre(g)}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: '44px', flexShrink: 0 }}
                    >
                      {g} ×
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* STEP 4: SUMMARY & READY */}
          {currentStep === 4 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                TASTE PROFILE <span style={{ color: 'var(--accent-lime)' }}>SUMMARY</span>
              </h2>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Review your choices before generating your first personalized recommendation deck.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-primary)', border: '2px solid var(--border-color)', padding: '1rem', borderRadius: '4px' }}>
                <div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 800, color: 'var(--accent-lime)', margin: '0 0 0.4rem 0' }}>
                    TOP ARTISTS ({selectedArtists.length})
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {selectedArtists.length === 0 ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>None selected</span>
                    ) : (
                      selectedArtists.map(a => (
                        <span key={a} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', flexShrink: 0 }}>
                          {a}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 800, color: 'var(--accent-lime)', margin: '0 0 0.4rem 0' }}>
                    TOP GENRES ({selectedGenres.length})
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {selectedGenres.length === 0 ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>None selected</span>
                    ) : (
                      selectedGenres.map(g => (
                        <span key={g} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', flexShrink: 0 }}>
                          {g}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: 'var(--accent-lime)',
                fontWeight: 700,
                marginTop: '1rem',
                padding: '0.6rem 0.8rem',
                backgroundColor: 'var(--bg-primary)',
                border: '1px dashed var(--accent-lime)',
                borderRadius: '4px',
                lineHeight: 1.4
              }}>
                NOTE: Enter at least 5 tracks in taste profile for more meaningful recommendations
              </p>
            </div>
          )}
        </div>

        {/* Wizard Navigation Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '2rem', paddingTop: '1.25rem', borderTop: '2px solid var(--border-color)' }}>
          {currentStep > 1 ? (
            <button
              type="button"
              className="btn-neo btn-neo-secondary"
              onClick={() => setCurrentStep(prev => prev - 1)}
              style={{ padding: '0.75rem 1.25rem', minHeight: '44px', flexShrink: 0 }}
            >
              <ArrowLeft size={16} style={{ flexShrink: 0 }} /> BACK
            </button>
          ) : (
            <div />
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              className="btn-neo btn-neo-lime"
              onClick={() => setCurrentStep(prev => prev + 1)}
              style={{ padding: '0.75rem 1.25rem', minHeight: '44px', flexShrink: 0 }}
            >
              NEXT <ArrowRight size={16} style={{ flexShrink: 0 }} />
            </button>
          ) : (
            <button
              type="button"
              className="btn-neo btn-neo-lime"
              disabled={isSubmitting}
              onClick={handleSubmitFinal}
              style={{ padding: '0.75rem 1.25rem', boxShadow: '0 4px 14px var(--accent-lime)', minHeight: '44px', flexShrink: 0 }}
            >
              {isSubmitting ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Loader2 size={18} className="animate-spin" style={{ flexShrink: 0 }} /> GENERATING...
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="back-btn-text-full">GENERATE RECOMMENDATIONS</span>
                  <span className="back-btn-text-short">GENERATE</span>
                  <ArrowRight size={18} style={{ flexShrink: 0 }} />
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
