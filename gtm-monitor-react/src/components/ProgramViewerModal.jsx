import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { API_BASE_URL } from '../apiConfig';

export default function ProgramViewerModal({ program, monthLabel, onClose, isAdmin, token, onDeleteSuccess }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);

  // Program Delete States
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Option Dropdown State (Titik Tiga)
  const [isOptionOpen, setIsOptionOpen] = useState(false);
  const optionMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (optionMenuRef.current && !optionMenuRef.current.contains(e.target)) {
        setIsOptionOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExecuteDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const targetProgramName = program.sheetName || program.name || '';
      const res = await fetch(`${API_BASE_URL}/api/admin/programs`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          monthLabel: monthLabel || 'Agustus 2026',
          programName: targetProgramName
        })
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
        throw new Error(data.error || data.message || 'Gagal menghapus program.');
      }

      if (onDeleteSuccess) {
        onDeleteSuccess();
      } else if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Delete program from modal error:', err);
      setDeleteError(err.message || 'Gagal menghapus program.');
      setIsDeleting(false);
    }
  };

  const containerRef = useRef(null);
  const tableRef = useRef(null);

  // Zoom handlers
  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.15, 0.5));
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

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
      if (program.imageUrl) {
        const res = await fetch(program.imageUrl);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const filename = `${(program.sheetName || 'Program').replace(/\s+/g, '_')}_${(monthLabel || '').replace(/\s+/g, '_')}.png`;
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!program) return null;

  const headers = program.headers || [];
  const rows = program.rows || [];
  const summaryRow = program.summaryRow;

  // Format cell value smartly
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
      {/* FLOATING THREE-DOT OPTION BUTTON (Pojok Kanan Atas) */}
      <div ref={optionMenuRef} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 100002 }}>
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
          {/* Vertical Three Dots Icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="19" r="1.5" fill="currentColor" />
          </svg>
        </button>

        {/* Option Dropdown Menu - EXACTLY 2 OPTIONS */}
        {isOptionOpen && (
          <div
            style={{
              position: 'absolute',
              top: '52px',
              right: '0',
              width: '210px',
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(16px)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              animation: 'fadeIn 0.15s ease-out'
            }}
          >
            {/* Opsi 1: Link Detail Program */}
            {program.detailUrl ? (
              <a
                href={program.detailUrl}
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
                <span>Link Detail Program</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsOptionOpen(false);
                  alert(`📌 Link detail resmi untuk program "${program.sheetName || program.name || 'ini'}" belum dikonfigurasi.`);
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
                <span>Link Detail Program</span>
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
              <span>{isDownloading ? 'Memproses...' : 'Download Gambar'}</span>
            </button>
          </div>
        )}
      </div>

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
        {program.imageUrl ? (
          <div
            ref={tableRef}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0, 0, 0.2, 1)',
              willChange: 'transform',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '98vw',
              maxHeight: '96vh'
            }}
          >
            <img
              src={program.imageUrl}
              alt={program.sheetName || 'Gambar Program'}
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

      {/* Modal Konfirmasi Hapus Program */}
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
              Konfirmasi Hapus Program
            </h3>

            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 18px 0', fontWeight: 500 }}>
              Apakah Anda yakin ingin menghapus program <strong>"{program.sheetName}"</strong> pada periode <strong>{monthLabel || 'Agustus 2026'}</strong>?
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
