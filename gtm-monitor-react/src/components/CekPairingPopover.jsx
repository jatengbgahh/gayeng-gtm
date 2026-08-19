import { useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../apiConfig';

const CekPairingPopover = memo(function CekPairingPopover({ isOpen, coords, onClose, token }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const cleanQ = query.trim();

    if (!cleanQ || cleanQ.length < 6) {
      setError('Kata kunci terlalu umum. Masukkan nilai yang akurat dan lengkap (minimal 6 karakter).');
      setResults([]);
      setIsModalOpen(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const savedToken = token || localStorage.getItem('gtm_token') || sessionStorage.getItem('gtm_token') || localStorage.getItem('token');
      const headers = savedToken ? { 'Authorization': `Bearer ${savedToken}` } : {};
      const res = await fetch(`${API_BASE_URL}/api/pairing/search?q=${encodeURIComponent(cleanQ)}`, { headers });
      const contentType = res.headers.get('content-type') || '';

      let data = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server mengembalikan respon non-JSON (${res.status}): ${text.slice(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || `Terjadi kesalahan saat mencari data pairing (Status ${res.status}).`);
      }

      if (!data.results || data.results.length === 0) {
        setError(`Data pairing tidak ditemukan untuk kata kunci "${cleanQ}". Pastikan penulisan ID/nomor telepon sudah sesuai.`);
        setResults([]);
        setIsModalOpen(false);
      } else {
        const grouped = groupPairingRecordsByParent(data.results);
        setResults(grouped);
        setSelectedIdx(0);
        setIsModalOpen(true);
        onClose(); // Close the dropdown popover when modal opens
      }
    } catch (err) {
      setError(err.message || 'Gagal melakukan pencarian.');
      setResults([]);
      setIsModalOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const formatSourcePerdana = (msisdn, sourceStr) => {
    if (!msisdn) return '-';
    const cleanMsisdn = String(msisdn).trim();
    if (!cleanMsisdn) return '-';

    if (!sourceStr || typeof sourceStr !== 'string') return cleanMsisdn;
    const cleanSource = sourceStr.trim();

    if (!cleanSource || /^(0|\\N|N\/A|-)$/i.test(cleanSource)) {
      return cleanMsisdn;
    }

    return `${cleanMsisdn} (${cleanSource})`;
  };

  const groupPairingRecordsByParent = (rawRecords) => {
    if (!rawRecords || rawRecords.length === 0) return [];

    const groupedMap = new Map();

    rawRecords.forEach(rec => {
      const key = (rec.bb_id || rec.msisdn_parent || rec.order_id || JSON.stringify(rec)).trim().toLowerCase();

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          bb_id: rec.bb_id,
          msisdn_parent: rec.msisdn_parent,
          source_perdana_parent: rec.source_perdana_parent,
          product_commercial_name: rec.product_commercial_name,
          activation_date_ih: rec.activation_date_ih,
          activation_date_parent: rec.activation_date_parent,
          city: rec.city,
          region: rec.region,
          area: rec.area,
          cluster: rec.cluster,
          sto: rec.sto,
          tsel_id_ih: rec.tsel_id_ih,
          tsel_id_mobile_parent: rec.tsel_id_mobile_parent,
          order_id: rec.order_id,
          children: []
        });
      }

      const group = groupedMap.get(key);

      for (let i = 1; i <= 6; i++) {
        const childNum = rec[`msisdn_child${i}`];
        const childDate = rec[`activation_date_child${i}`];
        const childTselId = rec[`tsel_id_mobile_child${i}`];
        const childSource = rec[`source_perdana_child${i}`];

        if (childNum) {
          const exists = group.children.some(c => c.msisdn === childNum);
          if (!exists) {
            group.children.push({
              msisdn: childNum,
              date: childDate || '',
              tselId: childTselId || '',
              sourcePerdana: childSource || ''
            });
          }
        }
      }
    });

    return Array.from(groupedMap.values());
  };

  const activeRecord = results[selectedIdx] || null;

  const buildTransposedFields = (rec) => {
    if (!rec) return [];

    const fields = [
      { label: 'bb_id', val: rec.bb_id },
      { label: 'msisdn_parent', val: formatSourcePerdana(rec.msisdn_parent, rec.source_perdana_parent) },
    ];

    if (rec.children && rec.children.length > 0) {
      rec.children.forEach((c, idx) => {
        fields.push({
          label: `msisdn_child${idx + 1}`,
          val: formatSourcePerdana(c.msisdn, c.sourcePerdana)
        });
      });
    } else {
      fields.push({ label: 'msisdn_child1', val: '-' });
    }

    fields.push({ label: 'activation_date_ih', val: rec.activation_date_ih });
    fields.push({ label: 'activation_date_parent', val: rec.activation_date_parent });

    if (rec.children && rec.children.length > 0) {
      rec.children.forEach((c, idx) => {
        fields.push({ label: `activation_date_child${idx + 1}`, val: c.date });
      });
    } else {
      fields.push({ label: 'activation_date_child1', val: '-' });
    }

    fields.push({ label: 'city', val: rec.city });
    fields.push({ label: 'sto', val: rec.sto });
    fields.push({ label: 'order_id', val: rec.order_id });

    return fields;
  };

  const transposedFields = buildTransposedFields(activeRecord);

  return (
    <>
      {/* ─── DROPDOWN SEARCH POPOVER (Mounted to document.body via createPortal) ─── */}
      {isOpen && coords && coords.top > 0 && createPortal(
        <div
          className="pairing-fixed-dropdown fade-in"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: 'translateX(-50%)',
            width: '380px',
            background: '#FFFFFF',
            borderRadius: '18px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 16px 40px rgba(15, 23, 42, 0.18)',
            padding: '20px',
            zIndex: 999999,
            animation: 'programDropdownFadeIn 0.15s ease-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#C8102E', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                TELKOMSEL ONE PAIRING
              </div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>
                Pencarian Data Pairing
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                border: 'none',
                background: '#F1F5F9',
                color: '#64748B',
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Cari bb_id, msisdn, atau order_id..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setError(null);
                }}
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 14px 11px 38px',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  fontWeight: 600,
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

            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '11.5px',
              color: '#475569',
              lineHeight: 1.45
            }}>
              <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '4px', fontSize: '11.5px' }}>
                Panduan Penggunaan:
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <li>Masukkan <strong style={{ color: '#0F172A' }}>bb_id</strong>, nomor HP (<strong style={{ color: '#0F172A' }}>08...</strong> / <strong style={{ color: '#0F172A' }}>62...</strong>), atau <strong style={{ color: '#0F172A' }}>order_id</strong> secara lengkap.</li>
                <li>Penulisan harus akurat (persis) sesuai data.</li>
                <li>Tekan <strong style={{ color: '#0F172A' }}>Enter</strong> atau tombol <strong style={{ color: '#C8102E' }}>Konfirmasi Pencarian</strong>.</li>
              </ul>
            </div>

            {error && (
              <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '12px', fontWeight: 700 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !query.trim()}
              style={{
                width: '100%',
                padding: '11px 20px',
                borderRadius: '50px',
                border: 'none',
                background: loading || !query.trim() ? '#CBD5E1' : 'linear-gradient(135deg, #C8102E 0%, #FF5E00 100%)',
                color: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 800,
                letterSpacing: '0.5px',
                cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                boxShadow: loading || !query.trim() ? 'none' : '0 4px 14px rgba(200, 16, 46, 0.3)',
                transition: 'all 0.2s ease',
                marginTop: '4px'
              }}
            >
              {loading ? 'Mencari Data Pairing...' : 'Konfirmasi Pencarian'}
            </button>
          </form>
        </div>,
        document.body
      )}

      {/* ─── TRANSPOSED TELKOMSEL RESULT POP-UP MODAL (Mounted to document.body via createPortal) ─── */}
      {isModalOpen && activeRecord && createPortal(
        <div
          className="pairing-transposed-modal"
          onClick={() => setIsModalOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            boxSizing: 'border-box',
            overflowY: 'auto'
          }}
        >
          <div
            className="fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              border: '1px solid #E2E8F0',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              margin: 'auto'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#C8102E', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
                  TELKOMSEL ONE PAIRING DATA
                </div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>
                  Hasil Deteksi Pairing
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#E2E8F0',
                  color: '#475569',
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Multiple Results Selector (if results count > 1) */}
            {results.length > 1 && (
              <div style={{ padding: '10px 24px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ fontWeight: '700', color: '#475569' }}>
                  Ditemukan {results.length} data cocok. Menampilkan ({selectedIdx + 1} dari {results.length}):
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={selectedIdx === 0}
                    onClick={() => setSelectedIdx(prev => prev - 1)}
                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFF', fontSize: '11.5px', fontWeight: 700, cursor: selectedIdx === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Sebelumnya
                  </button>
                  <button
                    disabled={selectedIdx === results.length - 1}
                    onClick={() => setSelectedIdx(prev => prev + 1)}
                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFF', fontSize: '11.5px', fontWeight: 700, cursor: selectedIdx === results.length - 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            )}

            {/* Modal Body: Transposed Table Telkomsel Style */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', fontSize: '13px' }}>
                <tbody>
                  {transposedFields.map((f, i) => (
                    <tr key={i}>
                      {/* Left Header Column (Vertical Transposed) - Maroon Telkomsel */}
                      <td
                        style={{
                          width: '42%',
                          padding: '12px 16px',
                          background: '#C8102E',
                          color: '#FFFFFF',
                          fontWeight: 800,
                          fontSize: '12px',
                          fontFamily: "'Outfit', sans-serif",
                          letterSpacing: '0.3px',
                          borderTopLeftRadius: '10px',
                          borderBottomLeftRadius: '10px',
                          verticalAlign: 'middle'
                        }}
                      >
                        {f.label}
                      </td>

                      {/* Right Value Column - Clean Crisp Card */}
                      <td
                        style={{
                          padding: '12px 16px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderLeft: 'none',
                          borderTopRightRadius: '10px',
                          borderBottomRightRadius: '10px',
                          color: '#0F172A',
                          fontWeight: 700,
                          wordBreak: 'break-all',
                          verticalAlign: 'middle'
                        }}
                      >
                        {f.val || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '50px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0F172A 0%, #334155 100%)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'
                }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
});

export default CekPairingPopover;
