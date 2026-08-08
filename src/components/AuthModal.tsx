import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { fetchUserProfileFromDB, updateUserProfileInDB } from '../services/supabaseService';
import { UserProfileInfo } from '../types/music';
import { X, Lock, Mail, User, Globe, Radio, ShieldAlert, Sparkles, Headphones } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (userProfile: UserProfileInfo, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [lastFmUsername, setLastFmUsername] = useState('');
  const [age, setAge] = useState<string>('24');
  const [gender, setGender] = useState<string>('Prefer not to say');

  if (!isOpen) return null;

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
          onClose();
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
              lastFmUsername,
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
            lastFmUsername: lastFmUsername || '',
            age: ageNum,
            gender: gender || 'Prefer not to say',
            topGenres: [],
            topArtists: [],
            isLastFmSynced: false
          };

          await updateUserProfileInDB(data.user.id, profile);
          const token = data.session?.access_token || '';
          onAuthSuccess(profile, token);
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1.5rem'
    }}>
      <div className="tactile-card" style={{
        maxWidth: '480px',
        width: '100%',
        backgroundColor: 'var(--bg-secondary)',
        border: '3px solid var(--border-color)',
        boxShadow: '10px 10px 0px var(--accent-lime)',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-main)',
            cursor: 'pointer',
            minWidth: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <X size={24} style={{ flexShrink: 0 }} />
        </button>

        {/* Header Badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span className="badge-neo badge-lime" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <Sparkles size={12} style={{ flexShrink: 0 }} /> SYSTEM AUTHENTICATION
          </span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', marginTop: '0.4rem' }}>
            GROOVE4U <span style={{ color: 'var(--accent-lime)' }}>ACCESS</span>
          </h2>
        </div>

        {/* Mode Switcher Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            className={`btn-neo ${mode === 'login' ? 'btn-neo-lime' : 'btn-neo-secondary'}`}
            style={{ flex: 1, justifyContent: 'center', fontWeight: 800, minHeight: '44px', flexShrink: 0 }}
            onClick={() => setMode('login')}
          >
            LOG IN
          </button>
          <button
            type="button"
            className={`btn-neo ${mode === 'signup' ? 'btn-neo-lime' : 'btn-neo-secondary'}`}
            style={{ flex: 1, justifyContent: 'center', fontWeight: 800, minHeight: '44px', flexShrink: 0 }}
            onClick={() => setMode('signup')}
          >
            SIGN UP
          </button>
        </div>

        {/* Quick Guest Mode Banner */}
        <button
          type="button"
          className="btn-neo btn-neo-cyan"
          onClick={onClose}
          style={{ width: '100%', padding: '0.75rem', justifyContent: 'center', marginBottom: '1.25rem', gap: '0.5rem', fontWeight: 800, minHeight: '44px', flexShrink: 0 }}
        >
          <Headphones size={18} style={{ flexShrink: 0 }} /> CONTINUE AS GUEST (NO LOGIN REQUIRED)
        </button>

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

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Sign Up Name Field */}
          {mode === 'signup' && (
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                FULL NAME
              </label>
              <div style={{ position: 'relative' }}>
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
            </div>
          )}

          {/* Email Field */}
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
              EMAIL ADDRESS
            </label>
            <input
              type="email"
              className="input-neo"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="victoria.legrand@groove4u.app"
              required
              style={{ minHeight: '44px' }}
            />
          </div>

          {/* Password Field */}
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

          {/* Additional Sign Up Fields */}
          {mode === 'signup' && (
            <>
              {/* Country */}
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

              {/* Age and Gender Grid */}
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

          {/* Submit Button */}
          <button
            type="submit"
            className="btn-neo btn-neo-lime"
            style={{ padding: '0.85rem', fontSize: '1rem', justifyContent: 'center', marginTop: '0.5rem', minHeight: '44px', flexShrink: 0 }}
            disabled={isLoading}
          >
            {isLoading ? 'AUTHENTICATING...' : (mode === 'login' ? 'LOG IN TO DECK' : 'CREATE ACCOUNT')}
          </button>

          {/* Continue as Guest Button */}
          <button
            type="button"
            className="btn-neo btn-neo-secondary"
            onClick={onClose}
            style={{ padding: '0.75rem', fontSize: '0.88rem', justifyContent: 'center', width: '100%', minHeight: '44px', flexShrink: 0 }}
          >
            CONTINUE AS GUEST 🎧
          </button>
        </form>
      </div>
    </div>
  );
};
