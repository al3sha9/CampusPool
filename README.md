# CampusPool

Expo, React Native, HeroUI Native, Hugeicons and Supabase. The app uses the dark theme and the supplied CampusPool logo.

## Run on iPhone

```sh
pnpm install
pnpm start --clear
```

Keep `EXPO_PUBLIC_USE_RN_FETCH=1` in `.env.local` to use React Native networking instead of Expo’s Swift fetch transport. Restart Metro after changing it.

Scan with Expo Go. Maps use MapLibre GL in a WebView in Expo Go; a native build uses MapLibre Native. Both use OpenFreeMap tiles and require internet access.

The icon and native splash use the original supplied artwork. The splash canvas matches the logo's light background; the app stays dark. Sign-in and Profile also show the logo. Expo Go cannot reproduce the final standalone launch screen; see [Expo guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

## Accounts and database

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` in `.env.local` using the publishable key. Run the complete `supabase/migrations/20261010084407_shared_trip_flow.sql` once in Supabase SQL Editor. Then run `supabase/migrations/20261010094653_searchable_destinations.sql` to enable destination search and per-request car estimates. Then run `supabase/migrations/20261010103000_optional_search_estimate.sql` so searching and joining do not require a car estimate. Existing installations need only migrations they have not already applied.

For direct hackathon signup, turn **Confirm email** off in the Supabase Email provider settings. The local Supabase config already has confirmations disabled, but hosted settings must be changed in the dashboard. New accounts receive a session directly; no confirmation email is required. See [Supabase configuration](https://supabase.com/docs/guides/auth/general-configuration/).

Sign up with your name, email and password. Home, Trips and Profile use your signed-in identity. The dummy preview entry has been removed; the local adapter remains as a test fixture. No peers or shared trips are seeded. Campus affiliation remains unverified.

## Shared trip flow

1. Use two separately signed-in devices. On the first, search a destination or tap a shared drop-off on the map, choose a departure window and budget, then enter an estimated car total to create a group.
2. Select the same destination with an overlapping window on the second device and join the group. Each member confirms their share.
3. The organiser locks the group and records an external quote. A changed quote clears consent and arrival; everyone reconfirms within budget.
4. Each passenger generates a five-minute QR. The organiser scans it and marks their own arrival. Everyone must have confirmed and arrived before departure.
5. The organiser starts and completes the journey. An optional final total updates the exact integer split. Booking and settlement happen externally; payment is unverified.

Trips persist on Supabase. Sessions persist on the device. Active screens refresh every five seconds and on foregrounding. Signing out preserves the server trip. Finish dismisses the summary without deleting its record. Only the organiser can lock, quote, scan, start, complete or cancel; members may leave before departure. Locked groups cannot accept replacements.

The authenticated RPC derives identity from `auth.uid()`, locks affected rows, validates versions and budgets, and stores only hashed, single-use QR tokens. App roles cannot directly read or write the private tables. The app reports missing SQL setup instead of substituting fake trips.

## Map and location

The campus pin is BIIT at the organiser-supplied [Google Maps location](https://maps.app.goo.gl/kFNzvYePzQKbh9GK7). [6th Road Metrobus Station](https://maps.app.goo.gl/si1RA3N8yUHhmP7d9) remains a quick destination. Search neighbourhoods, malls, offices and stations using Photon/OpenStreetMap, or choose a shared map pin in Islamabad–Rawalpindi. Search runs on explicit submission and requires internet; the public Photon service has no availability guarantee. The campus pin is a place location; members must agree on the exact gate. The unconfirmed city-centre option is hidden from new requests, and its old illustrative coordinate has been removed.

Tap **My location** to grant foreground permission. A separate blue marker shows the phone's location and the UI shows reported accuracy. Already-granted permission resumes location updates while the map is visible. Updates stop when the map loses focus or the app backgrounds. Your location does not replace the campus pickup and is not uploaded to Supabase or shared with the group. Denied permissions, disabled services and unavailable positions have retry/settings controls. No simulated position, background tracking, road routing or calculated ETA is supplied.

Matching uses a canonical destination ID, overlapping departure windows and each member’s exact integer share within budget. Different places with the same name remain separate. Map pins round to four decimal places; choose the same shared point when matching.

Only the car fare is split. Metro tickets are paid individually and excluded from every quote and summary. Starting fares are labelled estimates. The organiser must enter the external quote; provider prices and payments are not connected.

## Checks and device rehearsal

```sh
pnpm typecheck
pnpm lint
pnpm format:check
node --experimental-strip-types --test tests/*.test.mjs
pnpm exec expo export --platform ios --platform android --output-dir /tmp/campuspool-export
```

SQL tests run the migration in PGlite with fixture Auth users and verify identity restrictions, fare consent, QR expiry/regeneration/consumption, rate limits and locked cancellation. Local adapter tests cover exact shares, version changes, role restrictions and terminal states.

Physical verification is still required: allow and deny location on iPhone, check the blue marker and accuracy, background/resume and switch tabs, then complete the trip with two accounts and scan the passenger QR. Test session restoration after closing the app. Repeat location and camera checks on Android before claiming Android readiness. JavaScript bundle exports do not verify native permission prompts or GPS hardware.
# CampusPool
