// ============================================================
// FUNZIONE SERVERLESS — create-checkout-session
// Percorso pubblico: /api/create-checkout-session
// (reindirizzato a /.netlify/functions/create-checkout-session da netlify.toml)
// Piattaforma di riferimento: Netlify Functions (Node.js)
//
// Cosa fa: identico a prima (versione Vercel), cambia solo il "contenitore"
// della funzione:
//   - niente più (req, res) ma (event, context) e un valore di ritorno
//   - il body arriva come stringa in event.body, va fatto JSON.parse
//   - la risposta si restituisce come { statusCode, headers, body }
//     invece di chiamare res.status().json()
//
// Variabili d'ambiente necessarie (Netlify: Site configuration >
// Environment variables — MAI nel codice):
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

    if (struttura.stato === 'attiva') {
      return { statusCode: 409, body: JSON.stringify({ errore: 'Questa struttura risulta già attiva e pagata.' }) };
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
              name: `Quota annuale pubblicazione — ${struttura.nome_struttura}`,
              description: 'Iseo Sapori e Soggiorni: scheda struttura pubblicata per 12 mesi, rinnovo automatico.'
            }
          },
          quantity: 1
        }
      ],
      metadata: { struttura_id: struttura.id },
      success_url: `${process.env.SITE_URL}/pagamento-confermato.html?struttura_id=${struttura.id}`,
      cancel_url: `${process.env.SITE_URL}/crea-sessione-pagamento.html?struttura_id=${struttura.id}&errore=annullato`
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

  } catch (err) {
    console.error('Errore create-checkout-session:', err);
    return { statusCode: 500, body: JSON.stringify({ errore: 'Errore interno durante la creazione del pagamento.' }) };
  }
};
