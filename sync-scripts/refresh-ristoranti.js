// refresh-ristoranti.js
//
// SCOPO: rispettare il limite di Google (max 30 giorni di cache) senza dover
// rifare la ricerca da capo. Legge dalla tabella i place_id già noti e, per
// ognuno, richiama Google Place Details per aggiornare nome/indirizzo/stato.
//
// Va lanciato periodicamente (es. ogni 25 giorni) da un job schedulato,
// es. GitHub Actions con "schedule" (vedi refresh.yml).
//
// Uso: node refresh-ristoranti.js

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

// Rigenera i dati solo per i locali con cache più vecchia di N giorni,
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

  console.log(`Cerco ristoranti con cache più vecchia di ${GIORNI_SOGLIA} giorni (prima di ${sogliaData.toISOString()})...`);

  const { data: ristoranti, error } = await supabase
    .from('ristoranti')
    .select('id, place_id, nome')
    .lt('last_synced_at', sogliaData.toISOString())
    .neq('stato', 'chiusa'); // non serve ricontrollare quelli già segnati chiusi

  if (error) {
    console.error('Errore lettura da Supabase:', error.message);
    process.exit(1);
  }

  if (!ristoranti || ristoranti.length === 0) {
    console.log('Nessun ristorante da aggiornare. Tutto già sincronizzato di recente.');
    return;
  }

  console.log(`Trovati ${ristoranti.length} ristoranti da aggiornare.\n`);

  let aggiornati = 0;
  let chiusi = 0;
  let daVerificare = 0;

  for (const r of ristoranti) {
    try {
      const dettagli = await ricaricaDettagli(r.place_id);

      if (dettagli.notFound) {
        // place_id non più valido: probabilmente la scheda Google è stata rimossa.
        // Non cancelliamo il record, lo segnaliamo per controllo manuale.
        await supabase
          .from('ristoranti')
          .update({ stato: 'da_verificare', last_synced_at: new Date().toISOString() })
          .eq('id', r.id);
        console.log(`  [DA VERIFICARE] ${r.nome} — place_id non più trovato su Google`);
        daVerificare++;
        continue;
      }

      if (dettagli.businessStatus === 'CLOSED_PERMANENTLY') {
        await supabase
          .from('ristoranti')
          .update({ stato: 'chiusa', last_synced_at: new Date().toISOString() })
          .eq('id', r.id);
        console.log(`  [CHIUSO] ${r.nome}`);
        chiusi++;
        continue;
      }

      await supabase
        .from('ristoranti')
        .update({
          nome: dettagli.displayName?.text ?? r.nome,
          indirizzo: dettagli.formattedAddress,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', r.id);

      console.log(`  [OK] ${r.nome}`);
      aggiornati++;
    } catch (err) {
      console.error(`  [ERRORE] ${r.nome}:`, err.message);
    }

    // Piccola pausa tra le chiamate per restare entro i rate limit di Google
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(`\nRiepilogo: ${aggiornati} aggiornati, ${chiusi} segnati come chiusi, ${daVerificare} da verificare manualmente.`);
}

main().catch((err) => {
  console.error('Errore imprevisto:', err);
  process.exit(1);
});
