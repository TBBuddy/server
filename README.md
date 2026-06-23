# TBuddy Backend

NestJS 11 REST API untuk foundation F00 dan Authentication/User F01.

## Menjalankan project

Prasyarat:

- Node.js 20 atau lebih baru.
- MongoDB yang dapat diakses melalui `MONGODB_CONNECTION`.
- MongoDB replica set atau mongos karena onboarding, check-in, stok, dan
  penutupan episode memakai transaction.
- Redis pada `127.0.0.1:6379`. SSH tunnel dapat digunakan selama port lokal tersebut meneruskan koneksi ke Redis server.

```bash
npm install
copy .env.example .env
npm run start:dev
```

Endpoint lokal:

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`
- Health: `http://localhost:3000/api/v1/health`

`REDIS_ENABLED=true` membuat health check gagal dengan HTTP 503 ketika Redis/tunnel tidak tersedia. Set `false` hanya untuk unit/e2e test yang tidak menguji queue.

## Endpoint F01

| Method | Endpoint                       | Akses      |
| ------ | ------------------------------ | ---------- |
| POST   | `/api/v1/auth/register`        | Public     |
| POST   | `/api/v1/auth/login`           | Public     |
| GET    | `/api/v1/auth/me`              | Bearer JWT |
| POST   | `/api/v1/auth/logout`          | Bearer JWT |
| PATCH  | `/api/v1/users/me`             | Bearer JWT |
| POST   | `/api/v1/users/me/push-tokens` | Bearer JWT |
| DELETE | `/api/v1/users/me/push-tokens` | Bearer JWT |

Create/update/delete hanya mengembalikan `{ "message": "..." }`. Login mengembalikan `{ data: { accessToken, expiresIn, user } }`. Semua error memakai kontrak global dengan `statusCode`, `code`, `message`, `errors`, `path`, `method`, `timestamp`, dan `requestId`.

Logout bersifat stateless: server dapat melepaskan `pushToken` yang dikirim pada body, sedangkan client wajib menghapus JWT lokal. JWT tetap valid sampai masa berlakunya habis karena MVP tidak menggunakan refresh token atau token denylist.

## MongoDB dan Mongoloquent

- Model `User` diregistrasikan melalui `MongoloquentModule.forFeature([User])`.
- Service menerima model melalui `@InjectModel(User)`.
- Transaction menggunakan koneksi Mongoloquent yang sama melalui
  `DB.connection(...).database(...).transaction(...)`; tidak ada fallback
  non-transaction.
- Collection dan field persistence mengikuti `dbdocsio.txt` (`users`, snake_case).
- Index email/username unique dibuat idempotent saat bootstrap.
- `$addToSet` dan `$pull` memakai client MongoDB yang sama milik Mongoloquent untuk menjamin push token atomik; tidak ada `MongoClient` tambahan.
- Dokumentasi wajib: [Mongoloquent NestJS integration](https://mongoloquent.com/docs/integrations/nestjs/).

## Quality commands

```bash
npm run lint
npm run format:check
npm test -- --runInBand
npm run test:e2e
npm run build
```

E2E menggunakan `MongoMemoryReplSet`, bukan database development.

## Seed admin

Isi `ADMIN_EMAIL`, `ADMIN_USERNAME`, dan `ADMIN_PASSWORD` pada `.env`, lalu:

```bash
npm run seed:admin
```

Public register hanya menerima role `PATIENT` atau `SUPPORTER`.

## Migrasi episode pengobatan

Backup database sebelum migrasi. Dry-run adalah mode default:

```bash
npm run backup:patient-episodes -- --output=/absolute/path/patient-episodes.json
npm run migrate:patient-episodes
npm run migrate:patient-episodes -- --apply
```

Script bersifat idempotent, mengisi `patient_profile_id` pada data medis lama,
dan melaporkan konflik maupun orphan record sebelum perubahan diterapkan.
Mode `--apply` mempertahankan index lama agar server versi sebelumnya tetap
kompatibel selama rollout. Setelah server baru aktif, hapus index lama dengan:

```bash
npm run migrate:patient-episodes -- --apply --finalize-indexes
```

## Seed akun demo

Seed hanya dapat dijalankan selain pada `NODE_ENV=production`:

```bash
npm run seed:demo
```

Semua akun memakai password `TBuddyDemo123!`.

| Username         | Kondisi                                   |
| ---------------- | ----------------------------------------- |
| `supporter_demo` | Supporter baru tanpa riwayat              |
| `patient_demo`   | Patient dengan episode aktif              |
| `recovered_demo` | Supporter dengan riwayat selesai          |
| `dropped_demo`   | Supporter dengan riwayat putus pengobatan |
