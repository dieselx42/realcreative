-- Log every scan, not just leads.
--
-- Before this migration a scan_request could only exist once a lead was
-- captured (lead_id / restaurant_id were NOT NULL), so anonymous scans — a
-- visitor who runs a scan but never submits the email gate — left no trace.
-- This makes the lead linkage optional so a scan row is created up front (at
-- scan time) and later *attached* to a lead when the visitor converts.
--
-- Safe to run on an existing database. The app also degrades gracefully: if
-- this migration hasn't been applied, up-front scan logging is a best-effort
-- no-op and the funnel still creates a lead+scan at the gate as before.

alter table public.scan_requests
  alter column lead_id drop not null,
  alter column restaurant_id drop not null;

-- Scan context, so the admin can show what was scanned before a lead exists.
alter table public.scan_requests
  add column if not exists business_name text,
  add column if not exists city text;

-- Whether a scan converted to a lead is simply "lead_id is not null"; index it
-- so the admin can sort/filter converted vs anonymous scans cheaply.
create index if not exists scan_requests_lead_id_idx
  on public.scan_requests (lead_id);
