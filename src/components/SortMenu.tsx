import React, { useState, useEffect, useRef } from 'react';
import { ArrowUpDown, Check } from 'lucide-react';

interface SortOption {
  label: string;
  value: string;
}

interface SortMenuProps {
  value: string;
  onChange: (val: string) => void;
  options: SortOption[];
}

export const SortMenu: React.FC<SortMenuProps> = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = options.find(o => o.value === value);

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        className="btn-neo"
        onClick={() => setIsOpen(!isOpen)}
        title={`Sort options (${currentOption?.label || 'Sort'})`}
        style={{
          padding: '0 0.75rem',
          height: '44px',
          minHeight: '44px',
          minWidth: '44px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-main)',
          border: '2px solid var(--border-color)',
          cursor: 'pointer'
        }}
      >
        <ArrowUpDown size={18} style={{ flexShrink: 0 }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          backgroundColor: 'var(--bg-secondary)',
          border: '2px solid var(--border-color)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          borderRadius: '4px',
          zIndex: 9999,
          minWidth: '190px',
          padding: '0.35rem 0'
        }}>
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  padding: '0.65rem 0.9rem',
                  fontSize: '0.825rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isSelected ? 800 : 600,
                  color: isSelected ? 'var(--accent-lime)' : 'var(--text-main)',
                  backgroundColor: isSelected ? 'rgba(118, 185, 0, 0.12)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  minHeight: '44px',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                {isSelected && <Check size={14} style={{ color: 'var(--accent-lime)', flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
