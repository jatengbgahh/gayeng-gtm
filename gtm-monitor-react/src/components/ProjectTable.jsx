import { useState, useMemo, memo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ACT_TYPES, actMeta, formatBranch } from '../utils';
import UploadModal from './UploadModal';
import ConfirmSubmitModal from './ConfirmSubmitModal';

const FilterIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
  </svg>
);

// ─── OPTIMASI 3: ON-DEMAND LOADING & MEMOIZED ODP ROW ───
const OdpRow = memo(({ o, odpGrid }) => {
  const occRate = o.total > 0 ? Math.round((o.used / o.total) * 100) : 0;
  const badgeBg = o.used === 0 ? '#e2e8f0' : occRate < 50 ? '#dcfce7' : occRate < 75 ? '#fef3c7' : '#fee2e2';
  const badgeColor = o.used === 0 ? '#334155' : occRate < 50 ? '#16a34a' : occRate < 75 ? '#d97706' : '#dc2626';

  return (
    <div
      className="table-row"
      style={{ gridTemplateColumns: odpGrid, backgroundColor: '#fafbfc', borderTop: '1px solid #f8fafc' }}
    >
      <div></div>
      <div style={{ fontSize: '13px', fontWeight: 600, paddingLeft: '14px' }}>{o.odp}</div>

      <div style={{
        fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
        display: 'inline-block',
        backgroundColor: badgeBg,
        color: badgeColor
      }}>
        {o.total > 0 ? `${occRate}%` : '-'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', height: '100%' }}>{o.used}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', height: '100%' }}>{o.avai}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', height: '100%' }}>{o.total}</div>
    </div>
  );
});

const ActivityTextInput = memo(({ a, actType, bName, p, updateActivityField }) => {
  const initialValue = a?.[actType.fieldKey] || a?.keterangan || a?.fields?.[actType.fieldKey] || a?.fields?.kodeSf || '';
  const [val, setVal] = useState(initialValue);

  useEffect(() => {
    setVal(initialValue);
  }, [initialValue]);

  const handleKeyDown = async (e) => {
    if (e.key === 'Enter' && updateActivityField) {
      e.preventDefault();
      if (!val || !val.trim()) {
        return;
      }
      await updateActivityField(bName, p.name, actType.key, actType.fieldKey, val);
    }
  };

  return (
    <>
      <input
        type="text"
        placeholder={actType.placeholder}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{ width: '120px', fontSize: '12px', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '5px' }}
        readOnly={!updateActivityField}
        title="Ketik kode (cth: SF 0973) lalu tekan Enter untuk mengirim"
      />
    </>
  );
});

// ─── CUSTOM DELETE CONFIRMATION MODAL (PORTAL TO BODY) ───
function DeleteConfirmModal({ projectName, onCancel, onConfirm }) {
  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0, left: 0, width: '100vw', height: '100vh',
      zIndex: 100000,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', boxSizing: 'border-box'
    }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: '420px',
        background: '#FFFFFF', borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        padding: '28px 24px', boxSizing: 'border-box',
        textAlign: 'center', animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Warning Icon Badge */}
        <div style={{
          width: '54px', height: '54px', borderRadius: '50%',
          background: '#FEF2F2', border: '1px solid #FECACA',
          color: '#DC2626', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 16px auto'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </div>

        <h3 style={{ fontSize: '19px', fontWeight: 800, color: '#0F172A', margin: '0 0 10px 0', fontFamily: "'Outfit', sans-serif" }}>
          Konfirmasi Hapus Foto
        </h3>

        <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 24px 0', fontWeight: 500 }}>
          Apakah Anda yakin ingin menghapus foto kegiatan untuk proyek <strong style={{ color: '#0F172A', wordBreak: 'break-word' }}>"{projectName}"</strong>?
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: '12px',
              border: '1px solid #E2E8F0', background: '#F8FAFC',
              color: '#475569', fontSize: '13.5px', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px', borderRadius: '12px',
              border: 'none', background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
              color: '#FFFFFF', fontSize: '13.5px', fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
              transition: 'all 0.2s'
            }}
          >
            Ya, Hapus Foto
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── PHOTO PREVIEW & DELETE MODAL COMPONENT (PORTAL TO BODY) ───
function PhotoPreviewModal({ photoData, onClose, onReplace, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  if (!photoData) return null;
  const { branchName, projectName, actType, photoUrl, status } = photoData;
  const isVerified = status === 'verified';

  // Construct absolute URL for display
  const displayUrl = photoUrl.startsWith('http')
    ? photoUrl
    : photoUrl.startsWith('/')
    ? photoUrl
    : '/' + photoUrl;

  return createPortal(
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: '520px',
          background: '#FFFFFF',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
          padding: '24px',
          boxSizing: 'border-box',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              width: '32px', height: '32px', borderRadius: '50%',
              border: 'none', background: '#F1F5F9', color: '#64748B',
              fontSize: '16px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ✕
          </button>

          {/* Header */}
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
              {projectName}
            </h3>
            <div style={{ fontSize: '12.5px', color: '#64748B' }}>
              Branch: {formatBranch(branchName)} · Tipe: {actType}
            </div>
          </div>

          {/* Image Preview Container */}
          <div style={{
            width: '100%', height: '280px', borderRadius: '16px',
            background: '#090A0F', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '20px', border: '1px solid #E2E8F0',
            position: 'relative'
          }}>
            <img
              src={displayUrl}
              alt="Preview Foto Kegiatan"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.parentElement) {
                  e.target.parentElement.innerHTML = '<div style="color:#ef4444;font-weight:700;font-size:13px;padding:20px;text-align:center">⚠️ File foto tidak ditemukan atau telah terhapus dari server.</div>';
                }
              }}
            />
            {/* Status Badge */}
            <div style={{
              position: 'absolute', top: '12px', left: '12px',
              padding: '5px 14px', borderRadius: '50px', fontSize: '11px', fontWeight: 800,
              background: isVerified ? '#10B981' : '#F59E0B', color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)', letterSpacing: '0.3px'
            }}>
              {isVerified ? 'Terverifikasi' : 'Menunggu Verifikasi'}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {/* Ganti Foto Button */}
            <label style={{
              padding: '10px 18px', borderRadius: '10px',
              background: '#F1F5F9', color: '#334155', border: '1px solid #CBD5E1',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '6px'
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Ganti Foto</span>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    onReplace(e.target.files[0]);
                    onClose();
                  }
                }}
              />
            </label>

            {/* Hapus Foto Button */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: '10px 18px', borderRadius: '10px',
                background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '6px'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Hapus Foto</span>
            </button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          projectName={projectName}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete();
            onClose();
          }}
        />
      )}
    </>,
    document.body
  );
}

// ─── OPTIMASI 2: REACT RENDER OPTIMIZATION (MEMOIZED PROJECT ROW) ───
const ProjectRow = memo(({ p, branchName, isExpanded, toggleProject, onReview, onOpenUploadModal, onPreviewPhoto, tableGrid, odpGrid }) => {
  const pOdps = p.odps || [];
  const usedTotal = p.usedTotal;
  const avaiTotal = p.avaiTotal;
  const totalPort = p.totalPort;
  const bName = p.branchName || branchName;
  const projectActivities = p.activities || [];

  return (
    <div>
      {/* PROJECT ROW — with activity status & upload button */}
      <div
        className="table-row"
        style={{ gridTemplateColumns: tableGrid }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
          onClick={() => toggleProject(p.name)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease'
            }}
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
        <div
          style={{ fontSize: '13.5px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
          onClick={() => toggleProject(p.name)}
        >
          {p.name}
        </div>
        <div
          style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
          onClick={() => toggleProject(p.name)}
        >
          {formatBranch(bName)} · {p.wok}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', height: '100%' }}>{usedTotal}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', height: '100%' }}>{avaiTotal}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', height: '100%' }}>{totalPort}</div>

        {/* Activity cells */}
        {ACT_TYPES.map(actType => {
          const a = projectActivities.find(x => x.type === actType.key);
          const status = a?.status || 'belum';
          const meta = actMeta(status);
          const photos = a?.photos || [];
          const verifiedPhotos = photos.filter(ph => ph.status === 'verified');
          const pendingPhotos = photos.filter(ph => ph.status === 'upload');
          const hasPending = status === 'upload' || pendingPhotos.length > 0;
          const isVerified = status === 'verified' || verifiedPhotos.length > 0;
          const verifiedCount = verifiedPhotos.length > 0 ? verifiedPhotos.length : (status === 'verified' ? 1 : 0);

          const badgeLabel = isVerified ? `Terverifikasi (${verifiedCount})` : meta.label;

          return (
            <div key={actType.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '6px 0', alignSelf: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', backgroundColor: meta.bg, color: meta.color, border: meta.border, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                {badgeLabel}
              </div>

              {/* Action Buttons / Status text */}
              {hasPending ? (
                <button
                  type="button"
                  onClick={() => onReview && onReview(bName, p.name)}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                    color: '#FFFFFF', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(217, 119, 6, 0.25)', display: 'flex', alignItems: 'center', gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                  title="Foto sedang menunggu verifikasi Admin. Klik untuk mengecek status & detail."
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>Cek Status</span>
                </button>
              ) : isVerified ? (
                <button
                  type="button"
                  onClick={() => onOpenUploadModal && onOpenUploadModal({ branchName: bName, projectName: p.name, actTypeObj: actType })}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#FFFFFF', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                  title="Klik untuk menambah foto kegiatan baru"
                >
                  <span>+ Tambah Foto</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenUploadModal && onOpenUploadModal({ branchName: bName, projectName: p.name, actTypeObj: actType })}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #FF5E00 0%, #C8102E 100%)',
                    color: '#FFFFFF', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(200, 16, 46, 0.25)', display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                  title="Klik untuk mengunggah kegiatan GTM"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Upload</span>
                </button>
              )}
            </div>
          );
        })}

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onReview && onReview(bName, p.name); }}
            style={{ background: 'none', border: 'none', fontSize: '12px', fontWeight: 700, color: '#C8102E', cursor: 'pointer' }}>
            Review
          </button>
        </div>
      </div>

      {/* ODP ROWS — On-demand loading: only rendered in DOM when isExpanded is true */}
      {isExpanded && pOdps.map((o) => (
        <OdpRow key={o.odp} o={o} odpGrid={odpGrid} />
      ))}
    </div>
  );
});

export default function ProjectTable({ projects, branchName, onReview, updateActivityField, uploadPhoto, verifyActivity, rejectActivity, deletePhoto }) {
  const [expanded, setExpanded] = useState({});
  const [previewPhotoData, setPreviewPhotoData] = useState(null);
  const [filterPopup, setFilterPopup] = useState(null);
  const [filters, setFilters] = useState({
    wok: { sort: null, search: '', unchecked: [] },
    usedTotal: { sort: null, search: '', unchecked: [] },
    avaiTotal: { sort: null, search: '', unchecked: [] },
    totalPort: { sort: null, search: '', unchecked: [] }
  });

  // ─── FILTER POPUP REF & CLICK OUTSIDE LISTENER ───
  const popupRef = useRef(null);

  useEffect(() => {
    if (!filterPopup) return;
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setFilterPopup(null);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [filterPopup]);

  // ─── OPTIMASI 1: PAGINATION STATE ───
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);

  // ─── UPLOAD MODAL STATE ───
  const [activeUploadData, setActiveUploadData] = useState(null);
  const [confirmSubmitData, setConfirmSubmitData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleProject = useCallback((projectName) => {
    setExpanded(prev => ({ ...prev, [projectName]: !prev[projectName] }));
  }, []);

  // ─── OPTIMASI 2: GUNAKAN NILAI PRE-COMPUTED DARI SERVER ───
  // usedTotal, avaiTotal, totalPort, occRate sudah dihitung di server.js — tidak perlu reduce() di sini.
  const projectsWithTotals = useMemo(() => {
    return (Array.isArray(projects) ? projects : []).map(p => {
      const odps = Array.isArray(p.odps) ? p.odps : [];
      return {
        ...p,
        wok: p.wok || '-',
        usedTotal: p.usedTotal ?? odps.reduce((s, o) => s + (o.used || 0), 0),
        avaiTotal: p.avaiTotal ?? odps.reduce((s, o) => s + (o.avai || 0), 0),
        totalPort: p.totalPort ?? odps.reduce((s, o) => s + (o.total || 0), 0),
      };
    });
  }, [projects]);

  const displayProjects = useMemo(() => {
    let list = [...projectsWithTotals];

    // Apply filtering
    ['wok', 'usedTotal', 'avaiTotal', 'totalPort'].forEach(col => {
      const f = filters[col];
      if (f && f.unchecked && f.unchecked.length > 0) {
        const uncheckedStr = f.unchecked.map(String);
        list = list.filter(p => !uncheckedStr.includes(String(p[col] ?? '-')));
      }
    });

    // Apply sorting
    const sortCol = ['wok', 'usedTotal', 'avaiTotal', 'totalPort'].find(col => filters[col]?.sort);
    if (sortCol) {
      const sortDir = filters[sortCol].sort;
      if (sortCol === 'wok') {
        list.sort((a, b) => {
          const valA = String(a.wok || '');
          const valB = String(b.wok || '');
          return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });
      } else {
        list.sort((a, b) => {
          const numA = Number(a[sortCol]) || 0;
          const numB = Number(b[sortCol]) || 0;
          return sortDir === 'asc' ? numA - numB : numB - numA;
        });
      }
    }

    return list;
  }, [projectsWithTotals, filters]);

  // Reset page ke 1 jika filter berubah atau daftar proyek berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [displayProjects.length, filters]);

  const totalPages = Math.ceil(displayProjects.length / pageSize) || 1;
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayProjects.slice(start, start + pageSize);
  }, [displayProjects, currentPage, pageSize]);

  const updateFilter = (col, key, val) => {
    setFilters(prev => {
      const newState = { ...prev };
      if (key === 'sort' && val !== null) {
        ['wok', 'usedTotal', 'avaiTotal', 'totalPort'].forEach(c => {
          if (c !== col) newState[c].sort = null;
        });
      }
      newState[col] = { ...newState[col], [key]: val };
      return newState;
    });
  };

  const renderFilterPopup = (col) => {
    if (filterPopup !== col) return null;

    const valueCounts = {};
    projectsWithTotals.forEach(p => {
      const v = p[col] ?? '-';
      valueCounts[v] = (valueCounts[v] || 0) + 1;
    });

    const isStringCol = col === 'wok';
    const allValues = isStringCol
      ? Object.keys(valueCounts).sort((a, b) => a.localeCompare(b))
      : Object.keys(valueCounts).map(Number).sort((a, b) => a - b);

    const searchLower = (filters[col].search || '').toLowerCase();
    const visibleValues = allValues.filter(v => v.toString().toLowerCase().includes(searchLower));
    const currentUncheckedStr = (filters[col].unchecked || []).map(String);

    return (
      <div
        ref={popupRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '6px',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          boxShadow: '0 10px 30px -5px rgba(0,0,0,0.22)',
          zIndex: 99999,
          width: '210px',
          padding: '12px',
          fontSize: '12px',
          color: '#334155',
          fontWeight: 500,
          textAlign: 'left',
          textTransform: 'none',
          letterSpacing: 'normal'
        }}
      >
        <div
          onClick={() => { updateFilter(col, 'sort', filters[col].sort === 'asc' ? null : 'asc'); setFilterPopup(null); }}
          style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: '6px', backgroundColor: filters[col].sort === 'asc' ? '#F1F5F9' : 'transparent', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: filters[col].sort === 'asc' ? '#C8102E' : '#334155' }}
        >
          <span style={{ fontSize: '14px' }}>↓</span> {isStringCol ? 'Sort A to Z' : 'Sort Kecil ke Besar'}
        </div>
        <div
          onClick={() => { updateFilter(col, 'sort', filters[col].sort === 'desc' ? null : 'desc'); setFilterPopup(null); }}
          style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: '6px', backgroundColor: filters[col].sort === 'desc' ? '#F1F5F9' : 'transparent', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: filters[col].sort === 'desc' ? '#C8102E' : '#334155' }}
        >
          <span style={{ fontSize: '14px' }}>↑</span> {isStringCol ? 'Sort Z to A' : 'Sort Besar ke Kecil'}
        </div>

        <div style={{ height: '1px', background: '#E2E8F0', margin: '8px 0' }} />

        <input
          type="text"
          placeholder={`Cari ${col === 'wok' ? 'WOK' : 'nilai'}...`}
          value={filters[col].search}
          onChange={e => updateFilter(col, 'search', e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 12px', border: '1px solid #CBD5E1', borderRadius: '50px', marginBottom: '8px', fontSize: '11.5px', outline: 'none' }}
        />

        <div style={{ maxHeight: '160px', overflowY: 'auto', paddingRight: '2px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 2px', cursor: 'pointer', fontWeight: 700, borderBottom: '1px solid #F1F5F9', marginBottom: '4px' }}>
            <input
              type="checkbox"
              checked={currentUncheckedStr.length === 0}
              onChange={(e) => {
                if (e.target.checked) updateFilter(col, 'unchecked', []);
                else updateFilter(col, 'unchecked', allValues.map(String));
              }}
            />
            (Pilih Semua)
          </label>
          {visibleValues.map(v => {
            const strVal = String(v);
            const isChecked = !currentUncheckedStr.includes(strVal);
            return (
              <label key={strVal} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 2px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ flexShrink: 0 }}
                  checked={isChecked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateFilter(col, 'unchecked', currentUncheckedStr.filter(x => x !== strVal));
                    } else {
                      updateFilter(col, 'unchecked', [...currentUncheckedStr, strVal]);
                    }
                  }}
                />
                <span style={{ lineHeight: '1.3', fontSize: '11.5px', color: '#0F172A' }}>
                  {strVal} <span style={{ color: '#94A3B8', fontSize: '10.5px', fontWeight: 600 }}>({valueCounts[v]})</span>
                </span>
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginTop: '10px', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
          <button
            type="button"
            onClick={() => {
              updateFilter(col, 'unchecked', []);
              updateFilter(col, 'search', '');
              updateFilter(col, 'sort', null);
            }}
            style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setFilterPopup(null)}
            style={{ padding: '4px 12px', border: 'none', borderRadius: '6px', background: '#0F172A', color: '#FFFFFF', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
          >
            Terapkan
          </button>
        </div>
      </div>
    );
  };

  const tableGrid = '34px 210px 130px 80px 80px 80px 160px 160px 160px 160px 160px 70px';
  const odpGrid = '34px 210px 130px 80px 80px 80px';

  return (
    <div className="card" style={{ position: 'relative', overflow: filterPopup ? 'visible' : 'hidden' }}>
      <div style={{ overflowX: 'auto', overflowY: filterPopup ? 'visible' : 'auto', maxHeight: '75vh' }}>
        <div style={{ minWidth: 'max-content', paddingBottom: filterPopup ? '400px' : '0' }}>
          {/* Header */}
          <div className="table-header" style={{ gridTemplateColumns: tableGrid }}>
            <div></div>
            <div>Nama Proyek</div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', paddingTop: '2px' }}>Branch / WOK</span>
              <div onClick={(e) => { e.stopPropagation(); setFilterPopup(filterPopup === 'wok' ? null : 'wok'); }} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: filters.wok.sort || filters.wok.unchecked.length > 0 ? '#C8102E' : '#94a3b8', padding: '2px' }}><FilterIcon /></div>
              {renderFilterPopup('wok')}
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', paddingTop: '2px' }}>Used</span>
              <div onClick={(e) => { e.stopPropagation(); setFilterPopup(filterPopup === 'usedTotal' ? null : 'usedTotal'); }} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: filters.usedTotal.sort || filters.usedTotal.unchecked.length > 0 ? '#C8102E' : '#94a3b8', padding: '2px' }}><FilterIcon /></div>
              {renderFilterPopup('usedTotal')}
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', paddingTop: '2px' }}>Available</span>
              <div onClick={(e) => { e.stopPropagation(); setFilterPopup(filterPopup === 'avaiTotal' ? null : 'avaiTotal'); }} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: filters.avaiTotal.sort || filters.avaiTotal.unchecked.length > 0 ? '#C8102E' : '#94a3b8', padding: '2px' }}><FilterIcon /></div>
              {renderFilterPopup('avaiTotal')}
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', paddingTop: '2px' }}>Total</span>
              <div onClick={(e) => { e.stopPropagation(); setFilterPopup(filterPopup === 'totalPort' ? null : 'totalPort'); }} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: filters.totalPort.sort || filters.totalPort.unchecked.length > 0 ? '#C8102E' : '#94a3b8', padding: '2px' }}><FilterIcon /></div>
              {renderFilterPopup('totalPort')}
            </div>
            {ACT_TYPES.map(t => (
              <div key={t.key} className="activity-col-header">{t.label}</div>
            ))}
            <div style={{ textAlign: 'center' }}>Detail</div>
          </div>

          {/* Rows */}
          {paginatedProjects.map((p) => (
            <ProjectRow
              key={p.name}
              p={p}
              branchName={branchName}
              isExpanded={Boolean(expanded[p.name])}
              toggleProject={toggleProject}
              onReview={onReview}
              onOpenUploadModal={setActiveUploadData}
              onPreviewPhoto={setPreviewPhotoData}
              tableGrid={tableGrid}
              odpGrid={odpGrid}
            />
          ))}

          {paginatedProjects.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px', borderBottom: '1px solid #f1f5f9' }}>
              Tidak ada data proyek yang cocok dengan filter.
            </div>
          )}
        </div>
      </div>

      {/* Photo Preview Modal */}
      {previewPhotoData && (
        <PhotoPreviewModal
          photoData={previewPhotoData}
          onClose={() => setPreviewPhotoData(null)}
          onReplace={(file) => {
            if (uploadPhoto) {
              uploadPhoto(previewPhotoData.branchName, previewPhotoData.projectName, previewPhotoData.actType, file);
            }
          }}
          onDelete={() => {
            if (deletePhoto) {
              deletePhoto(previewPhotoData.branchName, previewPhotoData.projectName, previewPhotoData.actType);
            }
          }}
        />
      )}

      {/* Upload Modal */}
      {activeUploadData && (
        <UploadModal
          data={activeUploadData}
          onClose={() => setActiveUploadData(null)}
          onSubmit={(payload) => {
            setConfirmSubmitData({
              ...activeUploadData,
              actLabel: activeUploadData.actTypeObj.label,
              payload
            });
          }}
        />
      )}

      {/* Confirm Submit Modal */}
      {confirmSubmitData && (
        <ConfirmSubmitModal
          data={confirmSubmitData}
          isSubmitting={isSubmitting}
          onCancel={() => setConfirmSubmitData(null)}
          onConfirm={async () => {
            setIsSubmitting(true);
            try {
              if (uploadPhoto) {
                await uploadPhoto(
                  confirmSubmitData.branchName,
                  confirmSubmitData.projectName,
                  confirmSubmitData.actTypeObj.key,
                  confirmSubmitData.payload
                );
              }
              setConfirmSubmitData(null);
              setActiveUploadData(null);
            } catch (err) {
              console.error('Submit error:', err);
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
      )}

      {/* Pagination Footer */}
      <div className="table-pagination-footer">
        <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
          Menampilkan <span style={{ color: '#0f172a', fontWeight: 700 }}>{displayProjects.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> - <span style={{ color: '#0f172a', fontWeight: 700 }}>{Math.min(currentPage * pageSize, displayProjects.length)}</span> dari <span style={{ color: '#0f172a', fontWeight: 700 }}>{displayProjects.length}</span> proyek
        </div>

        <div className="table-pagination-controls">
          {/* Custom Capsule Dropup for Page Size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
            <span>Per halaman:</span>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsPageSizeOpen(!isPageSizeOpen)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '50px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  fontWeight: 700,
                  color: '#0f172a'
                }}
              >
                <span>{pageSize} proyek</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isPageSizeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              {isPageSizeOpen && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: '6px',
                  width: '120px',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                  zIndex: 50,
                  overflow: 'hidden'
                }}>
                  {[15, 25, 50].map(size => (
                    <div
                      key={size}
                      className={`dropdown-item ${pageSize === size ? 'active' : ''}`}
                      onClick={() => { setPageSize(size); setCurrentPage(1); setIsPageSizeOpen(false); }}
                      style={{ padding: '8px 14px', fontSize: '13px' }}
                    >
                      {size} proyek
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Capsule Arrow Buttons for Prev / Next */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              title="Halaman Sebelumnya"
              style={{
                padding: '7px 14px',
                borderRadius: '50px',
                border: '1px solid #cbd5e1',
                background: currentPage === 1 ? '#f1f5f9' : '#fff',
                color: currentPage === 1 ? '#94a3b8' : '#0f172a',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>

            <span style={{ padding: '0 6px', fontSize: '13px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              title="Halaman Selanjutnya"
              style={{
                padding: '7px 14px',
                borderRadius: '50px',
                border: '1px solid #cbd5e1',
                background: currentPage === totalPages ? '#f1f5f9' : '#fff',
                color: currentPage === totalPages ? '#94a3b8' : '#0f172a',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
