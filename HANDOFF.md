# Handoff Notes — Street Foster App

This document is for the developer taking over this project. It covers
what's already built, what to watch out for, and where to start. Read this
alongside [README.md](./README.md) (setup + tech stack) and
`supabase/migrations/001_initial_schema.sql` (DB schema).

---

## 1. Current State (Phase 1 — done)

- Full dog record CRUD: add dog (4-step wizard: photos → details → location →
  confirm), view profile, **edit dog info** (name, gender, status, DOB/approx
  age, colony, feeder phone, notes, location) via the edit modal on
  `app/dog/[id].tsx`.
- **Photos**: multiple photos per dog (`dog_photos` table, one profile photo
  enforced by a partial unique index). Users can add photos in bulk (camera
  single-shot or multi-select from library) both when creating a dog and
  later from the dog detail screen's Photo Gallery ("+ Add").
- **Location**: GPS capture (`expo-location`) with automatic fallback to
  manual latitude/longitude entry if the user denies permission or GPS fails.
  Same pattern is used in both the add-dog wizard and the edit modal.
- Feeders: list, create, rate (good/bad/unrated), link to dogs.
- Health updates (daily field notes), medical records (vaccination/deworming/
  rabies/other) with auto-calculated next-due dates, and reminders
  (auto-generated 6-month checks + manual).
- Alerts tab surfaces due/overdue reminders.
- One-tap Excel export (`lib/utils/export.ts`, via `xlsx`).
- Push notification scheduling for reminders (`lib/utils/notifications.ts`).

## 2. Not yet built (Phase 2 / 3, see README for full list)

- Google Maps colour-coded pins on the home map tab beyond current basic pins.
- Android build/testing (project has been developed and tested iOS-first).
- Multi-volunteer auth + Supabase Row Level Security (RLS is currently wide
  open — every table has an "Allow all" policy; see §4 below).
- Web version, colony-level reporting.

## 3. Environment variables & secrets

- Copy `.env.example` to `.env.local` and fill in your own Supabase and
  Google Maps keys (see README setup steps). `.env`, `.env.local`,
  `node_modules/`, and the native `ios/`/`android/` folders are all
  gitignored — never commit real keys.
- The Supabase key used client-side is the **anon** key, which is designed
  to be public in a mobile app and is protected by Row Level Security (RLS)
  — see §4 below on the current (permissive) RLS state.
- General practice: if any API key is ever accidentally committed, treat it
  as compromised and rotate it immediately in the relevant provider console
  (e.g. [Google Cloud Console](https://console.cloud.google.com) for Google
  Maps, Supabase dashboard → Settings → API for Supabase keys) — removing it
  from a future commit doesn't undo prior exposure.

## 4. Known gotchas / tribal knowledge

- **RLS is currently permissive**: every table has an `Allow all` policy (see
  `supabase/migrations/001_initial_schema.sql`). Fine for a single-volunteer
  MVP, but must be locked down before multi-volunteer auth (Phase 3).
- **Route params**: `expo-router`'s `useLocalSearchParams` can return
  `string | string[]` for a param — always normalize before `parseInt`/`Number`
  (see `app/dog/[id].tsx`).
- **Bracket filenames in shell**: zsh treats `[id].tsx` as a glob. Quote the
  path when referencing it in terminal commands, e.g. `"app/dog/[id].tsx"`.
- **Physical device testing**: run `npx expo start --dev-client --tunnel` (or
  `--lan`) before reloading on a real device. "No bundle URL present" usually
  just means Metro isn't serving the JS bundle yet.
- **Metro/`simple-swizzle` resolution error**: a broken `simple-swizzle@0.2.4`
  publish (missing `index.js`) breaks `color-string` resolution. Already
  pinned via `overrides.simple-swizzle: 0.2.2` in `package.json` — don't
  remove that override without checking upstream is fixed.
- **react-native-maps custom markers**: render `Marker` elements directly (or
  via function calls) inside `MapView`. Wrapping them in a custom function
  component as a direct child triggers "Function components cannot be given
  refs".
- **iOS + `PROVIDER_GOOGLE`**: don't force `provider={PROVIDER_GOOGLE}` on iOS
  unless the Google Maps SDK is actually configured natively — it throws
  "AirGoogleMaps dir must be added". Use the default provider on iOS.
- **Supabase network errors**: wrap startup/polling queries in `try/catch`
  and prefer `console.warn` over `console.error` for transient failures —
  `console.error` surfaces as a noisy red overlay in Expo dev builds.
- **Nested Supabase relation selects** (e.g. `dogs.select('*, feeders(name)')`)
  can silently fail under certain RLS/relation setups. The safer pattern used
  elsewhere in this codebase is a separate `feeders`/`dog_photos` query,
  joined client-side by `feeder_id`/`dog_id` (see `lib/supabase/dogs.ts`,
  `app/tabs/index.tsx`).
- **Expo SDK upgrades**: replacing `node_modules` in-place can hit npm
  `ENOTEMPTY` rename conflicts. Fastest workaround: rename the old
  `node_modules` out of the way, delete `package-lock.json`, then
  `npm install` fresh.

## 5. Suggested first tasks for the new developer

1. Set up `.env.local` from `.env.example` (§3) and confirm `npx expo start`
   / `npx expo start --ios` run locally.
2. Read through `supabase/migrations/001_initial_schema.sql` to understand
   the 5-table schema before making DB changes.
3. Decide on an RLS strategy before onboarding a second volunteer/user.
