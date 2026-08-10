const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Auto-load .env file if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > -1) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  });
}

// Clean channel_binding=require if present in DATABASE_URL as it causes connection failure with Neon pooler
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/&channel_binding=require/g, '').replace(/\?channel_binding=require/g, '');
}

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary');
const crypto = require('crypto');

const app = express();
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Configuration
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'gtm-super-secret-key-2026';

const BRANCH_COORDS = {
  MAGELANG: { lat: -7.4797, lon: 110.2177 },
  PEKALONGAN: { lat: -6.8886, lon: 109.6753 },
  PURWOKERTO: { lat: -7.4245, lon: 109.2302 },
  SEMARANG: { lat: -7.0051, lon: 110.4381 },
  SURAKARTA: { lat: -7.5755, lon: 110.8243 },
  YOGYAKARTA: { lat: -7.7956, lon: 110.3695 }
};

function getOdpCoords(odpName, branchName, existingLat, existingLon) {
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
  const latOffset = ((abs % 1000) - 500) * 0.0003;
  const lonOffset = (((abs / 1000) | 0) % 1000 - 500) * 0.0003;
  return { lat: base.lat + latOffset, lon: base.lon + lonOffset };
}

// ─── CLOUDINARY CONFIGURATION (STAGING FOR UNVERIFIED PHOTOS) ───
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'qlggcwmf',
  api_key: process.env.CLOUDINARY_API_KEY || '334656367936846',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'VAhyDEr0QzAithQk7KAWmKx-ctI',
});

// Helper: Upload buffer photo to Cloudinary staging
const uploadToCloudinary = (fileBuffer, folder = 'gtm_staging') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      { folder: folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// Helper: Delete photo from Cloudinary
const deleteFromCloudinary = async (urlOrPublicId) => {
  if (!urlOrPublicId) return;
  try {
    let publicId = urlOrPublicId;
    if (urlOrPublicId.includes('res.cloudinary.com')) {
      const parts = urlOrPublicId.split('/upload/');
      if (parts[1]) {
        const pathAndExt = parts[1].replace(/^v\d+\//, '');
        publicId = pathAndExt.substring(0, pathAndExt.lastIndexOf('.'));
      }
    }
    if (publicId && !publicId.startsWith('/')) {
      console.log('🧹 [Cloudinary Cleanup] Destroying publicId:', publicId);
      await cloudinary.v2.uploader.destroy(publicId);
    }
  } catch (err) {
    console.error('⚠️ [Cloudinary Destroy Error]:', err.message);
  }
};

// Helper: Download image buffer from remote Cloudinary URL
const downloadBuffer = (url) => {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Gagal mengunduh gambar dari Cloudinary, status code: ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', err => reject(err));
    }).on('error', err => reject(err));
  });
};

// Helper: Sanitize folder/file name for OS compatibility
const sanitizeFolderName = (str) => {
  if (!str) return 'UNKNOWN';
  return str.toString().trim()
    .replace(/[\\/:*?"<>|]/g, '-') // Replace OS forbidden characters with hyphen
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
};

// Helper: Get Activity Label for Folder & File Prefix
const getActivityLabel = (type) => {
  switch (type) {
    case 'tsel_menyapa':
      return 'TSEL MENYAPA WARGA';
    case 'branding_outlet':
      return 'BRANDING DOWNLINE OUTLET';
    case 'bumdes':
      return 'KERJASAMA DENGAN BUMDES';
    case 'rekrutmen_sf':
      return 'REKRUTMEN SF AKAMSI';
    case 'open_table':
      return 'ALWAYS ON OPEN TABLE';
    default:
      return (type || 'ACTIVITY').toUpperCase().replace(/_/g, ' ');
  }
};

// Helper: Save verified Cloudinary photo to structured local disk directory
// Hierarchy: database foto / <BRANCH> / <WOK> / <NAMA PROYEK> / <JENIS ACTIVITY> / <MM_YYYY> / <FILENAME>
// Filename: <ACT_3>_<BRANCH_3>_<WOK_3>_<NAMA_PROYEK>_<DDMMYYYY>_<HHMMSS>.[ext]
const saveVerifiedPhotoToLocal = async (photoUrl, rawBranch, rawWok, rawProjectName, type, planDate) => {
  if (!photoUrl || !photoUrl.includes('res.cloudinary.com')) {
    return photoUrl; // Already local or empty
  }

  try {
    const branchFolder = sanitizeFolderName(rawBranch || 'UNKNOWN_BRANCH').toUpperCase();
    const wokFolder = sanitizeFolderName(rawWok || 'UNKNOWN_WOK').toUpperCase();
    const projectFolder = sanitizeFolderName(rawProjectName || 'UNKNOWN_PROJECT');
    const actLabel = getActivityLabel(type).toUpperCase();

    const d = planDate ? new Date(planDate) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;

    const year = validDate.getFullYear();
    const month = String(validDate.getMonth() + 1).padStart(2, '0');
    const day = String(validDate.getDate()).padStart(2, '0');

    const monthYear = `${month}_${year}`;       // e.g. 08_2026
    const ddmmyyyy = `${day}${month}${year}`;  // e.g. 07082026

    // Current time HHMMSS for verification timestamp
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const hhmmss = `${hh}${mm}${ss}`;          // e.g. 141414

    // 3-letter prefixes (uppercase)
    const act3 = actLabel.substring(0, 3).toUpperCase();
    const branch3 = branchFolder.substring(0, 3).toUpperCase();
    const wok3 = wokFolder.substring(0, 3).toUpperCase();

    // Directory: database foto / branch / WOK / project / activity / (Bulan_tahun)
    const targetDir = path.join(__dirname, 'database foto', branchFolder, wokFolder, projectFolder, actLabel, monthYear);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Determine extension from URL
    let ext = '.jpg';
    const matchExt = photoUrl.match(/\.(jpg|jpeg|png|webp)($|\?)/i);
    if (matchExt) {
      ext = `.${matchExt[1].toLowerCase()}`;
    }

    // File name format: TSE_PEK_BAT_ODP-123_07082026_141414.jpg
    const baseFileName = `${act3}_${branch3}_${wok3}_${projectFolder}_${ddmmyyyy}_${hhmmss}`;
    let fileName = `${baseFileName}${ext}`;
    let filePath = path.join(targetDir, fileName);

    // Handle collisions safely if verified at exact same second
    let counter = 1;
    while (fs.existsSync(filePath)) {
      fileName = `${baseFileName}_${counter}${ext}`;
      filePath = path.join(targetDir, fileName);
      counter++;
    }

    console.log(`📥 [Auto Local Download] Downloading verified photo from Cloudinary to: ${filePath}`);
    const imgBuffer = await downloadBuffer(photoUrl);
    fs.writeFileSync(filePath, imgBuffer);

    // Web-accessible URL path
    const localWebPath = `/database foto/${branchFolder}/${wokFolder}/${projectFolder}/${actLabel}/${monthYear}/${fileName}`;

    // Clean up temporary Cloudinary staging photo
    await deleteFromCloudinary(photoUrl).catch(err => console.error('Cloudinary cleanup warning:', err.message));

    return localWebPath;
  } catch (err) {
    console.error('❌ [Auto Local Download Error]:', err);
    return photoUrl; // Fallback to original URL on error
  }
};

app.use(cors());
app.use(express.json());

// Memory Storage for Photo Uploads (Staging ke Cloudinary sebelum terverifikasi)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Maksimal 10 MB per foto
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar (.jpg, .jpeg, .png, .webp) yang diperbolehkan!'));
    }
  }
});

// Serve /uploads & /database foto statically for frontend photo rendering (Dual Serving)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/database foto', express.static(path.join(__dirname, 'database foto')));
app.use('/database%20foto', express.static(path.join(__dirname, 'database foto')));

// Multer memory storage for Excel files (temp only)
const excelUpload = multer({ storage: multer.memoryStorage() });

// --- Authentication Middlewares ---

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Akses ditolak. Sesi tidak ditemukan.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ success: false, message: 'Sesi telah berakhir. Silakan login kembali.' });
    req.user = user;
    next();
  });
};

const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) req.user = null;
    else req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user && req.user.role === 'ADMIN') {
      next();
    } else {
      res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat melakukan tindakan ini.' });
    }
  });
};

// --- Auth Endpoints ---

// Register User Baru (khusus Admin â€” akun WOK sudah dibuat tetap, bukan self-signup)
app.post('/api/auth/register', requireAdmin, async (req, res) => {
  try {
    const { username, password, fullName, branchName } = req.body;
    if (!username || !password || !fullName || !branchName) {
      return res.status(400).json({ success: false, message: 'Semua kolom (username, password, nama, dan branch) wajib diisi.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan oleh akun lain.' });
    }

    const branch = await prisma.branch.findUnique({ where: { name: branchName } });
    if (!branch) {
      return res.status(400).json({ success: false, message: 'Branch yang dipilih tidak ditemukan dalam sistem.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        role: 'USER',
        branchId: branch.id
      },
      include: { branch: true }
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, branchName: branch.name, fullName: user.fullName },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, branchName: branch.name, fullName: user.fullName }
    });
  } catch (error) {
    console.error('Error in /api/auth/register:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan internal pada server saat registrasi.' });
  }
});

// Login User / Admin
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
    }

    const cleanUsername = username.toString().trim();
    const cleanPassword = password.toString().trim();

    let user = await prisma.user.findUnique({
      where: { username: cleanUsername },
      include: { branch: true }
    }).catch(() => null);

    if (!user) {
      user = await prisma.user.findFirst({
        where: { username: { equals: cleanUsername, mode: 'insensitive' } },
        include: { branch: true }
      }).catch(() => null);
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    const validPassword = await bcrypt.compare(cleanPassword, user.password).catch(() => false);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    const branchName = user.branch ? user.branch.name : null;
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, branchName, fullName: user.fullName },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, branchName, fullName: user.fullName }
    });
  } catch (error) {
    console.error('Error in /api/auth/login:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan internal saat login.' });
  }
});

// Reset / Forgot Password with credentials verification (Username, Nama Lengkap, Branch)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { username, fullName, branchName, newPassword } = req.body;
    if (!username || !fullName || !branchName || !newPassword) {
      return res.status(400).json({ success: false, message: 'Semua kolom (username, nama lengkap, branch, dan password baru) wajib diisi.' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Password baru minimal harus 4 karakter.' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { branch: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kredensial tidak cocok. Username tidak ditemukan.' });
    }

    // Verify Full Name
    if (user.fullName.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Kredensial tidak cocok. Nama Lengkap tidak sesuai dengan data akun.' });
    }

    // Verify Branch Name
    if (user.role === 'USER') {
      if (!user.branch || user.branch.name.trim().toLowerCase() !== branchName.trim().toLowerCase()) {
        return res.status(400).json({ success: false, message: 'Kredensial tidak cocok. Branch tidak sesuai dengan data akun.' });
      }
    } else if (user.role === 'ADMIN') {
      if (branchName.trim().toUpperCase() !== 'ADMIN' && branchName.trim().toLowerCase() !== (user.branch?.name || '').trim().toLowerCase()) {
        return res.status(400).json({ success: false, message: 'Kredensial tidak cocok. Branch tidak sesuai untuk akun Administrator.' });
      }
    }

    // Hash new password and update user in database
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    res.json({
      success: true,
      message: 'Password Anda telah berhasil diperbarui. Silakan login kembali dengan password baru Anda.'
    });
  } catch (error) {
    console.error('Error in /api/auth/reset-password:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat mereset password.' });
  }
});

// Verify session & get current user profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// --- Data Endpoints (Protected & Branch-Scoped) ---

// 1. Get All Data (Both ADMIN and USER get all branches for Dashboard view)
app.get('/api/data', optionalAuthenticateToken, async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      include: {
        projects: {
          include: {
            odps: true,
            activities: true,
            photos: {
              orderBy: { createdAt: 'asc' }
            }
          }
        }
      }
    });

    // Transform data to match what the frontend expects (Return all projects for Dashboard & typeDesign support)
    const formattedBranches = branches.map(b => ({
      name: b.name,
      occRate: b.occRate,   // Nilai OCC BRANCH langsung dari Excel (0.0 - 1.0)
      gapWoW: b.gapWoW,    // Nilai GAP WOW dari Excel
      projects: b.projects.map(p => {
        // Pre-kalkulasi total per proyek
        const usedTotal = p.odps.reduce((s, o) => s + o.used, 0);
        const avaiTotal = p.odps.reduce((s, o) => s + o.avai, 0);
        const totalPort = p.odps.reduce((s, o) => s + o.total, 0);
        const occRate = totalPort > 0 ? Math.round((usedTotal / totalPort) * 1000) / 10 : 0;
        const odpCount = p.odps.length;
        const isPriority = odpCount > 1 && occRate < 35;
        const typeDesign = p.typeDesign || 'Greenfield';

        const actTypes = ['tsel_menyapa', 'branding_outlet', 'bumdes', 'rekrutmen_sf', 'open_table'];
        const formattedActivities = actTypes.map(actKey => {
          let typePhotos = (p.photos || []).filter(ph => ph.type === actKey);
          const legacyAct = (p.activities || []).find(a => a.type === actKey);

          // Jika ada data di ProjectActivity tapi belum ada di ProjectActivityPhoto
          if (legacyAct && legacyAct.status && legacyAct.status !== 'belum' && (legacyAct.photoUrl || legacyAct.planDate || legacyAct.keterangan || legacyAct.kodeSf)) {
            if (typePhotos.length === 0) {
              typePhotos.push({
                id: legacyAct.id,
                type: actKey,
                status: legacyAct.status || 'upload',
                photoUrl: legacyAct.photoUrl,
                planDate: legacyAct.planDate,
                keterangan: legacyAct.keterangan,
                createdAt: legacyAct.createdAt || new Date()
              });
            }
          }

          // Cek keberadaan file fisik untuk foto lokal (/uploads/...)
          const validPhotos = typePhotos.map(ph => {
            let photoUrl = ph.photoUrl;
            let status = ph.status;
            if (photoUrl && photoUrl.startsWith('/uploads/')) {
              const localFilePath = path.join(__dirname, decodeURIComponent(photoUrl));
              if (!fs.existsSync(localFilePath)) {
                console.log(`⚠️ [File Checker] File foto lokal hilang dari disk untuk proyek "${p.name}" (${actKey}): ${photoUrl}`);
                photoUrl = null;
                status = 'belum';
              }
            }
            return { ...ph, photoUrl, status };
          }).filter(ph => ph.photoUrl || ph.planDate || ph.keterangan || ph.kodeSf || ph.namaOutlet);

          // Hitung overall status kegiatan
          let overallStatus = 'belum';
          if (validPhotos.some(ph => ph.status === 'upload')) {
            overallStatus = 'upload';
          } else if (validPhotos.some(ph => ph.status === 'verified')) {
            overallStatus = 'verified';
          }

          const latestPhoto = validPhotos[validPhotos.length - 1];

          return {
            id: legacyAct?.id || actKey,
            type: actKey,
            status: overallStatus,
            photos: validPhotos,
            photoUrl: latestPhoto?.photoUrl || null,
            planDate: latestPhoto?.planDate || null,
            namaOutlet: latestPhoto?.namaOutlet || null,
            kodeSf: latestPhoto?.kodeSf || latestPhoto?.keterangan || null,
            keterangan: latestPhoto?.keterangan || null
          };
        });

        return {
          name: p.name,
          branchName: b.name,
          wok: p.wok,
          typeDesign,
          isPriority,
          usedTotal,
          avaiTotal,
          totalPort,
          occRate,
          odpCount,
          odps: p.odps.map(o => {
            const coords = getOdpCoords(o.odp, b.name, o.lat, o.lon);
            const pct = o.total > 0 ? o.used / o.total : 0;
            const calcStatus = o.used === 0 ? 'BLACK' : pct < 0.25 ? 'GREEN' : pct < 0.50 ? 'YELLOW' : pct < 0.75 ? 'ORANGE' : 'RED';
            const occStatus = o.occStatus ? o.occStatus.toUpperCase() : calcStatus;

            return {
              odp: o.odp,
              avai: o.avai,
              used: o.used,
              total: o.total,
              lat: coords.lat,
              lon: coords.lon,
              occStatus: occStatus
            };
          }),
          activities: formattedActivities
        };
      })
    }));

    res.json(formattedBranches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// 1b. Get Import Metadata (Jateng DIY Summary for Dashboard KPI cards)
app.get('/api/import-meta', optionalAuthenticateToken, async (req, res) => {
  try {
    const meta = await prisma.importMeta.findUnique({
      where: { key: 'jateng_diy_summary' }
    });
    res.json(meta || {});
  } catch (error) {
    console.error(error);
    res.json({});
  }
});

// 2. Upload/Update Project Activity (Protected & Branch-Scoped — Cloudinary Staging)
app.post('/api/activities', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const { projectName, branchName, type, planDate, namaOutlet, kodeSf, keterangan } = req.body;
    console.log(`[Activity POST] project: ${projectName}, type: ${type}, namaOutlet: ${namaOutlet}, planDate: ${planDate}`);

    // Security Check: USER can only update their assigned branch
    if (req.user && req.user.role === 'USER' && req.user.branchName !== branchName) {
      return res.status(403).json({ error: `Akses ditolak. Anda hanya berhak memodifikasi data di branch ${req.user.branchName}.` });
    }

    // Find the Project by name + branch
    const branch = await prisma.branch.findUnique({ where: { name: branchName } });
    if (!branch) {
      return res.status(404).json({ error: 'Branch tidak ditemukan' });
    }

    const project = await prisma.project.findFirst({
      where: { name: projectName, branchId: branch.id }
    });

    if (!project) {
      return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    }

    // Cek apakah ada foto kegiatan sebelumnya yang masih berstatus 'upload' (menunggu verifikasi)
    const existingPending = await prisma.projectActivityPhoto.findFirst({
      where: {
        projectId: project.id,
        type: type,
        status: 'upload'
      }
    });

    if (existingPending) {
      return res.status(400).json({ error: 'Foto kegiatan sebelumnya masih menunggu verifikasi Admin. Anda hanya dapat menambahkan foto baru jika kegiatan sebelumnya telah terverifikasi.' });
    }

    // Validasi input wajib per kegiatan GTM
    if (type === 'branding_outlet') {
      if (!namaOutlet || !namaOutlet.trim() || !req.file) {
        return res.status(400).json({ error: 'Upload Branding Downline/Outlet wajib memasukkan Nama Outlet dan Foto bukti.' });
      }
    } else if (type === 'open_table' || type === 'tsel_menyapa') {
      if (!planDate || !req.file) {
        return res.status(400).json({ error: 'Upload kegiatan ini wajib memasukkan Tanggal dan Foto bukti.' });
      }
    } else if (type === 'bumdes') {
      if (!req.file) {
        return res.status(400).json({ error: 'Upload Kerjasama BUMDes wajib memasukkan Foto bukti.' });
      }
    } else if (type === 'rekrutmen_sf') {
      const sfVal = kodeSf || keterangan;
      if (!req.file && (!sfVal || !sfVal.trim())) {
        return res.status(400).json({ error: 'Rekrutmen SF AKAMSI wajib memasukkan setidaknya Kode SF atau Foto bukti.' });
      }
    }

    let photoUrl = null;
    if (req.file) {
      console.log('☁️ Uploading photo to Cloudinary staging...');
      const cldRes = await uploadToCloudinary(req.file.buffer, 'gtm_staging');
      photoUrl = cldRes.secure_url;
      console.log('✅ Cloudinary Staging URL:', photoUrl);
    }

    const effectiveKeterangan = keterangan || namaOutlet || kodeSf || null;
    const effectivePlanDate = planDate ? new Date(planDate) : null;

    // Simpan ke ProjectActivityPhoto
    const activityPhoto = await prisma.projectActivityPhoto.create({
      data: {
        projectId: project.id,
        type: type,
        status: 'upload',
        photoUrl: photoUrl,
        planDate: effectivePlanDate,
        namaOutlet: namaOutlet || null,
        kodeSf: kodeSf || keterangan || null,
        keterangan: effectiveKeterangan,
        userId: req.user?.id || undefined
      }
    });

    // Sinkronkan juga ke ProjectActivity
    await prisma.projectActivity.upsert({
      where: { projectId_type: { projectId: project.id, type: type } },
      update: {
        status: 'upload',
        photoUrl: photoUrl || undefined,
        planDate: effectivePlanDate || undefined,
        keterangan: effectiveKeterangan || undefined,
        userId: req.user?.id || undefined
      },
      create: {
        projectId: project.id,
        type: type,
        status: 'upload',
        photoUrl: photoUrl,
        planDate: effectivePlanDate,
        keterangan: effectiveKeterangan,
        userId: req.user?.id || undefined
      }
    });

    res.json({ success: true, activityPhoto });
  } catch (error) {
    console.error('Error saving activity:', error);
    res.status(500).json({ error: 'Gagal menyimpan kegiatan' });
  }
});

// Helper: Find Project robustly by projectId, exact name, or fuzzy name
async function findProjectHelper(body) {
  const { projectId, projectName, branchName } = body || {};

  // 1. By ID first if provided
  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId } }).catch(() => null);
    if (p) return p;
  }

  const cleanBName = (branchName || '').trim();
  const cleanPName = (projectName || '').trim();

  let branch = null;
  if (cleanBName) {
    branch = await prisma.branch.findUnique({ where: { name: cleanBName } }).catch(() => null);
    if (!branch) {
      branch = await prisma.branch.findFirst({
        where: { name: { equals: cleanBName, mode: 'insensitive' } }
      }).catch(() => null);
    }
  }

  // 2. By Branch ID + Name
  if (branch && cleanPName) {
    let p = await prisma.project.findFirst({
      where: { name: cleanPName, branchId: branch.id }
    }).catch(() => null);
    if (p) return p;

    p = await prisma.project.findFirst({
      where: { name: { equals: cleanPName, mode: 'insensitive' }, branchId: branch.id }
    }).catch(() => null);
    if (p) return p;
  }

  // 3. By Name alone
  if (cleanPName) {
    let p = await prisma.project.findFirst({
      where: { name: cleanPName }
    }).catch(() => null);
    if (p) return p;

    p = await prisma.project.findFirst({
      where: { name: { equals: cleanPName, mode: 'insensitive' } }
    }).catch(() => null);
    if (p) return p;

    // 4. Fuzzy match (strip symbols / punctuation differences)
    const simplified = cleanPName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (simplified) {
      const allProjects = await prisma.project.findMany({ select: { id: true, name: true, branchId: true } }).catch(() => []);
      const matched = allProjects.find(item => item.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === simplified);
      if (matched) {
        return await prisma.project.findUnique({ where: { id: matched.id } }).catch(() => null);
      }
    }
  }

  return null;
}

// 2b. Delete Activity Photo (Protected - Users & Admin)
app.post('/api/activities/delete-photo', authenticateToken, async (req, res) => {
  try {
    const { type, photoId } = req.body;
    const project = await findProjectHelper(req.body);
    if (!project) return res.status(404).json({ success: false, message: `Proyek "${req.body.projectName || req.body.projectId}" tidak ditemukan.` });

    // User Branch Access Check (Validate against project.branchId)
    if (req.user && req.user.role === 'USER' && req.user.branchName) {
      const userBranch = await prisma.branch.findFirst({
        where: { name: { equals: req.user.branchName, mode: 'insensitive' } }
      }).catch(() => null);

      if (userBranch && project.branchId !== userBranch.id) {
        return res.status(403).json({ success: false, message: `Akses ditolak. Anda hanya berhak memodifikasi data di branch ${req.user.branchName}.` });
      }
    }

    let targetPhoto = null;
    if (photoId && typeof photoId === 'string' && photoId.length > 15) {
      targetPhoto = await prisma.projectActivityPhoto.findUnique({ where: { id: photoId } }).catch(() => null);
    }
    if (!targetPhoto) {
      targetPhoto = await prisma.projectActivityPhoto.findFirst({
        where: { projectId: project.id, type: type },
        orderBy: { createdAt: 'desc' }
      }).catch(() => null);
    }

    if (targetPhoto) {
      if (targetPhoto.photoUrl) {
        if (targetPhoto.photoUrl.includes('res.cloudinary.com')) {
          await deleteFromCloudinary(targetPhoto.photoUrl).catch(err => console.error('Cloudinary error:', err.message));
        } else if (targetPhoto.photoUrl.startsWith('/uploads/') || targetPhoto.photoUrl.startsWith('/database foto/') || targetPhoto.photoUrl.startsWith('/database%20foto/')) {
          const localP = path.join(__dirname, decodeURIComponent(targetPhoto.photoUrl));
          if (fs.existsSync(localP)) {
            await fs.promises.unlink(localP).catch(err => console.error('Unlink error:', err.message));
          }
        }
      }
      await prisma.projectActivityPhoto.delete({ where: { id: targetPhoto.id } }).catch(() => null);
    }

    // Check remaining photos
    const remainingPhotos = await prisma.projectActivityPhoto.findMany({
      where: { projectId: project.id, type: type }
    }).catch(() => []);

    if (remainingPhotos.length > 0) {
      let newStatus = 'belum';
      if (remainingPhotos.some(p => p.status === 'upload')) {
        newStatus = 'upload';
      } else if (remainingPhotos.some(p => p.status === 'verified')) {
        newStatus = 'verified';
      }

      const latest = remainingPhotos[remainingPhotos.length - 1];
      await prisma.projectActivity.updateMany({
        where: { projectId: project.id, type: type },
        data: {
          status: newStatus,
          photoUrl: latest?.photoUrl || null,
          planDate: latest?.planDate || null,
          keterangan: latest?.keterangan || null
        }
      }).catch(() => null);
    } else {
      // Clear physical photo from ProjectActivity if legacy record
      const legacyAct = await prisma.projectActivity.findFirst({
        where: { projectId: project.id, type: type }
      }).catch(() => null);

      if (legacyAct && legacyAct.photoUrl) {
        if (legacyAct.photoUrl.includes('res.cloudinary.com')) {
          await deleteFromCloudinary(legacyAct.photoUrl).catch(err => console.error('Cloudinary error:', err.message));
        } else if (legacyAct.photoUrl.startsWith('/uploads/') || legacyAct.photoUrl.startsWith('/database foto/') || legacyAct.photoUrl.startsWith('/database%20foto/')) {
          const localP = path.join(__dirname, decodeURIComponent(legacyAct.photoUrl));
          if (fs.existsSync(localP)) {
            await fs.promises.unlink(localP).catch(err => console.error('Unlink error:', err.message));
          }
        }
      }

      await prisma.projectActivityPhoto.deleteMany({
        where: { projectId: project.id, type: type }
      }).catch(() => null);

      await prisma.projectActivity.updateMany({
        where: { projectId: project.id, type: type },
        data: {
          status: 'belum',
          photoUrl: null,
          planDate: null,
          keterangan: null
        }
      }).catch(() => null);
    }

    res.json({ success: true, message: 'Foto / kegiatan berhasil dihapus.' });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus foto kegiatan: ' + error.message });
  }
});

// 3a. Verify Project Activity Verification (Admin only)
app.post('/api/verify', requireAdmin, async (req, res) => {
  try {
    const { type, photoUrl: reqPhotoUrl, photoId } = req.body;
    const project = await findProjectHelper(req.body);
    if (!project) return res.status(404).json({ success: false, message: `Proyek "${req.body.projectName || req.body.projectId}" tidak ditemukan.` });

    let targetPhoto = null;
    if (photoId && typeof photoId === 'string' && photoId.length > 15) {
      targetPhoto = await prisma.projectActivityPhoto.findUnique({ where: { id: photoId } }).catch(() => null);
    }
    if (!targetPhoto) {
      targetPhoto = await prisma.projectActivityPhoto.findFirst({
        where: { projectId: project.id, type: type, status: 'upload' },
        orderBy: { createdAt: 'desc' }
      }).catch(() => null);
    }

    let finalPhotoUrl = reqPhotoUrl || targetPhoto?.photoUrl;

    // Automatically download verified photo from Cloudinary Staging to structured local disk directory
    if (targetPhoto && targetPhoto.photoUrl && targetPhoto.photoUrl.includes('res.cloudinary.com')) {
      const dateToUse = targetPhoto.planDate || targetPhoto.createdAt;
      const bObj = await prisma.branch.findUnique({ where: { id: project.branchId } }).catch(() => null);
      finalPhotoUrl = await saveVerifiedPhotoToLocal(
        targetPhoto.photoUrl,
        bObj?.name || req.body.branchName,
        project.wok,
        project.name,
        type,
        dateToUse
      );
    } else if (targetPhoto && targetPhoto.photoUrl && (targetPhoto.photoUrl.startsWith('/uploads/') || targetPhoto.photoUrl.startsWith('/database foto/') || targetPhoto.photoUrl.startsWith('/database%20foto/'))) {
      finalPhotoUrl = targetPhoto.photoUrl;
    }

    if (targetPhoto) {
      await prisma.projectActivityPhoto.update({
        where: { id: targetPhoto.id },
        data: {
          status: 'verified',
          photoUrl: finalPhotoUrl || targetPhoto.photoUrl
        }
      });
    }

    const remainingPending = await prisma.projectActivityPhoto.count({
      where: { projectId: project.id, type: type, status: 'upload' }
    });

    const newStatus = remainingPending > 0 ? 'upload' : 'verified';

    const activity = await prisma.projectActivity.upsert({
      where: { projectId_type: { projectId: project.id, type: type } },
      update: {
        status: newStatus,
        photoUrl: finalPhotoUrl || targetPhoto?.photoUrl || undefined
      },
      create: {
        projectId: project.id,
        type: type,
        status: newStatus,
        photoUrl: finalPhotoUrl || targetPhoto?.photoUrl || null
      }
    });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error verifying activity:', error);
    res.status(500).json({ success: false, message: 'Failed to verify activity: ' + error.message });
  }
});

// 3b. Reject Project Activity Verification (Admin only — deletes photo & resets status completely)
app.post('/api/reject', requireAdmin, async (req, res) => {
  try {
    const { type, photoId } = req.body;
    const project = await findProjectHelper(req.body);

    if (!project) {
      return res.status(404).json({ success: false, message: `Proyek "${req.body.projectName || req.body.projectId}" tidak ditemukan.` });
    }

    console.log(`🧹 [REJECT ACTION] Rejecting activity "${type}" for project "${project.name}" (ID: ${project.id})`);

    // 1. Collect all photo URLs to be physically deleted from Cloudinary / Disk
    const photosToDelete = new Set();

    if (photoId && typeof photoId === 'string' && photoId.length > 15) {
      const photoRec = await prisma.projectActivityPhoto.findUnique({ where: { id: photoId } }).catch(() => null);
      if (photoRec && photoRec.photoUrl) {
        photosToDelete.add(photoRec.photoUrl);
      }
    }

    const photosInDb = await prisma.projectActivityPhoto.findMany({
      where: { projectId: project.id, type: type }
    }).catch(() => []);

    for (const ph of photosInDb) {
      if (ph.photoUrl) photosToDelete.add(ph.photoUrl);
    }

    const legacyAct = await prisma.projectActivity.findFirst({
      where: { projectId: project.id, type: type }
    }).catch(() => null);

    if (legacyAct && legacyAct.photoUrl) {
      photosToDelete.add(legacyAct.photoUrl);
    }

    // 2. Physically delete all collected photo files
    for (const photoUrl of photosToDelete) {
      if (!photoUrl) continue;
      if (photoUrl.includes('res.cloudinary.com')) {
        console.log('🧹 [Reject] Destroying Cloudinary staging photo:', photoUrl);
        await deleteFromCloudinary(photoUrl).catch(err => console.error('Cloudinary cleanup warning:', err.message));
      } else if (photoUrl.startsWith('/uploads/') || photoUrl.startsWith('/database foto/') || photoUrl.startsWith('/database%20foto/')) {
        const localP = path.join(__dirname, decodeURIComponent(photoUrl));
        if (fs.existsSync(localP)) {
          console.log('🧹 [Reject] Unlinking local photo:', localP);
          await fs.promises.unlink(localP).catch(err => console.error('Unlink error:', err.message));
        }
      }
    }

    // 3. Delete ALL ProjectActivityPhoto records for this project & activity type
    await prisma.projectActivityPhoto.deleteMany({
      where: { projectId: project.id, type: type }
    }).catch(() => null);

    // 4. Completely reset ProjectActivity record to status 'belum' and clear all user input fields
    await prisma.projectActivity.upsert({
      where: { projectId_type: { projectId: project.id, type: type } },
      update: {
        status: 'belum',
        photoUrl: null,
        planDate: null,
        actualDate: null,
        keterangan: null,
        userId: null
      },
      create: {
        projectId: project.id,
        type: type,
        status: 'belum',
        photoUrl: null,
        planDate: null,
        actualDate: null,
        keterangan: null,
        userId: null
      }
    });

    console.log(`✅ [Reject Success] Project "${project.name}" (${type}) status reset to 'belum'`);
    res.json({ success: true, message: 'Verifikasi berhasil ditolak. Kegiatan dikembalikan ke status belum dikerjakan.' });
  } catch (error) {
    console.error('Error rejecting activity:', error);
    res.status(500).json({ success: false, message: 'Gagal menolak verifikasi activity: ' + error.message });
  }
});

// 3c. Reset All Activities (Admin only — resets all GTM activities to 0 / 'belum')
app.post('/api/admin/reset-activities', requireAdmin, async (req, res) => {
  try {
    const deletedPhotos = await prisma.projectActivityPhoto.deleteMany({});
    const deletedProjectActivities = await prisma.projectActivity.deleteMany({});
    const deletedActivities = await prisma.activity.deleteMany({});

    res.json({
      success: true,
      message: `Reset selesai. Semua data aktivitas GTM telah dikosongkan (${deletedPhotos.count} foto, ${deletedProjectActivities.count} aktivitas proyek).`,
      count: deletedProjectActivities.count
    });
  } catch (error) {
    console.error('Reset activities error:', error);
    res.status(500).json({ success: false, message: 'Gagal mereset data aktivitas GTM' });
  }
});

// 4. Import Excel (Admin only) — updates ODP data and creates Projects/Branches robustly & super fast
app.post('/api/admin/import-excel', requireAdmin, excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const startTime = Date.now();
    console.log('📦 Memulai import Excel dengan In-Memory Mapping & Batch Processing...');

    // ─── PETA & NORMALISASI WOK → BRANCH YANG BENAR (WOK menentukan Branch) ───
    function getCorrectBranchForWok(rawWok) {
      if (!rawWok) return null;
      const clean = rawWok.toString().trim().toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
      
      if (clean.includes('KEBUMEN')) return 'MAGELANG';
      if (clean.includes('MAGELANG') || clean.includes('TEMANGGUNG')) return 'MAGELANG';

      if (clean.includes('BATANG')) return 'PEKALONGAN';
      if (clean.includes('PEMALANG') || clean.includes('PURBALINGGA')) return 'PEKALONGAN';
      if (clean.includes('TEGAL') || clean.includes('BREBES')) return 'PEKALONGAN';

      if (clean.includes('CILACAP') || clean.includes('BANYUMAS')) return 'PURWOKERTO';
      if (clean.includes('WONOSOBO') || clean.includes('BANJARNEGARA')) return 'PURWOKERTO';

      if (clean.includes('DEMAK')) return 'SEMARANG';
      if (clean.includes('JEPARA') || clean.includes('KUDUS') || clean.includes('PATI')) return 'SEMARANG';
      if (clean.includes('SEMARANG')) return 'SEMARANG';

      if (clean.includes('BOYOLALI')) return 'SURAKARTA';
      if (clean.includes('SRAGEN')) return 'SURAKARTA';
      if (clean.includes('SURAKARTA') || clean.includes('SOLO')) return 'SURAKARTA';

      if (clean.includes('YOGYA') || clean.includes('JOGJA') || clean.includes('YOGYAKARTA') || clean.includes('DIY')) return 'YOGYAKARTA';

      return null;
    }

    // Read from buffer (memoryStorage)
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    
    let totalRowsProcessed = 0;
    let projectsCreated = 0;
    let odpsUnchanged = 0;
    let wokBranchCorrections = 0;
    const branchesFound = new Set();
    const seenOdpKeysInCurrentImport = new Set();

    // ─── 1. IN-MEMORY MAPPING (Load semua data dari DB ke RAM sekaligus) ───
    const allDbBranches = await prisma.branch.findMany();
    const branchMap = new Map(); // uppercase name -> branch object
    for (const b of allDbBranches) {
      branchMap.set(b.name.toUpperCase(), b);
    }

    const allProjects = await prisma.project.findMany({
      include: { odps: true }
    });
    const projectMap = new Map(); // `${branchId}||${projectName.toUpperCase()}` -> project object
    const odpMap = new Map(); // odpName.toUpperCase() -> odp object

    for (const p of allProjects) {
      projectMap.set(`${p.branchId}||${p.name.toUpperCase()}`, p);
      for (const o of p.odps) {
        odpMap.set(o.odp.toUpperCase(), o);
      }
    }

    const projectsToCreate = [];
    const odpsToCreate = [];
    const odpsToUpdate = [];

    // Storage untuk nilai OCC BRANCH dan GAP WOW per branch dari Excel
    const branchOccFromExcel = {}; // branchName -> { occRate, gapWoW } (first occurrence)
    let jatengDiySummary = null; // Baris summary "Jateng DIY"

    // ─── 2. PROCESS ROWS IN RAM (Sangat cepat & 100% akurat) ───
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // Convert to 2D array to find the true header row (ignoring titles)
      const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      let headerRowIndex = 0;
      let headers = [];
      
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const rowStrings = (rawData[i] || []).map(c => c ? c.toString().trim().toUpperCase() : '');
        if (rowStrings.some(c => c.includes('PROJECT') || c.includes('PROYEK') || c.includes('BRANCH') || c.includes('CABANG'))) {
          headerRowIndex = i;
          headers = rowStrings;
          break;
        }
      }

      if (headers.length === 0) continue; // Skip sheet if no valid headers found

      // Build dynamic column index map
      const colMap = {};
      headers.forEach((h, idx) => { if (h) colMap[h] = idx; });

      // Map rows based on the detected headers
      const data = [];
      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const rowObj = {};
        let hasData = false;
        for (let j = 0; j < headers.length; j++) {
          if (headers[j]) {
            rowObj[headers[j]] = rawData[i][j];
            if (rawData[i][j] !== undefined && rawData[i][j] !== null && rawData[i][j] !== '') hasData = true;
          }
        }
        if (hasData) data.push(rowObj);
      }

      for (const row of data) {
        // Headers are already normalized (uppercase & trimmed)
        const normRow = row;

        // Helper untuk mencari kolom dengan pencarian kata kunci yang fleksibel
        const findValue = (rowObj, possibleKeys, substringKeywords) => {
          for (const key of possibleKeys) {
            if (rowObj[key] !== undefined && rowObj[key] !== null) return rowObj[key];
          }
          if (substringKeywords) {
            for (const [key, val] of Object.entries(rowObj)) {
              for (const kw of substringKeywords) {
                if (key.includes(kw) && val !== undefined && val !== null) return val;
              }
            }
          }
          return undefined;
        };

        const rawBranch = findValue(normRow, ['TELKOMSEL BRANCH', 'TELKOMSEL', 'BRANCH', 'CABANG', 'NAMA BRANCH', 'NAMA CABANG', 'AREA'], ['BRANCH', 'CABANG', 'TELKOMSEL']) || '';
        const rawProject = findValue(normRow, ['NAMA PROYEK', 'PROJECT', 'PROYEK', 'NAMA PROJECT', 'ID PROJECT'], ['PROJECT', 'PROYEK']) || '';
        const rawWok = findValue(normRow, ['BWOK', 'WOK', 'WILAYAH', 'KOTA'], ['WOK', 'WILAYAH', 'BWOK']) || '-';
        const rawTypeDesign = findValue(normRow, ['TYPE DESIGN', 'DESIGN TYPE', 'TYPE', 'GREENFIELD/BROWNFIELD', 'GREENFIELD / BROWNFIELD', 'DESIGN'], ['DESIGN', 'GREENFIELD', 'BROWNFIELD']);
        
        let typeDesign = 'Greenfield';
        if (rawTypeDesign) {
          const strVal = rawTypeDesign.toString().toUpperCase();
          if (strVal.includes('BROWN')) typeDesign = 'Brownfield';
          else if (strVal.includes('GREEN')) typeDesign = 'Greenfield';
        }
        
        const rawStatus = findValue(normRow, ['OCC 2', 'STATUS ODP', 'OCC STATUS', 'WARNA ODP', 'COLOR', 'WARNA'], ['WARNA', 'OCC 2']);
        let excelOccStatus = null;
        if (rawStatus) {
          const strS = rawStatus.toString().toUpperCase();
          if (strS.includes('BLACK') || strS.includes('HITAM')) excelOccStatus = 'BLACK';
          else if (strS.includes('GREEN') || strS.includes('HIJAU')) excelOccStatus = 'GREEN';
          else if (strS.includes('YELLOW') || strS.includes('KUNING')) excelOccStatus = 'YELLOW';
          else if (strS.includes('ORANGE') || strS.includes('JINGGA')) excelOccStatus = 'ORANGE';
          else if (strS.includes('RED') || strS.includes('MERAH')) excelOccStatus = 'RED';
        }

        const rawLatVal = findValue(normRow, ['LATITUDE', 'LAT', 'KORDINAT LAT', 'Y'], ['LATITUDE', 'LAT']);
        const rawLonVal = findValue(normRow, ['LONGITUDE', 'LON', 'LONG', 'KORDINAT LON', 'X'], ['LONGITUDE', 'LON', 'LONG']);
        const parsedLat = parseFloat(rawLatVal);
        const parsedLon = parseFloat(rawLonVal);
        const hasExplicitCoords = !isNaN(parsedLat) && !isNaN(parsedLon);

        const rawOdp = findValue(normRow, ['ODP NAME', 'ID ODP', 'NAMA ODP', 'ODP ID'], ['ODP NAME', 'ID ODP']);
        const jumlahOdp = parseInt(findValue(normRow, ['JUMLAH ODP', 'ODP COUNT', 'TOTAL ODP'], ['JUMLAH ODP']) || 1) || 1;

        const total = parseInt(findValue(normRow, ['PORT', 'TOTAL PORT', 'IS TOTALIUM', 'TOTALIUM', 'TOTAL', 'KAPASITAS'], ['TOTAL']) || 0) || 0;
        const used = parseInt(findValue(normRow, ['USED', 'USED IUM', 'TERPAKAI', 'PORT USED'], ['USED', 'TERPAKAI']) || 0) || 0;
        
        const avaiVal = findValue(normRow, ['AVAI IUM', 'AVAI', 'AVAILABLE', 'TERSEDIA', 'PORT AVAI'], ['AVAI', 'AVAILABLE']);
        // FIX: Hapus Math.max(0,...) — ODP over-subscribed (used > total) boleh punya avai negatif, sesuai Excel
        // Jika kolom AVAI ada → pakai langsung (termasuk nilai negatif seperti -7, -1)
        // Jika kolom AVAI tidak ada → hitung total - used (TANPA Math.max agar nilai negatif tidak di-clamp ke 0)
        const avai = (avaiVal !== undefined && avaiVal !== null) ? (parseInt(avaiVal) || 0) : (total - used);


        // Ambil OCC BRANCH dan GAP WOW dari kolom Excel
        const rawOccBranch = findValue(normRow, ['OCC BRANCH'], ['OCC BRANCH']);
        const rawGapWoW = findValue(normRow, ['GAP WOW', 'GAP WOW '], ['GAP WOW']);

        if (!rawBranch) continue;

        // ─── TANGKAP BARIS SUMMARY "JATENG DIY" ───
        if (rawBranch.toString().trim().toUpperCase().includes('JATENG') || rawBranch.toString().trim().toUpperCase() === 'JATENG DIY') {
          jatengDiySummary = {
            occRate: parseFloat(rawOccBranch) || null,
            available: parseInt(avaiVal) || null,
            used: parseInt(findValue(normRow, ['USED'], ['USED'])) || null,
            total: parseInt(findValue(normRow, ['TOTAL'], ['TOTAL'])) || null,
            gapWoW: parseFloat(rawGapWoW) || null,
          };
          console.log('📊 Jateng DIY Summary Row ditemukan:', jatengDiySummary);
          continue;
        }

        if (!rawProject) continue;

        // ─── WOK-BASED BRANCH CORRECTION ───
        // Prioritas: WOK menentukan Branch yang benar
        const wokNameUpper = rawWok.toString().trim().toUpperCase();
        let branchName = rawBranch.toString().trim().toUpperCase();
        
        // Alias normalisasi branch name
        if (branchName === 'JOGJA' || branchName === 'YOGYA' || branchName === 'DIY') branchName = 'YOGYAKARTA';
        if (branchName === 'SOLO') branchName = 'SURAKARTA';
        if (branchName === 'PWK') branchName = 'PURWOKERTO';
        if (branchName === 'PKL') branchName = 'PEKALONGAN';
        if (branchName === 'SMG') branchName = 'SEMARANG';
        if (branchName === 'MGL') branchName = 'MAGELANG';

        // Koreksi Branch berdasarkan WOK (fleksibel untuk Yogya 2, Yogya2, dll.)
        const correctBranch = getCorrectBranchForWok(rawWok);
        if (correctBranch && correctBranch !== branchName) {
          console.log(`🔧 WOK Correction: "${rawOdp || rawProject}" Branch ${branchName} → ${correctBranch} (WOK: ${wokNameUpper})`);
          branchName = correctBranch;
          wokBranchCorrections++;
        }

        // Simpan OCC BRANCH dan GAP WOW per Branch ORIGINAL dari Excel (sebelum WOK correction)
        const originalBranchForOcc = rawBranch.toString().trim().toUpperCase();
        let normalizedOriginalBranch = originalBranchForOcc;
        if (normalizedOriginalBranch === 'JOGJA' || normalizedOriginalBranch === 'YOGYA' || normalizedOriginalBranch === 'DIY') normalizedOriginalBranch = 'YOGYAKARTA';
        if (normalizedOriginalBranch === 'SOLO') normalizedOriginalBranch = 'SURAKARTA';
        if (normalizedOriginalBranch === 'PWK') normalizedOriginalBranch = 'PURWOKERTO';
        if (normalizedOriginalBranch === 'PKL') normalizedOriginalBranch = 'PEKALONGAN';
        if (normalizedOriginalBranch === 'SMG') normalizedOriginalBranch = 'SEMARANG';
        if (normalizedOriginalBranch === 'MGL') normalizedOriginalBranch = 'MAGELANG';
        
        if (rawOccBranch !== undefined && rawOccBranch !== null && rawOccBranch !== '') {
          if (!branchOccFromExcel[normalizedOriginalBranch]) {
            branchOccFromExcel[normalizedOriginalBranch] = {
              occRate: parseFloat(rawOccBranch) || 0,
              gapWoW: parseFloat(rawGapWoW) || 0,
            };
          }
        }
        if (rawGapWoW !== undefined && rawGapWoW !== null && rawGapWoW !== '') {
          if (!branchOccFromExcel[normalizedOriginalBranch]) {
            branchOccFromExcel[normalizedOriginalBranch] = {
              occRate: parseFloat(rawOccBranch) || 0,
              gapWoW: parseFloat(rawGapWoW) || 0,
            };
          } else if (!branchOccFromExcel[normalizedOriginalBranch].gapWoW) {
            branchOccFromExcel[normalizedOriginalBranch].gapWoW = parseFloat(rawGapWoW) || 0;
          }
        }

        // Get or create branch
        let branch = branchMap.get(branchName);
        if (!branch) {
          branch = await prisma.branch.upsert({
            where: { name: branchName },
            update: {},
            create: { name: branchName }
          });
          branchMap.set(branchName, branch);
        }

        // Find or create Project
        let projectName = rawProject.toString().trim();
        const wokName = rawWok.toString().trim();

        const projectKey = `${branch.id}||${projectName.toUpperCase()}`;
        let project = projectMap.get(projectKey);

        if (!project) {
          const newProjectId = crypto.randomUUID();
          project = {
            id: newProjectId,
            name: projectName,
            wok: wokName,
            typeDesign: typeDesign,
            branchId: branch.id
          };
          projectsToCreate.push(project);
          projectMap.set(projectKey, project);
          projectsCreated++;
        }

        // Processing ODPs (Either explicit ODP Name or Synthetic ODPs based on Jumlah ODP)
        const countToCreate = rawOdp ? 1 : Math.max(1, jumlahOdp);
        const baseSubTotal = Math.floor(total / countToCreate);
        const baseSubUsed = Math.floor(used / countToCreate);
        // FIX: Split avai dari Excel secara proporsional, bukan recalculate sebagai total-used
        const baseSubAvai = Math.floor(avai / countToCreate);

        let remainingTotal = total;
        let remainingUsed = used;
        let remainingAvai = avai;

        for (let i = 1; i <= countToCreate; i++) {
          let rawOdpStr = rawOdp ? rawOdp.toString().trim() : '';
          let odpName = rawOdpStr 
            ? rawOdpStr 
            : `${projectName}-${wokName !== '-' ? wokName : 'WOK'}-${totalRowsProcessed + 1}-${i}`;
          
          let cleanOdpKey = odpName.toUpperCase();

          // Jika nama ODP ini sudah pernah diproses di baris sebelumnya dalam file Excel yang sama (duplikat nama ODP):
          // Tambahkan suffix unik (#row) agar data port dari kedua baris tersebut TIDAK saling tertimpa
          if (rawOdpStr && seenOdpKeysInCurrentImport.has(cleanOdpKey)) {
            odpName = `${rawOdpStr} (#${totalRowsProcessed + 1})`;
            cleanOdpKey = odpName.toUpperCase();
          }
          seenOdpKeysInCurrentImport.add(cleanOdpKey);

          let subTotal = baseSubTotal;
          let subUsed = baseSubUsed;
          let subAvai = baseSubAvai;
          
          // ODP terakhir mendapat sisa pembagian agar total presisi
          if (i === countToCreate) {
            subTotal = remainingTotal;
            subUsed = remainingUsed;
            subAvai = remainingAvai; // FIX: gunakan sisa avai dari Excel, bukan recalculate
          } else {
            remainingTotal -= subTotal;
            remainingUsed -= subUsed;
            remainingAvai -= baseSubAvai;
          }

          const existingOdp = odpMap.get(cleanOdpKey);
          const coords = hasExplicitCoords 
            ? { lat: parsedLat, lon: parsedLon }
            : getOdpCoords(odpName, branch.name, null, null);

          if (existingOdp) {
            if (existingOdp.id && existingOdp.id.startsWith('temp-')) {
              const target = odpsToCreate.find(item => item.odp.toUpperCase() === cleanOdpKey);
              if (target) {
                target.avai = subAvai;
                target.used = subUsed;
                target.total = subTotal;
                target.projectId = project.id;
                if (hasExplicitCoords) {
                  target.lat = parsedLat;
                  target.lon = parsedLon;
                }
                if (excelOccStatus) target.occStatus = excelOccStatus;
              }
            } else if (
              existingOdp.avai !== subAvai ||
              existingOdp.used !== subUsed ||
              existingOdp.total !== subTotal ||
              existingOdp.projectId !== project.id
            ) {
              const updatePayload = {
                id: existingOdp.id,
                odp: odpName,
                avai: subAvai,
                used: subUsed,
                total: subTotal,
                projectId: project.id
              };
              if (hasExplicitCoords) {
                updatePayload.lat = parsedLat;
                updatePayload.lon = parsedLon;
              }
              if (excelOccStatus) updatePayload.occStatus = excelOccStatus;

              odpsToUpdate.push(updatePayload);
              existingOdp.avai = subAvai;
              existingOdp.used = subUsed;
              existingOdp.total = subTotal;
              existingOdp.projectId = project.id;
              if (hasExplicitCoords) {
                existingOdp.lat = parsedLat;
                existingOdp.lon = parsedLon;
              }
              if (excelOccStatus) existingOdp.occStatus = excelOccStatus;
            } else {
              odpsUnchanged++;
            }
          } else {
            odpsToCreate.push({
              odp: odpName,
              avai: subAvai,
              used: subUsed,
              total: subTotal,
              lat: coords.lat,
              lon: coords.lon,
              occStatus: excelOccStatus || 'GREEN',
              projectId: project.id
            });
            odpMap.set(cleanOdpKey, {
              id: 'temp-' + odpsToCreate.length,
              odp: odpName,
              avai: subAvai,
              used: subUsed,
              total: subTotal,
              lat: coords.lat,
              lon: coords.lon,
              projectId: project.id
            });
          }
        }

        totalRowsProcessed++;
        branchesFound.add(branch.name);
      }
    }

    // â”€â”€â”€ 3. BATCH EXECUTION (Kirim ke DB sekaligus dengan aman) â”€â”€â”€
    console.log(`âš¡ RAM Processing selesai. Menyiapkan Batch DB: ${projectsToCreate.length} project, ${odpsToCreate.length} ODP baru, ${odpsToUpdate.length} update. WOK corrections: ${wokBranchCorrections}.`);

    // Batch Insert Project Baru
    if (projectsToCreate.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < projectsToCreate.length; i += BATCH_SIZE) {
        const batch = projectsToCreate.slice(i, i + BATCH_SIZE);
        await prisma.project.createMany({
          data: batch,
          skipDuplicates: true
        });
      }
    }

    // Batch Insert ODP Baru (dalam grup 500 baris)
    if (odpsToCreate.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < odpsToCreate.length; i += BATCH_SIZE) {
        const batch = odpsToCreate.slice(i, i + BATCH_SIZE);
        await prisma.odp.createMany({
          data: batch,
          skipDuplicates: true
        });
      }
    }

    // Batch Update ODP yang Berubah (diproses paralel 50 request serentak)
    if (odpsToUpdate.length > 0) {
      const CONCURRENCY = 50;
      for (let i = 0; i < odpsToUpdate.length; i += CONCURRENCY) {
        const chunk = odpsToUpdate.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(item => 
            prisma.odp.update({
              where: { id: item.id },
              data: {
                avai: item.avai,
                used: item.used,
                total: item.total,
                projectId: item.projectId,
                ...(item.lat !== undefined ? { lat: item.lat, lon: item.lon } : {}),
                ...(item.occStatus ? { occStatus: item.occStatus } : {})
              }
            }).catch(err => console.error(`Gagal update ODP ${item.odp}:`, err.message))
          )
        );
      }
    }

    // ——— 4. STALE ODP CLEANUP (Hapus ODP lama yang tidak ada di file update baru agar statistik 100% presisi) ———
    // FIX: Gunakan seenOdpKeysInCurrentImport — berisi TEPAT semua ODP yang dibaca dari file Excel terbaru.
    const processedOdpNames = seenOdpKeysInCurrentImport;
    const allDbOdps = await prisma.odp.findMany({ select: { id: true, odp: true } });
    const staleOdpIds = allDbOdps
      .filter(o => !processedOdpNames.has(o.odp.toUpperCase()))
      .map(o => o.id);

    if (staleOdpIds.length > 0) {
      console.log(`🧹 Membersihkan ${staleOdpIds.length} ODP lama yang tidak ada di file Excel terbaru...`);
      for (let i = 0; i < staleOdpIds.length; i += 500) {
        await prisma.odp.deleteMany({
          where: { id: { in: staleOdpIds.slice(i, i + 500) } }
        });
      }
    }

    // Hapus proyek kosong tanpa ODP
    await prisma.project.deleteMany({
      where: { odps: { none: {} } }
    });

    // ─── 5. SIMPAN NILAI OCC BRANCH & GAP WOW PER BRANCH KE DATABASE ───
    console.log('📊 Menyimpan OCC BRANCH & GAP WOW per branch...');
    // Baseline raw gap dari Minggu Pertama (27 Juli) untuk pembandingan jika prevGap belum ada
    const BASELINE_RAW_GAP_MAP = {
      MAGELANG: -0.0564,
      PEKALONGAN: -0.0923,
      PURWOKERTO: -0.0704,
      SEMARANG: -0.0792,
      SURAKARTA: -0.0808,
      YOGYAKARTA: -0.0656
    };

    const allBranchesInDb = await prisma.branch.findMany();
    for (const b of allBranchesInDb) {
      const bUpper = b.name.toUpperCase();
      const excelVals = branchOccFromExcel[bUpper];

      const finalOccRate = (excelVals && excelVals.occRate !== undefined && excelVals.occRate !== null && excelVals.occRate !== 0)
        ? excelVals.occRate
        : b.occRate;

      // Ambil nilai raw GAP WOW dari file Excel yang baru saja di-upload
      const newRawGap = (excelVals && excelVals.gapWoW !== undefined && excelVals.gapWoW !== null && excelVals.gapWoW !== 0)
        ? excelVals.gapWoW
        : null;

      let finalGapWoWDelta = b.gapWoW; // Fallback jika tidak ada gap di excel

      if (newRawGap !== null) {
        // Ambil nilai baseline minggu sebelumnya (dari BASELINE_RAW_GAP_MAP)
        const prevRawGap = BASELINE_RAW_GAP_MAP[bUpper] !== undefined ? BASELINE_RAW_GAP_MAP[bUpper] : 0;
        
        // Hitung selisih tren WoW: (Gap Minggu Terbaru) - (Gap Minggu Lalu)
        finalGapWoWDelta = newRawGap - prevRawGap;
      }

      await prisma.branch.update({
        where: { id: b.id },
        data: {
          occRate: finalOccRate,
          gapWoW: finalGapWoWDelta,
        }
      });
      console.log(`  ${bUpper}: OCC=${finalOccRate ? (finalOccRate * 100).toFixed(1) + '%' : 'N/A'} GAP_DELTA=${finalGapWoWDelta !== null ? (finalGapWoWDelta * 100).toFixed(2) + '%' : '0%'}`);
    }

    // ─── 6. SIMPAN SUMMARY JATENG DIY KE ImportMeta ───
    if (jatengDiySummary) {
      const BASELINE_JATENG_GAP = -0.0760; // Baseline Minggu 1 Jateng DIY (-7.60%)
      const newJatengGap = jatengDiySummary.gapWoW;
      const jatengGapDelta = newJatengGap !== null ? (newJatengGap - BASELINE_JATENG_GAP) : null;

      await prisma.importMeta.upsert({
        where: { key: 'jateng_diy_summary' },
        update: {
          occRate: jatengDiySummary.occRate,
          available: jatengDiySummary.available,
          used: jatengDiySummary.used,
          total: jatengDiySummary.total,
          gapWoW: jatengDiySummary.gapWoW,
        },
        create: {
          key: 'jateng_diy_summary',
          occRate: jatengDiySummary.occRate,
          available: jatengDiySummary.available,
          used: jatengDiySummary.used,
          total: jatengDiySummary.total,
          gapWoW: jatengDiySummary.gapWoW,
        }
      });
      console.log('ðŸ“Š Jateng DIY Summary disimpan ke ImportMeta.');
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`âœ… Excel Import selesai dalam ${durationSec} detik! (Processed ${totalRowsProcessed} rows across ${branchesFound.size} branches, ${wokBranchCorrections} WOK corrections)`);

    res.json({ 
      success: true, 
      message: `Database berhasil diperbarui dalam ${durationSec} detik! (${totalRowsProcessed} baris diproses: ${odpsToCreate.length} baru, ${odpsToUpdate.length} diperbarui, ${staleOdpIds.length} dibersihkan, ${wokBranchCorrections} WOK -> Branch dikoreksi)`,
      stats: {
        durationSec,
        rows: totalRowsProcessed,
        projectsCreated,
        odpsCreated: odpsToCreate.length,
        odpsUpdated: odpsToUpdate.length,
        odpsRemoved: staleOdpIds.length,
        odpsUnchanged,
        wokBranchCorrections,
        branches: Array.from(branchesFound)
      }
    });
  } catch (error) {
    console.error('Excel Import Error:', error);
    res.status(500).json({ error: 'Failed to import Excel data: ' + error.message });
  }
});



// --- Serve Static React App & SPA Fallback for Single Deploy ---
const staticPath = path.join(__dirname, '../gtm-monitor-react/dist');
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
  app.use((req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

