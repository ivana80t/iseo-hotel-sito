// ============================================================
// FUNZIONE SERVERLESS — invia-richiesta-info
// Percorso pubblico: /api/invia-richiesta-info
// Piattaforma di riferimento: Netlify Functions (Node.js)
//
// Logica identica alla versione Vercel; cambia solo l'involucro
// (event/context in ingresso, oggetto {statusCode, body} in uscita).
//
// Variabili d'ambiente necessarie:
//   RESEND_API_KEY
//   RESEND_FROM
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SITE_URL
// ============================================================

const { createClient } = require('@supabase/supabase-js');

function emailValida(indirizzo) {
  return typeof indirizzo === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(indirizzo);
}

function escapeHtml(testo) {
  return String(testo)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  const { struttura_id, nome, email, messaggio } = body;

  if (!struttura_id) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Parametro struttura_id mancante.' }) };
  }
  if (!nome || !nome.trim()) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Il nome è obbligatorio.' }) };
  }
  if (!emailValida(email)) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Indirizzo email non valido.' }) };
  }
  if (!messaggio || !messaggio.trim()) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Il messaggio è obbligatorio.' }) };
  }
  if (messaggio.length > 4000) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Messaggio troppo lungo.' }) };
  }

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: struttura, error: fetchError } = await supabaseAdmin
      .from('strutture')
      .select('id, nome_struttura, email, stato')
      .eq('id', struttura_id)
      .eq('stato', 'attiva')
      .single();

    if (fetchError || !struttura) {
      return { statusCode: 404, body: JSON.stringify({ errore: 'Struttura non trovata o non attiva.' }) };
    }

    const oggettoEmail = `Nuova richiesta di informazioni — ${struttura.nome_struttura}`;
    const corpoHtml = `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#152238;line-height:1.6;">
        <p>Hai ricevuto una nuova richiesta di informazioni dal tuo annuncio su
        <strong>Iseo Sapori e Soggiorni</strong>.</p>
        <table style="margin:16px 0;border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;color:#5b6779;">Nome</td><td><strong>${escapeHtml(nome)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5b6779;">Email</td><td><strong>${escapeHtml(email)}</strong></td></tr>
        </table>
        <p style="color:#5b6779;margin-bottom:4px;">Messaggio:</p>
        <p style="white-space:pre-wrap;background:#f6f4ef;border-radius:8px;padding:14px 16px;">${escapeHtml(messaggio)}</p>
        <p style="margin-top:24px;color:#5b6779;font-size:13px;">
          Puoi rispondere direttamente a questa email: la risposta arriverà a ${escapeHtml(email)}.
        </p>
      </div>
    `;

    const rispostaResend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: struttura.email,
        reply_to: email,
        subject: oggettoEmail,
        html: corpoHtml
      })
    });

    if (!rispostaResend.ok) {
      const dettaglioErrore = await rispostaResend.text();
      console.error('Errore invio email Resend:', dettaglioErrore);
      return { statusCode: 502, body: JSON.stringify({ errore: "Errore durante l'invio dell'email." }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('Errore invia-richiesta-info:', err);
    return { statusCode: 500, body: JSON.stringify({ errore: 'Errore interno del server.' }) };
  }
};
