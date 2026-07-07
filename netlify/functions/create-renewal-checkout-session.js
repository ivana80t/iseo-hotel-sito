// ============================================================
// FUNZIONE SERVERLESS — create-renewal-checkout-session
// Percorso pubblico: /api/create-renewal-checkout-session
// Piattaforma di riferimento: Netlify Functions (Node.js)
//
// Stessa logica della versione Vercel (rinnovo di una struttura "attiva"
// o "scaduta"), adattata alla firma (event, context) / return di Netlify.
//
// Variabili d'ambiente necessarie (stesse di create-checkout-session.js):
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SITE_URL
// ============================================================

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

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

  const { struttura_id } = body;
  if (!struttura_id) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Parametro struttura_id mancante.' }) };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: struttura, error: fetchError } = await supabaseAdmin
      .from('strutture')
      .select('id, nome_struttura, email, stato')
      .eq('id', struttura_id)
      .single();

    if (fetchError || !struttura) {
      return { statusCode: 404, body: JSON.stringify({ errore: 'Struttura non trovata.' }) };
    }

    if (struttura.stato === 'in_attesa_pagamento') {
      return {
        statusCode: 409,
        body: JSON.stringify({ errore: "Questa struttura non ha ancora completato l'iscrizione iniziale." })
      };
    }
    if (struttura.stato === 'disattivata') {
      return {
        statusCode: 409,
        body: JSON.stringify({ errore: 'Questa struttura è stata disattivata dalla redazione: contattaci per riattivarla.' })
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: struttura.email,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: 5900,
            product_data: {
              name: `Rinnovo quota annuale — ${struttura.nome_struttura}`,
              description: 'Iseo Sapori e Soggiorni: rinnovo scheda struttura per altri 12 mesi.'
            }
          },
          quantity: 1
        }
      ],
      metadata: { struttura_id: struttura.id, tipo: 'rinnovo' },
      success_url: `${process.env.SITE_URL}/pagamento-confermato.html?struttura_id=${struttura.id}&rinnovo=1`,
      cancel_url: `${process.env.SITE_URL}/rinnova-struttura.html?struttura_id=${struttura.id}&errore=annullato`
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

  } catch (err) {
    console.error('Errore create-renewal-checkout-session:', err);
    return { statusCode: 500, body: JSON.stringify({ errore: 'Errore interno durante la creazione del pagamento di rinnovo.' }) };
  }
};
