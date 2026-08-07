import React, { useState } from 'react';
import { Radio, Sparkles, Music, Star, User, LogIn, LogOut, Menu, X } from 'lucide-react';
import { MusicThemeToggle } from './MusicThemeToggle';
import { GrooveLogo } from './GrooveLogo';

interface HeaderProps {
  activeTab: 'home' | 'playlist' | 'taste' | 'profile';
  setActiveTab: (tab: 'home' | 'playlist' | 'taste' | 'profile') => void;
  playlistCount: number;
  tasteCount: number;
  isDarkMode: boolean;
  setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  isLoggedIn: boolean;
  userName?: string;
  onOpenAuthModal: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  playlistCount,
  tasteCount,
  isDarkMode,
  setIsDarkMode,
  isLoggedIn,
  userName,
  onOpenAuthModal,
  onLogout
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleTabClick = (tab: 'home' | 'playlist' | 'taste' | 'profile') => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  return (
    <header className="main-header">
      {/* Top Flash Stripe: Dual Jaws stomp inward from left & right edges to center, then retract revealing new text color */}
      <div className="top-flash-stripe">
        <span className="flash-stripe-text">MUSIC TASTE PERSONALIZED</span>
        <div className="flash-jaw-left" />
        <div className="flash-jaw-right" />
      </div>

      {/* Main Header Container - 3-Column Grid for 100% Dead-Centered Nav Tabs */}
      <div className="main-header-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0.75rem 1.5rem',
        gap: '1rem',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Left Column: Brand Logo */}
        <div
          className="brand-logo-container"
          onClick={() => setActiveTab('home')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', justifySelf: 'start' }}
        >
          <div className="brand-logo-icon-box" style={{
            backgroundColor: 'var(--accent-lime)',
            color: '#FFFFFF',
            padding: '0.5rem',
            border: '2px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Radio size={26} className="brand-radio-icon" />
          </div>
          <div>
            <h1 className="brand-logo-h1" style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--text-main)', margin: 0 }}>
              GROOVE<span style={{ color: 'var(--accent-lime)' }}>4U</span>
            </h1>
            <p className="brand-logo-sub" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0.1rem 0 0 0' }}>
              MUSIC DISCOVERY ENGINE
            </p>
          </div>
        </div>

        {/* Center Column: 4 Core Navigation Tabs (Desktop) */}
        <nav className="main-header-nav desktop-nav" style={{
          display: 'flex',
          border: '2px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)',
          backgroundColor: 'var(--bg-secondary)',
          justifySelf: 'center'
        }}>
          <button
            className={`nav-tab-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => handleTabClick('home')}
          >
            <Sparkles size={16} /> RECOMMENDATIONS
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'playlist' ? 'active' : ''}`}
            onClick={() => { if (isLoggedIn) handleTabClick('playlist'); else { onOpenAuthModal(); setIsSidebarOpen(false); } }}
            style={!isLoggedIn ? { backgroundColor: 'var(--bg-primary)', opacity: 0.7, cursor: 'pointer' } : {}}
            title={!isLoggedIn ? 'Locked in Guest Mode - Log in to access Playlists' : ''}
          >
            <Music size={16} /> PLAYLIST {!isLoggedIn ? <span style={{ filter: 'grayscale(100%)', opacity: 0.85 }}>🔒</span> : `(${playlistCount})`}
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'taste' ? 'active' : ''}`}
            onClick={() => { if (isLoggedIn) handleTabClick('taste'); else { onOpenAuthModal(); setIsSidebarOpen(false); } }}
            style={!isLoggedIn ? { backgroundColor: 'var(--bg-primary)', opacity: 0.7, cursor: 'pointer' } : {}}
            title={!isLoggedIn ? 'Locked in Guest Mode - Log in to access Taste Profile' : ''}
          >
            <Star size={16} /> TASTE PROFILE {!isLoggedIn ? <span style={{ filter: 'grayscale(100%)', opacity: 0.85 }}>🔒</span> : `(${tasteCount})`}
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => { if (isLoggedIn) handleTabClick('profile'); else { onOpenAuthModal(); setIsSidebarOpen(false); } }}
            style={!isLoggedIn ? { backgroundColor: 'var(--bg-primary)', opacity: 0.7, cursor: 'pointer' } : {}}
            title={!isLoggedIn ? 'Locked in Guest Mode - Log in to access Profile' : ''}
          >
            <User size={16} /> PROFILE {!isLoggedIn ? <span style={{ filter: 'grayscale(100%)', opacity: 0.85 }}>🔒</span> : ''}
          </button>
        </nav>

        {/* Right Column: Desktop Controls */}
        <div className="desktop-controls" style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <MusicThemeToggle
            isDarkMode={isDarkMode}
            onToggle={() => setIsDarkMode(prev => !prev)}
          />

          {isLoggedIn ? (
            <button
              className="btn-neo btn-neo-red"
              onClick={() => { onLogout(); setIsSidebarOpen(false); }}
              title="Log Out of Groove4U"
              style={{ height: '38px', padding: '0 0.75rem', fontSize: '0.75rem', gap: '0.4rem' }}
            >
              <LogOut size={14} /> LOG OUT
            </button>
          ) : (
            <button
              className="btn-neo btn-neo-lime"
              onClick={() => { onOpenAuthModal(); setIsSidebarOpen(false); }}
              style={{ height: '38px', padding: '0 0.9rem', fontSize: '0.75rem', gap: '0.4rem' }}
            >
              <LogIn size={14} /> LOGIN / SIGN UP
            </button>
          )}
        </div>

        {/* Right Column: Mobile Hamburger Menu Button */}
        <div className="mobile-menu-btn" style={{ justifySelf: 'end' }}>
          <button
            className="btn-neo"
            onClick={() => setIsSidebarOpen(true)}
            style={{ padding: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer' }}
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      <div 
        className={`mobile-sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} 
        onClick={() => setIsSidebarOpen(false)} 
      />

      {/* Mobile Sidebar */}
      <div className={`mobile-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <MusicThemeToggle
            isDarkMode={isDarkMode}
            onToggle={() => setIsDarkMode(prev => !prev)}
          />
          <button 
            onClick={() => setIsSidebarOpen(false)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '0.5rem' }}
          >
            <X size={28} />
          </button>
        </div>

        <div className="mobile-nav-stack">
          <button
            className={`mobile-nav-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => handleTabClick('home')}
          >
            <Sparkles size={20} style={{ flexShrink: 0 }} /> Recommendations
          </button>

          <button
            className={`mobile-nav-btn ${activeTab === 'playlist' ? 'active' : ''}`}
            onClick={() => { if (isLoggedIn) handleTabClick('playlist'); else { onOpenAuthModal(); setIsSidebarOpen(false); } }}
            style={!isLoggedIn ? { opacity: 0.7 } : {}}
          >
            <Music size={20} style={{ flexShrink: 0 }} /> Playlists {!isLoggedIn ? '🔒' : `(${playlistCount})`}
          </button>

          <button
            className={`mobile-nav-btn ${activeTab === 'taste' ? 'active' : ''}`}
            onClick={() => { if (isLoggedIn) handleTabClick('taste'); else { onOpenAuthModal(); setIsSidebarOpen(false); } }}
            style={!isLoggedIn ? { opacity: 0.7 } : {}}
          >
            <Star size={20} style={{ flexShrink: 0 }} /> Taste Profile {!isLoggedIn ? '🔒' : `(${tasteCount})`}
          </button>

          <button
            className={`mobile-nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => { if (isLoggedIn) handleTabClick('profile'); else { onOpenAuthModal(); setIsSidebarOpen(false); } }}
            style={!isLoggedIn ? { opacity: 0.7 } : {}}
          >
            <User size={20} style={{ flexShrink: 0 }} /> Profile {!isLoggedIn ? '🔒' : ''}
          </button>
        </div>

        <div style={{ marginTop: 'auto' }}>
          {isLoggedIn ? (
            <button
              className="btn-neo btn-neo-red"
              onClick={() => { onLogout(); setIsSidebarOpen(false); }}
              style={{ width: '100%', padding: '1rem', fontSize: '1rem', gap: '0.5rem', justifyContent: 'center' }}
            >
              <LogOut size={18} /> LOG OUT
            </button>
          ) : (
            <button
              className="btn-neo btn-neo-lime"
              onClick={() => { onOpenAuthModal(); setIsSidebarOpen(false); }}
              style={{ width: '100%', padding: '1rem', fontSize: '1rem', gap: '0.5rem', justifyContent: 'center' }}
            >
              <LogIn size={18} /> LOGIN / SIGN UP
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
