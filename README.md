# CampusPool

CampusPool helps students find people heading the same way, share a car and split the fare. We built this hackathon project around BIIT in Rawalpindi, where students often leave campus for the same neighbourhoods or metro station.

## How it works

Search for a destination or pick a shared drop-off on the map. Set your departure window and budget, then join a matching group or create one.

The organiser records the car quote, and everyone confirms their share. Passengers show a QR code at pickup. Once everyone arrives, the organiser starts the journey and ends it at the destination.

- Ride chat helps members agree on where to meet.
- The map shows campus pickup, the shared drop-off and your phone's location.
- Profile lets you change your name and photo, switch themes and view past rides.

CampusPool splits the car fare only. Each passenger pays for their own metro ticket. Members arrange the actual booking and payment outside the app.

## Run locally

```sh
pnpm install
cp .env.example .env.local
```

Add your Supabase project URL and publishable key to `.env.local`. Keep `EXPO_PUBLIC_USE_RN_FETCH=1`. Run the SQL files in [supabase/migrations](supabase/migrations) in filename order through Supabase SQL Editor. For the hackathon signup flow, turn off email confirmation in Supabase's Email provider settings.

```sh
pnpm start --clear
```

Open the app in Expo Go. Use two accounts on separate phones to try matching, chat and QR pickup.

Built with Expo, React Native, HeroUI Native, Hugeicons and Supabase. Maps use MapLibre and OpenFreeMap; place search uses Photon and OpenStreetMap data.

See [setup and testing notes](docs/SETUP.md) for database details, native builds and device checks.
