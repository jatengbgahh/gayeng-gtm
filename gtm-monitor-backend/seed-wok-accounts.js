const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const WOK_ACCOUNTS = [
  { username: 'batang', fullName: 'WOK Batang', branchName: 'PEKALONGAN', password: 'pasbatang123' },
  { username: 'boyolali', fullName: 'WOK Boyolali', branchName: 'SURAKARTA', password: 'pasboyolali123' },
  { username: 'cilacapbanyumas', fullName: 'WOK Cilacap Banyumas', branchName: 'PURWOKERTO', password: 'pascilacapbanyumas123' },
  { username: 'demak', fullName: 'WOK Demak', branchName: 'SEMARANG', password: 'pasdemak123' },
  { username: 'jeparakuduspati', fullName: 'WOK Jepara Kudus - Pati', branchName: 'SEMARANG', password: 'pasjeparakuduspati123' },
  { username: 'kebumen', fullName: 'WOK Kebumen', branchName: 'MAGELANG', password: 'paskebumen123' },
  { username: 'magelangtemanggung', fullName: 'WOK Magelang Temanggung', branchName: 'MAGELANG', password: 'pasmagelangtemanggung123' },
  { username: 'pemalangpurbalingga', fullName: 'WOK Pemalang Purbalingga', branchName: 'PEKALONGAN', password: 'paspemalangpurbalingga123' },
  { username: 'semarang1', fullName: 'WOK Semarang 1', branchName: 'SEMARANG', password: 'passemarang1123' },
  { username: 'semarang2', fullName: 'WOK Semarang 2', branchName: 'SEMARANG', password: 'passemarang2123' },
  { username: 'sragen', fullName: 'WOK Sragen', branchName: 'SURAKARTA', password: 'passragen123' },
  { username: 'surakarta', fullName: 'WOK Surakarta', branchName: 'SURAKARTA', password: 'passurakarta123' },
  { username: 'tegalbrebes', fullName: 'WOK Tegal Brebes', branchName: 'PEKALONGAN', password: 'pastegalbrebes123' },
  { username: 'wonosobobanjarnegara', fullName: 'WOK Wonosobo Banjarnegara', branchName: 'PURWOKERTO', password: 'paswonosobobanjarnegara123' },
  { username: 'yogya1', fullName: 'WOK Yogya 1', branchName: 'YOGYAKARTA', password: 'pasyogya1123' },
  { username: 'yogya2', fullName: 'WOK Yogya 2', branchName: 'YOGYAKARTA', password: 'pasyogya2123' },
];

async function seed() {
  console.log('🔒 Update & Seed Kredensial 16 Akun WOK User + Admin...\n');

  // 1. Update Akun Admin Jateng
  const adminPassword = await bcrypt.hash('Jatenggayeng123*', 10);
  await prisma.user.upsert({
    where: { username: 'jateng' },
    update: {
      password: adminPassword,
      fullName: 'Administrator Pusat GTM',
      role: 'ADMIN',
      branchId: null,
    },
    create: {
      username: 'jateng',
      password: adminPassword,
      fullName: 'Administrator Pusat GTM',
      role: 'ADMIN',
      branchId: null,
    },
  });
  console.log('✅ Admin: jateng -> Jatenggayeng123*');

  // 2. Update 16 Akun WOK User
  for (const account of WOK_ACCOUNTS) {
    const branch = await prisma.branch.findFirst({
      where: { name: { equals: account.branchName, mode: 'insensitive' } }
    });

    if (!branch) {
      console.error(`❌ Branch "${account.branchName}" tidak ditemukan untuk "${account.username}".`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(account.password, 10);

    await prisma.user.upsert({
      where: { username: account.username },
      update: {
        password: hashedPassword,
        fullName: account.fullName,
        role: 'USER',
        branchId: branch.id,
      },
      create: {
        username: account.username,
        password: hashedPassword,
        fullName: account.fullName,
        role: 'USER',
        branchId: branch.id,
      },
    });

    console.log(`✅ User: ${account.username.padEnd(20)} -> ${account.branchName.padEnd(12)} (password: ${account.password})`);
  }

  console.log('\n🎉 Seluruh 17 Akun (1 Admin + 16 WOK User) Berhasil Diperbarui!');
}

seed()
  .catch((error) => {
    console.error('❌ Error during seeding:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
