import { useState, useMemo, memo } from 'react';
import { formatBranch } from '../utils';

const CekPairingView = memo(function CekPairingView({ branches = [], goDashboard }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'paired' | 'unpaired'
  const [selectedBranch, setSelectedBranch] = useState('Semua Branch');

  // Compute pairing data from branches
  const pairingData = useMemo(() => {
    const list = [];
    (branches || []).forEach(b => {
      const bName = formatBranch(b.name);
      (b.projects || []).forEach(p => {
        const odps = p.odps || [];
        const totalUsed = p.usedTotal ?? odps.reduce((s, o) => s + (o.used || 0), 0);
        const totalPort = p.totalPort ?? odps.reduce((s, o) => s + (o.total || 0), 0);
        const isPaired = odps.length > 0 && totalPort > 0;

        list.push({
          id: `${bName}-${p.name}`,
          branchName: bName,
          wok: p.wok || '-',
          projectName: p.name,
          typeDesign: p.typeDesign || 'Greenfield',
          odpCount: odps.length,
          totalUsed,
          totalPort,
          status: isPaired ? 'paired' : 'unpaired',
          odpList: odps.map(o => o.odp).filter(Boolean)
        });
      });
    });
    return list;
  }, [branches]);

  // Statistics
  const stats = useMemo(() => {
    const total = pairingData.length;
    const paired = pairingData.filter(d => d.status === 'paired').length;
    const unpaired = total - paired;
    const pct = total > 0 ? ((paired / total) * 100).toFixed(1) : '0';
    return { total, paired, unpaired, pct };
  }, [pairingData]);

  // Filtered List
  const filteredList = useMemo(() => {
    const s = search.toLowerCase();
    return pairingData.filter(item => {
      const matchBranch = selectedBranch === 'Semua Branch' || item.branchName === selectedBranch;
      const matchSearch = !s || 
        item.projectName.toLowerCase().includes(s) || 
        item.wok.toLowerCase().includes(s) || 
        item.branchName.toLowerCase().includes(s) ||
        item.odpList.some(o => o.toLowerCase().includes(s));
      
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchBranch && matchSearch && matchStatus;
    });
  }, [pairingData, selectedBranch, search, statusFilter]);

  const uniqueBranches = useMemo(() => {
    const set = new Set(pairingData.map(d => d.branchName));
    return ['Semua Branch', ...Array.from(set)];
  }, [pairingData]);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
      {/* Header Bar */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#C8102E', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>
            VALIDASI & INTEGRASI SISTEM
          </div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>
            Cek Pairing ODP &amp; Project GTM
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Memantau status pemetaan pasangan ODP dengan LOP/Proyek Greenfield di seluruh Branch &amp; WOK.
          </p>
        </div>

        <button
          type="button"
          onClick={goDashboard}
          style={{
            padding: '9px 18px',
            borderRadius: '50px',
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            color: '#334155',
            fontSize: '12.5px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#94A3B8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Kembali ke Overview</span>
        </button>
      </div>

      {/* Summary KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Total LOP / Proyek</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>{stats.total.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px' }}>Proyek Greenfield Priority</div>
        </div>

        <div style={{ padding: '20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Ter-Pairing Sempurna</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#16A34A', fontFamily: "'Outfit', sans-serif" }}>{stats.paired.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 700, marginTop: '4px' }}>{stats.pct}% Tingkat Pairing</div>
        </div>

        <div style={{ padding: '20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Belum Ter-Pairing</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#DC2626', fontFamily: "'Outfit', sans-serif" }}>{stats.unpaired.toLocaleString('id-ID')}</div>
          <div style={{ fontSize: '11.5px', color: '#DC2626', fontWeight: 700, marginTop: '4px' }}>Perlu Validasi ODP</div>
        </div>
      </div>

      {/* Controls & Search Filter Bar */}
      <div style={{ padding: '16px 20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              placeholder="Cari nama proyek, WOK, atau kode ODP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 14px 9px 36px',
                borderRadius: '50px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                outline: 'none',
                background: '#F8FAFC',
                color: '#0F172A',
                boxSizing: 'border-box'
              }}
            />
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: '50px',
              border: '1px solid #CBD5E1',
              background: '#F8FAFC',
              color: '#0F172A',
              fontSize: '12.5px',
              fontWeight: 700,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {uniqueBranches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Filter Status Chips */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'all', label: 'Semua Status' },
            { id: 'paired', label: 'Ter-pairing' },
            { id: 'unpaired', label: 'Belum Pairing' }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '50px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: statusFilter === f.id ? '#0F172A' : '#F1F5F9',
                color: statusFilter === f.id ? '#FFFFFF' : '#64748B',
                transition: 'all 0.15s ease'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pairing Data Table */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                <th style={{ padding: '14px 20px' }}>Nama LOP / Proyek</th>
                <th style={{ padding: '14px 16px' }}>Branch / WOK</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>Jumlah ODP</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>Port Used / Total</th>
                <th style={{ padding: '14px 20px', textAlign: 'center' }}>Status Pairing</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                    Tidak ada data pairing yang cocok dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                filteredList.map((row, idx) => (
                  <tr key={row.id || idx} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.background = '#FAFAFC'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '14px 20px', fontWeight: 800, color: '#0F172A' }}>
                      {row.projectName}
                      <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, marginTop: '2px' }}>{row.typeDesign}</div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#334155', fontWeight: 600 }}>
                      <span style={{ color: '#0F172A', fontWeight: 800 }}>{row.branchName}</span> • {row.wok}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                      {row.odpCount} ODP
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                      {row.totalUsed} / {row.totalPort}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      {row.status === 'paired' ? (
                        <span style={{ padding: '4px 12px', borderRadius: '50px', background: '#DCFCE7', color: '#166534', fontWeight: 800, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          ✓ Ter-pairing ({row.odpCount} ODP)
                        </span>
                      ) : (
                        <span style={{ padding: '4px 12px', borderRadius: '50px', background: '#FEE2E2', color: '#991B1B', fontWeight: 800, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          ⚠️ Belum Pairing
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

export default CekPairingView;
