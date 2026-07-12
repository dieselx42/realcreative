-- Adds the landing-quiz "primary goal" to leads, for segmentation.
-- Safe to run on an existing database; the app also writes it best-effort, so
-- lead creation still works if this migration hasn't been applied yet.

alter table leads
  add column if not exists goal text;
