# 🐾 Street Foster Programme — Mobile App

A mobile-first app for tracking community dogs across Delhi's colonies. Built with **React Native + Expo** and **Supabase**.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Mobile (iOS + Android) | React Native + Expo | Single codebase, iOS-first, scales to Android & web |
| Navigation | Expo Router (file-based) | Industry standard, great for resume |
| Backend & Database | Supabase (PostgreSQL) | Real SQL, offline sync, open-source — impressive on resume |
| Auth (Phase 2) | Supabase Auth | Built-in, row-level security for multi-volunteer |
| Maps (Phase 2) | react-native-maps + Google Maps API | |
| Push Notifications | expo-notifications | Local + remote |
| Photo Storage | Supabase Storage | |
| Excel Export | SheetJS (xlsx) | |
| Date Logic | date-fns | |

---

## Project Structure

```
StreetFoster/
├── app/                        # Expo Router screens
│   ├── tabs/                   # Bottom nav tabs
│   │   ├── index.tsx           # Home — Map view
│   │   ├── alerts.tsx          # Alerts tab
│   │   ├── dogs.tsx            # My Dogs tab
│   │   └── more.tsx            # More / Settings tab
│   ├── dog/
│   │   └── [id].tsx            # Dog detail screen
│   └── modals/
│       ├── add-dog.tsx         # Add new dog flow
│       └── log-update.tsx      # Log health update
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Supabase client setup
│   │   ├── dogs.ts             # Dog CRUD + category logic
│   │   └── records.ts          # Reminders, health updates, medical records
│   └── utils/
│       ├── export.ts           # One-tap Excel export
│       └── notifications.ts    # Push notification scheduling
├── types/
│   └── index.ts                # All TypeScript types (mirrors DB schema)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # Full DB schema — run this first
├── .env.example                # Copy to .env.local and fill in keys
├── app.json                    # Expo config (permissions, bundle IDs)
├── package.json
└── tsconfig.json
```

---

## Setup Instructions

### 1. Clone & install dependencies

```bash
git clone <your-repo-url>
cd StreetFoster
npm install
```

### 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In the Supabase dashboard → **SQL Editor**, paste and run the contents of:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. Go to **Settings → API** and copy your **Project URL** and **anon public key**.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Set up Supabase Storage (for photos)

In the Supabase dashboard → **Storage**, create a bucket called `dog-photos` and set it to **Public**.

### 5. Start the app

```bash
npx expo start
```

- Press `i` to open in iOS Simulator
- Scan the QR code with **Expo Go** on your iPhone for real device testing

---

## Database Schema

5 tables — all linked via `dog_id`:

- **dogs** — core animal record (name, DOB, gender, location, status)
- **dog_photos** — multiple photos per dog, one profile photo
- **health_updates** — daily field observations timeline
- **medical_records** — vaccinations, deworming, sterilisation events
- **reminders** — auto-generated (6-month, boosters) + manual

See `supabase/migrations/001_initial_schema.sql` for full schema with constraints.

---

## Key Features (Phase 1)

- [x] Full animal database with all schema fields
- [x] Category system: puppy / unsterilised female / adult (auto-calculated)
- [x] Daily health update logging with quick-select types
- [x] Vaccination & deworming tracker with auto next-due dates
- [x] Auto reminders: 1 week before + on 6-month birthday
- [x] Manual reminders with free-text label
- [x] Alerts tab: today's and this week's reminders
- [x] Push notifications for all reminders
- [x] Mark reminder done → auto-logs in dog history
- [x] One-tap monthly Excel export (4 sheets: animals, health, medical, reminders)
- [x] Offline-capable (Supabase handles sync)
- [x] iPhone-first UI

## Planned (Phase 2)

- [ ] Google Maps integration with colour-coded pulsing pins
- [ ] Tap-to-call feeder contacts
- [ ] Android support
- [ ] Annual vaccination booster reminders

## Planned (Phase 3)

- [ ] Multi-volunteer access with Supabase Row Level Security
- [ ] Web / laptop version (Expo web)
- [ ] Advanced reporting & colony statistics

