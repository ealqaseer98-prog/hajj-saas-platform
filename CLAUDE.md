## Project
This is a multi-tenant SaaS Hajj/Umrah campaign management platform (hajj-saas-platform), derived from the single-campaign Al-Ammar system. Stack: React + Vite + TypeScript, Supabase (Postgres, Auth, Storage), TanStack Query, Zustand, Tailwind. Frontend runs on port 5175.

## CRITICAL RULES
- This is MULTI-TENANT. Every data table MUST have `campaign_id uuid not null` and RLS policies that isolate by campaign. No table ships without isolation.
- NEVER touch or modify the live Al-Ammar production system/database. This is a separate project.
- The live Supabase project for this app is ref `wsrfhwybxhnpldixamqt`. Do not confuse it with Al-Ammar (`oogtpuqoggkajzqodtxo`).

## Multi-tenant table pattern (apply to EVERY new table)
- `campaign_id uuid not null default ((auth.jwt() -> 'app_metadata') ->> 'campaign_id')::uuid`
- Enable RLS. One `FOR ALL` policy: `USING (campaign_id = ((auth.jwt() -> 'app_metadata') ->> 'campaign_id')::uuid) WITH CHECK (same)`.
- `id uuid primary key default uuid_generate_v4()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`.
- `BEFORE UPDATE` trigger calling `update_updated_at()` (this function already exists in the DB).

## Gotchas learned
- NEVER put CHECK constraints on Arabic-valued columns — Arabic text read from page source gets character-reversed, so the constraint won't match what the page submits and inserts will fail. Only use CHECK on verified Latin-lettered enums (status, request_type, sender_type, gender, photo_type).
- When writing SQL for a new table, output SQL only for the user to run in Supabase — do not attempt to run it.
- ALL tables with `campaign_id` must have the JWT default `((auth.jwt() -> 'app_metadata') ->> 'campaign_id')::uuid`, or inserts fail with 403 under RLS. The original tables (accounts, hotels, receipts, room_assignments, rooms, travellers, trips) were missing it and have now been fixed. `profiles` is intentionally excluded (campaign assigned on approval, not from own JWT).

## Tables that EXIST (do not recreate)
accounts, campaigns, hotels, invoices, profiles, receipts, room_assignments, rooms, traveller_trips, travellers, trip_legs, trips, staff, pre_registrations.

## Tables still to build (migration in progress)
notifications, fcm_tokens, adahi_status, hajj_rituals, room_requests, room_request_messages, buses, bus_assignments, cars, car_usage, car_photos (+ car-photos storage bucket), expenses, account_transfers, traveller_documents, payment_reminders, whatsapp_log, visa_history.

## "Module done" checklist (verify before ticking off)
1. Table(s) created with campaign_id + RLS. 2. Page loads with no crash/error banner. 3. Adding a record works and appears. 4. Data is campaign-isolated.

## Deferred / known incomplete
- `PilgrimPortalPage.tsx`'s anonymous `fcm_tokens` upsert (pilgrim enabling notifications) and the staff-token push lookup (`user_type = 'staff'` filter) are not functional yet: the page has no campaign_id scoping at all, and no insert path sets `user_type`. Standard JWT-based RLS on `fcm_tokens` will reject the anonymous pilgrim write. This is expected — not a bug to fix opportunistically. Anonymous-pilgrim campaign-scoping + FCM push is a separate future task.
