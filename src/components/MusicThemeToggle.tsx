import React from 'react';
import { Sun, Moon } from 'lucide-react';

interface MusicThemeToggleProps {
  isDarkMode: boolean;
  onToggle: () => void;
}

export const MusicThemeToggle: React.FC<MusicThemeToggleProps> = ({ isDarkMode, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      type="button"
      style={{
        position: 'relative',
        width: '68px',
        height: '38px',
        borderRadius: '4px',
        border: '2px solid var(--border-color)',
        padding: '3px',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        backgroundColor: isDarkMode ? 'var(--bg-secondary)' : 'var(--bg-card-hover)',
        transition: 'background-color 0.25s ease, border-color 0.25s ease',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none'
      }}
      className="btn-neo-hover-press"
      title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} Mode`}
    >
      {/* Inner Square Knob - Green Square with Crisp White Icon */}
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '2px',
          border: '1.5px solid var(--border-color)',
          backgroundColor: 'var(--accent-lime)',
          transform: isDarkMode ? 'translateX(30px)' : 'translateX(0px)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }}
      >
        {isDarkMode ? (
          <Moon size={16} style={{ color: '#FFFFFF' }} />
        ) : (
          <Sun size={16} style={{ color: '#FFFFFF' }} />
        )}
      </div>
    </button>
  );
};
