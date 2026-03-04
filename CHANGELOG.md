# Changelog

Semua perubahan penting project dicatat di file ini.

## [Unreleased] - 2026-03-04
Perubahan terbaru (belum di-commit) pada working tree.

### Added
- Modul baru `materials` ditambahkan.
- Modul baru `ai-jobs` ditambahkan.
- Migrasi Prisma baru:
  - `20260304090000_add_materials_ai_jobs`
  - `20260304163000_sync_ai_status_enum`

### Changed
- Swagger docs diperkaya agar lebih siap pakai (deskripsi, contoh request/response, helper UI).
- README diperbarui besar-besaran untuk onboarding, cara run, dan alur Swagger.
- Contoh request auth disesuaikan dengan akun seed agar langsung bisa testing.
- Konfigurasi env dan dependensi ikut diperbarui mengikuti modul/fitur baru.

## [0bd8f60] - 2026-03-04
`fix: auto-init dev database after docker up`

### Fixed
- Inisialisasi database dev otomatis dijalankan setelah `docker up`.

### Changed
- Update skrip docker/dev di `package.json`.
- Update dokumentasi penggunaan di `README.md`.

## [ba3a322] - 2026-03-04
`upd: swagger desc`

### Changed
- Perbaikan deskripsi Swagger di `src/swagger.ts`.
