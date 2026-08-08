import React from 'react';
import { Play, Pause, X, Disc, Volume2 } from 'lucide-react';
import { Track } from '../types/music';

interface AudioPlayerBarProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTogglePlay: (track: Track) => void;
  onClose: () => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onClose
}) => {
  if (!currentTrack) return null;

  const coverUrl = currentTrack.coverUrl || (currentTrack as any).cover_url || '';
  const trackTitle = currentTrack.title || 'Unknown Track';
  const artistName = currentTrack.artist || 'Unknown Artist';

  return (
    <div
      className={`audio-player-bar ${isPlaying ? 'playing-glow' : ''}`}
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        backgroundColor: 'var(--bg-secondary)',
        border: '3px solid var(--border-color)',
        boxShadow: 'var(--shadow-lg)',
        padding: '0.85rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        borderRadius: '4px',
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease'
      }}
    >
      {/* Album Artwork Container */}
      <div
        style={{
          position: 'relative',
          width: '52px',
          height: '52px',
          flexShrink: 0,
          borderRadius: '4px',
          overflow: 'hidden',
          border: '2px solid var(--border-color)',
          backgroundColor: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={trackTitle}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        ) : (
          <Disc size={24} style={{ color: 'var(--text-muted)' }} />
        )}
        {/* Vinyl Disc Overlay Icon when playing */}
        {isPlaying && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Disc size={26} className="spinning-vinyl" style={{ color: 'var(--accent-lime)' }} />
          </div>
        )}
      </div>

      {/* Track Details & Sliding Marquee Text */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* Sliding Marquee for Title & Artist */}
        <div className="marquee-container" style={{ width: '100%', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <div className="marquee-content">
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>
              {trackTitle}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-lime)', fontWeight: 700, marginLeft: '0.5rem' }}>
              — {artistName}
            </span>
            {/* Duplicate for seamless infinite sliding marquee loop */}
            <span style={{ paddingLeft: '3rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>
              {trackTitle}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-lime)', fontWeight: 700, marginLeft: '0.5rem' }}>
              — {artistName}
            </span>
          </div>
        </div>

        {/* Animated Equalizer Soundwave Bars & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
          {isPlaying ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '14px' }}>
              <div className="eq-bar eq-bar-1" />
              <div className="eq-bar eq-bar-2" />
              <div className="eq-bar eq-bar-3" />
              <div className="eq-bar eq-bar-4" />
            </div>
          ) : (
            <Volume2 size={13} style={{ color: 'var(--text-muted)' }} />
          )}

          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            {isPlaying ? 'PLAYING 30S PREVIEW' : 'PAUSED'}
          </span>
        </div>
      </div>

      {/* Action Controls: Play/Pause & Close Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
        <button
          className="btn-neo"
          style={{
            minWidth: '44px',
            minHeight: '44px',
            padding: '0.45rem',
            backgroundColor: isPlaying ? 'var(--accent-red)' : 'var(--accent-lime)',
            color: '#000',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
          onClick={() => onTogglePlay(currentTrack)}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} style={{ flexShrink: 0 }} /> : <Play size={18} style={{ flexShrink: 0 }} />}
        </button>

        <button
          style={{
            minWidth: '44px',
            minHeight: '44px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
          onClick={onClose}
          title="Close player"
        >
          <X size={18} style={{ flexShrink: 0 }} />
        </button>
      </div>
    </div>
  );
};
