# Bookings

Tattoo appointments with date/time/duration/type/estimate/notes, optional before/after images, optionally tied to a client. Calendar UI has day/month/year views. Quick-booking lets the user type "chris friday 2pm 2h touchup" and get a prefilled form.

## Key files

- `src/stores/bookingStore.ts` — Bookings CRUD, filtering (client/date/month/search), optimistic updates, persists to `inkbloop-bookings`.
- `src/stores/imageStore.ts` — Booking-image metadata, sync status, booking-id remap, persists to `inkbloop-images`.
- `src/services/bookingService.ts` — Supabase CRUD on `bookings` table.
- `src/services/imageService.ts` — CRUD on `booking_images` metadata.
- `src/lib/imageDb.ts` — IndexedDB (`inkbloop-images` / `blobs`) for original + thumbnail blobs.
- `src/lib/imageSync.ts` — `ImageSyncQueue` class: serial background uploads, 3× retry, 1s delay between items.
- `src/pages/Calendar.tsx` — Search, Today button, view routing.
- `src/components/calendar/{DayView,MonthView,YearView}.tsx` — Calendar views with infinite scroll (month/year) and 3-panel carousel (day).
- `src/components/{BookingForm,BookingDrawer,BookingCard,QuickBooking,ImagePicker,ImageViewer,ImageThumbnailGrid}.tsx` — Booking UI.
- `src/utils/quickBookingParser.ts` — Regex parser (client fuzzy, duration, type keywords, weekday, time).
- `src/utils/aiBookingParser.ts` — Calls `parse-booking` edge function, falls back to regex on error.
- `src/utils/calendar.ts` — iCalendar (.ics) export; duration math.
- `src/hooks/useBookingImages.ts` — Thumbnail loading, add/remove with IndexedDB + sync queue.
- `src/agents/bookingAgent.ts` — Agent executors: create/open/edit/delete.
- `supabase/functions/parse-booking/index.ts` — Claude Haiku parser.

## Data flow

### Create a booking (form)

1. `BookingForm` submit → `bookingStore.addBooking(data)` (optimistic add).
2. `bookingService.createBooking(data, id)` → INSERT + SELECT returning the row.
3. Row transformed → `Booking` type, store updated. Rollback on error.

### Quick booking (text → form)

1. `QuickBooking` modal textarea → submit.
2. If AI enabled: `parseBookingWithAI(text)` → `supabase.functions.invoke('parse-booking', { text, clients })`.
3. Edge fn fetches encrypted Anthropic key from `user_settings`, decrypts (AES-GCM), calls `claude-haiku-4-5-20251001`, validates JSON fields server-side.
4. Falls back to regex `parseQuickBooking(text)` on any error.
5. Result (`ParsedBooking`) → `setPrefillBookingData(prefill)` → opens `BookingForm`.

### Booking images (pick → cache → sync → DB)

1. `useBookingImages.addImages(files)` generates thumbnail → saves original + thumbnail blobs to IndexedDB.
2. Creates metadata row (`sync_status = 'local'`) in `imageStore`.
3. Enqueues to `imageSyncQueue`.
4. Queue pulls item → `sync_status = 'uploading'` → reads blob from IndexedDB → uploads to `booking-images` Storage bucket at `{user_id}/{booking_id}/{imageId}.{ext}` → sets `sync_status = 'synced'` + `remote_path`.
5. 3× retry on failure; final failure sets `sync_status = 'error'` (non-fatal).

### Calendar render

1. `bookingStore.fetchBookings()` loads all rows; localStorage serves instantly from last session.
2. `DayView` filters by date, lays out overlapping bookings in columns, hour grid at 48 px/hour.
3. `MonthView` infinite-scrolls with 6-month buffer, shows up to 3 event pills + count per day.
4. `YearView` infinite-scrolls with 2-year buffer, 3-column mini-calendar grid.
5. Empty-slot click opens `BookingForm` prefilled with date/time.

## Supabase tables + storage

### `bookings`

`id` (uuid pk), `user_id`, `client_id` (nullable fk), `date` (timestamptz, device-local interpretation — no Z suffix), `duration` (float hours), `type` (enum), `estimate` (int), `status` (enum), `rescheduled` (bool), `notes`, `quick_booking_raw`, `title` (text, nullable — Personal bookings only), timestamps.

- **Type enum**: Regular, Touch Up, Consultation, Full Day, Cover Up, Personal (Personal added in migration 00016, Cover Up in 00014).
- **Status enum**: Confirmed, Tentative, Completed, Cancelled, No-show.
- **Personal type**: artist's own calendar blocks (dentist, gym, lunch, family stuff like "Joslyn's braces"). `client_id` is always null; `title` holds a free-text label capped at 30 chars. Form swaps the client picker for a title input. Defaults to 1-hour duration. Display components (`BookingCard`, `BookingDrawer`, agent cards) show `title` instead of the client name for Personal rows via the `getBookingLabel(booking, clientName)` helper in `src/types/index.ts`. The agent parser treats non-tattoo nouns (dentist, braces, birthday, gym, etc.) as Personal-type signals even without the word "personal", and preserves possessive names in titles ("April's Birthday" not just "Birthday").
- Indexes: `user_id`, `(user_id, date)`, `client_id`.
- RLS: all CRUD gated by `user_id`.

### `booking_images`

`id`, `user_id`, `booking_id` (cascade delete), `filename`, `mime_type`, `size_bytes`, `width`, `height`, `sync_status` (`local|uploading|synced|error`), `remote_path`.

- Indexes: `booking_id`, `user_id`. RLS by `user_id`. `ON DELETE CASCADE` on `booking_id`.

### Storage bucket: `booking-images` (private)

Path: `{user_id}/{booking_id}/{imageId}.{ext}`. RLS: users upload/read/delete within own folder. **No cascade on booking delete** — Storage objects are orphaned unless cleaned by the app.

## Edge function: `parse-booking`

- **In**: `{ text: string, clients: [{id, name}] }`, bearer token.
- **Out**: `{ client_id?, date?, duration?, type?, estimate?, rescheduled?, timeSlot?, notes? }`.
- Decrypts per-user Anthropic key from `user_settings.anthropic_key` (AES-GCM, env `API_KEY_SECRET`).
- Model: `claude-haiku-4-5-20251001`, max_tokens 300.
- **Explicit-only policy** — `duration` only set if the user said it; `rescheduled` only if explicit.
- Server-side validates: `client_id` exists, `type` is in enum, `timeSlot` enum valid.

## Stores

### bookingStore (Zustand + persist)

State: `bookings`, `isLoading`, `error`. Persists `bookings` only to `inkbloop-bookings`.

Actions: `fetchBookings`, `getBooking`, `getBookingsForClient`, `getBookingsForDate`, `getBookingsForMonth`, `addBooking`, `updateBooking`, `deleteBooking`, `searchBookings`. All mutations are optimistic with rollback.

### imageStore (Zustand + persist)

State: `images`, `isLoading`. Persists `images` to `inkbloop-images`.

Actions: `fetchImages`, `getImagesForBooking`, `addImage` (fire-and-forget) / `addImageAsync`, `removeImage` / `removeImageAsync`, `removeImagesForBooking`, `remapBookingImages(oldId, newId)`, `updateSyncStatus(id, status, remotePath?)`.

## Gotchas

1. **Quick-booking parser vs AI parser.** Regex is instant + offline but no duration inference. AI (edge fn) requires user's Anthropic key; falls back to regex on any error.
2. **Image sync is best-effort.** `addImage` doesn't await; no error surfaced to caller. Queue state lives only in memory — lost on reload. On next app load, re-enqueue by scanning `sync_status = 'local'` rows.
3. **Orphaned Storage objects** on booking delete. `booking_images` DB rows cascade; Storage objects don't. If full cleanup matters, delete Storage objects before the booking row.
4. **Duration is a float in hours.** DayView uses `end = start + duration * HOUR_HEIGHT` (48 px/hour). iCal export multiplies by 3,600,000 for ms.
5. **Timezone is device-local.** `date` column has no Z suffix; all views use local `Date` methods. No explicit TZ conversion anywhere — be careful if the artist travels.
6. **`calendarDate` lives in uiStore only** (not persisted). Resets to today on mount. Agent can set it via schedule intents.
7. **Quick-booking default type is Regular** when no keyword matches.
8. **AI parser's `client_id` is validated server-side against the `clients` list passed in the body** — hallucinations get rejected, so the field comes back missing rather than wrong.

## Related docs

- [clients.md](./clients.md) — `client_id` FK on bookings; client delete sets FK null (preserves history).
- [agents.md](./agents.md) — booking/create, booking/open, booking/edit, booking/delete, booking/search, schedule/query all route through `bookingAgent.ts`.
- [supabase.md](./supabase.md) — schema + Storage bucket policies.
- [deployment.md](./deployment.md) — edge function deploy, secret rotation for `API_KEY_SECRET`.
