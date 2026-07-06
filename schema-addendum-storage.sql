-- ============================================================
-- ADDENDUM SCHEMA — Policy di Storage per il bucket immagini
-- Da incollare nell'SQL Editor di Supabase DOPO aver creato il bucket
-- "strutture-immagini" (Project > Storage > New bucket > Public).
--
-- Perché serve: la tabella "strutture" NON riceve più insert diretti dal
-- browser (passano da /api/pubblica-struttura con la service_role key),
-- ma le IMMAGINI restano caricate direttamente dal browser sul bucket di
-- Storage, perché un endpoint serverless non è un buon posto per
-- gestire upload di file binari potenzialmente grandi.
--
-- Questa policy permette ai visitatori anonimi SOLO di caricare file nel
-- bucket "strutture-immagini" — non di leggerne l'elenco, non di
-- sovrascriverli, non di cancellarli. La lettura pubblica delle immagini
-- avviene comunque tramite l'URL pubblico del bucket (Public bucket),
-- non tramite questa policy.
-- ============================================================

create policy "Upload pubblico immagini strutture"
  on storage.objects for insert
  with check (bucket_id = 'strutture-immagini');

-- Nota: niente policy di update/delete per "anon" su questo bucket —
-- una volta caricata un'immagine, solo il backend (service_role key)
-- potrà eventualmente sostituirla o rimuoverla in futuro.
