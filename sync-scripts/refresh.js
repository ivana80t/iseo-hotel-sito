// refresh.js
//
// SCOPO: rispettare il limite di Google (max 30 giorni di cache) senza dover
// rifare la ricerca da capo. Legge dalla tabella i place_id già noti e, per
// ognuno, richiama Google Place Details per aggiornare nome/indirizzo/stato.
//
// Va lanciato periodicamente (es. ogni 25 giorni) da un job schedulato,
// es. GitHub Actions con "schedule" (vedi README.md).
//
// Uso: node refresh.js

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!GOOGLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Mancano variabili in .env (GOOGLE_PLACES_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const FIELD_MASK = ['displayName', 'formattedAddress', 'businessStatus'].join(',');

// Rigenera i dati solo per le strutture con cache più vecchia di N giorni,
// per non richiamare l'API inutilmente su record appena sincronizzati.
const GIORNI_SOGLIA = 25;

async function ricaricaDettagli(placeId) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
  });

  if (res.status === 404) {
    return { notFound: true };
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Place Details error (${res.status}): ${errText}`);
  }

  return res.json();
}

async function main() {
  const sogliaData = new Date();
  sogliaData.setDate(sogliaData.getDate() - GIORNI_SOGLIA);

  console.log(`Cerco strutture con cache più vecchia di ${GIORNI_SOGLIA} giorni (prima di ${sogliaData.toISOString()})...`);

  // Prendiamo TUTTE le strutture con place_id valorizzato (escludendo quelle
  // manuali, che hanno place_id null e non vanno mai passate a Google) e non
  // ancora segnate come chiuse. Il filtro sulla data lo facciamo dopo in JS,
  // perché il confronto ".lt()" di Supabase su una colonna con valori NULL
  // esclude quelle righe invece di trattarle come "mai sincronizzate".
  const { data: candidate, error } = await supabase
    .from('strutture')
    .select('id, place_id, nome, last_synced_at')
    .not('place_id', 'is', null)
    .neq('stato', 'chiusa'); // non serve ricontrollare quelle già segnate chiuse

  if (error) {
    console.error('Errore lettura da Supabase:', error.message);
    process.exit(1);
  }

  // "Da aggiornare" = mai sincronizzata (last_synced_at null) OPPURE
  // sincronizzata più di GIORNI_SOGLIA giorni fa.
  const strutture = (candidate || []).filter((s) => {
    if (!s.last_synced_at) return true;
    return new Date(s.last_synced_at) < sogliaData;
  });

  if (!strutture || strutture.length === 0) {
    console.log('Nessuna struttura da aggiornare. Tutto già sincronizzato di recente.');
    return;
  }

  console.log(`Trovate ${strutture.length} strutture da aggiornare (su ${candidate.length} con place_id valido).\n`);

  let aggiornate = 0;
  let chiuse = 0;
  let daVerificare = 0;

  for (const s of strutture) {
    try {
      const dettagli = await ricaricaDettagli(s.place_id);

      if (dettagli.notFound) {
        // place_id non più valido: probabilmente la scheda Google è stata rimossa.
        // Non cancelliamo il record, lo segnaliamo per controllo manuale.
        await supabase
          .from('strutture')
          .update({ stato: 'da_verificare', last_synced_at: new Date().toISOString() })
          .eq('id', s.id);
        console.log(`  [DA VERIFICARE] ${s.nome} — place_id non più trovato su Google`);
        daVerificare++;
        continue;
      }

      if (dettagli.businessStatus === 'CLOSED_PERMANENTLY') {
        await supabase
          .from('strutture')
          .update({ stato: 'chiusa', last_synced_at: new Date().toISOString() })
          .eq('id', s.id);
        console.log(`  [CHIUSA] ${s.nome}`);
        chiuse++;
        continue;
      }

      await supabase
        .from('strutture')
        .update({
          nome: dettagli.displayName?.text ?? s.nome,
          indirizzo: dettagli.formattedAddress,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', s.id);

      console.log(`  [OK] ${s.nome}`);
      aggiornate++;
    } catch (err) {
      console.error(`  [ERRORE] ${s.nome}:`, err.message);
    }

    // Piccola pausa tra le chiamate per restare entro i rate limit di Google
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nRiepilogo: ${aggiornate} aggiornate, ${chiuse} segnate come chiuse, ${daVerificare} da verificare manualmente.`);
}

main().catch((err) => {
  console.error('Errore imprevisto:', err);
  process.exit(1);
});
