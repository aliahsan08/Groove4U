import React, { useState, useRef, useEffect } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  speed?: number; // Duration in seconds for full loop
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({
  text,
  className = '',
  style = {},
  speed = 12
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        // Compare text scroll width with container visible width
        const overflows = textRef.current.scrollWidth > containerRef.current.clientWidth + 4;
        setIsOverflowing(overflows);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text]);

  if (!isOverflowing) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          width: '100%',
          ...style
        }}
      >
        <span ref={textRef}>{text}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`auto-marquee-container ${className}`}
      style={{
        width: '100%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        position: 'relative',
        ...style
      }}
    >
      <div
        className="auto-marquee-track"
        style={{
          animationDuration: `${speed}s`
        }}
      >
        <span>{text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      </div>
    </div>
  );
};
