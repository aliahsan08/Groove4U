import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { fetchUserProfileFromDB, updateUserProfileInDB } from '../services/supabaseService';
import { UserProfileInfo } from '../types/music';
import { Radio, ShieldAlert, Sparkles, Disc, Music, Headphones, Zap } from 'lucide-react';
import { GrooveLogo } from './GrooveLogo';

interface AuthViewProps {
  onAuthSuccess: (userProfile: UserProfileInfo, token: string) => void;
  isDarkMode: boolean;
  onContinueAsGuest?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess, isDarkMode, onContinueAsGuest }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [age, setAge] = useState<string>('24');
  const [gender, setGender] = useState<string>('Prefer not to say');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        if (data.session && data.user) {
          const profile = await fetchUserProfileFromDB(data.user.id, data.user.email || email);
          onAuthSuccess(profile, data.session.access_token);
        }
      } else {
        // SIGN UP MODE
        const ageNum = parseInt(age) || 24;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
              country,
              age: ageNum,
              gender
            }
          }
        });

        if (error) throw error;

        if (data.user) {
          const profile: UserProfileInfo = {
            id: data.user.id,
            name: name || email.split('@')[0],
            email,
            country: country || '',
            lastFmUsername: '',
            age: ageNum,
            gender: gender || 'Prefer not to say',
            topGenres: [],
            topArtists: [],
            isLastFmSynced: false
          };

          await updateUserProfileInDB(data.user.id, profile);
          const token = data.session?.access_token || '';
          onAuthSuccess(profile, token);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`auth-container ${isDarkMode ? '' : 'light-mode'}`}>
      {/* DESKTOP LEFT SIDE PANEL: Whole Green Card with Groove4U Logo & Music Equalizer */}
      <div className="auth-desktop-left">
        {/* Background Decorative Circles */}
        <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '240px', height: '240px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-80px', right: '-80px', width: '320px', height: '320px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.06)', pointerEvents: 'none' }} />

        {/* Center Content Box: Logo Card & Music Equalizer Bar (No CD & Lesser spacing) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', zIndex: 2 }}>
          {/* Black Rectangular Logo Card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            backgroundColor: '#0D0E12', padding: '0.85rem 3rem', border: '3px solid #000000',
            boxShadow: '6px 6px 0px rgba(0,0,0,0.3)', borderRadius: '4px'
          }}>
            <Radio size={36} style={{ color: 'var(--accent-lime)' }} />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.8rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0 }}>
              GROOVE<span style={{ color: 'var(--accent-lime)' }}>4U</span>
            </h1>
          </div>

          {/* Animated Music Equalizer Bar Capsule Pill */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '32px',
            padding: '0.4rem 1.75rem', backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: '20px',
            border: '2px solid rgba(0,0,0,0.25)'
          }}>
            {[1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1].map((barGroup, idx) => (
              <div
                key={idx}
                className={`eq-bar eq-bar-${barGroup}`}
                style={{ width: '4px', backgroundColor: '#0D0E12', borderRadius: '2px', animationDelay: `${idx * 0.08}s` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* MOBILE TOP BANNER (Shown only on Phone) */}
      <div className="auth-mobile-top" style={{
        backgroundColor: 'var(--accent-lime)',
        padding: '0.65rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '3px solid #000000',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.85rem',
          backgroundColor: '#0D0E12', padding: '0.45rem 1.5rem',
          border: '3px solid #000000', boxShadow: '3px 3px 0px rgba(0,0,0,0.3)',
          borderRadius: '4px', zIndex: 2
        }}>
          <Radio size={26} style={{ color: 'var(--accent-lime)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.85rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0 }}>
            GROOVE<span style={{ color: 'var(--accent-lime)' }}>4U</span>
          </h1>
        </div>
      </div>

      {/* CENTER / RIGHT FORM CARD CONTAINER */}
      <div className="auth-desktop-right" style={{
        flex: 1,
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        overflowY: 'auto'
      }}>
        <div className="tactile-card" style={{
          maxWidth: '460px',
          width: '100%',
          backgroundColor: 'var(--bg-secondary)',
          border: '3px solid var(--border-color)',
          boxShadow: '10px 10px 0px var(--accent-lime)',
          padding: mode === 'signup' ? '1.75rem 2rem' : '2.25rem 2rem'
        }}>
          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem' }}>
            <button
              type="button"
              className={`btn-neo ${mode === 'login' ? 'btn-neo-lime' : 'btn-neo-secondary'}`}
              style={{ flex: 1, justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', minHeight: '44px', flexShrink: 0 }}
              onClick={() => setMode('login')}
            >
              LOG IN
            </button>
            <button
              type="button"
              className={`btn-neo ${mode === 'signup' ? 'btn-neo-lime' : 'btn-neo-secondary'}`}
              style={{ flex: 1, justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', minHeight: '44px', flexShrink: 0 }}
              onClick={() => setMode('signup')}
            >
              SIGN UP
            </button>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div style={{
              backgroundColor: 'rgba(255, 0, 55, 0.15)',
              border: '2px solid var(--accent-red)',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--accent-red)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <ShieldAlert size={16} style={{ flexShrink: 0 }} />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: mode === 'signup' ? '0.85rem' : '1.1rem' }}>
            {mode === 'signup' && (
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                  FULL NAME
                </label>
                <input
                  type="text"
                  className="input-neo"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Victoria Legrand"
                  required
                  style={{ minHeight: '44px' }}
                />
              </div>
            )}

            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                className="input-neo"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="victoria@groove4u.app"
                required
                style={{ minHeight: '44px' }}
              />
            </div>

            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                PASSWORD
              </label>
              <input
                type="password"
                className="input-neo"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                minLength={6}
                required
                style={{ minHeight: '44px' }}
              />
            </div>

            {mode === 'signup' && (
              <>
                <div>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    COUNTRY
                  </label>
                  <input
                    type="text"
                    className="input-neo"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    placeholder="Pakistan"
                    required
                    style={{ minHeight: '44px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                      AGE
                    </label>
                    <input
                      type="number"
                      min="13"
                      max="120"
                      className="input-neo"
                      value={age}
                      onChange={e => setAge(e.target.value)}
                      placeholder="24"
                      required
                      style={{ minHeight: '44px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                      GENDER
                    </label>
                    <select
                      className="input-neo"
                      value={gender}
                      onChange={e => setGender(e.target.value)}
                      style={{ cursor: 'pointer', minHeight: '44px' }}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              className="btn-neo btn-neo-lime"
              style={{ padding: '0.9rem', fontSize: '1rem', justifyContent: 'center', marginTop: '0.5rem', minHeight: '44px', flexShrink: 0 }}
              disabled={isLoading}
            >
              {isLoading ? 'AUTHENTICATING...' : (mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT')}
            </button>
          </form>
        </div>

        {/* Continue as Guest Button Placed Directly Under the Login Card */}
        <div style={{ marginTop: '1.5rem', width: '100%', maxWidth: '460px', textAlign: 'center' }}>
          <button
            type="button"
            className="btn-neo btn-neo-cyan"
            onClick={onContinueAsGuest}
            style={{
              padding: '0.55rem 1.1rem',
              fontSize: '0.825rem',
              fontWeight: 700,
              justifyContent: 'center',
              display: 'inline-flex',
              boxShadow: '0 4px 12px rgba(0, 229, 255, 0.25)',
              gap: '0.4rem',
              minHeight: '44px',
              flexShrink: 0
            }}
          >
            <Headphones size={15} style={{ flexShrink: 0 }} /> Continue as Guest
          </button>
        </div>

        {/* Explicit Content Notice */}
        <div style={{ marginTop: '0.85rem', width: '100%', maxWidth: '460px', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.725rem',
            color: 'var(--text-muted)',
            margin: 0,
            lineHeight: 1.4,
            opacity: 0.85
          }}>
            Note: Explicit (E) rated songs & artwork are included in catalog
          </p>
        </div>
      </div>

      {/* Bottom Green Banner with Animated Audio Equalizer Visualizer (Shown only on Phone) */}
      <div className="auth-mobile-bottom" style={{
        backgroundColor: 'var(--accent-lime)',
        padding: '1.25rem 1rem',
        minHeight: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderTop: '3px solid #000000',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        {/* Subtle Animated Audio Equalizer Visualizer Centered */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '6px',
          height: '24px',
          padding: '0.35rem 1.5rem',
          backgroundColor: 'rgba(0,0,0,0.12)',
          borderRadius: '20px',
          border: '2px solid rgba(0,0,0,0.25)',
          zIndex: 2
        }}>
          {[1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4].map((barGroup, idx) => (
            <div
              key={idx}
              className={`eq-bar eq-bar-${barGroup}`}
              style={{
                width: '4px',
                backgroundColor: '#0D0E12',
                borderRadius: '2px',
                animationDelay: `${idx * 0.08}s`
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
