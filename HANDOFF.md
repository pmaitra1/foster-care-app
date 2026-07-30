# Handoff Notes — Street Foster App

This document is for the developer taking over this project. It covers what's
already built, what to watch out for, and repo hygiene actions that were taken
right before handoff. Read this alongside [README.md](./README.md) (setup +
tech stack) and `supabase/migrations/001_initial_schema.sql` (DB schema).

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
  open — every table has an "Allow all" policy; see §5 below).
- Web version, colony-level reporting.

## 3. Repo hygiene — what changed right before handoff

- Deleted `node_modules_old_sdk51/` (an 869MB untracked leftover backup from
  a past Expo SDK upgrade — see §4 for why it existed). It was never needed
  at runtime; if you ever see a similar `*_old_sdk*` folder reappear, it's
  safe to delete after confirming `npm install` still works from the current
  `node_modules`.
- `node_modules/` was previously **committed to git** (45k+ files) despite
  being listed in `.gitignore` — it had been added before the ignore rule
  existed. It has now been untracked with `git rm -r --cached node_modules`.
  **You must commit this** (`git commit -m "Untrack node_modules"`) to finish
  the cleanup — the files remain on disk, only git's tracking was affected.
- `.env` and `.env.local` were also committed to git. They've been untracked
  the same way and added to `.gitignore`. **Commit this too.** An
  `.env.example` template (no real secrets) now exists for new setups.

## 4. Security note — rotate the Google Maps API key

The committed `.env`/`.env.local` contained a real Google Maps API key and
the Supabase anon key. The Supabase anon key is designed to be public in a
client app (protected by RLS — though see §5, RLS isn't actually restrictive
yet), but the **Google Maps key should be rotated** in the
[Google Cloud Console](https://console.cloud.google.com) since it's exposed
in git history (untracking going forward does not remove it from past
commits — that would require a history rewrite, which was intentionally not
done here to avoid disrupting shared history without sign-off).

## 5. Known gotchas / tribal knowledge

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

## 6. Suggested first tasks for the new developer

1. `git commit` the untracking changes from §3, then rotate the Google Maps
   key (§4).
2. Verify `npx expo start` + `npx expo start --ios` still work locally after
   the git index changes (no files were touched on disk, so this should be a
   no-op, but confirm).
3. Read through `supabase/migrations/001_initial_schema.sql` to understand
   the 5-table schema before making DB changes.
4. Decide on an RLS strategy before onboarding a second volunteer/user.
