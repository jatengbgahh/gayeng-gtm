export const ACT_TYPES = [
  { key: 'tsel_menyapa', label: 'Tsel Menyapa Warga', kind: 'date_photo', fieldKey: 'planDate' },
  { key: 'branding_outlet', label: 'Branding Downline/Outlet', kind: 'photo' },
  { key: 'bumdes', label: 'Kerjasama dengan BUMDES', kind: 'photo' },
  { key: 'rekrutmen_sf', label: 'Rekrutmen SF AKAMSI', kind: 'text', fieldKey: 'keterangan', placeholder: 'Kode SF' },
  { key: 'open_table', label: 'Always ON Open Table', kind: 'photo' }
];

export const BRANCH_COLORS = {
  MAGELANG: '#10b981',   // Emerald Green
  PEKALONGAN: '#f97316', // Sunset Orange
  PURWOKERTO: '#3b82f6', // Royal Blue
  SEMARANG: '#ef4444',   // Telkomsel Red / Crimson
  SURAKARTA: '#8b5cf6',  // Royal Purple / Violet
  YOGYAKARTA: '#06b6d4'  // Cyan / Turquoise
};

const BRANCH_COORDS = {
  MAGELANG: { lat: -7.4797, lon: 110.2177 },
  PEKALONGAN: { lat: -6.8886, lon: 109.6753 },
  PURWOKERTO: { lat: -7.4245, lon: 109.2302 },
  SEMARANG: { lat: -7.0051, lon: 110.4381 },
  SURAKARTA: { lat: -7.5755, lon: 110.8243 },
  YOGYAKARTA: { lat: -7.7956, lon: 110.3695 }
};

export function getOdpCoords(odpName, branchName, existingLat, existingLon) {
  if (typeof existingLat === 'number' && typeof existingLon === 'number' && !isNaN(existingLat) && !isNaN(existingLon)) {
    return { lat: existingLat, lon: existingLon };
  }
  const base = BRANCH_COORDS[branchName?.toString().trim().toUpperCase()] || { lat: -7.25, lon: 110.0 };
  let h = 0;
  for (let i = 0; i < (odpName || '').length; i++) {
    h = ((h << 5) - h) + odpName.charCodeAt(i);
    h |= 0;
  }
  const abs = Math.abs(h);
  const latOffset = ((abs % 1000) - 500) * 0.0003; // ~ +/- 0.15 deg (~15 km radius)
  const lonOffset = (((abs / 1000) | 0) % 1000 - 500) * 0.0003;
  return { lat: base.lat + latOffset, lon: base.lon + lonOffset };
}

export function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function occColor(status) {
  return { GREEN: '#16a34a', YELLOW: '#d97706', ORANGE: '#f97316', BLACK: '#334155', RED: '#dc2626' }[status] || '#64748b';
}

export function occBg(status) {
  return { GREEN: '#dcfce7', YELLOW: '#fef3c7', ORANGE: '#ffedd5', BLACK: '#e2e8f0', RED: '#fee2e2' }[status] || '#f1f5f9';
}

export function actMeta(status) {
  if (status === 'verified') return { label: 'Terverifikasi', bg: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' };
  if (status === 'upload') return { label: 'Menunggu Verifikasi', bg: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' };
  return { label: 'Belum Dikerjakan', bg: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' };
}

export function flatOdps(branches, typeDesignFilter) {
  const out = [];
  for (const b of (Array.isArray(branches) ? branches : [])) {
    for (const p of (b.projects || [])) {
      if (typeDesignFilter && typeDesignFilter !== 'ALL' && (p.typeDesign || 'Greenfield') !== typeDesignFilter) {
        continue;
      }
      for (const o of (p.odps || [])) {
        const coords = getOdpCoords(o.odp, b.name, o.lat, o.lon);
        out.push({ ...o, lat: coords.lat, lon: coords.lon, branch: b.name, project: p.name, wok: p.wok });
      }
    }
  }
  return out;
}

export function computeStats(branches, typeDesignFilter) {
  let totalAvai = 0, totalUsed = 0, totalPort = 0, odpCount = 0;
  let totalProjCount = 0;
  const allActs = [];

  for (const b of (Array.isArray(branches) ? branches : [])) {
    const projs = b.projects || [];
    for (const p of projs) {
      if (typeDesignFilter && typeDesignFilter !== 'ALL' && (p.typeDesign || 'Greenfield') !== typeDesignFilter) {
        continue;
      }
      totalProjCount++;
      for (const o of (p.odps || [])) {
        totalAvai += o.avai;
        totalUsed += o.used;
        totalPort += o.total;
        odpCount++;
      }
      // Activities are at project level
      if (p.activities) {
        allActs.push(...p.activities);
      }
    }
  }

  const occRate = totalPort ? Math.round((totalUsed / totalPort) * 1000) / 10 : 0;
  const actVerified = allActs.filter(a => a.status === 'verified').length;
  const actUploaded = allActs.filter(a => a.status === 'upload').length;
  const actBelum = allActs.filter(a => a.status === 'belum').length;
  
  // Perhitungan Kontribusi Persentase Verifikasi:
  // Setiap 1 Proyek memiliki 5 Tipe Aktivitas.
  // Total Kapasitas Aktivitas = Total Proyek * 5.
  // Progress (%) = (Jumlah Aktivitas Terverifikasi / (Total Proyek * 5)) * 100%
  const totalActivitySlots = totalProjCount * 5;
  const actCompletionPct = totalActivitySlots ? Math.round((actVerified / totalActivitySlots) * 1000) / 10 : 0;
  
  return {
    totalAvai, totalUsed, totalPort, occRate,
    actVerified, actUploaded, actBelum, actCompletionPct, odpCount,
    totalProjCount, totalActivitySlots
  };
}

export function formatBranch(name) {
  if (!name || name === 'Semua Branch' || name === 'Multi Branch') return name;
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function exportProjectsToExcel(branches, selectedBranchName = null) {
  import('xlsx-js-style').then(XLSX => {
    let targetBranches = Array.isArray(branches) ? branches : [];
    if (selectedBranchName && selectedBranchName !== 'Semua Branch' && selectedBranchName !== 'Multi Branch') {
      targetBranches = targetBranches.filter(b => b.name === selectedBranchName || b.name.toLowerCase() === selectedBranchName.toLowerCase());
    }

    const getActStatusLabel = (act, actTypeKey) => {
      if (!act || !act.status || act.status === 'belum') return 'Belum Dikerjakan';
      let label = act.status === 'verified' ? 'Terverifikasi' : 'Menunggu Verifikasi';
      if (actTypeKey === 'tsel_menyapa' && act.planDate) {
        const dStr = new Date(act.planDate).toLocaleDateString('id-ID');
        label += ` (Tgl: ${dStr})`;
      } else if (actTypeKey === 'rekrutmen_sf' && (act.keterangan || act.kodeSf)) {
        label += ` (${act.kodeSf || act.keterangan})`;
      }
      return label;
    };

    const getOverallProjectStatus = (acts) => {
      if (acts.some(a => a.status === 'upload')) return 'Menunggu Verifikasi';
      if (acts.some(a => a.status === 'verified')) return 'Terverifikasi';
      return 'Belum Dikerjakan';
    };

    const dataRows = [];

    targetBranches.forEach(b => {
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

    if (dataRows.length === 0) {
      alert('⚠️ Tidak ada data proyek untuk diexport.');
      return;
    }

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
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Merge title rows A1 & A2
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } }
    ];

    if (ws['A1']) {
      ws['A1'].s = {
        font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "0F172A" } },
        alignment: { vertical: "center" }
      };
    }
    if (ws['A2']) {
      ws['A2'].s = {
        font: { name: "Calibri", sz: 11, italic: true, color: { rgb: "475569" } },
        alignment: { vertical: "center" }
      };
    }

    // AutoFilter across A4:N...
    ws['!autofilter'] = { ref: `A4:N${3 + dataRows.length}` };

    // Style Header A4:N4 with Telkomsel Red (#C8102E) & White Bold Text (#FFFFFF)
    const headerCols = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N'];
    headerCols.forEach(col => {
      const cellRef = `${col}4`;
      if (ws[cellRef]) {
        ws[cellRef].s = {
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

    ws['!cols'] = [
      { wch: 16 }, // Branch
      { wch: 22 }, // WOK
      { wch: 32 }, // Nama LOP
      { wch: 14 }, // Type Design
      { wch: 10 }, // Used Port
      { wch: 10 }, // Avai Port
      { wch: 10 }, // Total Port
      { wch: 18 }, // Occupancy Rate
      { wch: 30 }, // Tsel Menyapa
      { wch: 22 }, // Branding
      { wch: 22 }, // BUMDES
      { wch: 30 }, // Rekrutmen SF
      { wch: 22 }, // Open Table
      { wch: 24 }  // Status LOP
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap LOP');

    const cleanName = selectedBranchName && selectedBranchName !== 'Semua Branch' && selectedBranchName !== 'Multi Branch'
      ? formatBranch(selectedBranchName).replace(/\s+/g, '_')
      : 'Semua_Branch';

    const today = new Date().toISOString().split('T')[0];
    const fileName = cleanName !== 'Semua_Branch'
      ? `Rekap_GTM_Activity_${cleanName}_${today}.xlsx`
      : `Rekap_GTM_Activity_${today}.xlsx`;

    XLSX.writeFile(wb, fileName);
  });
}
