# InkBloop: SwiftUI Port Reference

Analysis performed 2026-04-13 against commit be61aea on main.

## App Overview

InkBloop is a tattoo artist booking/client management app. ~3 days of React/Tailwind work as of this analysis.

- **Frontend:** React 19 + TypeScript + Tailwind 4 + Vite 8
- **State:** Zustand 5 (4 stores)
- **Backend:** Supabase (Postgres + Storage + 2 Edge Functions)
- **Auth:** Supabase email/password + TOTP MFA
- **Animations:** framer-motion 12 + @use-gesture/react
- **Routing:** react-router-dom 7 (HashRouter, 7 routes)
- **Icons:** lucide-react
- **Dates:** date-fns 4

---

## Data Models (src/types/)

### clients
- id (UUID), user_id (FK auth.users), name, display_name, phone, instagram, facebook_id, email, dob, channel ('Facebook'|'Instagram'|'Phone'), tags (text[]), notes (JSONB array of {ts, text}), created_at

### bookings
- id (UUID), user_id, client_id (FK clients, ON DELETE SET NULL), date (timestamptz), duration (real, hours), type ('Regular'|'Touch Up'|'Consultation'|'Full Day'), estimate (int, dollars), status ('Confirmed'|'Tentative'|'Completed'|'Cancelled'|'No-show'), rescheduled (bool), notes (text), quick_booking_raw (text), created_at

### booking_images
- id (UUID), user_id, booking_id (FK bookings, ON DELETE CASCADE), filename, mime_type, size_bytes, width, height, sync_status ('local'|'uploading'|'synced'|'error'), remote_path, created_at

### user_settings
- user_id (UUID PK/FK auth.users, 1-to-1), anthropic_key (AES-GCM encrypted), has_api_key (bool), created_at, updated_at

### documents (stub, not heavily used in UI)
- id, user_id, client_id, booking_id, type ('image'|'consent_form'|'other'), label, storage_path, is_sensitive, mime_type, size_bytes, notes

### age_verification_logs (stub, not in UI)
- id, user_id, client_id, verified_at, verified_by, document_deleted, notes

### Relationships
```
auth.users 1──N clients, bookings, booking_images, documents, age_verification_logs
auth.users 1──1 user_settings
clients    1──N bookings, documents, age_verification_logs
bookings   1──N booking_images, documents
```

All tables have RLS: users can only access rows where user_id = auth.uid().

---

## Architecture Layers

### 1. Services (src/services/) — Supabase CRUD

Each service: fetch, create, update, delete + a row-to-model transform function.

- **bookingService.ts** — Booking CRUD. Queries: .select('*'), .insert().select().single(), .update().eq(), .delete().eq()
- **clientService.ts** — Client CRUD + updateClientNotes (JSONB array of {ts, text})
- **imageService.ts** — Image metadata CRUD + remapBookingImages(oldId, newId) + updateSyncStatus. Blobs stored separately in Supabase Storage bucket `booking-images` at path `{user_id}/{booking_id}/{image_id}.{ext}`
- **apiKeyService.ts** — Calls edge functions for encrypted API key save/remove/check

**Swift port:** Replace `@supabase/supabase-js` with `supabase-swift`. The query API is nearly identical (.select, .insert, .eq, etc.).

### 2. Stores (src/stores/) — Zustand

All use optimistic updates with rollback on error.

- **bookingStore.ts** (~117 lines) — bookings[], fetchBookings, add/update/delete (optimistic), query helpers (byClient, byDate, byMonth, search)
- **clientStore.ts** (~134 lines) — clients[], fetchClients, add/update/delete (optimistic), addNote, searchClients
- **imageStore.ts** (~145 lines) — images[], add/remove (sync + async variants), remapBookingImages, updateSyncStatus. Fire-and-forget pattern for mutations.
- **uiStore.ts** (~135 lines) — calendarView/Date, selected/editing IDs, modal open states, sidebar collapsed, toasts[], prefillBookingData, header slots

**Swift port:** Each store becomes an `@Observable` class with `@Published` properties. Same optimistic pattern works natively.

### 3. Image Pipeline (complex, 3 layers)

1. **IndexedDB** (src/lib/imageDb.ts) — Local blob cache. DB: `inkbloop-images`, store: `blobs`, schema: {id, original: Blob, thumbnail: Blob}
2. **Metadata** (imageService + imageStore) — Supabase `booking_images` table tracks sync_status progression: local -> uploading -> synced/error
3. **Cloud sync** (src/lib/imageSync.ts) — `ImageSyncQueue` singleton. Processes 1 at a time, 1s retry delay, max 3 retries. Uploads blob to Supabase Storage, updates sync_status on success/failure.
4. **Hook** (src/hooks/useBookingImages.ts, ~162 lines) — Loads thumbnails from IndexedDB, falls back to downloading from Storage if synced, handles add/remove/cleanup of object URLs.
5. **Thumbnails** (src/utils/imageProcessing.ts) — Canvas-based downscale to max 300px, JPEG 70% quality.

**Swift port:** This gets simpler. Use `FileManager` for local cache, `UIImage` for thumbnail generation (3 lines), `URLSession` background tasks or `OperationQueue` for upload queue. Drop IndexedDB and object URL management entirely.

### 4. Auth (src/contexts/AuthContext.tsx)

- React Context providing session/user/loading
- Init: `supabase.auth.getSession()` + `onAuthStateChange()` listener
- Login: `signInWithPassword()` -> check `mfa.listFactors()` -> if TOTP: `mfa.challenge()` + `mfa.verify()`
- Session persisted to localStorage key `inkbloop-auth`, auto-refresh

**Swift port:** `@Observable` AuthManager. supabase-swift handles session persistence. MFA flow is the same API shape but slightly less documented in Swift SDK.

### 5. Supabase Backend (supabase/)

**Migrations** (stay as-is, no changes needed):
- `00001_initial_schema.sql` — All tables, indexes (including trigram for fuzzy client search), RLS, storage bucket policies
- `00002_user_settings.sql` — Encrypted API key table

**Edge Functions** (Deno, stay as-is):
- `parse-booking` — Auth check -> decrypt user's API key -> call Claude Haiku -> validate/return parsed booking JSON
- `save-api-key` — Auth check -> AES-GCM encrypt key with server secret -> upsert to user_settings

**Storage Buckets:**
- `booking-images` (private) — user-namespaced image blobs
- `documents` (private) — future use

---

## UI Component Map

### Layout
- **AppShell** — Responsive shell: Sidebar + AppHeader on desktop, MobileTabBar on mobile (<1024px)
- **Sidebar** — Nav links, collapsible to 70px icon-only
- **MobileTabBar** — Bottom tab bar with Calendar/Clients/Messages/Settings
- **AppHeader** — Dynamic title + header slots (left/right render props)

### Pages (7 routes)
- `/login` — Email/password + TOTP MFA (public)
- `/` — Calendar (default, protected) — YearView/MonthView/DayView + search overlay
- `/clients` — Client list with search
- `/clients/:id` — Client detail with bookings, notes, contact info
- `/messages` — Stub/placeholder
- `/settings` — API key management, account settings
- `/theme` — Theme customization

### Booking Components
- **BookingForm** — Most complex component. Create/edit modal. Client search dropdown, image picker, AI field highlighting (red borders for missing fields), date/time pickers, type-based duration defaults.
- **BookingDrawer** — Slide-in panel showing booking details, edit/delete actions
- **QuickBooking** — Text input modal -> AI parsing via edge function -> prefill BookingForm
- **DatePicker, TimePicker, ImagePicker, ImageThumbnailGrid, ImageViewer** — Form sub-components

### Calendar Components
- **YearView -> MonthView -> DayView** — Drill-down navigation
- Color-coded booking blocks via CSS variables (live-themeable)
- Search overlay for global booking lookup

### Client Components
- **ClientForm** — Edit client modal
- **CreateClientForm** — New client modal
- Client detail page: inline notes, tags array, multi-channel contact

### Common
- **Modal** — Advanced: drag-to-dismiss gesture, collapsible, spring animations, laser trace accent, full-screen mobile. Uses ModalDismissContext for children.
- **Toast** — Stack at top-center, auto-dismiss 5s, optional action button

---

## Port Strategy Recommendations

### Use native iOS patterns (don't replicate web UI)
- Web Modal -> SwiftUI `.sheet()` / `.fullScreenCover()` / `presentationDetents`
- Web routing -> `NavigationStack` with `NavigationLink` / `navigationDestination`
- Tailwind -> SwiftUI modifiers (`.padding()`, `.background()`, etc.) + custom `ViewModifier`s
- framer-motion -> SwiftUI `.animation()` / `withAnimation` (springs are native)
- @use-gesture -> native `DragGesture`, `LongPressGesture`
- CSS variable theming -> `@Environment(\.colorScheme)` + custom theme `@Observable`

### Keep the same patterns
- Service layer (swap supabase-js for supabase-swift, same API shape)
- Store layer (Zustand -> `@Observable` classes)
- Optimistic updates with rollback
- Image sync queue (use `OperationQueue` or `URLSession` background tasks)
- Local-first image caching (FileManager instead of IndexedDB)

### Calendar is the riskiest component
- No built-in SwiftUI calendar grid with custom event rendering
- Options: custom `LazyVGrid` build, or third-party library like `HorizonCalendar`
- Booking color-coding logic ports directly; it's the layout that needs work

### Estimated effort
- ~4-5 days for experienced SwiftUI developer to reach feature parity
- Data/logic layer: ~1.5 days (near-mechanical translation)
- UI rebuild: ~2.5-3 days (calendar views + forms + theming)
- Add 1-2 days if newer to SwiftUI idioms
