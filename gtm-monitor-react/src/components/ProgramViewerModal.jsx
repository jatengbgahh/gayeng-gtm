import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { API_BASE_URL } from '../apiConfig';

export default function ProgramViewerModal({ program, monthLabel, onClose, isAdmin, token, onDeleteSuccess }) {
  // Normalize multi-image slides from program.images or fallback to single imageUrl
  const initialSlides = (Array.isArray(program?.images) && program.images.length > 0)
    ? program.images
    : (program?.imageUrl ? [{ id: 'legacy_0', imageUrl: program.imageUrl, detailUrl: program.detailUrl || '', scannedLink: program.scannedLink || null }] : []);

  const [slides, setSlides] = useState(initialSlides);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Sync if program prop updates
  useEffect(() => {
    const updated = (Array.isArray(program?.images) && program.images.length > 0)
      ? program.images
      : (program?.imageUrl ? [{ id: 'legacy_0', imageUrl: program.imageUrl, detailUrl: program.detailUrl || '', scannedLink: program.scannedLink || null }] : []);
    setSlides(updated);
    setCurrentSlideIndex(0);
  }, [program]);

  const currentSlide = slides[currentSlideIndex] || slides[0] || {};
  const activeImageUrl = currentSlide.imageUrl || program?.imageUrl || null;
  const activeDetailUrl = currentSlide.detailUrl !== undefined ? currentSlide.detailUrl : (program?.detailUrl || '');

  // Viewport Zoom and Pan States
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);

  // Program / Slide Delete States
  const [deleteTargetType, setDeleteTargetType] = useState('PROGRAM'); // 'PROGRAM' or 'SLIDE'
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Option Dropdown State (Titik Tiga)
  const [isOptionOpen, setIsOptionOpen] = useState(false);
  const optionMenuRef = useRef(null);

  // Close option dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (optionMenuRef.current && !optionMenuRef.current.contains(e.target)) {
        setIsOptionOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Slide navigation handlers
  const handleSlideChange = (newIdx) => {
    if (newIdx >= 0 && newIdx < slides.length) {
      setCurrentSlideIndex(newIdx);
      // Reset zoom & pan position on slide change
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  const handlePrevSlide = () => {
    if (slides.length <= 1) return;
    const newIdx = currentSlideIndex > 0 ? currentSlideIndex - 1 : slides.length - 1;
    handleSlideChange(newIdx);
  };

  const handleNextSlide = () => {
    if (slides.length <= 1) return;
    const newIdx = currentSlideIndex < slides.length - 1 ? currentSlideIndex + 1 : 0;
    handleSlideChange(newIdx);
  };

  // Keyboard navigation: Escape to close, ArrowLeft / ArrowRight to switch slides
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showConfirmDelete) {
          setShowConfirmDelete(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        if (slides.length > 1) handlePrevSlide();
      } else if (e.key === 'ArrowRight') {
        if (slides.length > 1) handleNextSlide();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, slides.length, currentSlideIndex, showConfirmDelete]);

  // Handle Delete (Entire Program or Current Slide)
  const handleExecuteDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const targetProgramName = program?.sheetName || program?.name || '';
      const payload = {
        monthLabel: monthLabel || 'Agustus 2026',
        programName: targetProgramName
      };

      if (deleteTargetType === 'SLIDE' && currentSlide?.id) {
        payload.imageId = currentSlide.id;
      }

      const res = await fetch(`${API_BASE_URL}/api/admin/programs`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get('content-type') || '';
      let data = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const textErr = await res.text();
        throw new Error(`Server error (${res.status}): ${textErr.slice(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Gagal memproses penghapusan.');
      }

      if (deleteTargetType === 'SLIDE' && slides.length > 1) {
        const newSlides = slides.filter((_, idx) => idx !== currentSlideIndex);
        setSlides(newSlides);
        setCurrentSlideIndex(prev => (prev >= newSlides.length ? newSlides.length - 1 : prev));
        setShowConfirmDelete(false);
        setIsDeleting(false);
        if (onDeleteSuccess) onDeleteSuccess();
      } else {
        if (onDeleteSuccess) {
          onDeleteSuccess();
        } else if (onClose) {
          onClose();
        }
      }
    } catch (err) {
      console.error('Delete error in modal:', err);
      setDeleteError(err.message || 'Gagal menghapus data.');
      setIsDeleting(false);
    }
  };

  const containerRef = useRef(null);
  const tableRef = useRef(null);

  // Wheel zoom handler
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale(prev => Math.min(prev + 0.1, 2.5));
    } else {
      setScale(prev => Math.max(prev - 0.1, 0.5));
    }
  };

  // Drag / Pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Export to PNG Image or direct image download
  const handleDownloadPNG = async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      if (activeImageUrl) {
        const res = await fetch(activeImageUrl);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const slideSuffix = slides.length > 1 ? `_slide_${currentSlideIndex + 1}` : '';
        const filename = `${(program.sheetName || 'Program').replace(/\s+/g, '_')}${slideSuffix}_${(monthLabel || '').replace(/\s+/g, '_')}.png`;
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } else if (tableRef.current) {
        const currentScale = scale;
        const currentPos = { ...position };

        setScale(1);
        setPosition({ x: 0, y: 0 });

        await new Promise(r => setTimeout(r, 100));

        const canvas = await html2canvas(tableRef.current, {
          backgroundColor: '#FFFFFF',
          scale: 2,
          useCORS: true,
          logging: false
        });

        const image = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const filename = `${(program.sheetName || 'Program').replace(/\s+/g, '_')}_${(monthLabel || '').replace(/\s+/g, '_')}.png`;

        link.href = image;
        link.download = filename;
        link.click();

        setScale(currentScale);
        setPosition(currentPos);
      }
    } catch (err) {
      console.error('Failed to export program image:', err);
      alert('Gagal mendownload gambar program. Silakan coba lagi.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!program) return null;

  const headers = program.headers || [];
  const rows = program.rows || [];
  const summaryRow = program.summaryRow;

  // Format cell value smartly for Excel tables
  const formatCellValue = (headerName, val) => {
    if (val === null || val === undefined || val === '') return '-';

    const header = String(headerName || '').toUpperCase();
    const strVal = String(val).trim();

    if (strVal === 'PASS') {
      return (
        <span style={{ padding: '3px 10px', borderRadius: '50px', background: '#DCFCE7', color: '#166534', fontWeight: 800, fontSize: '11px' }}>
          PASS
        </span>
      );
    }
    if (strVal === 'NOT PASS') {
      return (
        <span style={{ padding: '3px 10px', borderRadius: '50px', background: '#FEE2E2', color: '#991B1B', fontWeight: 800, fontSize: '11px' }}>
          NOT PASS
        </span>
      );
    }

    if (
      header.includes('%') ||
      header.includes('ACH') ||
      header.includes('MOM') ||
      header.includes('OCC')
    ) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        const pct = num <= 1 && num >= -1 ? Math.round(num * 1000) / 10 : Math.round(num * 10) / 10;
        const color = pct > 0 && (header.includes('MOM') || header.includes('ACH')) ? '#16A34A' : pct < 0 && header.includes('MOM') ? '#DC2626' : 'inherit';
        return <span style={{ color, fontWeight: 700 }}>{pct > 0 && header.includes('MOM') ? `+${pct}%` : `${pct}%`}</span>;
      }
    }

    if (header.includes('INSENTIF')) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        return `Rp ${num.toLocaleString('id-ID')}`;
      }
    }

    const num = parseFloat(val);
    if (!isNaN(num) && typeof val === 'number') {
      return Number.isInteger(num) ? num.toLocaleString('id-ID') : num.toFixed(2);
    }

    return strVal;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 100000,
        background: 'rgba(15, 23, 42, 0.94)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-in-out'
      }}
    >
      {/* TOP FLOATING BAR: Left (Program Name & Slide Badge) & Right (Actions) */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '24px',
          right: '24px',
          zIndex: 100002,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none'
        }}
      >
        {/* Left: Program Info Badge */}
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50px',
            padding: '8px 18px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#FF5E00',
              boxShadow: '0 0 10px #FF5E00'
            }}
          />
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.3px' }}>
            {program.sheetName || 'Program Tracking'}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8' }}>
            • {monthLabel || 'Agustus 2026'}
          </span>
          {slides.length > 1 && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#60A5FA',
                background: 'rgba(59, 130, 246, 0.15)',
                padding: '2px 8px',
                borderRadius: '20px',
                border: '1px solid rgba(96, 165, 250, 0.3)'
              }}
            >
              Slide {currentSlideIndex + 1}/{slides.length}
            </span>
          )}
        </div>

        {/* Right: Three Dots Menu + Close Button */}
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* THREE-DOT OPTION BUTTON */}
          <div ref={optionMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOptionOpen(prev => !prev);
              }}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(10px)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(15, 23, 42, 0.95)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'}
              title="Opsi Program"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="19" r="1.5" fill="currentColor" />
              </svg>
            </button>

            {/* Option Dropdown Menu */}
            {isOptionOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '52px',
                  right: '0',
                  width: '240px',
                  background: 'rgba(15, 23, 42, 0.94)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.55)',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  animation: 'fadeIn 0.15s ease-out',
                  zIndex: 100010
                }}
              >
                {/* Opsi 1: Link Detail Program (Spesifik per Slide) */}
                {activeDetailUrl ? (
                  <a
                    href={activeDetailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsOptionOpen(false)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      color: '#60A5FA',
                      fontSize: '13px',
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>Link Detail Program</span>
                      {slides.length > 1 && (
                        <span style={{ fontSize: '10.5px', color: '#93C5FD', fontWeight: 600 }}>
                          (Slide {currentSlideIndex + 1})
                        </span>
                      )}
                    </div>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOptionOpen(false);
                      const slideInfo = slides.length > 1 ? `untuk slide ke-${currentSlideIndex + 1}` : '';
                      alert(`📌 Link detail resmi ${slideInfo} pada program "${program.sheetName || program.name || 'ini'}" belum dikonfigurasi.`);
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      color: '#94A3B8',
                      background: 'transparent',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>Link Detail Program</span>
                      {slides.length > 1 && (
                        <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 500 }}>
                          (Slide {currentSlideIndex + 1} - Tidak Ada)
                        </span>
                      )}
                    </div>
                  </button>
                )}

                {/* Opsi 2: Download Gambar */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionOpen(false);
                    handleDownloadPNG();
                  }}
                  disabled={isDownloading}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    color: '#FFFFFF',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isDownloading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>
                    {isDownloading
                      ? 'Memproses...'
                      : slides.length > 1
                      ? `Download Gambar (Slide ${currentSlideIndex + 1})`
                      : 'Download Gambar'}
                  </span>
                </button>

                {/* Opsi Admin: Hapus Slide Ini (hanya jika multi-slide) */}
                {isAdmin && slides.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOptionOpen(false);
                      setDeleteTargetType('SLIDE');
                      setShowConfirmDelete(true);
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      color: '#FB7185',
                      background: 'transparent',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      textAlign: 'left',
                      width: '100%',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span>Hapus Slide Ini ({currentSlideIndex + 1})</span>
                  </button>
                )}

                {/* Opsi Admin: Hapus Seluruh Program */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOptionOpen(false);
                      setDeleteTargetType('PROGRAM');
                      setShowConfirmDelete(true);
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      color: '#EF4444',
                      background: 'transparent',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      textAlign: 'left',
                      width: '100%',
                      borderTop: slides.length <= 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Hapus Seluruh Program</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* CLOSE BUTTON (✕) */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(10px)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#C8102E';
              e.currentTarget.style.borderColor = '#C8102E';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
            title="Tutup (Esc)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* MULTI-SLIDE NAVIGATION CONTROLS (LEFT / RIGHT BUTTONS & BOTTOM DOTS) */}
      {slides.length > 1 && (
        <>
          {/* Left Arrow Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevSlide();
            }}
            style={{
              position: 'fixed',
              left: '24px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 100003,
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(12px)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(200, 16, 46, 0.95)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
            }}
            title="Slide Sebelumnya (Panah Kiri)"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Right Arrow Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNextSlide();
            }}
            style={{
              position: 'fixed',
              right: '24px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 100003,
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(12px)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(200, 16, 46, 0.95)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
            }}
            title="Slide Berikutnya (Panah Kanan)"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Bottom Floating Pagination Dots Pill */}
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100003,
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '50px',
              padding: '8px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
              userSelect: 'none'
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.5px' }}>
              Slide {currentSlideIndex + 1} dari {slides.length}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSlideChange(idx);
                  }}
                  style={{
                    width: idx === currentSlideIndex ? '22px' : '8px',
                    height: '8px',
                    borderRadius: '50px',
                    background: idx === currentSlideIndex ? 'linear-gradient(135deg, #FF5E00, #C8102E)' : 'rgba(255, 255, 255, 0.35)',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                  title={`Lompat ke Slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* FULLSCREEN CANVAS VIEWPORT FOR THE PROGRAM IMAGE */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          background: 'transparent',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}
      >
        {activeImageUrl ? (
          <div
            ref={tableRef}
            key={`slide-view-${currentSlideIndex}`}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0, 0, 0.2, 1)',
              willChange: 'transform',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '98vw',
              maxHeight: '96vh',
              animation: 'fadeIn 0.2s ease-in-out'
            }}
          >
            <img
              src={activeImageUrl}
              alt={`${program.sheetName || 'Gambar Program'} - Slide ${currentSlideIndex + 1}`}
              style={{
                maxWidth: '96vw',
                maxHeight: '94vh',
                objectFit: 'contain',
                borderRadius: '16px',
                userSelect: 'none',
                pointerEvents: 'none',
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)'
              }}
            />
          </div>
        ) : (
          <div
            ref={tableRef}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0, 0, 0.2, 1)',
              willChange: 'transform',
              background: '#FFFFFF',
              borderRadius: '20px',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6)',
              padding: '28px',
              border: '1px solid #E2E8F0',
              maxHeight: '85vh',
              maxWidth: '92vw',
              overflow: 'auto'
            }}
          >
            <div style={{ marginBottom: '16px', borderBottom: '2px solid #C8102E', paddingBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#C8102E', letterSpacing: '0.5px' }}>
                  TELKOMSEL GTM ACTIVITY MONITORING
                </h4>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                  {program.sheetName} — {monthLabel || 'Agustus 2026'}
                </div>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', background: '#F8FAFC', padding: '4px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                Total {rows.length} Baris Data
              </div>
            </div>

            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: '12px',
                color: '#334155',
                textAlign: 'left'
              }}
            >
              <thead>
                <tr style={{ background: '#C8102E', color: '#FFFFFF' }}>
                  {headers.map((h, colIdx) => (
                    <th
                      key={colIdx}
                      style={{
                        padding: '12px 14px',
                        fontWeight: 800,
                        fontSize: '11.5px',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        border: '1px solid #A80C25',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, rowIdx) => (
                  <tr
                    key={rowIdx}
                    style={{
                      background: rowIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    {headers.map((h, colIdx) => (
                      <td
                        key={colIdx}
                        style={{
                          padding: '10px 14px',
                          border: '1px solid #E2E8F0',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {formatCellValue(h, r[h])}
                      </td>
                    ))}
                  </tr>
                ))}

                {summaryRow && (
                  <tr style={{ background: '#0F172A', color: '#FFFFFF', fontWeight: 800 }}>
                    {headers.map((h, colIdx) => (
                      <td
                        key={colIdx}
                        style={{
                          padding: '12px 14px',
                          border: '1px solid #1E293B',
                          whiteSpace: 'nowrap',
                          color: '#FFFFFF'
                        }}
                      >
                        {formatCellValue(h, summaryRow[h])}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Konfirmasi Hapus Program / Slide */}
      {showConfirmDelete && (
        <div
          onClick={() => !isDeleting && setShowConfirmDelete(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100005,
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '420px',
              background: '#FFFFFF',
              borderRadius: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              padding: '28px 24px',
              textAlign: 'center',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFE4E6 0%, #FECDD3 100%)',
                border: '1px solid #FDA4AF',
                color: '#E11D48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                boxShadow: '0 6px 16px rgba(225, 29, 72, 0.15)'
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>

            <h3 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', fontFamily: "'Outfit', sans-serif" }}>
              {deleteTargetType === 'SLIDE' ? 'Konfirmasi Hapus Slide' : 'Konfirmasi Hapus Program'}
            </h3>

            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 18px 0', fontWeight: 500 }}>
              {deleteTargetType === 'SLIDE' ? (
                <>
                  Apakah Anda yakin ingin menghapus <strong>Slide {currentSlideIndex + 1}</strong> dari program <strong>"{program.sheetName}"</strong>?
                </>
              ) : (
                <>
                  Apakah Anda yakin ingin menghapus seluruh program <strong>"{program.sheetName}"</strong> pada periode <strong>{monthLabel || 'Agustus 2026'}</strong>?
                </>
              )}
            </p>

            {deleteError && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '12px', fontWeight: 700, marginBottom: '16px' }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isDeleting ? 'not-allowed' : 'pointer'
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #E11D48 0%, #BE123C 100%)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(225, 29, 72, 0.35)'
                }}
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

