-- ============================================================
-- ADDENDUM SCHEMA — Gestione scadenza e rinnovo annuale
-- Da incollare nell'SQL Editor di Supabase.
--
-- Aggiunge due colonne per ricordarsi se il promemoria a 30 e a 7 giorni
-- dalla scadenza è già stato inviato: senza questo, se il cron gira più
-- volte nello stesso giorno (o recupera un giorno saltato) rischieremmo
-- di inviare la stessa email più volte alla stessa struttura.
--
-- Vengono resettate a "false" automaticamente dal webhook Stripe ogni
-- volta che una struttura rinnova il pagamento (vedi stripe-webhook.js),
-- così l'anno successivo i promemoria potranno essere inviati di nuovo.
-- ============================================================

alter table strutture add column if not exists promemoria_30_inviato boolean not null default false;
alter table strutture add column if not exists promemoria_7_inviato  boolean not null default false;
alter table strutture add column if not exists promemoria_post_scadenza_inviato boolean not null default false;

-- Indice utile per la query giornaliera del cron (cerca per stato + scadenza)
create index if not exists idx_strutture_stato_scadenza on strutture (stato, data_scadenza);
