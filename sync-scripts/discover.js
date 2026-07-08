// discover.js
// Cerca strutture ricettive (hotel, B&B, agriturismi, appartamenti...) entro
// 6km dal centro di Iseo usando OpenStreetMap (Overpass API), raggruppa i
// risultati per comune e salva su Supabase solo quelle del comune di Iseo.
//
// Uso: npm run discover

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// --- Configurazione -------------------------------------------------------

const CENTRO_ISEO = { lat: 45.6564, lon: 10.0886 }; // Piazza Garibaldi, Iseo
const RAGGIO_METRI = 6000;
const COMUNE_DA_SALVARE = 'Iseo';

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('âŒ Mancano SUPABASE_URL o SUPABASE_SERVICE_KEY nel file .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Query Overpass ---------------------------------------------------

// Cerchiamo nodi/way con tag tourism relativi a strutture ricettive
function buildOverpassQuery(lat, lon, raggio) {
  return `
    [out:json][timeout:60];
    (
      node["tourism"~"^(hotel|guest_house|hostel|apartment|chalet|motel|camp_site)$"](around:${raggio},${lat},${lon});
      way["tourism"~"^(hotel|guest_house|hostel|apartment|chalet|motel|camp_site)$"](around:${raggio},${lat},${lon});
    );
    out center tags;
  `;
}

async function fetchStruttureOSM() {
  const query = buildOverpassQuery(CENTRO_ISEO.lat, CENTRO_ISEO.lon, RAGGIO_METRI);

  let ultimoErrore;

  for (const url of OVERPASS_URLS) {
    try {
      console.log(`   Provo il server: ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'iseo-strutture-sync/1.0 (script uso interno)',
        },
        body: 'data=' + encodeURIComponent(query),
      });

      if (!res.ok) {
        throw new Error(`risposta con status ${res.status}`);
      }

      const data = await res.json();
      return data.elements || [];
    } catch (err) {
      console.log(`   âš ï¸  Server non disponibile (${err.message}), provo il prossimo...`);
      ultimoErrore = err;
    }
  }

  throw new Error(
    `Tutti i server Overpass hanno fallito. Ultimo errore: ${ultimoErrore?.message}`
  );
}

// --- Utility ----------------------------------------------------------

function distanzaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estraiComune(tags) {
  // OSM spesso ha addr:city, a volte solo il comune amministrativo.
  return tags['addr:city'] || tags['addr:suburb'] || null;
}

// Pulisce il nome del comune: rimuove sigle di provincia, parentesi e spazi
// doppi, poi normalizza per il confronto.
// Esempi: "Iseo BS" -> "Iseo", "Sale Marasino (BS)" -> "Sale Marasino"
function pulisciComune(nomeGrezzo) {
  if (!nomeGrezzo) return null;
  const nome = nomeGrezzo
    .replace(/\(?\b[A-Z]{2}\)?$/, '') // rimuove sigla provincia finale, es "BS"
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return nome || null;
}

// Attende un certo numero di millisecondi (per rispettare i limiti di Nominatim)
function attendi(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reverse geocoding: dato lat/lon, chiede a Nominatim (OSM) di che comune si
// tratta. Nominatim richiede max 1 richiesta al secondo e uno User-Agent.
async function trovaComuneDaCoordinate(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'iseo-strutture-sync/1.0 (script uso interno)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const indirizzo = data.address || {};
    return (
      indirizzo.city ||
      indirizzo.town ||
      indirizzo.village ||
      indirizzo.municipality ||
      null
    );
  } catch (err) {
    console.log(`   âš ï¸  Errore geocoding: ${err.message}`);
    return null;
  }
}

// Ora asincrona: se OSM non ha il comune, prova il reverse geocoding
// come fallback prima di rinunciare.
async function normalizzaElemento(el, contatoreGeocoding) {
  const tags = el.tags || {};
  const lat = el.type === 'node' ? el.lat : el.center?.lat;
  const lon = el.type === 'node' ? el.lon : el.center?.lon;

  if (lat == null || lon == null) return null;

  const via = [tags['addr:street'], tags['addr:housenumber']]
    .filter(Boolean)
    .join(' ');

  let comune = pulisciComune(estraiComune(tags));
  let fonteComune = comune ? 'osm-tag' : null;

  if (!comune) {
    contatoreGeocoding.n++;
    const nomeStruttura = tags.name || `(id ${el.id})`;
    console.log(
      `   [${contatoreGeocoding.n}] Comune mancante per "${nomeStruttura}", provo il geocoding...`
    );
    await attendi(1100); // rispetta il limite di 1 richiesta/secondo di Nominatim
    comune = pulisciComune(await trovaComuneDaCoordinate(lat, lon));
    fonteComune = comune ? 'geocoding' : null;
  }

  return {
    osm_id: String(el.id),
    osm_type: el.type,
    nome: tags.name || null,
    tipo: tags.tourism || null,
    comune,
    fonte_comune: fonteComune,
    indirizzo: via || null,
    telefono: tags.phone || tags['contact:phone'] || null,
    sito_web: tags.website || tags['contact:website'] || null,
    email: tags.email || tags['contact:email'] || null,
    latitudine: lat,
    longitudine: lon,
    distanza_km: Number(
      distanzaKm(CENTRO_ISEO.lat, CENTRO_ISEO.lon, lat, lon).toFixed(2)
    ),
  };
}

// --- Main ---------------------------------------------------------------

async function main() {
  console.log(`ðŸ”Ž Cerco strutture ricettive entro ${RAGGIO_METRI / 1000}km da Iseo...`);

  const elementiGrezzi = await fetchStruttureOSM();
  console.log(`   Trovati ${elementiGrezzi.length} elementi grezzi da OpenStreetMap.`);

  // Scartiamo subito quelle senza nome, poco utili, per non sprecare
  // richieste di geocoding su elementi che comunque non terremmo.
  const elementiConNome = elementiGrezzi.filter((el) => (el.tags || {}).name);

  const contatoreGeocoding = { n: 0 };
  const strutture = [];
  for (const el of elementiConNome) {
    const s = await normalizzaElemento(el, contatoreGeocoding);
    if (s) strutture.push(s);
  }

  // Raggruppa per comune (usiamo "Sconosciuto" se OSM non ha il campo)
  const conteggi = {};
  for (const s of strutture) {
    const chiave = s.comune || 'Sconosciuto';
    conteggi[chiave] = (conteggi[chiave] || 0) + 1;
  }

  console.log('\nðŸ“Š Riepilogo per comune:');
  Object.entries(conteggi)
    .sort((a, b) => b[1] - a[1])
    .forEach(([comune, n]) => console.log(`   ${comune}: ${n} strutture`));

  // Filtra solo quelle di Iseo per il salvataggio
  const daSalvare = strutture.filter(
    (s) => (s.comune || '').toLowerCase() === COMUNE_DA_SALVARE.toLowerCase()
  );

  console.log(
    `\nðŸ’¾ Salvo su Supabase ${daSalvare.length} strutture del comune di ${COMUNE_DA_SALVARE}...`
  );

  if (daSalvare.length === 0) {
    console.log('   Nessuna struttura da salvare, esco.');
    return;
  }

  const { error } = await supabase
    .from('strutture_scoperte')
    .upsert(daSalvare, { onConflict: 'osm_type,osm_id' });

  if (error) {
    console.error('âŒ Errore salvataggio su Supabase:', error.message);
    process.exit(1);
  }

  console.log('âœ… Fatto! Strutture salvate/aggiornate su strutture_scoperte.');
}

main().catch((err) => {
  console.error('âŒ Errore imprevisto:', err);
  process.exit(1);
});
