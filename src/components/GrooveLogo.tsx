import React from 'react';

interface GrooveLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const GrooveLogo: React.FC<GrooveLogoProps> = ({ size = 38, className, style }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
    >
      <defs>
        {/* Neon Lime Gradient */}
        <linearGradient id="grooveLimeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A3E635" />
          <stop offset="50%" stopColor="#76B900" />
          <stop offset="100%" stopColor="#4D7C0F" />
        </linearGradient>

        {/* Dark Metallic Surface Gradient */}
        <linearGradient id="grooveDarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E232A" />
          <stop offset="100%" stopColor="#090A0D" />
        </linearGradient>

        {/* Cyber Neon Glow Effect */}
        <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Tactile Shadow */}
      <rect x="3" y="3" width="42" height="42" rx="8" fill="#000000" />

      {/* Outer Metallic Card Frame */}
      <rect x="2" y="2" width="42" height="42" rx="8" fill="url(#grooveDarkGrad)" stroke="#FFFFFF" strokeWidth="2.5" />

      {/* Outer Glowing Vinyl Arc */}
      <path
        d="M11 24C11 16.8203 16.8203 11 24 11C31.1797 11 37 16.8203 37 24C37 31.1797 31.1797 37 24 37"
        stroke="url(#grooveLimeGrad)"
        strokeWidth="3"
        strokeLinecap="round"
        filter="url(#neonGlow)"
      />

      {/* Dotted Inner Vinyl Groove */}
      <circle cx="24" cy="24" r="8.5" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.85" />

      {/* Equalizer Spectrum Bars */}
      <rect x="14" y="20" width="2.5" height="8" rx="1.25" fill="#FFFFFF" />
      <rect x="18.5" y="15" width="2.5" height="15" rx="1.25" fill="url(#grooveLimeGrad)" />
      <rect x="29.5" y="18" width="2.5" height="11" rx="1.25" fill="url(#grooveLimeGrad)" />
      <rect x="34" y="22" width="2.5" height="6" rx="1.25" fill="#FFFFFF" />

      {/* Stylized Center Turntable Spindle */}
      <circle cx="24" cy="24" r="3" fill="#FFFFFF" stroke="#000000" strokeWidth="1" />
      <circle cx="24" cy="24" r="1.2" fill="#76B900" />
    </svg>
  );
};
