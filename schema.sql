-- ============================================================
-- SCHEMA DATABASE — Iseo Sapori e Soggiorni
-- Da incollare nell'SQL Editor di Supabase (Project > SQL Editor > New query)
-- ============================================================

-- Estensione per generare UUID automaticamente
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- TABELLA PRINCIPALE: strutture
-- Un record = una struttura iscritta (hotel, B&B, residence, ristorante...)
-- ------------------------------------------------------------
create table strutture (
  id                  uuid primary key default gen_random_uuid(),

  -- Identificativo leggibile usato nell'URL, es: hotel-dettaglio.html?slug=corte-antica
  -- Generato dal nome struttura (es. "B&B Corte Antica" -> "bb-corte-antica")
  slug                text unique not null,

  -- --- Dati anagrafici (dal form "Pubblica la tua struttura") ---
  tipologia           text not null check (tipologia in (
                         'boutique','spa','famiglie','romantici','economici',
                         'bed-breakfast','residence','ristorante','altro'
                       )),
  nome_struttura       text not null,
  nome_referente       text not null,
  email                text not null,
  telefono             text not null,   -- usato anche per link WhatsApp e "Chiama ora"
  citta                text not null,
  indirizzo            text not null,
  sito_web             text,
  descrizione          text not null,

  -- --- Servizi, carte, lingue: array di testo (checkbox multipli dal form) ---
  servizi              text[] default '{}',   -- es: {wifi-gratuito, colazione-inclusa, ...}
  carte_accettate      text[] default '{}',   -- es: {visa, mastercard, contanti}
  lingue               text[] default '{}',   -- es: {italiano, inglese}

  orario_checkin       time,
  orario_checkout      time,
  parcheggio           text,  -- privato-gratuito | privato-pagamento | pubblico-vicinanze | non-disponibile

  -- --- Immagini: fino a 12, caricate su Supabase Storage.
  -- immagini[0] = foto hero, le successive alimentano striscia foto + galleria ---
  immagini             text[] default '{}',

  -- --- Dati "vetrina" mostrati nelle card e nella scheda ---
  prezzo_da            numeric(6,2),        -- prezzo indicativo "a partire da", compilato dalla struttura in fase di iscrizione
  distanza_lago_metri  integer,             -- usato per ordinamento "Vicinanza al lago"

  -- --- Stato pubblicazione / pagamento ---
  stato                text not null default 'in_attesa_pagamento' check (stato in (
                         'in_attesa_pagamento',  -- form inviato, pagamento non ancora confermato
                         'attiva',               -- pagamento confermato, visibile sul sito
                         'scaduta',               -- quota annuale non rinnovata
                         'disattivata'            -- sospesa manualmente dalla redazione
                       )),
  data_creazione       timestamptz not null default now(),
  data_attivazione     timestamptz,          -- valorizzata quando lo stato passa ad "attiva"
  data_scadenza        date,                 -- data_attivazione + 1 anno, per il rinnovo

  -- --- Riferimenti Stripe (usati dal webhook per aggiornare lo stato) ---
  stripe_customer_id      text,
  stripe_checkout_session text,
  stripe_payment_intent   text
);

-- Indici utili per le query più frequenti
create index idx_strutture_stato     on strutture (stato);
create index idx_strutture_tipologia on strutture (tipologia);
create index idx_strutture_slug      on strutture (slug);

-- ------------------------------------------------------------
-- Sicurezza: Row Level Security (RLS)
-- Il sito pubblico deve poter LEGGERE solo le strutture "attiva".
-- Scrittura/aggiornamento riservati al backend (chiave service_role), mai al browser.
-- ------------------------------------------------------------
alter table strutture enable row level security;

create policy "Lettura pubblica solo strutture attive"
  on strutture for select
  using (stato = 'attiva');

-- Nessuna policy di insert/update per il ruolo "anon":
-- l'inserimento (dal form) e l'aggiornamento (dal webhook Stripe)
-- passeranno sempre da una funzione serverless con la service_role key,
-- mai direttamente dal browser del visitatore.

-- ------------------------------------------------------------
-- NOTA: il portale non prevede un sistema di recensioni/valutazioni
-- (le strutture non compilano né stelle né punteggio). Se la tabella
-- "strutture" è già stata creata con lo schema precedente (che includeva
-- le colonne valutazione/numero_recensioni), rimuoverle con:
--
--   alter table strutture drop column if exists valutazione;
--   alter table strutture drop column if exists numero_recensioni;
-- ------------------------------------------------------------

