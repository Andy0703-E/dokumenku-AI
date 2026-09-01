# Dokumenku AI

Pembuat empat dokumen proyek secara streaming: `PRD.md`, `TECH-STACK.md`, `UI-UX.md`, dan `SCHEMA.md`.

## Menjalankan aplikasi

1. Salin `.env.example` menjadi `.env.local`.
2. Isi `BANDELBANGET_API_KEY` (provider utama), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, dan `APP_SESSION_SECRET`.
   Untuk gateway cadangan, tambahkan `INVIBUILDER_API_KEY`. Endpoint bawaan memakai
   `https://api.invibuilder.com/api/v1`; ubah hanya bila Anda memang memakai endpoint lain.
   Gunakan `AI_PROVIDER_STRATEGY=balanced` bila dua provider aktif dan Anda ingin
   membagi generasi baru secara stabil. Tanpa nilai itu, sistem memakai failover aman.
3. Jalankan `npm run dev`.

Pengguna membuat akun dengan email dan kata sandi sendiri. Panel `/admin` memakai kata sandi admin dari `ADMIN_PASSWORD`; tidak ada integrasi login atau hosting pihak ketiga.

Data akun, kredit, serta riwayat pembuatan dokumen disimpan secara lokal di `data/dokumenku.sqlite`. Untuk produksi, arahkan `DATABASE_PATH` ke penyimpanan persisten pada server Anda.
