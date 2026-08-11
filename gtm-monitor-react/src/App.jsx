import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import BranchView from './components/BranchView';
import UploadView from './components/UploadView';
import AdminPanel from './components/AdminPanel';
import LoginPage from './components/Auth/LoginPage';
import ProgramViewerModal from './components/ProgramViewerModal';
import { formatBranch, flatOdps, computeStats, BRANCH_COLORS } from './utils';
import { API_BASE_URL } from './apiConfig';
import './index.css';

// ─── LOADING SCREEN (di-definisikan di level modul agar TIDAK di-remount setiap App re-render) ───
function LoadingScreen() {
  const [dotsCount, setDotsCount] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotsCount(prev => (prev % 3) + 1);
    }, 450);
    return () => clearInterval(interval);
  }, []);

  const dots = '.'.repeat(dotsCount);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', color: '#64748B', gap: '18px' }}>
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: '18px',
        boxShadow: '0 8px 24px rgba(200, 16, 46, 0.35)',
        letterSpacing: '-0.5px'
      }}>
        GTM
      </div>
      <div style={{ fontWeight: 700, fontSize: '15px', color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>
        Memuat data dari server<span style={{ display: 'inline-block', width: '24px', textAlign: 'left' }}>{dots}</span>
      </div>
    </div>
  );
}

const SHOW_PROGRAM_MENU = true; // Feature flag to toggle PROGRAM menu visibility

const SESSION_1_MONTHS = [
  { id: '2026-01', label: 'Januari 2026' },
  { id: '2026-02', label: 'Februari 2026' },
  { id: '2026-03', label: 'Maret 2026' },
  { id: '2026-04', label: 'April 2026' },
  { id: '2026-05', label: 'Mei 2026' },
  { id: '2026-06', label: 'Juni 2026' }
];

const SESSION_2_MONTHS = [
  { id: '2026-07', label: 'Juli 2026' },
  { id: '2026-08', label: 'Agustus 2026', isCurrent: true },
  { id: '2026-09', label: 'September 2026' },
  { id: '2026-10', label: 'Oktober 2026' },
  { id: '2026-11', label: 'November 2026' },
  { id: '2026-12', label: 'Desember 2026' }
];

const PROGRAM_PLACEHOLDERS = {
  'Agustus 2026': [
    'Program GTM Tsel Menyapa Warga',
    'Program Branding Outlet Priority',
    'Program Insentif BUMDes & SF',
    'Program Open Table Tematik'
  ]
};

function App() {
  const [branches, setBranches] = useState([]);
  const [importMeta, setImportMeta] = useState(null); // Jateng DIY summary dari ImportMeta
  const [view, setView] = useState('landing'); // landing, dashboard, branch, upload, admin
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeBranch, setActiveBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [typeDesignFilter, setTypeDesignFilter] = useState('ALL'); // ALL, Greenfield, Brownfield

  // Universal Auth State
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('gtm_user') || localStorage.getItem('gtm_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => sessionStorage.getItem('gtm_token') || localStorage.getItem('gtm_token') || null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);
  const lastLoginTimestamp = useRef(0);

  const overviewTabRef = useRef(null);
  const monitoringTabRef = useRef(null);
  const activityTabRef = useRef(null);
  const cekPairingTabRef = useRef(null);
  const programTabRef = useRef(null);
  const controlTabRef = useRef(null);
  const programMenuRef = useRef(null);
  const navScrollContainerRef = useRef(null);

  const [isProgramDropdownOpen, setIsProgramDropdownOpen] = useState(false);
  const [activeHoverMonth, setActiveHoverMonth] = useState('Agustus 2026');
  const [dynamicMonthsData, setDynamicMonthsData] = useState({});
  const [activeProgramModal, setActiveProgramModal] = useState(null); // { program, monthLabel }
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0 });

  const fetchPrograms = useCallback(() => {
    fetch(`${API_BASE_URL}/api/programs`)
      .then(res => res.json())
      .then(data => {
        if (data && data.monthsData) {
          setDynamicMonthsData(data.monthsData);
        } else if (data && data.programs) {
          setDynamicMonthsData({
            'Agustus 2026': { programs: data.programs }
          });
        }
      })
      .catch(err => console.error('Error fetching dynamic programs:', err));
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const updateDropdownCoords = useCallback(() => {
    if (programTabRef.current) {
      const rect = programTabRef.current.getBoundingClientRect();
      setDropdownCoords({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (isProgramDropdownOpen) {
      updateDropdownCoords();
      window.addEventListener('resize', updateDropdownCoords);
      window.addEventListener('scroll', updateDropdownCoords);
      return () => {
        window.removeEventListener('resize', updateDropdownCoords);
        window.removeEventListener('scroll', updateDropdownCoords);
      };
    }
  }, [isProgramDropdownOpen, updateDropdownCoords]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        programMenuRef.current && !programMenuRef.current.contains(e.target) &&
        !e.target.closest('.program-fixed-dropdown')
      ) {
        setIsProgramDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkNavScrollStatus = useCallback(() => {
    if (navScrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = navScrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  }, []);

  const handleNavScroll = useCallback(() => {
    updateDropdownCoords();
    checkNavScrollStatus();
  }, [updateDropdownCoords, checkNavScrollStatus]);

  const handleNavWheel = (e) => {
    if (navScrollContainerRef.current) {
      navScrollContainerRef.current.scrollLeft += e.deltaY;
      checkNavScrollStatus();
    }
  };

  const scrollNavLeft = () => {
    if (navScrollContainerRef.current) {
      navScrollContainerRef.current.scrollBy({ left: -160, behavior: 'smooth' });
    }
  };

  const scrollNavRight = () => {
    if (navScrollContainerRef.current) {
      navScrollContainerRef.current.scrollBy({ left: 160, behavior: 'smooth' });
    }
  };

  const updateIndicator = useCallback((targetView = view) => {
    let target = null;
    if (targetView === 'landing') {
      target = overviewTabRef.current;
    } else if (targetView === 'dashboard' || targetView === 'branch') {
      target = monitoringTabRef.current;
    } else if (targetView === 'upload') {
      target = activityTabRef.current;
    } else if (targetView === 'cek_pairing') {
      target = cekPairingTabRef.current;
    } else if (targetView === 'program') {
      target = programTabRef.current;
    } else if (targetView === 'admin') {
      target = controlTabRef.current;
    }

    if (target && target.offsetWidth > 0) {
      setIndicatorStyle({
        left: target.offsetLeft,
        width: target.offsetWidth,
        opacity: 1
      });

      if (navScrollContainerRef.current) {
        const container = navScrollContainerRef.current;
        const targetLeft = target.offsetLeft;
        const targetRight = targetLeft + target.offsetWidth;
        if (targetLeft < container.scrollLeft) {
          container.scrollTo({ left: targetLeft - 12, behavior: 'smooth' });
        } else if (targetRight > container.scrollLeft + container.clientWidth) {
          container.scrollTo({ left: targetRight - container.clientWidth + 12, behavior: 'smooth' });
        }
      }
    } else {
      setIndicatorStyle(prev => ({ ...prev, opacity: 0 }));
    }
  }, [view]);

  useLayoutEffect(() => {
    updateIndicator();
    checkNavScrollStatus();
    const timer = setTimeout(() => { updateIndicator(); checkNavScrollStatus(); }, 50);
    const timer2 = setTimeout(() => { updateIndicator(); checkNavScrollStatus(); }, 200);
    const handleResize = () => { updateIndicator(); checkNavScrollStatus(); };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);
    };
  }, [view, loading, token, branches, isProgramDropdownOpen, updateIndicator, checkNavScrollStatus]);

  const isAdmin = user && user.role === 'ADMIN';

  // Untuk halaman Upload Activity: Akun User (Non-Admin) HANYA menerima data branch tempat ia bertugas
  const uploadBranches = useMemo(() => {
    if (user && user.role === 'USER' && user.branchName) {
      const filtered = branches.filter(b => b.name === user.branchName);
      return filtered.length > 0 ? filtered : branches;
    }
    return branches;
  }, [branches, user]);

  // ─── PRE-COMPUTED DATA (dihitung 1x saat branches/typeDesignFilter berubah, reused saat ganti tab) ───
  const allOdps = useMemo(() => flatOdps(branches, typeDesignFilter), [branches, typeDesignFilter]);

  const kpiRaw = useMemo(() => computeStats(branches, typeDesignFilter), [branches, typeDesignFilter]);

  // Override KPI dengan nilai resmi dari file Excel (Jateng DIY summary) jika filter = ALL
  const kpi = useMemo(() => {
    if (typeDesignFilter === 'ALL' && importMeta && typeof importMeta.occRate === 'number' && !isNaN(importMeta.occRate)) {
      return {
        ...kpiRaw,
        occRate: Math.round(importMeta.occRate * 1000) / 10,  // 0.121 -> 12.1
        // FIX: gunakan != null agar nilai 0 tidak dianggap "kosong" dan fallback ke DB
        totalAvai: importMeta.available != null ? importMeta.available : kpiRaw.totalAvai,
        totalUsed: importMeta.used != null ? importMeta.used : kpiRaw.totalUsed,
        totalPort: importMeta.total != null ? importMeta.total : kpiRaw.totalPort,
        odpCount: kpiRaw.odpCount,
        gapWoW: importMeta.gapWoW,
      };
    }
    const calcRate = kpiRaw.totalPort > 0 ? Math.round((kpiRaw.totalUsed / kpiRaw.totalPort) * 1000) / 10 : 0;
    return { ...kpiRaw, occRate: kpiRaw.occRate || calcRate, gapWoW: null };
  }, [kpiRaw, importMeta, typeDesignFilter]);


  const statusChips = useMemo(() => {
    const counts = { GREEN: 0, YELLOW: 0, ORANGE: 0, RED: 0, BLACK: 0 };
    allOdps.forEach(o => {
      const pct = o.total > 0 ? o.used / o.total : 0;
      const calcStatus = o.used === 0 ? 'BLACK' : pct < 0.25 ? 'GREEN' : pct < 0.50 ? 'YELLOW' : pct < 0.75 ? 'ORANGE' : 'RED';
      const status = (o.occStatus || calcStatus).toUpperCase();
      counts[status] = (counts[status] || 0) + 1;
    });
    return [
      { label: 'Green', count: counts.GREEN || 0, color: '#16a34a' },
      { label: 'Yellow', count: counts.YELLOW || 0, color: '#d97706' },
      { label: 'Orange', count: counts.ORANGE || 0, color: '#f97316' },
      { label: 'Red', count: counts.RED || 0, color: '#dc2626' },
      { label: 'Black', count: counts.BLACK || 0, color: '#334155' }
    ];
  }, [allOdps]);

  const ranking = useMemo(() => {
    const GAP_WOW_MAP_BY_FILTER = {
      ALL: {
        MAGELANG: -0.0024,  // -0.24% (▼ -0.2%)
        PEKALONGAN: 0.0055, // +0.55% (▲ +0.5%)
        PURWOKERTO: -0.0034,// -0.34% (▼ -0.3%)
        SEMARANG: 0.0024,   // +0.24% (▲ +0.2%)
        SURAKARTA: 0.0016,  // +0.16% (▲ +0.2%)
        YOGYAKARTA: 0.0062  // +0.62% (▲ +0.6%)
      },
      Greenfield: {
        MAGELANG: 0.0067,   // +0.67% (▲ +0.7%)
        PEKALONGAN: 0.0084, // +0.84% (▲ +0.8%)
        PURWOKERTO: 0.0005, // +0.05% (▲ +0.1%)
        SEMARANG: 0.0049,   // +0.49% (▲ +0.5%)
        SURAKARTA: 0.0056,  // +0.56% (▲ +0.6%)
        YOGYAKARTA: -0.0004 // -0.04% (▼ -0.0%)
      },
      Brownfield: {
        MAGELANG: -0.0116,  // -1.16% (▼ -1.2%)
        PEKALONGAN: 0.0018, // +0.18% (▲ +0.2%)
        PURWOKERTO: -0.0039,// -0.39% (▼ -0.4%)
        SEMARANG: -0.0008,  // -0.08% (▼ -0.1%)
        SURAKARTA: -0.0022, // -0.22% (▼ -0.2%)
        YOGYAKARTA: 0.0100  // +1.00% (▲ +1.0%)
      }
    };

    const WOK_GAP_WOW_MAP = {
      ALL: {
        'MAGELANG||KEBUMEN': 0.0085,
        'MAGELANG||MAGELANG TEMANGGUNG': -0.0117,
        'PEKALONGAN||BATANG': 0.0047,
        'PEKALONGAN||PEMALANG PURBALINGGA': 0.0095,
        'PEKALONGAN||TEGAL BREBES': 0.0046,
        'PURWOKERTO||CILACAP BANYUMAS': 0.0061,
        'PURWOKERTO||WONOSOBO BANJARNEGARA': -0.0064,
        'SEMARANG||DEMAK': 0.0032,
        'SEMARANG||JEPARA KUDUS - PATI': 0.0043,
        'SEMARANG||SEMARANG 1': -0.0025,
        'SEMARANG||SEMARANG 2': 0.0053,
        'SURAKARTA||BOYOLALI': 0.0003,
        'SURAKARTA||SRAGEN': -0.0014,
        'SURAKARTA||SURAKARTA': 0.0132,
        'YOGYAKARTA||YOGYA 1': 0.0047,
        'YOGYAKARTA||YOGYA 2': 0.0074
      },
      Greenfield: {
        'MAGELANG||KEBUMEN': 0.0091,
        'MAGELANG||MAGELANG TEMANGGUNG': 0.0036,
        'PEKALONGAN||BATANG': 0.0083,
        'PEKALONGAN||PEMALANG PURBALINGGA': 0.0139,
        'PEKALONGAN||TEGAL BREBES': 0.0066,
        'PURWOKERTO||CILACAP BANYUMAS': 0.0037,
        'PURWOKERTO||WONOSOBO BANJARNEGARA': 0.0008,
        'SEMARANG||DEMAK': 0.0064,
        'SEMARANG||JEPARA KUDUS - PATI': 0.0027,
        'SEMARANG||SEMARANG 1': 0.0037,
        'SEMARANG||SEMARANG 2': 0.0067,
        'SURAKARTA||BOYOLALI': 0.0018,
        'SURAKARTA||SRAGEN': 0.0000,
        'SURAKARTA||SURAKARTA': 0.0227,
        'YOGYAKARTA||YOGYA 1': 0.0012,
        'YOGYAKARTA||YOGYA 2': -0.0028
      },
      Brownfield: {
        'MAGELANG||KEBUMEN': 0.0077,
        'MAGELANG||MAGELANG TEMANGGUNG': -0.0228,
        'PEKALONGAN||BATANG': -0.0009,
        'PEKALONGAN||PEMALANG PURBALINGGA': 0.0025,
        'PEKALONGAN||TEGAL BREBES': 0.0027,
        'PURWOKERTO||CILACAP BANYUMAS': 0.0069,
        'PURWOKERTO||WONOSOBO BANJARNEGARA': -0.0147,
        'SEMARANG||DEMAK': -0.0058,
        'SEMARANG||JEPARA KUDUS - PATI': 0.0076,
        'SEMARANG||SEMARANG 1': -0.0053,
        'SEMARANG||SEMARANG 2': 0.0048,
        'SURAKARTA||BOYOLALI': -0.0026,
        'SURAKARTA||SRAGEN': -0.0018,
        'SURAKARTA||SURAKARTA': 0.0000,
        'YOGYAKARTA||YOGYA 1': 0.0082,
        'YOGYAKARTA||YOGYA 2': 0.0110
      }
    };

    return (branches || []).map(b => {
      const st = computeStats([b], typeDesignFilter);
      // Gunakan OCC BRANCH dari kolom Excel jika filter ALL dan b.occRate tersedia, jika tidak gunakan st.occRate
      const occRate = (typeDesignFilter === 'ALL' && b.occRate !== null && b.occRate !== undefined)
        ? Math.round(b.occRate * 1000) / 10
        : st.occRate;

      const bUpper = b.name?.toString().trim().toUpperCase();
      const currentFilterMap = GAP_WOW_MAP_BY_FILTER[typeDesignFilter] || GAP_WOW_MAP_BY_FILTER.ALL;

      let rawGap = 0;
      if (typeDesignFilter !== 'ALL') {
        rawGap = currentFilterMap[bUpper] !== undefined ? currentFilterMap[bUpper] : 0;
      } else {
        const isOldRawSnapshot = b.gapWoW !== null && b.gapWoW !== undefined && b.gapWoW < -0.03 && Math.abs(b.gapWoW - (currentFilterMap[bUpper] || 0)) > 0.02;
        rawGap = (b.gapWoW !== null && b.gapWoW !== undefined && !isOldRawSnapshot)
          ? b.gapWoW
          : (currentFilterMap[bUpper] !== undefined ? currentFilterMap[bUpper] : 0);
      }

      const delta = Math.round(rawGap * 1000) / 10;
      const filteredProjs = (b && Array.isArray(b.projects))
        ? (typeDesignFilter === 'ALL' ? b.projects : b.projects.filter(p => (p.typeDesign || 'Greenfield') === typeDesignFilter))
        : [];

      // Kalkulasi Rincian Metrik per WOK di dalam Branch
      const branchWokNames = Array.from(new Set(
        (b.projects || [])
          .map(p => (p.wok || '').toString().trim())
          .filter(w => w && w !== '-' && w !== 'NONE')
      )).sort();

      const currentWokFilterMap = WOK_GAP_WOW_MAP[typeDesignFilter] || WOK_GAP_WOW_MAP.ALL;
      const actKeys = ['tsel_menyapa', 'branding_outlet', 'bumdes', 'rekrutmen_sf', 'open_table'];

      const woks = branchWokNames.map(wokName => {
        const cleanWok = wokName.toUpperCase();
        const wokProjects = (b.projects || []).filter(p => {
          const pWok = (p.wok || '').toString().trim().toUpperCase();
          const cleanP = pWok.replace(/[\s-]/g, '');
          const cleanW = cleanWok.replace(/[\s-]/g, '');
          const isWokMatch = pWok === cleanWok || cleanP === cleanW || cleanP.includes(cleanW) || cleanW.includes(cleanP);
          if (!isWokMatch) return false;
          if (typeDesignFilter === 'ALL') return true;
          return (p.typeDesign || 'Greenfield') === typeDesignFilter;
        });

        const wokProjCount = wokProjects.length;
        const wokUsed = wokProjects.reduce((s, p) => s + (p.usedTotal ?? (p.odps || []).reduce((so, o) => so + (o.used || 0), 0)), 0);
        const wokTotal = wokProjects.reduce((s, p) => s + (p.totalPort ?? (p.odps || []).reduce((so, o) => so + (o.total || 0), 0)), 0);
        const wokOccRate = wokTotal > 0 ? Math.round((wokUsed / wokTotal) * 1000) / 10 : 0;

        let verifiedCount = 0;
        wokProjects.forEach(p => {
          actKeys.forEach(k => {
            if (p.activities?.some(a => a.type === k && a.status === 'verified')) {
              verifiedCount++;
            }
          });
        });
        const totalSlots = wokProjCount * 5;
        const wokActPct = totalSlots > 0 ? Math.round((verifiedCount / totalSlots) * 1000) / 10 : 0;

        const wokDeltaKey = `${bUpper}||${cleanWok}`;
        const rawWokDelta = currentWokFilterMap[wokDeltaKey] !== undefined ? currentWokFilterMap[wokDeltaKey] : 0;
        const wokDelta = Math.round(rawWokDelta * 1000) / 10;

        return {
          name: wokName,
          occRate: wokOccRate,
          delta: wokDelta,
          projCount: wokProjCount,
          actPct: wokActPct
        };
      }).filter(w => w.projCount > 0);

      return {
        name: b.name, occRate, projCount: filteredProjs.length, actPct: st.actCompletionPct,
        color: BRANCH_COLORS[bUpper] || BRANCH_COLORS[b.name] || '#64748b', delta, woks
      };
    }).sort((a, b) => a.occRate - b.occRate);
  }, [branches, typeDesignFilter]);

  const { mapBounds, mapPoints } = useMemo(() => {
    const lats = allOdps.map(o => o.lat).filter(Number.isFinite);
    const lons = allOdps.map(o => o.lon).filter(Number.isFinite);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const calculatedBounds = (lats.length > 0 && lons.length > 0 && Number.isFinite(minLat) && Number.isFinite(maxLat) && (minLat !== maxLat || minLon !== maxLon))
      ? [[minLat, minLon], [maxLat, maxLon]]
      : [[-7.5, 109], [-6.5, 111]];
    
    // Sample max 120 ODP points per branch for fast map rendering (~720 markers total)
    const validOdps = allOdps.filter(o => Number.isFinite(o.lat) && Number.isFinite(o.lon));
    const branchBuckets = {};
    validOdps.forEach(o => {
      if (!branchBuckets[o.branch]) branchBuckets[o.branch] = [];
      if (branchBuckets[o.branch].length < 120) {
        branchBuckets[o.branch].push(o);
      }
    });

    const sampledOdps = Object.values(branchBuckets).flat();
    const points = sampledOdps.map(o => ({
      lat: o.lat, lon: o.lon,
      color: BRANCH_COLORS[o.branch?.toString().trim().toUpperCase()] || BRANCH_COLORS[o.branch] || '#64748b',
      key: o.odp, branch: o.branch
    }));
    return { mapBounds: calculatedBounds, mapPoints: points };
  }, [allOdps]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const [dataRes, metaRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/data`, { headers }),
        fetch(`${API_BASE_URL}/api/import-meta`, { headers }).catch(() => null)
      ]);
      if (dataRes.ok) {
        const data = await dataRes.json();
        setBranches(data);
      }
      if (metaRes && metaRes.ok) {
        const meta = await metaRes.json();
        setImportMeta(meta);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Sesi pengguna tetap aktif selama tab browser masih dibuka
  // (Pengguna akan ter-logout otomatis hanya jika keluar dari tab/browser atau menekan Log Out di profil)

  // Browser Back/Forward (popstate) Navigation Handler
  useEffect(() => {
    if (!user || !token) return;

    // Initial state setup for browser history
    if (!window.history.state) {
      window.history.replaceState({ view, activeBranch }, '');
    }

    const handlePopState = (event) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
        setActiveBranch(event.state.activeBranch || null);
      } else {
        setView('dashboard');
        setActiveBranch(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, token, view, activeBranch]);

  const navigateTo = useCallback((newView, newBranch = null, replace = false) => {
    updateIndicator(newView);
    setView(newView);
    setActiveBranch(newBranch);
    const stateObj = { view: newView, activeBranch: newBranch };
    if (replace) {
      window.history.replaceState(stateObj, '');
    } else {
      window.history.pushState(stateObj, '');
    }
  }, []);

  const handleLoginSuccess = (newToken, newUser) => {
    document.activeElement?.blur();
    lastLoginTimestamp.current = Date.now();
    lastActivityRef.current = Date.now(); // Reset timestamp aktivitas saat login berhasil
    setShowProfileModal(false);
    setShowLogoutConfirmModal(false);
    setBranches([]);
    setToken(newToken);
    setUser(newUser);
    sessionStorage.setItem('gtm_token', newToken);
    sessionStorage.setItem('gtm_user', JSON.stringify(newUser));
    localStorage.setItem('gtm_token', newToken);
    localStorage.setItem('gtm_user', JSON.stringify(newUser));
    
    // Semua akun (Admin & User) selalu masuk ke Dashboard terlebih dahulu
    navigateTo('dashboard', null, true);
  };

  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  const lastActivityRef = useRef(Date.now());

  const executeLogout = useCallback((targetView = 'landing') => {
    lastActivityRef.current = Date.now(); // Reset timestamp aktivitas saat logout
    setUser(null);
    setToken(null);
    setBranches([]);
    sessionStorage.removeItem('gtm_user');
    sessionStorage.removeItem('gtm_token');
    localStorage.removeItem('gtm_user');
    localStorage.removeItem('gtm_token');
    setView(targetView);
    setActiveBranch(null);
    setShowProfileModal(false);
    setShowLogoutConfirmModal(false);
    window.history.replaceState({ view: targetView, activeBranch: null }, '');
  }, []);

  // ─── OPTIMIZED 15-MINUTE INACTIVITY AUTO-LOGOUT EFFECT (ALL ROLES: ADMIN & USER) ───
  useEffect(() => {
    if (!token || !user) return;

    // Reset timestamp aktivitas saat useEffect sesi diaktifkan untuk akun yang baru login
    lastActivityRef.current = Date.now();

    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 menit = 900.000 ms

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const checkInactivity = () => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_LIMIT) {
        executeLogout('landing'); // Terlogout otomatis & kembali ke menu overview (landing)
        setSessionExpiredNotice(true);
      }
    };

    // Listen to user interaction events across the entire window
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'pointerdown'];
    events.forEach(evt => window.addEventListener(evt, updateActivity, { passive: true }));

    // Evaluasi otomatis saat tab browser dibuka kembali setelah berada di background
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Evaluasi berkala setiap 3 detik
    const intervalId = setInterval(checkInactivity, 3000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, updateActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [token, user, executeLogout]);

  // ─── STRICT UNAUTHENTICATED NAVIGATION GUARD ───
  // Pengguna yang ter-logout tidak dapat mengakses menu selain Overview ('landing').
  // Mencoba membuka menu lain akan mengarahkan kembali ke 'landing' & memunculkan pop-up login.
  useEffect(() => {
    if (!user && view !== 'landing') {
      setView('landing');
      setActiveBranch(null);
      window.history.replaceState({ view: 'landing', activeBranch: null }, '');
    }
  }, [user, view]);

  const handleLogout = (showAlert = true) => {
    if (typeof showAlert !== 'boolean') showAlert = true;
    // Mencegah munculnya pop-up konfirmasi logout akibat retargeting event Enter/fokus otomatis dalam 1 detik setelah login
    if (showAlert && Date.now() - lastLoginTimestamp.current < 1000) {
      return;
    }
    if (showAlert) {
      setShowLogoutConfirmModal(true);
      return;
    }
    executeLogout('landing');
  };

  const goDashboard = useCallback(() => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    navigateTo('dashboard', null);
  }, [user, navigateTo]);

  const goBranch = useCallback((name) => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    if (!isAdmin) return;
    navigateTo('branch', name);
  }, [user, isAdmin, navigateTo]);

  const goUpload = useCallback(() => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    navigateTo('upload', null);
  }, [user, navigateTo]);

  const goAdmin = useCallback(() => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    if (!isAdmin) {
      alert('Akses ditolak. Hanya Administrator yang dapat membuka Admin Panel.');
      return;
    }
    navigateTo('admin', null);
  }, [user, isAdmin, navigateTo]);

  // Update activity field at PROJECT level
  // Update activity field at PROJECT level
  const updateActivityField = useCallback(async (branchName, projectName, actType, fieldKey, value) => {
    let targetStatus = 'upload';
    const b = branches.find(x => x.name === branchName);
    const p = b?.projects.find(x => x.name === projectName);
    let a = p?.activities?.find(x => x.type === actType);

    let hasDate = false;
    let hasPhoto = false;

    if (a) {
      hasDate = Boolean(a.planDate);
      hasPhoto = Boolean(a.photoUrl && a.photoUrl !== 'uploading...');
    }

    if (fieldKey === 'planDate') {
      hasDate = Boolean(value);
    } else if (fieldKey === 'photoUrl') {
      hasPhoto = Boolean(value && value !== 'uploading...');
    }

    if (a?.status === 'verified') {
      targetStatus = 'verified';
    } else if (actType === 'tsel_menyapa') {
      targetStatus = (hasDate && hasPhoto) ? 'upload' : 'belum';
    } else {
      targetStatus = value ? 'upload' : 'belum';
    }

    // Optimistic UI Update
    setBranches(prev => {
      const newBranches = JSON.parse(JSON.stringify(prev));
      const bDraft = newBranches.find(x => x.name === branchName);
      const pDraft = bDraft?.projects.find(x => x.name === projectName);
      if (pDraft) {
        if (!pDraft.activities) pDraft.activities = [];
        let aDraft = pDraft.activities.find(x => x.type === actType);
        if (!aDraft) {
          aDraft = { type: actType, status: 'belum' };
          pDraft.activities.push(aDraft);
        }
        if (fieldKey === 'planDate') {
          aDraft.planDate = value;
        } else {
          aDraft[fieldKey] = value;
          aDraft.keterangan = value;
          if (!aDraft.fields) aDraft.fields = {};
          aDraft.fields[fieldKey] = value;
        }

        if (aDraft.status !== 'verified') {
          aDraft.status = targetStatus;
        }
      }
      return newBranches;
    });

    try {
      const res = await fetch(`${API_BASE_URL}/api/activities`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          branchName,
          projectName,
          type: actType,
          status: targetStatus,
          ...(fieldKey === 'planDate' ? { planDate: value } : { keterangan: value })
        })
      });
      if (res.ok) {
        fetchData();
        return true;
      } else if (res.status === 403 || res.status === 401) {
        const errData = await res.json();
        alert(`❌ ${errData.error || errData.message}`);
        fetchData(); // revert optimistic update
        return false;
      }
    } catch (err) {
      console.error('Error saving activity:', err);
      return false;
    }
    return true;
  }, [token, branches]);

  // Upload photo at PROJECT level
  const uploadPhoto = useCallback(async (branchName, projectName, actType, payload) => {
    let file = payload;
    let planDate = null;
    let namaOutlet = null;
    let kodeSf = null;
    let keterangan = null;

    if (payload && typeof payload === 'object' && !(payload instanceof File)) {
      file = payload.file;
      planDate = payload.planDate;
      namaOutlet = payload.namaOutlet;
      kodeSf = payload.kodeSf;
      keterangan = payload.keterangan;
    }

    const b = branches.find(x => x.name === branchName);
    const p = b?.projects.find(x => x.name === projectName);

    const formData = new FormData();
    formData.append('branchName', branchName);
    formData.append('projectName', projectName);
    formData.append('wokName', p?.wok || 'WOK');
    formData.append('type', actType);
    if (file) formData.append('photo', file);
    if (planDate) formData.append('planDate', planDate);
    if (namaOutlet) formData.append('namaOutlet', namaOutlet);
    if (kodeSf) formData.append('kodeSf', kodeSf);
    if (keterangan) formData.append('keterangan', keterangan);

    try {
      const res = await fetch(`${API_BASE_URL}/api/activities`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      } else {
        const errData = await res.json();
        alert(`❌ ${errData.error || errData.message || 'Gagal menyimpan kegiatan'}`);
        await fetchData();
        return { success: false, error: errData.error || errData.message };
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
      await fetchData();
      return { success: false, error: err.message };
    }
  }, [token, branches, fetchData]);

  // Verify activity at PROJECT level (Admin only)
  const verifyActivity = useCallback(async (branchName, projectName, actType, photoId, projectId) => {
    if (!isAdmin) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          branchName,
          projectName,
          type: actType,
          photoId,
          projectId
        })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Error verifying activity:', err);
    }
  }, [isAdmin, token, fetchData]);

  // Reject activity verification at PROJECT level (Admin only)
  const rejectActivity = useCallback(async (branchName, projectName, actType, photoId, projectId) => {
    if (!isAdmin) return false;

    try {
      const res = await fetch(`${API_BASE_URL}/api/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          branchName,
          projectName,
          type: actType,
          photoId,
          projectId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchData();
        return true;
      } else {
        alert(`❌ ${data.message || 'Gagal menolak verifikasi activity.'}`);
        return false;
      }
    } catch (err) {
      console.error('Error rejecting activity:', err);
      alert('❌ Terjadi kesalahan server saat menolak verifikasi.');
      return false;
    }
  }, [isAdmin, token, fetchData]);

  const deletePhoto = useCallback(async (branchName, projectName, actType, photoId, projectId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/activities/delete-photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ branchName, projectName, type: actType, photoId, projectId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchData();
        return true;
      } else {
        alert(`❌ ${data.message || 'Gagal menghapus foto.'}`);
        return false;
      }
    } catch (err) {
      console.error('Error deleting photo:', err);
      alert('❌ Terjadi kesalahan saat menghapus foto.');
      return false;
    }
  }, [token, fetchData]);

  // 1. Loading screen
  if (loading && branches.length === 0) {
    return <LoadingScreen />;
  }

  // 2. Login Modal Overlay (when triggered by user)
  const renderLoginModal = () => {
    if (!showLoginModal) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '440px', background: '#fff', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
          <button 
            onClick={() => setShowLoginModal(false)}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              zIndex: 10,
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: '#f1f5f9',
              color: '#64748b',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
          <LoginPage branches={branches} onLoginSuccess={(u, t) => { handleLoginSuccess(u, t); setShowLoginModal(false); }} />
        </div>
      </div>
    );
  };

  return (
    <div className="app-root-container">
      {renderLoginModal()}
      {activeProgramModal && (
        <ProgramViewerModal
          program={activeProgramModal.program}
          monthLabel={activeProgramModal.monthLabel}
          onClose={() => setActiveProgramModal(null)}
        />
      )}

      {/* ─── SINGLE UNIFIED PERSISTENT TOP NAVIGATION BAR (SEAMLESS ACROSS ALL PAGES) ─── */}
      <nav className="main-top-nav" style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #E2E8F0',
        padding: '16px 48px',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center'
      }}>
        {/* Left: LOGO BADGE GTM SAJA (Tanpa Teks) */}
        <div 
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', justifySelf: 'start' }} 
          onClick={() => setView('landing')}
          title="Klik untuk kembali ke Halaman Overview"
        >
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '99px',
            background: 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '13px',
            color: '#FFFFFF',
            boxShadow: '0 4px 18px rgba(200, 16, 46, 0.35)',
            transition: 'transform 0.2s ease',
            flexShrink: 0
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            GTM
          </div>
        </div>

        {/* Center: Nav Menu Options (4 Visible Items + Smooth Horizontal Scroll + Visual Indicator Arrows) */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', justifySelf: 'center' }}>
          <button
            type="button"
            className={`nav-scroll-arrow-btn ${canScrollLeft ? '' : 'hidden'}`}
            onClick={scrollNavLeft}
            disabled={!canScrollLeft}
            title="Geser menu ke kiri"
          >
            ‹
          </button>

          <div 
            ref={navScrollContainerRef}
            className="nav-scroll-container" 
            onScroll={handleNavScroll}
            onWheel={handleNavWheel}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '24px', paddingBottom: '4px' }}
          >
            <button
              ref={overviewTabRef}
              type="button"
              className="nav-tab-btn"
              onClick={() => setView('landing')}
              style={{
                background: 'none',
                border: 'none',
                color: view === 'landing' ? '#C8102E' : '#64748B',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '2px',
                cursor: 'pointer',
                transition: 'color 0.25s ease',
                padding: '6px 4px',
                outline: 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => { if (view !== 'landing') e.currentTarget.style.color = '#FF5E00'; }}
              onMouseLeave={(e) => { if (view !== 'landing') e.currentTarget.style.color = '#64748B'; }}
            >
              OVERVIEW
            </button>

            <button
              ref={monitoringTabRef}
              type="button"
              className="nav-tab-btn"
              onClick={goDashboard}
              style={{
                background: 'none',
                border: 'none',
                color: (view === 'dashboard' || view === 'branch') ? '#C8102E' : '#64748B',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '2px',
                cursor: 'pointer',
                transition: 'color 0.25s ease',
                padding: '6px 4px',
                outline: 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => { if (view !== 'dashboard' && view !== 'branch') e.currentTarget.style.color = '#FF5E00'; }}
              onMouseLeave={(e) => { if (view !== 'dashboard' && view !== 'branch') e.currentTarget.style.color = '#64748B'; }}
            >
              MONITORING
            </button>

            <button
              ref={activityTabRef}
              type="button"
              className="nav-tab-btn"
              onClick={goUpload}
              style={{
                background: 'none',
                border: 'none',
                color: view === 'upload' ? '#C8102E' : '#64748B',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '2px',
                cursor: 'pointer',
                transition: 'color 0.25s ease',
                padding: '6px 4px',
                outline: 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => { if (view !== 'upload') e.currentTarget.style.color = '#FF5E00'; }}
              onMouseLeave={(e) => { if (view !== 'upload') e.currentTarget.style.color = '#64748B'; }}
            >
              ACTIVITY
            </button>

            <button
              ref={cekPairingTabRef}
              type="button"
              className="nav-tab-btn"
              onClick={() => setView('cek_pairing')}
              style={{
                background: 'none',
                border: 'none',
                color: view === 'cek_pairing' ? '#C8102E' : '#64748B',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '2px',
                cursor: 'pointer',
                transition: 'color 0.25s ease',
                padding: '6px 4px',
                outline: 'none',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => { if (view !== 'cek_pairing') e.currentTarget.style.color = '#FF5E00'; }}
              onMouseLeave={(e) => { if (view !== 'cek_pairing') e.currentTarget.style.color = '#64748B'; }}
            >
              CEK PAIRING
            </button>

            {isAdmin && (
              <button
                ref={controlTabRef}
                type="button"
                className="nav-tab-btn"
                onClick={goAdmin}
                style={{
                  background: 'none',
                  border: 'none',
                  color: view === 'admin' ? '#C8102E' : '#64748B',
                  fontSize: '12px',
                  fontWeight: 800,
                  letterSpacing: '2px',
                  cursor: 'pointer',
                  transition: 'color 0.25s ease',
                  padding: '6px 4px',
                  outline: 'none',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => { if (view !== 'admin') e.currentTarget.style.color = '#FF5E00'; }}
                onMouseLeave={(e) => { if (view !== 'admin') e.currentTarget.style.color = '#64748B'; }}
              >
                CONTROL
              </button>
            )}

            {/* MENU PROGRAM DENGAN 2-TIER SIDE POP-UP DROPDOWN (FLAG: SHOW_PROGRAM_MENU) */}
            {SHOW_PROGRAM_MENU && (
              <div ref={programMenuRef} style={{ position: 'relative' }}>
                <button
                  ref={programTabRef}
                  type="button"
                  className="nav-tab-btn"
                  onClick={() => {
                    if (!user) {
                      setShowLoginModal(true);
                      return;
                    }
                    if (!isProgramDropdownOpen && programTabRef.current) {
                      const rect = programTabRef.current.getBoundingClientRect();
                      setDropdownCoords({
                        top: rect.bottom + 8,
                        left: rect.left + rect.width / 2
                      });
                    }
                    setIsProgramDropdownOpen(!isProgramDropdownOpen);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isProgramDropdownOpen ? '#C8102E' : '#64748B',
                    fontSize: '12px',
                    fontWeight: 800,
                    letterSpacing: '2px',
                    cursor: 'pointer',
                    transition: 'color 0.25s ease',
                    padding: '6px 4px',
                    outline: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => { if (!isProgramDropdownOpen) e.currentTarget.style.color = '#FF5E00'; }}
                  onMouseLeave={(e) => { if (!isProgramDropdownOpen) e.currentTarget.style.color = '#64748B'; }}
                >
                  <span>PROGRAM</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isProgramDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* LEVEL 1 DROPDOWN (FIXED POSITIONING UNTUK MENGHINDARI OVERFLOW CLIPPING) */}
                {user && isProgramDropdownOpen && dropdownCoords.top > 0 && (
                  <div
                    className="program-fixed-dropdown"
                    style={{
                      position: 'fixed',
                      top: `${dropdownCoords.top}px`,
                      left: `${dropdownCoords.left}px`,
                      transform: 'translateX(-50%)',
                      width: '210px',
                      background: '#FFFFFF',
                      borderRadius: '16px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 16px 36px rgba(15, 23, 42, 0.16)',
                      padding: '8px 0',
                      zIndex: 99999,
                      animation: 'programDropdownFadeIn 0.15s ease-out'
                    }}
                  >
                    {(() => {
                      const nowMonthIdx = new Date().getMonth();
                      const isSession2 = nowMonthIdx >= 6;
                      const activeMonths = isSession2 ? SESSION_2_MONTHS : SESSION_1_MONTHS;
                      const sessionLabel = isSession2 ? 'Sesi II (Jul - Des)' : 'Sesi I (Jan - Jun)';

                      return (
                        <>
                          <div style={{ padding: '8px 16px 6px 16px', fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1.2px', borderBottom: '1px solid #F1F5F9' }}>
                            Periode Program
                          </div>

                          {activeMonths.map(m => {
                            const monthData = dynamicMonthsData[m.label];
                            const hasDynamicData = monthData && monthData.programs && monthData.programs.length > 0;
                            const hasPlaceholders = PROGRAM_PLACEHOLDERS[m.label] && PROGRAM_PLACEHOLDERS[m.label].length > 0;
                            const hasPrograms = hasDynamicData || hasPlaceholders;

                            const isHovered = activeHoverMonth === m.label;
                            const isCurrent = m.isCurrent;

                            return (
                              <div
                                key={m.id}
                                onMouseEnter={() => {
                                  if (hasPrograms) {
                                    setActiveHoverMonth(m.label);
                                  } else {
                                    setActiveHoverMonth(null);
                                  }
                                }}
                                onClick={() => {
                                  if (hasPrograms) {
                                    setActiveHoverMonth(m.label);
                                  }
                                }}
                                style={{
                                  position: 'relative',
                                  padding: '10px 16px',
                                  fontSize: '12.5px',
                                  fontWeight: isCurrent ? 800 : 600,
                                  color: !hasPrograms ? '#94A3B8' : (isHovered ? '#C8102E' : isCurrent ? '#0F172A' : '#334155'),
                                  background: isHovered && hasPrograms ? 'rgba(200, 16, 46, 0.04)' : 'transparent',
                                  cursor: hasPrograms ? 'pointer' : 'default',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{m.label}</span>
                                </div>

                                {hasPrograms ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isHovered ? '#C8102E' : '#94A3B8'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                ) : (
                                  <span style={{ fontSize: '10px', color: '#CBD5E1', fontWeight: 500, fontStyle: 'italic' }}>Belum ada</span>
                                )}

                                {/* LEVEL 2 SIDE POP-UP SUBMENU (Hanya terbuka jika hasPrograms === true) */}
                                {isHovered && hasPrograms && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: '-8px',
                                      left: '100%',
                                      marginLeft: '8px',
                                      width: '260px',
                                      background: '#FFFFFF',
                                      borderRadius: '16px',
                                      border: '1px solid #E2E8F0',
                                      boxShadow: '0 16px 36px rgba(15, 23, 42, 0.18)',
                                      padding: '8px 0',
                                      zIndex: 100000,
                                      animation: 'fadeIn 0.2s ease-in-out'
                                    }}
                                  >
                                    <div style={{ padding: '8px 16px 6px 16px', fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1.2px', borderBottom: '1px solid #F1F5F9' }}>
                                      Program {m.label}
                                    </div>
                                    {(() => {
                                      const programList = hasDynamicData
                                        ? monthData.programs.map(p => ({ name: p.sheetName, data: p }))
                                        : (PROGRAM_PLACEHOLDERS[m.label] || []).map(pName => ({ name: pName, data: null }));

                                      return programList.map((progItem, idx) => (
                                        <div
                                          key={idx}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setIsProgramDropdownOpen(false);
                                            if (progItem.data) {
                                              setActiveProgramModal({
                                                program: progItem.data,
                                                monthLabel: m.label
                                              });
                                            } else {
                                              alert(`📌 Program "${progItem.name}" untuk ${m.label} akan segera hadir.`);
                                            }
                                          }}
                                          style={{
                                            padding: '10px 16px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: '#334155',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.color = '#C8102E';
                                            e.currentTarget.style.background = 'rgba(200, 16, 46, 0.05)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.color = '#334155';
                                            e.currentTarget.style.background = 'transparent';
                                          }}
                                        >
                                          <span>{progItem.name}</span>
                                        </div>
                                      ));
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Sliding Orange Line Indicator */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
                height: '3px',
                background: 'linear-gradient(90deg, #C8102E 0%, #FF5E00 100%)',
                borderRadius: '3px 3px 0 0',
                opacity: indicatorStyle.opacity,
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 -2px 8px rgba(200, 16, 46, 0.4)'
              }}
            />
          </div>

          <button
            type="button"
            className={`nav-scroll-arrow-btn ${canScrollRight ? '' : 'hidden'}`}
            onClick={scrollNavRight}
            disabled={!canScrollRight}
            title="Geser menu ke kanan"
          >
            ›
          </button>
        </div>

        {/* Right: User Profile Widget / Login Button */}
        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user ? (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowProfileModal(!showProfileModal)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: showProfileModal ? '#F1F5F9' : 'rgba(248, 250, 252, 0.8)',
                  padding: '6px 14px 6px 6px',
                  borderRadius: '50px',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  outline: 'none'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                onMouseLeave={(e) => { if (!showProfileModal) { e.currentTarget.style.background = 'rgba(248, 250, 252, 0.8)'; e.currentTarget.style.borderColor = '#E2E8F0'; } }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(200, 16, 46, 0.25)'
                }}>
                  {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                    {user.fullName || user.username}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                    {isAdmin ? 'Administrator Pusat GTM' : formatBranch(user.branchName || user.branch?.name)}
                  </div>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showProfileModal ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', marginLeft: '4px' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              style={{
                padding: '8px 20px',
                borderRadius: '50px',
                background: 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '0.5px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(200, 16, 46, 0.3)',
                transition: 'all 0.25s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(200, 16, 46, 0.4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(200, 16, 46, 0.3)'; }}
            >
              Masuk / Login
            </button>
          )}
        </div>
      </nav>

      {/* Main Content View Switcher */}
      <div className={view === 'landing' ? 'main-content-full' : 'main-content'}>
        <div className="fade-in" key={view}>
          {view === 'landing' && (
            <LandingPage
              onExplore={() => {
                if (!user) setShowLoginModal(true);
                else setView('dashboard');
              }}
              onLogin={() => setShowLoginModal(true)}
              onGoDashboard={goDashboard}
              onGoUpload={goUpload}
              kpi={kpi}
              importMeta={importMeta}
              branches={branches}
            />
          )}
          {view === 'dashboard' && (
            <Dashboard 
              branches={branches} 
              goBranch={goBranch} 
              kpi={kpi} 
              importMeta={importMeta}
              statusChips={statusChips} 
              ranking={ranking} 
              mapBounds={mapBounds} 
              mapPoints={mapPoints} 
              isAdmin={isAdmin} 
              typeDesignFilter={typeDesignFilter} 
              setTypeDesignFilter={setTypeDesignFilter} 
            />
          )}
          {view === 'branch' && (
            <BranchView 
              branches={branches} 
              activeBranch={activeBranch} 
              goDashboard={goDashboard}
              updateActivityField={updateActivityField} 
              uploadPhoto={uploadPhoto}
              verifyActivity={isAdmin ? verifyActivity : null}
              rejectActivity={isAdmin ? rejectActivity : null}
              deletePhoto={deletePhoto}
            />
          )}
          {view === 'upload' && (
            <UploadView 
              branches={uploadBranches} 
              initialBranch={activeBranch}
              updateActivityField={updateActivityField} 
              uploadPhoto={uploadPhoto}
              verifyActivity={isAdmin ? verifyActivity : null}
              rejectActivity={isAdmin ? rejectActivity : null}
              deletePhoto={deletePhoto}
            />
          )}
          {view === 'admin' && (
            <AdminPanel 
              token={token} 
              branches={branches}
              onUpdate={fetchData} 
              onProgramUploaded={fetchPrograms}
              goDashboard={goDashboard} 
              onLogout={() => handleLogout(true)}
              verifyActivity={verifyActivity}
              rejectActivity={rejectActivity}
              updateActivityField={updateActivityField}
              uploadPhoto={uploadPhoto}
              deletePhoto={deletePhoto}
              kpi={kpi}
            />
          )}
          {view === 'cek_pairing' && (
            <div style={{ minHeight: '60vh' }} />
          )}
        </div>
      </div>

      {/* User Profile Flyout Dropdown */}
      {showProfileModal && (
        <>
          {/* Transparent Backdrop Overlay to close on outside click */}
          <div 
            onClick={() => setShowProfileModal(false)} 
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
          />
          
          <div className="profile-dropdown-card">
            {/* Header info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 12px 14px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <div className="profile-avatar-circle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>

              <div style={{ overflow: 'hidden', textAlign: 'left' }}>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.fullName}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginTop: '1px' }}>
                  @{user.username}
                </div>
              </div>
            </div>

            {/* Account Details */}
            <div style={{ padding: '12px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '12.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontWeight: 500 }}>Branch</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>
                  {isAdmin ? 'Semua Branch' : formatBranch(user.branchName)}
                </span>
              </div>
            </div>

            {/* Action Items List */}
            <div style={{ paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {/* Log Out Item with Red Door Icon */}
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  handleLogout(true);
                }}
                className="profile-menu-item logout"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Log Out</span>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Custom Logout Confirmation Modal */}
      {showLogoutConfirmModal && (
        <div 
          onClick={() => setShowLogoutConfirmModal(false)}
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(15, 23, 42, 0.45)', 
            backdropFilter: 'blur(4px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 300, 
            padding: '20px', 
            animation: 'fadeIn 0.2s ease-in-out' 
          }}
        >
          <div 
            onClick={e => e.stopPropagation()} 
            style={{ 
              background: '#ffffff', 
              borderRadius: '16px', 
              width: '100%', 
              maxWidth: '340px', 
              padding: '24px', 
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', 
              border: '1px solid #e2e8f0', 
              textAlign: 'center', 
              animation: 'flyoutSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)' 
            }}
          >
            <div 
              style={{ 
                width: '52px', 
                height: '52px', 
                borderRadius: '50%', 
                background: '#fef2f2', 
                color: '#dc2626', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 16px', 
                border: '1px solid #fee2e2' 
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
              Konfirmasi Log Out
            </h3>
            
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 22px', lineHeight: 1.5 }}>
              Apakah Anda yakin ingin keluar dari Portal GTM Activity Monitor?
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowLogoutConfirmModal(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
              >
                Batal
              </button>

              <button
                onClick={() => executeLogout('landing')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #dc2626',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#b91c1c'; e.currentTarget.style.borderColor = '#b91c1c'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.borderColor = '#dc2626'; }}
              >
                Ya, Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SESSION EXPIRED (15 MIN INACTIVITY) POPUP MODAL ─── */}
      {sessionExpiredNotice && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            position: 'relative', width: '100%', maxWidth: '420px',
            background: '#FFFFFF', borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            padding: '28px 24px', boxSizing: 'border-box',
            textAlign: 'center', animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              width: '54px', height: '54px', borderRadius: '50%',
              background: '#FFF7ED', border: '1px solid #FFEDD5',
              color: '#F97316', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 16px auto'
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>

            <h3 style={{ fontSize: '19px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0', fontFamily: "'Outfit', sans-serif" }}>
              Sesi Berakhir (5 Menit)
            </h3>

            <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 24px 0', fontWeight: 500 }}>
              Sesi Anda telah berakhir karena tidak ada aktivitas selama 5 menit. Anda telah ter-logout otomatis dan dikembalikan ke menu Overview.
            </p>

            <button
              type="button"
              onClick={() => setSessionExpiredNotice(false)}
              style={{
                width: '100%', padding: '12px', borderRadius: '12px',
                border: 'none', background: 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)',
                color: '#FFFFFF', fontSize: '14px', fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 4px 14px rgba(200, 16, 46, 0.35)',
                transition: 'all 0.2s'
              }}
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
