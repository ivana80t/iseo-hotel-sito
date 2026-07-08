// ============================================================
// FUNZIONE SERVERLESS — pubblica-struttura
// Percorso pubblico: /api/pubblica-struttura
// Piattaforma di riferimento: Netlify Functions (Node.js)
//
// Stessa logica di validazione e creazione record della versione Vercel;
// cambia solo l'involucro (event.body va parsato manualmente, la risposta
// è un oggetto {statusCode, body}).
//
// Variabili d'ambiente necessarie:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const TIPOLOGIE_VALIDE = [
  'boutique', 'spa', 'famiglie', 'romantici', 'economici',
  'bed-breakfast', 'residence', 'ristorante', 'altro'
];
const PARCHEGGIO_VALIDI = [
  'privato-gratuito', 'privato-pagamento', 'pubblico-vicinanze', 'non-disponibile'
];
const MAX_IMMAGINI = 12;

function emailValida(indirizzo) {
  return typeof indirizzo === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(indirizzo);
}

function testoValido(valore, maxLen) {
  return typeof valore === 'string' && valore.trim().length > 0 && valore.trim().length <= maxLen;
}

function orarioValido(valore) {
  return valore == null || valore === '' || /^\d{2}:\d{2}(:\d{2})?$/.test(valore);
}

function generaSlug(nomeStruttura) {
  const base = nomeStruttura
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
  const suffisso = Math.random().toString(36).slice(2, 6);
  return `${base || 'struttura'}-${suffisso}`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { Allow: 'POST' },
      body: JSON.stringify({ errore: 'Metodo non consentito.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Corpo della richiesta non valido.' }) };
  }

  const errori = [];

  if (!TIPOLOGIE_VALIDE.includes(body.tipologia)) errori.push('Tipologia non valida.');
  if (!testoValido(body.nome_struttura, 200)) errori.push('Nome struttura mancante o troppo lungo.');
  if (!testoValido(body.nome_referente, 200)) errori.push('Nome referente mancante.');
  if (!emailValida(body.email)) errori.push('Email non valida.');
  if (!testoValido(body.telefono, 40)) errori.push('Telefono mancante.');
  if (!testoValido(body.citta, 100)) errori.push('Città mancante.');
  if (!testoValido(body.indirizzo, 200)) errori.push('Indirizzo mancante.');
  if (!testoValido(body.descrizione, 4000)) errori.push('Descrizione mancante o troppo lunga.');
  if (body.sito_web && (typeof body.sito_web !== 'string' || body.sito_web.length > 300)) errori.push('Sito web non valido.');
  if (body.parcheggio && !PARCHEGGIO_VALIDI.includes(body.parcheggio)) errori.push('Valore parcheggio non valido.');
  if (!orarioValido(body.orario_checkin)) errori.push('Orario check-in non valido.');
  if (!orarioValido(body.orario_checkout)) errori.push('Orario check-out non valido.');

  const prezzo = parseFloat(body.prezzo_da);
  if (isNaN(prezzo) || prezzo < 0 || prezzo > 100000) errori.push('Prezzo indicativo non valido.');

  const servizi = Array.isArray(body.servizi) ? body.servizi.filter(v => typeof v === 'string').slice(0, 40) : [];
  const carte_accettate = Array.isArray(body.carte_accettate) ? body.carte_accettate.filter(v => typeof v === 'string').slice(0, 20) : [];
  const lingue = Array.isArray(body.lingue) ? body.lingue.filter(v => typeof v === 'string').slice(0, 20) : [];
  const immagini = Array.isArray(body.immagini)
    ? body.immagini.filter(v => typeof v === 'string' && v.startsWith('http')).slice(0, MAX_IMMAGINI)
    : [];

  if (errori.length > 0) {
    return { statusCode: 400, body: JSON.stringify({ errore: errori.join(' ') }) };
  }

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const recordBase = {
      tipologia: body.tipologia,
      nome_struttura: body.nome_struttura.trim(),
      nome_referente: body.nome_referente.trim(),
      email: body.email.trim(),
      telefono: body.telefono.trim(),
      citta: body.citta.trim(),
      indirizzo: body.indirizzo.trim(),
      sito_web: body.sito_web ? body.sito_web.trim() : null,
      prezzo_da: prezzo,
      descrizione: body.descrizione.trim(),
      servizi,
      carte_accettate,
      lingue,
      orario_checkin: body.orario_checkin || null,
      orario_checkout: body.orario_checkout || null,
      parcheggio: body.parcheggio || null,
      immagini,
      stato: 'in_attesa_pagamento'
    };

    let struttura = null;
    let ultimoErrore = null;

    for (let tentativo = 0; tentativo < 3 && !struttura; tentativo++) {
      const slug = generaSlug(body.nome_struttura);
      const { data, error } = await supabaseAdmin
        .from('strutture')
        .insert({ ...recordBase, slug })
        .select('id, slug')
        .single();

      if (!error) {
        struttura = data;
      } else if (error.code === '23505') {
        ultimoErrore = error;
        continue;
      } else {
        throw error;
      }
    }

    if (!struttura) {
      console.error('Impossibile generare uno slug univoco dopo 3 tentativi:', ultimoErrore);
      return { statusCode: 500, body: JSON.stringify({ errore: 'Errore durante il salvataggio. Riprova.' }) };
    }

    // --- Collegamento con la scheda "scoperta" (se si arriva da hotel.html,
    // bottone "Attiva la scheda" -> pubblica-struttura.html?scoperta_id=...) ---
    // Colleghiamo struttura_scoperte.struttura_id alla struttura appena creata
    // e la segnamo come "promossa" così non ricompare più tra quelle da attivare.
    // Se questo update fallisce non blocchiamo la risposta: la struttura e il
    // pagamento devono comunque andare avanti, il collegamento si può sistemare
    // anche a mano dal database in caso di problemi.
    if (testoValido(body.scoperta_id, 100)) {
      const { error: erroreCollegamento } = await supabaseAdmin
        .from('strutture_scoperte')
        .update({ struttura_id: struttura.id, promossa: true })
        .eq('id', body.scoperta_id);

      if (erroreCollegamento) {
        console.error('Errore collegamento scoperta_id -> struttura:', erroreCollegamento);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ id: struttura.id, slug: struttura.slug }) };

  } catch (err) {
    console.error('Errore pubblica-struttura:', err);
    return { statusCode: 500, body: JSON.stringify({ errore: 'Errore interno durante il salvataggio dei dati.' }) };
  }
};
