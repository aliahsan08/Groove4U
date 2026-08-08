import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download, Loader2, Image as ImageIcon } from 'lucide-react';
import { fetchTrackArtworks } from '../services/api';

interface ArtworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  artist: string;
  title: string;
  currentCoverUrl?: string;
}

export const ArtworkModal: React.FC<ArtworkModalProps> = ({
  isOpen,
  onClose,
  artist,
  title,
  currentCoverUrl
}) => {
  const [artworks, setArtworks] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isImgLoading, setIsImgLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const initialList = currentCoverUrl && currentCoverUrl.trim() ? [currentCoverUrl.trim()] : [];
    setArtworks(initialList);
    setCurrentIndex(0);
    setIsLoading(true);
    setIsImgLoading(true);

    fetchTrackArtworks(artist, title, currentCoverUrl)
      .then(fetchedList => {
        if (fetchedList && fetchedList.length > 0) {
          setArtworks(fetchedList);
          // Preload all images in browser memory for instant slide navigation
          fetchedList.forEach(url => {
            if (url) {
              const img = new Image();
              img.src = url;
            }
          });
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, artist, title, currentCoverUrl]);

  if (!isOpen) return null;

  const currentArtwork = artworks[currentIndex] || currentCoverUrl || '';

  const handleNext = () => {
    if (artworks.length === 0) return;
    setIsImgLoading(true);
    setCurrentIndex((prev) => (prev + 1) % artworks.length);
  };

  const handlePrev = () => {
    if (artworks.length === 0) return;
    setIsImgLoading(true);
    setCurrentIndex((prev) => (prev - 1 + artworks.length) % artworks.length);
  };

  const handleDownload = async () => {
    if (!currentArtwork) return;
    setIsDownloading(true);
    try {
      const response = await fetch(currentArtwork, { mode: 'cors' });
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanArtist = artist.replace(/[^a-zA-Z0-9]/g, '_');
      link.download = `${cleanArtist}_${cleanTitle}_artwork_${currentIndex + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(currentArtwork, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      padding: '1.5rem',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'var(--bg-secondary, #16181E)',
        border: '3px solid #FFFFFF',
        boxShadow: '10px 10px 0px #000000',
        borderRadius: '8px',
        maxWidth: '560px',
        width: '100%',
        maxHeight: '85vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        padding: '2rem 1.5rem',
        color: '#FFFFFF',
        margin: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Top Header Row with Close Button */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#0D0E12',
              color: '#FFFFFF',
              border: '2px solid #FFFFFF',
              borderRadius: '4px',
              cursor: 'pointer',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '2px 2px 0px #FFFFFF',
              minWidth: '44px',
              minHeight: '44px',
              flexShrink: 0
            }}
            title="Close Modal"
          >
            <X size={20} style={{ flexShrink: 0 }} />
          </button>
        </div>

        {/* Track Title & Artist (Centered on Next Line) */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem', width: '100%', minWidth: 0, overflow: 'hidden' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            fontWeight: 900,
            margin: '0 0 0.25rem 0',
            color: '#FFFFFF',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {title}
          </h2>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9rem',
            color: 'var(--accent-lime, #76B900)',
            margin: 0,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {artist}
          </p>
        </div>

        {/* Carousel Image Container */}
        <div style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1/1',
          maxWidth: '380px',
          maxHeight: '380px',
          backgroundColor: '#0D0E12',
          border: '3px solid #000000',
          boxShadow: '6px 6px 0px rgba(0,0,0,0.5)',
          borderRadius: '6px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.25rem',
          flexShrink: 0
        }}>
          {currentArtwork ? (
            <>
              <img
                src={currentArtwork}
                alt={`${title} artwork`}
                onLoad={() => setIsImgLoading(false)}
                onError={() => setIsImgLoading(false)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: isImgLoading ? 0.4 : 1,
                  transition: 'opacity 0.15s ease-in-out'
                }}
              />
              {isImgLoading && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(13, 14, 18, 0.4)'
                }}>
                  <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-lime)' }} />
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#9CA3AF' }}>
              <ImageIcon size={48} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>No Artwork Found</span>
            </div>
          )}

          {/* Left Arrow Button */}
          {artworks.length > 1 && (
            <button
              onClick={handlePrev}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: 'rgba(13, 14, 18, 0.85)',
                color: 'var(--accent-lime, #76B900)',
                border: '2px solid #FFFFFF',
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                minWidth: '44px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '2px 2px 0px #000000',
                flexShrink: 0
              }}
              title="Previous Artwork"
            >
              <ChevronLeft size={24} style={{ flexShrink: 0 }} />
            </button>
          )}

          {/* Right Arrow Button */}
          {artworks.length > 1 && (
            <button
              onClick={handleNext}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: 'rgba(13, 14, 18, 0.85)',
                color: 'var(--accent-lime, #76B900)',
                border: '2px solid #FFFFFF',
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                minWidth: '44px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '2px 2px 0px #000000',
                flexShrink: 0
              }}
              title="Next Artwork"
            >
              <ChevronRight size={24} style={{ flexShrink: 0 }} />
            </button>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div style={{
              position: 'absolute',
              bottom: '10px',
              right: '10px',
              backgroundColor: '#0D0E12',
              color: 'var(--accent-lime)',
              padding: '0.3rem 0.6rem',
              borderRadius: '4px',
              border: '1px solid #FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem'
            }}>
              <Loader2 size={12} className="animate-spin" />
              <span>Fetching MusicBrainz covers...</span>
            </div>
          )}
        </div>

        {/* Carousel Indicators & Slide Counter */}
        {artworks.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            marginBottom: '1.25rem'
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              fontWeight: 800,
              color: '#9CA3AF'
            }}>
              Artwork {currentIndex + 1} of {artworks.length}
            </span>
          </div>
        )}

        {/* Action Buttons: Download Artwork */}
        <button
          onClick={handleDownload}
          disabled={!currentArtwork || isDownloading}
          style={{
            backgroundColor: 'var(--accent-lime, #76B900)',
            color: '#000000',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 900,
            border: '2px solid #000000',
            boxShadow: '4px 4px 0px #000000',
            padding: '0.75rem 1.75rem',
            borderRadius: '4px',
            cursor: currentArtwork && !isDownloading ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            transition: 'transform 0.1s ease',
            opacity: currentArtwork && !isDownloading ? 1 : 0.6
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'translate(2px, 2px)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'none')}
        >
          {isDownloading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>DOWNLOADING...</span>
            </>
          ) : (
            <>
              <Download size={18} />
              <span>DOWNLOAD ARTWORK</span>
            </>
          )}
        </button>
      </div>
    </div>,
    document.body
  );
};
