# Bookings

Tattoo appointments (plus the artist's "Personal" calendar blocks) with date/time/duration/type/estimate/notes, optional before/after images, optionally tied to a client. Calendar UI has day/month/year views. An AI pipeline lets the user type "chris friday 2pm 2h touchup" or "block off may 10-14 for vacation" and get a prefilled form.

**All-day and multi-day support** (Personal type only): Personal bookings can be all-day, span multiple days, and be marked as non-blocking (informational events that don't affect availability). See the "All-day / multi-day" section below.

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
2. `DayView` filters timed bookings by date, lays out overlapping bookings in columns on a 48 px/hour grid. An all-day banner above the grid renders bar-worthy bookings (all-day OR multi-day) with ‹ › continuation arrows when a bar extends past the visible day. Banner height is computed as `max(barsPrev, barsCurr, barsNext)` so hour rows stay aligned across swipes.
3. `MonthView` infinite-scrolls with 6-month buffer. Per week, a greedy lane packer lays out bar-worthy bookings as horizontal ribbons that bleed to cell edges (`-mx-0.5 lg:-mx-1`) so adjacent segments visually connect; single-day timed bookings render as pills below the bars (up to 3 + count).
4. `YearView` infinite-scrolls with 2-year buffer, 3-column mini-calendar grid.
5. Empty-slot click opens `BookingForm` prefilled with date/time.

## Supabase tables + storage

### `bookings`

`id` (uuid pk), `user_id`, `client_id` (nullable fk), `date` (timestamptz, device-local interpretation — no Z suffix), `end_date` (timestamptz, exclusive end — for all-day events this is midnight after the last covered day), `duration` (float hours, kept in sync with `end_date - date`), `type` (enum), `estimate` (int), `status` (enum), `rescheduled` (bool), `is_all_day` (bool, default false), `blocks_availability` (bool, default true), `notes`, `quick_booking_raw`, `title` (text, nullable — Personal bookings only), timestamps.

- **Type enum**: Regular, Touch Up, Consultation, Full Day, Cover Up, Personal (Personal added in migration 00016, Cover Up in 00014).
- **Status enum**: Confirmed, Tentative, Completed, Cancelled, No-show.
- **Personal type**: artist's own calendar blocks (dentist, gym, lunch, family stuff like "Joslyn's braces"). `client_id` is always null; `title` holds a free-text label capped at 30 chars. Form swaps the client picker for a title input. Defaults to 1-hour duration. Display components (`BookingCard`, `BookingDrawer`, agent cards) show `title` instead of the client name for Personal rows via the `getBookingLabel(booking, clientName)` helper in `src/types/index.ts`. The agent parser treats non-tattoo nouns (dentist, braces, birthday, gym, etc.) as Personal-type signals even without the word "personal", and preserves possessive names in titles ("April's Birthday" not just "Birthday").
- **All-day / multi-day** (Personal only): `is_all_day` and `blocks_availability` are enforced server-side to be `false` / `true` respectively for any non-Personal row. `end_date` is stored with exclusive-end semantics (RFC 5545): a Mon–Wed all-day block stores `date = Mon 00:00` / `end_date = Thu 00:00`. Added in migration 00021.
- Indexes: `user_id`, `(user_id, date)`, `client_id`.
- RLS: all CRUD gated by `user_id`.

### `booking_images`

`id`, `user_id`, `booking_id` (cascade delete), `filename`, `mime_type`, `size_bytes`, `width`, `height`, `sync_status` (`local|uploading|synced|error`), `remote_path`.

- Indexes: `booking_id`, `user_id`. RLS by `user_id`. `ON DELETE CASCADE` on `booking_id`.

### Storage bucket: `booking-images` (private)

Path: `{user_id}/{booking_id}/{imageId}.{ext}`. RLS: users upload/read/delete within own folder. **No cascade on booking delete** — Storage objects are orphaned unless cleaned by the app.

## Edge function: `parse-booking`

- **In**: `{ text: string, clients: [{id, name}] }`, bearer token.
- **Out**: `{ client_id?, date?, end_date?, duration?, type?, estimate?, rescheduled?, timeSlot?, is_all_day?, blocks_availability?, title?, notes? }`.
- Decrypts per-user Anthropic key from `user_settings.anthropic_key` (AES-GCM, env `API_KEY_SECRET`).
- Model: `claude-haiku-4-5-20251001`, max_tokens 300.
- **Explicit-only policy** — `duration` only set if the user said it; `rescheduled` only if explicit.
- Server-side validates: `client_id` exists, `type` is in enum, `timeSlot` enum valid. `is_all_day` and `blocks_availability` are rejected unless `type === 'Personal'`. `end_date` is dropped if earlier than `date` or malformed.
- **All-day / multi-day cues** (Personal only): "all day", "vacation", "out of town", "block off", named-range phrases ("may 10-14", "mon-wed") → `is_all_day: true`. Blocking cues ("I'm on vacation", "day off", "surgery", "gym", "dentist") keep `blocks_availability: true`; informational cues ("husband is out of town", "kids at camp", "John is in town") flip it to `false`. Timed Personal (e.g. "dentist 2pm") stays blocking by default; all-day Personal defaults to non-blocking unless a blocking cue is present.

## Stores

### bookingStore (Zustand + persist)

State: `bookings`, `isLoading`, `error`. Persists `bookings` only to `inkbloop-bookings`.

Actions: `fetchBookings`, `getBooking`, `getBookingsForClient`, `getBookingsForDate`, `getBookingsForMonth`, `addBooking`, `updateBooking`, `deleteBooking`, `searchBookings`. All mutations are optimistic with rollback.

### imageStore (Zustand + persist)

State: `images`, `isLoading`. Persists `images` to `inkbloop-images`.

Actions: `fetchImages`, `getImagesForBooking`, `addImage` (fire-and-forget) / `addImageAsync`, `removeImage` / `removeImageAsync`, `removeImagesForBooking`, `remapBookingImages(oldId, newId)`, `updateSyncStatus(id, status, remotePath?)`.

## All-day / multi-day

Personal-type bookings can span multiple calendar days and/or be marked all-day, mirroring Apple Calendar. Three fields drive the behavior:

- `is_all_day` (bool) — no clock time; event covers whole calendar days.
- `end_date` (timestamptz, exclusive) — the first instant *after* the event. A single Apr 24 all-day stores `end_date = Apr 25 00:00`. A Mon–Wed all-day stores `end_date = Thu 00:00`. Timed events follow the same exclusive-end rule.
- `blocks_availability` (bool) — does this event take the artist off the schedule?

**Blocking defaults**: timed Personal defaults to blocking (dentist 2pm, gym 7am); all-day Personal defaults to non-blocking (husband out of town, kids at camp) unless the language contains a blocking cue (vacation, day off, surgery). The agent chooses the default without asking — see `supabase/functions/agent-parse/index.ts` for the cue list.

**Rendering**:
- **MonthView** — per-week greedy lane packer lays bar-worthy bookings (all-day OR multi-day timed) as horizontal ribbons. Single-day timed bookings render as pills below the bars. Non-blocking bars get italic text + 0.1 alpha fill; blocking bars get 0.28 alpha fill.
- **DayView** — all-day banner above the hour grid. Bars with `bStart < dayStart` show a `‹` continuation arrow on the left edge; `bEnd > dayEnd` shows `›` on the right. Non-blocking bars get a small "Free" label.
- **YearView** — unchanged; no bar rendering in the mini-grid.

**Shared helpers** live in `src/utils/bookingRanges.ts`:
- `isBarBooking(b)` — `is_all_day || bookingIsMultiDay(b)`.
- `getOverlappingBookings(day, bookings)` — all bookings whose `[date, end_date)` interval overlaps the day.
- `getBarBookingsForDay(day, bookings)` — overlap filter + bar filter.

Any new range-aware view must go through these — never reintroduce `isSameDay(b.date, day)` for bar-worthy bookings.

## Gotchas

1. **Quick-booking parser vs AI parser.** Regex is instant + offline but no duration inference. AI (edge fn) requires user's Anthropic key; falls back to regex on any error.
2. **Image sync is best-effort.** `addImage` doesn't await; no error surfaced to caller. Queue state lives only in memory — lost on reload. On next app load, re-enqueue by scanning `sync_status = 'local'` rows.
3. **Orphaned Storage objects** on booking delete. `booking_images` DB rows cascade; Storage objects don't. If full cleanup matters, delete Storage objects before the booking row.
4. **`end_date` is the source of truth for range end**, not `duration`. DayView still uses `duration * HOUR_HEIGHT` (48 px/hour) for the timed hour-grid layout, but anything range-aware (MonthView bars, DayView banner, iCal export, availability math) reads `end_date`. Keep the two in sync on every write.
5. **Filter bar-worthy bookings by range overlap, not start-day equality.** A Mon–Fri bar should appear on Tue/Wed/Thu, but `isSameDay(b.date, day)` misses those. Use `src/utils/bookingRanges.ts` (`getOverlappingBookings`, `isBarBooking`, `getBarBookingsForDay`) — any new calendar view must go through those helpers.
6. **Exclusive-end convention for all-day.** A single all-day event on Apr 24 is stored `date=Apr 24 00:00`, `end_date=Apr 25 00:00`. RFC 5545 `DTEND;VALUE=DATE` uses the same convention, so iCal export passes `end_date` through unchanged. Subtract a day before showing an inclusive-end label to the user.
7. **Timezone is device-local.** `date` and `end_date` columns have no Z suffix; all views use local `Date` methods. No explicit TZ conversion anywhere — be careful if the artist travels.
8. **`calendarDate` lives in uiStore only** (not persisted). Resets to today on mount. Agent can set it via schedule intents.
9. **Quick-booking default type is Regular** when no keyword matches.
10. **AI parser's `client_id` is validated server-side against the `clients` list passed in the body** — hallucinations get rejected, so the field comes back missing rather than wrong.
11. **Availability math must respect `blocks_availability`.** Non-blocking Personal events (husband out of town, kids at camp) appear in the UI but are ignored by conflict checks and agent "is X free?" queries. Don't short-circuit on type alone — check the flag.
12. **Time-picker in `BookingForm` doesn't yet render bar bookings.** If the artist tries to book on a day that already has an all-day Personal event, the form won't visually flag the conflict. Earmark — not fixed.

## Related docs

- [clients.md](./clients.md) — `client_id` FK on bookings; client delete sets FK null (preserves history).
- [agents.md](./agents.md) — booking/create, booking/open, booking/edit, booking/delete, booking/search, schedule/query all route through `bookingAgent.ts`.
- [supabase.md](./supabase.md) — schema + Storage bucket policies.
- [deployment.md](./deployment.md) — edge function deploy, secret rotation for `API_KEY_SECRET`.
