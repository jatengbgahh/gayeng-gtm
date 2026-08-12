import { useState, memo } from 'react';
import { API_BASE_URL } from '../apiConfig';

const CekPairingPopover = memo(function CekPairingPopover({ isOpen, coords, onClose }) {
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
      const res = await fetch(`${API_BASE_URL}/api/pairing/search?q=${encodeURIComponent(cleanQ)}`);
      const contentType = res.headers.get('content-type') || '';

      let data = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server mengembalikan respon non-JSON (${res.status}): ${text.slice(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Terjadi kesalahan saat mencari data pairing.');
      }

      if (!data.results || data.results.length === 0) {
        setError(`Data pairing tidak ditemukan untuk kata kunci "${cleanQ}". Pastikan penulisan ID atau nomor telepon akurat.`);
        setResults([]);
        setIsModalOpen(false);
      } else {
        setResults(data.results);
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

  const activeRecord = results[selectedIdx] || null;

  const buildTransposedFields = (rec) => {
    if (!rec) return [];

    const baseFields = [
      { label: 'bb_id', val: rec.bb_id },
      { label: 'msisdn_parent', val: rec.msisdn_parent },
    ];

    for (let i = 1; i <= 6; i++) {
      const key = `msisdn_child${i}`;
      if (rec[key]) {
        baseFields.push({ label: key, val: rec[key] });
      }
    }

    if (rec.product_commercial_name) {
      baseFields.push({ label: 'product_commercial_name', val: rec.product_commercial_name });
    }
    baseFields.push({ label: 'activation_date_ih', val: rec.activation_date_ih });
    baseFields.push({ label: 'activation_date_parent', val: rec.activation_date_parent });

    for (let i = 1; i <= 6; i++) {
      const key = `activation_date_child${i}`;
      if (rec[key]) {
        baseFields.push({ label: key, val: rec[key] });
      }
    }

    baseFields.push({ label: 'city', val: rec.city });
    baseFields.push({ label: 'sto', val: rec.sto });
    baseFields.push({ label: 'order_id', val: rec.order_id });

    return baseFields;
  };

  const transposedFields = buildTransposedFields(activeRecord);

  return (
    <>
      {/* ─── DROPDOWN SEARCH POPOVER (Positioned directly under CEK PAIRING navbar button) ─── */}
      {isOpen && coords && coords.top > 0 && (
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
            zIndex: 99999,
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

            <span style={{ fontSize: '11.5px', color: '#64748B', lineHeight: 1.3 }}>
              Masukkan nilai akurat &amp; lengkap (minimal 6 karakter).
            </span>

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
        </div>
      )}

      {/* ─── TRANSPOSED TELKOMSEL RESULT POP-UP MODAL ─── */}
      {isModalOpen && activeRecord && (
        <div
          className="pairing-transposed-modal"
          onClick={() => setIsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
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
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden'
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
        </div>
      )}
    </>
  );
});

export default CekPairingPopover;
