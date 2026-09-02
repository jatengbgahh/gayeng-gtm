import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function UploadModal({ data, onClose, onSubmit }) {
  if (!data) return null;
  const { branchName, projectName, actTypeObj } = data;

  const actKey = actTypeObj.key;
  const actLabel = actTypeObj.label;

  const [planDate, setPlanDate] = useState('');
  const [namaOutlet, setNamaOutlet] = useState('');
  const [namaBumdes, setNamaBumdes] = useState('');
  const [kodeSf, setKodeSf] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('File harus berupa gambar (JPG, PNG, WEBP, dll).');
        return;
      }
      setSelectedFile(file);
      setErrorMsg('');
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleSubmitAttempt = (e) => {
    e.preventDefault();
    setErrorMsg('');

    // Validasi aturan input per activity
    if (actKey === 'branding_outlet') {
      if (!namaOutlet.trim()) {
        setErrorMsg('Nama Outlet wajib diisi.');
        return;
      }
      if (!selectedFile) {
        setErrorMsg('Foto bukti kegiatan wajib diunggah.');
        return;
      }
    } else if (actKey === 'open_table' || actKey === 'tsel_menyapa') {
      if (!planDate) {
        setErrorMsg('Tanggal wajib dipilih.');
        return;
      }
      if (!selectedFile) {
        setErrorMsg('Foto bukti kegiatan wajib diunggah.');
        return;
      }
    } else if (actKey === 'bumdes') {
      if (!namaBumdes.trim()) {
        setErrorMsg('Nama BUMDES wajib diisi.');
        return;
      }
      if (!selectedFile) {
        setErrorMsg('Foto bukti kegiatan wajib diunggah.');
        return;
      }
    } else if (actKey === 'rekrutmen_sf') {
      if (!kodeSf.trim()) {
        setErrorMsg('Kode SF wajib diisi.');
        return;
      }
    }

    // Panggil trigger konfirmasi
    onSubmit({
      file: selectedFile,
      planDate,
      namaOutlet: namaOutlet.trim(),
      namaBumdes: namaBumdes.trim(),
      kodeSf: kodeSf.trim(),
      keterangan: keterangan.trim() || kodeSf.trim() || namaOutlet.trim() || namaBumdes.trim()
    });
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', boxSizing: 'border-box'
    }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: '480px',
        background: '#FFFFFF', borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        padding: '26px 28px', boxSizing: 'border-box',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF5E00', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Upload Kegiatan GTM
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '4px 0 2px 0', fontFamily: "'Outfit', sans-serif" }}>
              {actLabel}
            </h3>
            <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
              {projectName} · <span style={{ color: '#0F172A' }}>{branchName}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '50%', border: 'none',
              background: '#F1F5F9', color: '#64748B', fontSize: '15px',
              fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626',
            padding: '10px 14px', borderRadius: '12px', fontSize: '12.5px', fontWeight: 600,
            marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmitAttempt} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Form Input: Branding Outlet -> Nama Outlet */}
          {actKey === 'branding_outlet' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Nama Outlet <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Masukkan Nama Outlet..."
                value={namaOutlet}
                onChange={(e) => setNamaOutlet(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          )}

          {/* Form Input: Kerjasama BUMDES -> Nama BUMDES */}
          {actKey === 'bumdes' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Nama BUMDES <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Masukkan Nama BUMDES..."
                value={namaBumdes}
                onChange={(e) => setNamaBumdes(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          )}

          {/* Form Input: Always Open Table & Tsel Menyapa -> Tanggal */}
          {(actKey === 'open_table' || actKey === 'tsel_menyapa') && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Tanggal Kegiatan <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          )}

          {/* Form Input: Rekrutmen SF -> Kode SF (wajib, satu-satunya input) */}
          {actKey === 'rekrutmen_sf' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Kode SF <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Contoh: SF 09812..."
                value={kodeSf}
                onChange={(e) => setKodeSf(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          )}

          {/* Upload Foto Dropzone — disembunyikan untuk Rekrutmen SF */}
          {actKey !== 'rekrutmen_sf' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Foto Bukti Kegiatan {['branding_outlet', 'open_table', 'tsel_menyapa', 'bumdes'].includes(actKey) && <span style={{ color: '#DC2626' }}>*</span>}
              </label>

              {previewUrl ? (
                <div style={{
                  position: 'relative', width: '100%', height: '180px', borderRadius: '14px',
                  overflow: 'hidden', border: '2px solid #10B981', background: '#0F172A'
                }}>
                  <img src={previewUrl} alt="Preview Upload" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  <button
                    type="button"
                    onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
                    style={{
                      position: 'absolute', top: '8px', right: '8px',
                      padding: '4px 10px', borderRadius: '8px', border: 'none',
                      background: 'rgba(220, 38, 38, 0.9)', color: '#FFF', fontSize: '11px',
                      fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    Ganti Foto
                  </button>
                </div>
              ) : (
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: '140px', borderRadius: '14px', border: '2px dashed #CBD5E1',
                  background: '#F8FAFC', cursor: 'pointer', transition: 'all 0.2s', padding: '16px'
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '8px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>Pilih File Foto Bukti</span>
                  <span style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>Format JPG, PNG (Max 5MB)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          )}

          {/* Modal Actions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '11px 20px', borderRadius: '12px',
                border: '1px solid #E2E8F0', background: '#F8FAFC',
                color: '#475569', fontSize: '13.5px', fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              style={{
                padding: '11px 22px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg, #FF5E00 0%, #C8102E 100%)',
                color: '#FFFFFF', fontSize: '13.5px', fontWeight: 800,
                cursor: 'pointer', boxShadow: '0 4px 14px rgba(200, 16, 46, 0.35)'
              }}
            >
              Kirim
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
