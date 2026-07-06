// ============================================================
// FUNZIONE SERVERLESS — stripe-webhook
// Percorso pubblico: /api/stripe-webhook
// Piattaforma di riferimento: Netlify Functions (Node.js)
//
// Differenza importante rispetto a Vercel: su Vercel bisognava disattivare
// il bodyParser (module.exports.config = { api: { bodyParser: false } })
// per ottenere il corpo "raw" necessario alla verifica della firma Stripe.
// Su Netlify il corpo arriva SEMPRE come stringa grezza in event.body
// (Netlify non lo interpreta mai come JSON in automatico), quindi non
// serve nessuna configurazione speciale: possiamo passare event.body
// direttamente a stripe.webhooks.constructEvent.
//
// Unica attenzione: se in futuro Stripe invia un payload binario e Netlify
// segnala event.isBase64Encoded = true, va decodificato da base64 prima
// di passarlo alla verifica (gestito qui sotto per sicurezza).
//
// Configurazione da fare su Stripe Dashboard > Developers > Webhooks:
//   - Endpoint: https://tuosito.it/api/stripe-webhook
//   - Evento da ascoltare: checkout.session.completed
//   - Copiare il "Signing secret" in STRIPE_WEBHOOK_SECRET
//
// Variabili d'ambiente necessarie:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Metodo non consentito.' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const corpoRaw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  const firma = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  let evento;
  try {
    evento = stripe.webhooks.constructEvent(corpoRaw, firma, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Firma webhook non valida:', err.message);
    return { statusCode: 400, body: `Firma non valida: ${err.message}` };
  }

  if (evento.type === 'checkout.session.completed') {
    const session = evento.data.object;
    const strutturaId = session.metadata && session.metadata.struttura_id;
    const tipoSessione = (session.metadata && session.metadata.tipo) || 'iscrizione';

    if (!strutturaId) {
      console.error('Webhook ricevuto senza struttura_id nei metadata.');
      return { statusCode: 400, body: 'struttura_id mancante nei metadata della sessione.' };
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const oggi = new Date();

    if (tipoSessione === 'rinnovo') {
      const { data: struttura, error: fetchError } = await supabaseAdmin
        .from('strutture')
        .select('id, data_scadenza, stato')
        .eq('id', strutturaId)
        .single();

      if (fetchError || !struttura) {
        console.error('Rinnovo: struttura non trovata:', strutturaId);
        return { statusCode: 404, body: 'Struttura non trovata per il rinnovo.' };
      }

      const scadenzaAttuale = struttura.data_scadenza ? new Date(struttura.data_scadenza) : oggi;
      const baseCalcolo = scadenzaAttuale > oggi ? scadenzaAttuale : oggi;
      const nuovaScadenza = new Date(baseCalcolo);
      nuovaScadenza.setFullYear(nuovaScadenza.getFullYear() + 1);

      const { error: updateError } = await supabaseAdmin
        .from('strutture')
        .update({
          stato: 'attiva',
          data_scadenza: nuovaScadenza.toISOString().slice(0, 10),
          promemoria_30_inviato: false,
          promemoria_7_inviato: false,
          promemoria_post_scadenza_inviato: false,
          stripe_customer_id: session.customer || null,
          stripe_checkout_session: session.id,
          stripe_payment_intent: session.payment_intent || null
        })
        .eq('id', strutturaId);

      if (updateError) {
        console.error('Errore aggiornamento struttura dopo rinnovo:', updateError.message);
        return { statusCode: 500, body: 'Errore aggiornamento database.' };
      }

      console.log(`Struttura ${strutturaId} rinnovata con successo, nuova scadenza ${nuovaScadenza.toISOString().slice(0, 10)}.`);

    } else {
      const scadenza = new Date(oggi);
      scadenza.setFullYear(scadenza.getFullYear() + 1);

      const { error: updateError } = await supabaseAdmin
        .from('strutture')
        .update({
          stato: 'attiva',
          data_attivazione: oggi.toISOString(),
          data_scadenza: scadenza.toISOString().slice(0, 10),
          stripe_customer_id: session.customer || null,
          stripe_checkout_session: session.id,
          stripe_payment_intent: session.payment_intent || null
        })
        .eq('id', strutturaId)
        .eq('stato', 'in_attesa_pagamento');

      if (updateError) {
        console.error('Errore aggiornamento struttura dopo pagamento:', updateError.message);
        return { statusCode: 500, body: 'Errore aggiornamento database.' };
      }

      console.log(`Struttura ${strutturaId} attivata con successo dopo pagamento.`);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
