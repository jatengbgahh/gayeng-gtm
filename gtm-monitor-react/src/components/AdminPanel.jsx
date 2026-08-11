import { useState, useMemo, memo, useCallback } from 'react';
import ProjectTable from './ProjectTable';
import ReviewModal from './ReviewModal';
import { formatBranch, computeStats, exportProjectsToExcel } from '../utils';
import { API_BASE_URL } from '../apiConfig';

const AdminPanel = memo(function AdminPanel({ token, branches = [], onUpdate, goDashboard, onLogout, verifyActivity, rejectActivity, updateActivityField, uploadPhoto, deletePhoto, kpi, onProgramUploaded }) {
  const [activeTab, setActiveTab] = useState('monitoring'); // 'monitoring' | 'excel'
  
  // Excel Upload & Export States (Monitoring ODP)
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Program Excel Upload States (Tracking Program Bulanan)
  const [programFile, setProgramFile] = useState(null);
  const [programMonthLabel, setProgramMonthLabel] = useState('Agustus 2026');
  const [programLoading, setProgramLoading] = useState(false);
  const [programMessage, setProgramMessage] = useState(null);
  const [programError, setProgramError] = useState(null);
  const [programResultSheets, setProgramResultSheets] = useState([]);

  const handleProgramUpload = async (e) => {
    e.preventDefault();
    if (!programFile) {
      setProgramError('Pilih file Excel tracking program terlebih dahulu.');
      return;
    }

    setProgramLoading(true);
    setProgramMessage(null);
    setProgramError(null);
    setProgramResultSheets([]);

    const formData = new FormData();
    formData.append('file', programFile);
    formData.append('monthLabel', programMonthLabel);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/upload-program-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses file Excel program.');
      }

      setProgramMessage(data.message || `Berhasil mengimpor Excel Program ${programMonthLabel}!`);
      if (data.sheets) {
        setProgramResultSheets(data.sheets);
      }
      setProgramFile(null);
      if (onProgramUploaded) {
        onProgramUploaded();
      }
    } catch (err) {
      console.error('Program Excel Upload Error:', err);
      setProgramError(err.message);
    } finally {
      setProgramLoading(false);
    }
  };

  // Export Rekap Excel (Opsi A: Client-side Export seluruh LOP)
  const handleExportRekapExcel = useCallback(async () => {
    const XLSX = await import('xlsx');
    const getActStatusLabel = (act, actTypeKey) => {
      if (!act || !act.status || act.status === 'belum') return 'Belum Dikerjakan';
      let label = act.status === 'verified' ? 'Terverifikasi' : 'Menunggu Verifikasi';
      if (actTypeKey === 'tsel_menyapa' && act.planDate) {
        const dStr = new Date(act.planDate).toISOString().split('T')[0];
        label += ` (Tgl: ${dStr})`;
      } else if (actTypeKey === 'rekrutmen_sf' && act.keterangan) {
        label += ` (${act.keterangan})`;
      }
      return label;
    };

    const getOverallProjectStatus = (acts) => {
      if (acts.some(a => a.status === 'upload')) return 'Menunggu Verifikasi';
      if (acts.some(a => a.status === 'verified')) return 'Terverifikasi';
      return 'Belum Dikerjakan';
    };

    const dataRows = [];

    (branches || []).forEach(b => {
      const bName = formatBranch(b.name);
      (b.projects || []).forEach(p => {
        const used = p.usedTotal ?? (p.odps || []).reduce((s, o) => s + (o.used || 0), 0);
        const avai = p.avaiTotal ?? (p.odps || []).reduce((s, o) => s + (o.avai || 0), 0);
        const total = p.totalPort ?? (p.odps || []).reduce((s, o) => s + (o.total || 0), 0);
        const occ = total > 0 ? (used / total * 100).toFixed(1) + '%' : '0%';

        const acts = p.activities || [];
        const tselAct = acts.find(a => a.type === 'tsel_menyapa');
        const brandingAct = acts.find(a => a.type === 'branding_outlet');
        const bumdesAct = acts.find(a => a.type === 'bumdes');
        const rekrutmenAct = acts.find(a => a.type === 'rekrutmen_sf');
        const openTableAct = acts.find(a => a.type === 'open_table');

        dataRows.push([
          bName,
          p.wok || '-',
          p.name,
          p.typeDesign || 'Greenfield',
          used,
          avai,
          total,
          occ,
          getActStatusLabel(tselAct, 'tsel_menyapa'),
          getActStatusLabel(brandingAct, 'branding_outlet'),
          getActStatusLabel(bumdesAct, 'bumdes'),
          getActStatusLabel(rekrutmenAct, 'rekrutmen_sf'),
          getActStatusLabel(openTableAct, 'open_table'),
          getOverallProjectStatus(acts)
        ]);
      });
    });

    const dateFormatted = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const titleRow1 = ['REKAPITULASI MONITORING AKTIVITAS GTM (GENERATING TRAFFIC & MOVEMENT)'];
    const titleRow2 = [`Tanggal Export: ${dateFormatted} | Total LOP / Proyek: ${dataRows.length}`];
    const emptyRow = [];
    const headerRow = [
      'Branch',
      'WOK',
      'Nama LOP / Proyek',
      'Type Design',
      'Used Port',
      'Avai Port',
      'Total Port',
      'Occupancy Rate (%)',
      'Tsel Menyapa Warga',
      'Branding Outlet',
      'BUMDES',
      'Rekrutmen SF',
      'Open Table',
      'Status LOP'
    ];

    const sheetData = [titleRow1, titleRow2, emptyRow, headerRow, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Merge judul di baris 1 dan 2 (A1:N1 dan A2:N2)
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } }
    ];

    // Style Title Rows A1 & A2
    if (worksheet['A1']) {
      worksheet['A1'].s = {
        font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "0F172A" } },
        alignment: { vertical: "center" }
      };
    }
    if (worksheet['A2']) {
      worksheet['A2'].s = {
        font: { name: "Calibri", sz: 11, italic: true, color: { rgb: "475569" } },
        alignment: { vertical: "center" }
      };
    }

    // Aktifkan AutoFilter bawaan Excel pada baris header (Baris ke-4: A4:N...)
    if (dataRows.length > 0) {
      worksheet['!autofilter'] = { ref: `A4:N${3 + dataRows.length}` };
    }

    // Styling background Telkomsel Red (#C8102E) & bold putih untuk baris header A4:N4
    const headerCols = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N'];
    headerCols.forEach(col => {
      const cellRef = `${col}4`;
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          fill: {
            patternType: "solid",
            fgColor: { rgb: "C8102E" } // Telkomsel Red (#C8102E)
          },
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: "FFFFFF" } // White text
          },
          alignment: {
            horizontal: "center",
            vertical: "center"
          },
          border: {
            top: { style: "thin", color: { rgb: "BFBFBF" } },
            bottom: { style: "thin", color: { rgb: "BFBFBF" } },
            left: { style: "thin", color: { rgb: "BFBFBF" } },
            right: { style: "thin", color: { rgb: "BFBFBF" } }
          }
        };
      }
    });

    const colWidths = [
      { wch: 16 }, // Branch
      { wch: 22 }, // WOK
      { wch: 32 }, // Nama LOP
      { wch: 14 }, // Type Design
      { wch: 10 }, // Used
      { wch: 10 }, // Avai
      { wch: 10 }, // Total
      { wch: 18 }, // OCC Rate
      { wch: 30 }, // Tsel Menyapa
      { wch: 22 }, // Branding
      { wch: 22 }, // BUMDES
      { wch: 30 }, // Rekrutmen SF
      { wch: 22 }, // Open Table
      { wch: 24 }  // Status LOP
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap LOP');

    const todayStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Rekap_GTM_Activity_${todayStr}.xlsx`);
  }, [branches]);

  // Data yang masuk ke Admin Panel persis sama dengan Halaman Upload Activity:
  // (Wajib: OCC < 35%, ODP > 1, DAN Type Design === Greenfield)
  const priorityBranches = useMemo(() => {
    return (branches || []).map(b => ({
      ...b,
      projects: (b.projects || []).filter(p => {
        const isPriority = p.isPriority ?? (p.odpCount > 1 && p.occRate < 35);
        const isGreenfield = (p.typeDesign || 'Greenfield') === 'Greenfield';
        return isPriority && isGreenfield;
      })
    })).filter(b => b.projects && b.projects.length > 0);
  }, [branches]);

  const totalProjects = useMemo(() => priorityBranches.reduce((s, b) => s + (b.projects?.length || 0), 0), [priorityBranches]);

  // Monitoring Filters States
  const [selectedBranch, setSelectedBranch] = useState('Semua Branch');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'need_review' | 'verified' | 'pending'
  const [modalKey, setModalKey] = useState(null); // format: branchName||projectName
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  // Filter Branches and Projects for Monitoring Tab
  const filteredBranches = useMemo(() => {
    if (selectedBranch === 'Semua Branch') return priorityBranches;
    return priorityBranches.filter(b => b.name === selectedBranch);
  }, [priorityBranches, selectedBranch]);

  // Dynamic KPI stats recalculated based on the selected branch filter
  const stats = useMemo(() => computeStats(filteredBranches), [filteredBranches]);
  const totalProjectsInFilter = useMemo(() => filteredBranches.reduce((s, b) => s + (b.projects?.length || 0), 0), [filteredBranches]);
  const totalBranchesInFilter = useMemo(() => selectedBranch === 'Semua Branch' ? priorityBranches.length : (filteredBranches.length > 0 ? 1 : 0), [priorityBranches, filteredBranches, selectedBranch]);

  // Hitung jumlah proyek per status filter (Semua, Menunggu Verifikasi, Sudah Terverifikasi, Belum Dikerjakan)
  const statusCounts = useMemo(() => {
    let needReviewCount = 0;
    let verifiedCount = 0;
    let pendingCount = 0;
    let totalCount = 0;

    filteredBranches.forEach(b => {
      (b.projects || []).forEach(p => {
        totalCount++;
        const acts = p.activities || [];
        if (acts.some(a => a.status === 'upload')) {
          needReviewCount++;
        } else if (acts.some(a => a.status === 'verified')) {
          verifiedCount++;
        } else if (acts.length === 0 || acts.every(a => a.status === 'belum')) {
          pendingCount++;
        }
      });
    });

    return {
      all: totalCount,
      need_review: needReviewCount,
      verified: verifiedCount,
      pending: pendingCount
    };
  }, [filteredBranches]);

  const branchesWithFilteredProjects = useMemo(() => {
    const s = search.toLowerCase();
    return filteredBranches.map(b => {
      let projs = (b.projects || []).filter(p => 
        !s || 
        p.name.toLowerCase().includes(s) || 
        (p.wok && p.wok.toLowerCase().includes(s)) ||
        (p.odps && p.odps.some(o => o.odp && o.odp.toLowerCase().includes(s)))
      );
      
      // Apply status filter
      if (statusFilter === 'need_review') {
        projs = projs.filter(p => p.activities?.some(a => a.status === 'upload'));
      } else if (statusFilter === 'verified') {
        projs = projs.filter(p => p.activities?.some(a => a.status === 'verified'));
      } else if (statusFilter === 'pending') {
        projs = projs.filter(p => !p.activities || p.activities.length === 0 || p.activities.every(a => a.status === 'belum'));
      }

      return { ...b, projects: projs };
    }).filter(b => b.projects.length > 0);
  }, [filteredBranches, search, statusFilter]);

  const allProjectsMultiBranch = useMemo(() => {
    return branchesWithFilteredProjects.flatMap(b => b.projects.map(p => ({ ...p, branchName: b.name })));
  }, [branchesWithFilteredProjects]);

  const openModal = (bName, pName) => setModalKey(`${bName}||${pName}`);
  const closeModal = () => setModalKey(null);

  let modalData = null;
  if (modalKey) {
    const [bName, pName] = modalKey.split('||');
    const b = branches.find(x => x.name === bName);
    const p = b?.projects?.find(x => x.name === pName);
    if (p) {
      const totalAvai = p.odps.reduce((s, o) => s + o.avai, 0);
      const totalUsed = p.odps.reduce((s, o) => s + o.used, 0);
      const totalPort = p.odps.reduce((s, o) => s + o.total, 0);

      modalData = {
        bName, pName, wok: p.wok,
        projectId: p.id,
        odps: p.odps,
        totalAvai, totalUsed, totalPort,
        odpCount: p.odps.length,
        activities: p.activities || []
      };
    }
  }

  // Excel Handlers
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage(null);
      setError(null);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Silakan pilih file Excel terlebih dahulu.');
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/import-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setMessage(result.message || 'Database berhasil diperbarui dengan data Excel baru!');
        setFile(null);
        if (onUpdate) onUpdate();
      } else if (response.status === 401) {
        setError(result.message || 'Sesi login Admin telah berakhir. Silakan login kembali.');
      } else {
        setError(result.message || result.error || 'Gagal mengunggah dan memperbarui database.');
      }
    } catch (err) {
      setError('Terjadi kesalahan koneksi ke server. Pastikan server backend sedang berjalan.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
      {/* ─── 1. HEADER TITLE (MATCHING MONITORING & ACTIVITY PAGE STYLE) ─── */}
      <div className="page-title-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '3px', color: '#FF5E00', fontWeight: 800, marginBottom: '4px' }}>
            PANEL KONTROL SISTEM
          </div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>
            Administrator Control Panel
          </h1>
        </div>
      </div>

      {/* ─── 2. KPI SUMMARY GRID (HARMONIZED STYLING) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Card 1: Total Branch / Proyek */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            Total Branch / Proyek
          </div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {priorityBranches.length} / {totalProjects}
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontWeight: 500 }}>Terkoneksi dalam sistem GTM</div>
        </div>

        {/* Card 2: Total ODP / Kapasitas */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            Total ODP / Kapasitas
          </div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {stats.odpCount} <span style={{ fontSize: '16px', color: '#64748B', fontWeight: 700 }}>ODP</span>
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontWeight: 500 }}>{stats.totalUsed} / {stats.totalPort} port ({stats.occRate}%)</div>
        </div>

        {/* Card 3: Menunggu Verifikasi */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Menunggu Verifikasi</span>
            {stats.actUploaded > 0 && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF5E00' }} />}
          </div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {stats.actUploaded} <span style={{ fontSize: '16px', color: '#64748B', fontWeight: 700 }}>Kegiatan</span>
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontWeight: 500 }}>Butuh tindakan review admin</div>
        </div>

        {/* Card 4: Progress Verifikasi GTM */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            Progress Verifikasi GTM
          </div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {stats.actCompletionPct}%
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontWeight: 500 }}>{stats.actVerified} dari {stats.totalActivitySlots} kegiatan terverifikasi</div>
        </div>
      </div>

      {/* ─── 3. NAVIGATION TABS (SEAMLESS PILL TOGGLES) ─── */}
      <div className="admin-tabs-container">
        <button
          className="admin-tab-btn"
          onClick={() => setActiveTab('monitoring')}
          style={{
            border: activeTab === 'monitoring' ? 'none' : '1px solid #E2E8F0',
            background: activeTab === 'monitoring' ? 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)' : '#FFFFFF',
            color: activeTab === 'monitoring' ? '#FFFFFF' : '#475569',
            boxShadow: activeTab === 'monitoring' ? '0 4px 16px rgba(200, 16, 46, 0.25)' : '0 2px 6px rgba(0, 0, 0, 0.02)'
          }}
        >
          <span>Monitoring & Verifikasi Proyek</span>
          {stats.actUploaded > 0 && (
            <span style={{ background: activeTab === 'monitoring' ? '#FFFFFF' : '#FF5E00', color: activeTab === 'monitoring' ? '#C8102E' : '#FFFFFF', padding: '2px 8px', borderRadius: '50px', fontSize: '11px', fontWeight: 900 }}>
              {stats.actUploaded}
            </span>
          )}
        </button>

        <button
          className="admin-tab-btn"
          onClick={() => setActiveTab('excel')}
          style={{
            border: activeTab === 'excel' ? 'none' : '1px solid #E2E8F0',
            background: activeTab === 'excel' ? 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)' : '#FFFFFF',
            color: activeTab === 'excel' ? '#FFFFFF' : '#475569',
            boxShadow: activeTab === 'excel' ? '0 4px 16px rgba(200, 16, 46, 0.25)' : '0 2px 6px rgba(0, 0, 0, 0.02)'
          }}
        >
          <span>Update Data Mingguan</span>
        </button>

        <button
          className="admin-tab-btn"
          onClick={() => setIsExportModalOpen(true)}
          style={{
            border: '1px solid #E2E8F0',
            background: '#FFFFFF',
            color: '#475569',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#FF5E00';
            e.currentTarget.style.color = '#C8102E';
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.color = '#475569';
            e.currentTarget.style.transform = 'translateY(0px)';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.02)';
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Export Rekap Excel</span>
        </button>
      </div>

      {/* ─── TAB 1: MONITORING & VERIFIKASI PROYEK ─── */}
      {activeTab === 'monitoring' && (
        <div className="fade-in">
          {/* Filter Bar */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '14px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', position: 'relative', zIndex: 80, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)' }}>
            {/* Branch Filter Capsule Dropdown */}
            <div style={{ position: 'relative' }}>
              <div 
                onClick={() => {
                  setIsBranchDropdownOpen(!isBranchDropdownOpen);
                  setIsStatusDropdownOpen(false);
                }}
                style={{ 
                  padding: '10px 20px', 
                  borderRadius: '50px', 
                  border: '1px solid #E2E8F0', 
                  fontSize: '13px', 
                  background: '#FFFFFF', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  cursor: 'pointer', 
                  minWidth: '210px', 
                  userSelect: 'none' 
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Branch:</span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', fontWeight: 800, color: '#0F172A' }}>
                  {selectedBranch === 'Semua Branch' 
                    ? `Semua Branch (${totalProjects})` 
                    : `${formatBranch(selectedBranch)} (${priorityBranches.find(x => x.name === selectedBranch)?.projects?.length || 0})`}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isBranchDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {isBranchDropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', width: '240px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.12)', zIndex: 1000, overflow: 'hidden' }}>
                  <div 
                    className={`dropdown-item ${selectedBranch === 'Semua Branch' ? 'active' : ''}`}
                    onClick={() => { setSelectedBranch('Semua Branch'); setIsBranchDropdownOpen(false); }}
                    style={{ padding: '12px 18px', fontSize: '13px', fontWeight: selectedBranch === 'Semua Branch' ? 800 : 600, color: selectedBranch === 'Semua Branch' ? '#C8102E' : '#334155', cursor: 'pointer' }}
                  >
                    Semua Branch ({totalProjects})
                  </div>
                  {priorityBranches.map(b => (
                    <div 
                      key={b.name}
                      className={`dropdown-item ${selectedBranch === b.name ? 'active' : ''}`}
                      onClick={() => { setSelectedBranch(b.name); setIsBranchDropdownOpen(false); }}
                      style={{ padding: '12px 18px', fontSize: '13px', fontWeight: selectedBranch === b.name ? 800 : 600, color: selectedBranch === b.name ? '#C8102E' : '#334155', cursor: 'pointer' }}
                    >
                      {formatBranch(b.name)} ({b.projects?.length || 0})
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status Filter Capsule Dropdown */}
            <div style={{ position: 'relative' }}>
              <div 
                onClick={() => {
                  setIsStatusDropdownOpen(!isStatusDropdownOpen);
                  setIsBranchDropdownOpen(false);
                }}
                style={{ 
                  padding: '10px 20px', 
                  borderRadius: '50px', 
                  border: '1px solid #E2E8F0', 
                  fontSize: '13px', 
                  background: '#FFFFFF', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  cursor: 'pointer', 
                  minWidth: '220px', 
                  userSelect: 'none' 
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Status:</span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', fontWeight: 800, color: '#0F172A' }}>
                  {statusFilter === 'all' 
                    ? `Semua Status (${statusCounts.all})` 
                    : statusFilter === 'need_review' 
                    ? `Menunggu Verifikasi (${statusCounts.need_review})` 
                    : statusFilter === 'verified' 
                    ? `Sudah Terverifikasi (${statusCounts.verified})` 
                    : `Belum Dikerjakan (${statusCounts.pending})`}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isStatusDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {isStatusDropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', width: '250px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.12)', zIndex: 1000, overflow: 'hidden' }}>
                  <div 
                    className={`dropdown-item ${statusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => { setStatusFilter('all'); setIsStatusDropdownOpen(false); }}
                    style={{ padding: '12px 18px', fontSize: '13px', fontWeight: statusFilter === 'all' ? 800 : 600, color: statusFilter === 'all' ? '#C8102E' : '#334155', cursor: 'pointer' }}
                  >
                    Semua Status ({statusCounts.all})
                  </div>
                  <div 
                    className={`dropdown-item ${statusFilter === 'need_review' ? 'active' : ''}`}
                    onClick={() => { setStatusFilter('need_review'); setIsStatusDropdownOpen(false); }}
                    style={{ padding: '12px 18px', fontSize: '13px', fontWeight: statusFilter === 'need_review' ? 800 : 600, color: statusFilter === 'need_review' ? '#C8102E' : '#334155', cursor: 'pointer' }}
                  >
                    Menunggu Verifikasi ({statusCounts.need_review})
                  </div>
                  <div 
                    className={`dropdown-item ${statusFilter === 'verified' ? 'active' : ''}`}
                    onClick={() => { setStatusFilter('verified'); setIsStatusDropdownOpen(false); }}
                    style={{ padding: '12px 18px', fontSize: '13px', fontWeight: statusFilter === 'verified' ? 800 : 600, color: statusFilter === 'verified' ? '#C8102E' : '#334155', cursor: 'pointer' }}
                  >
                    Sudah Terverifikasi ({statusCounts.verified})
                  </div>
                  <div 
                    className={`dropdown-item ${statusFilter === 'pending' ? 'active' : ''}`}
                    onClick={() => { setStatusFilter('pending'); setIsStatusDropdownOpen(false); }}
                    style={{ padding: '12px 18px', fontSize: '13px', fontWeight: statusFilter === 'pending' ? 800 : 600, color: statusFilter === 'pending' ? '#C8102E' : '#334155', cursor: 'pointer' }}
                  >
                    Belum Dikerjakan ({statusCounts.pending})
                  </div>
                </div>
              )}
            </div>

            {/* Search Input */}
            <div className="search-container-mobile" style={{ flex: 1, minWidth: '220px' }}>
              <input
                type="text"
                placeholder="Cari nama proyek, WOK, atau ODP..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 20px', borderRadius: '50px', border: '1px solid #E2E8F0', fontSize: '13px', background: '#FFFFFF', outline: 'none' }}
              />
            </div>
          </div>

          {/* Project Table */}
          {branchesWithFilteredProjects.length > 0 ? (
            selectedBranch === 'Semua Branch' ? (
              <div style={{ marginBottom: '32px' }}>
                <ProjectTable 
                  projects={allProjectsMultiBranch} 
                  branchName="Multi Branch" 
                  updateActivityField={updateActivityField}
                  uploadPhoto={uploadPhoto}
                  onReview={openModal}
                  verifyActivity={verifyActivity}
                  rejectActivity={rejectActivity}
                />
              </div>
            ) : (
              branchesWithFilteredProjects.map(b => (
                <div key={b.name} style={{ marginBottom: '32px' }}>
                  <ProjectTable 
                    projects={b.projects} 
                    branchName={b.name} 
                    updateActivityField={updateActivityField}
                    uploadPhoto={uploadPhoto}
                    onReview={openModal}
                    verifyActivity={verifyActivity}
                    rejectActivity={rejectActivity}
                  />
                </div>
              ))
            )
          ) : (
            <div style={{ padding: '60px 20px', textAlign: 'center', background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E2E8F0', color: '#64748B' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Tidak ada proyek yang sesuai filter</div>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>Coba ganti filter branch, status verifikasi, atau kata kunci pencarian Anda.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: UPDATE DATABASE MINGGUAN (EXCEL) ─── */}
      {activeTab === 'excel' && (
        <div className="fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', alignItems: 'stretch' }}>
            {/* Left Card: Upload File Excel Tracking Program Bulanan */}
            <div style={{ padding: '28px', background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E2E8F0', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                      Upload File Excel Tracking Program Bulanan
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748B' }}>
                      Pilih periode bulan dan unggah file Excel program (`.xlsx`). Sistem akan memindai sheet &amp; tautan detail secara otomatis.
                    </p>
                  </div>

                  {/* Month Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Periode Bulan:</label>
                    <select
                      value={programMonthLabel}
                      onChange={(e) => setProgramMonthLabel(e.target.value)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        background: '#F8FAFC',
                        color: '#0F172A',
                        fontSize: '13px',
                        fontWeight: 700,
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="Maret 2026">Maret 2026</option>
                      <option value="April 2026">April 2026</option>
                      <option value="Mei 2026">Mei 2026</option>
                      <option value="Juni 2026">Juni 2026</option>
                      <option value="Juli 2026">Juli 2026</option>
                      <option value="Agustus 2026">Agustus 2026</option>
                      <option value="September 2026">September 2026</option>
                      <option value="Oktober 2026">Oktober 2026</option>
                      <option value="November 2026">November 2026</option>
                      <option value="Desember 2026">Desember 2026</option>
                    </select>
                  </div>
                </div>

                <form onSubmit={handleProgramUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ position: 'relative' }}>
                    <label
                      htmlFor="program-excel-input"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '180px',
                        padding: '24px 20px',
                        border: programFile ? '2px solid #2563EB' : '2px dashed #CBD5E1',
                        borderRadius: '16px',
                        background: programFile ? '#EFF6FF' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                    >
                      {programFile ? (
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E40AF', marginBottom: '4px', wordBreak: 'break-all' }}>
                            📄 {programFile.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#3B82F6' }}>
                            {(programFile.size / 1024).toFixed(1)} KB • Siap diproses untuk periode {programMonthLabel}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Pilih File Excel Program</div>
                          <div style={{ fontSize: '12px', color: '#64748B' }}>Mendukung format .xlsx atau .xls (Setiap sheet = 1 opsi program)</div>
                        </div>
                      )}
                      <input
                        id="program-excel-input"
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setProgramFile(e.target.files[0]);
                            setProgramError(null);
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>

                  {programMessage && (
                    <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', fontSize: '13px', fontWeight: 700 }}>
                      ✓ {programMessage}
                    </div>
                  )}

                  {programError && (
                    <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '13px', fontWeight: 700 }}>
                      ⚠️ {programError}
                    </div>
                  )}

                  {programResultSheets.length > 0 && (
                    <div style={{ padding: '16px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                        Hasil Deteksi Sheet Program:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                        {programResultSheets.map((s, idx) => (
                          <div key={idx} style={{ padding: '8px 12px', borderRadius: '8px', background: '#FFFFFF', border: '1px solid #E2E8F0', fontSize: '12px' }}>
                            <div style={{ fontWeight: 800, color: '#C8102E' }}>📊 {s.sheetName}</div>
                            <div style={{ color: '#64748B', fontSize: '11px', marginTop: '2px' }}>
                              {s.rowsCount} Baris • Tautan: {s.detailUrl ? 'Ada 🔗' : 'Tidak Ada'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={programLoading || !programFile}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      background: programLoading || !programFile ? '#CBD5E1' : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '50px',
                      fontWeight: 800,
                      fontSize: '13px',
                      letterSpacing: '0.5px',
                      cursor: programLoading || !programFile ? 'not-allowed' : 'pointer',
                      transition: 'all 0.25s ease',
                      boxShadow: programLoading || !programFile ? 'none' : '0 4px 16px rgba(37, 99, 235, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {programLoading ? 'Sedang Menguraikan Sheet Program...' : 'Proses & Import Program Excel'}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Card: Upload File Excel Data ODP */}
            <div style={{ padding: '28px', background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E2E8F0', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', fontWeight: 900, color: '#0F172A', marginTop: 0, marginBottom: '16px' }}>
                  Upload File Excel Data ODP
                </h3>
                <p style={{ margin: '-8px 0 16px', fontSize: '12.5px', color: '#64748B' }}>
                  Unggah file Excel data ODP (`.xlsx`, `.csv`) untuk memperbarui kapasitas port ODP mingguan secara otomatis.
                </p>

                <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                  <div style={{ marginBottom: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label 
                      htmlFor="excel-upload-input"
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        flex: 1,
                        minHeight: '180px',
                        padding: '24px 20px', 
                        border: file ? '2px solid #059669' : '2px dashed #CBD5E1', 
                        borderRadius: '16px', 
                        background: file ? '#ECFDF5' : '#FFFFFF', 
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                    >
                      {file ? (
                        <div onClick={e => e.stopPropagation()}>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#065F46', wordBreak: 'break-all' }}>{file.name}</div>
                          <div style={{ fontSize: '12px', color: '#047857', marginTop: '4px' }}>{(file.size / 1024).toFixed(1)} KB · Siap diunggah</div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '14px' }}>
                            <label 
                              htmlFor="excel-upload-input"
                              style={{ 
                                fontSize: '12.5px', 
                                fontWeight: 800, 
                                color: '#059669', 
                                cursor: 'pointer',
                                textDecoration: 'underline'
                              }}
                            >
                              Ganti File
                            </label>

                            <span style={{ color: '#CBD5E1' }}>•</span>

                            <button
                              type="button"
                              onClick={() => {
                                setFile(null);
                                setMessage(null);
                                setError(null);
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#C8102E',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                padding: 0,
                                textDecoration: 'underline',
                                transition: 'color 0.15s'
                              }}
                            >
                              Hapus File
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Upload File ODP</div>
                          <div style={{ fontSize: '12px', color: '#64748B' }}>Mendukung format .xlsx, .xls, atau .csv</div>
                        </div>
                      )}
                      <input 
                        id="excel-upload-input"
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>

                  {message && (
                    <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
                      ✓ {message}
                    </div>
                  )}

                  {error && (
                    <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
                      ⚠️ {error}
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={loading || !file}
                    style={{ 
                      width: '100%', 
                      padding: '12px 24px', 
                      background: loading || !file ? '#CBD5E1' : 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)', 
                      color: '#FFFFFF', 
                      border: 'none', 
                      borderRadius: '50px', 
                      fontWeight: 800, 
                      fontSize: '13px', 
                      letterSpacing: '1px',
                      cursor: loading || !file ? 'not-allowed' : 'pointer',
                      transition: 'all 0.25s ease',
                      boxShadow: loading || !file ? 'none' : '0 4px 16px rgba(200, 16, 46, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {loading ? 'Sedang Membaca & Memperbarui Database...' : 'Mulai Update ODP'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      <ReviewModal modalData={modalData} closeModal={closeModal} verifyActivity={verifyActivity} rejectActivity={rejectActivity} deletePhoto={deletePhoto} />

      {/* Modal Konfirmasi Export Rekap Excel */}
      {isExportModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="fade-in" style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', width: '100%', maxWidth: '440px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>Konfirmasi Export Rekap</h3>
                <span style={{ fontSize: '12.5px', color: '#64748b' }}>Format File Excel (.xlsx)</span>
              </div>
            </div>

            <p style={{ fontSize: '13.5px', color: '#334155', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              Apakah Anda yakin ingin mengunduh rekapitulasi data LOP & status kegiatan dari seluruh branch ke dalam file Excel?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setIsExportModalOpen(false)}
                style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setIsExportModalOpen(false);
                  handleExportRekapExcel();
                }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)' }}
              >
                Unduh Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default AdminPanel;
