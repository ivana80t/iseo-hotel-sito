// ============================================================
// FUNZIONE SERVERLESS — invia-contatto-generico
// Percorso pubblico: /api/invia-contatto-generico
// Piattaforma di riferimento: Netlify Functions (Node.js)
//
// Gestisce il form generico "Contattaci" (pagina contatti.html),
// diverso da invia-richiesta-info.js che invece riguarda le richieste
// di informazioni su una singola struttura specifica.
//
// Variabili d'ambiente necessarie (già presenti su Netlify):
//   RESEND_API_KEY
//   RESEND_FROM
//   ADMIN_EMAIL   -> qui arriva la notifica del nuovo messaggio di contatto
// ============================================================

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

const ETICHETTE_OGGETTO = {
  'info-generali': 'Informazioni generali',
  'pubblica-struttura': 'Pubblicare la mia struttura',
  'collaborazioni': 'Collaborazioni e partnership',
  'altro': 'Altro'
};

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

  const { nome, telefono, email, oggetto, messaggio } = body;

  if (!nome || !nome.trim()) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Il nome è obbligatorio.' }) };
  }
  if (!emailValida(email)) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Indirizzo email non valido.' }) };
  }
  if (!oggetto) {
    return { statusCode: 400, body: JSON.stringify({ errore: "L'oggetto della richiesta è obbligatorio." }) };
  }
  if (!messaggio || !messaggio.trim()) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Il messaggio è obbligatorio.' }) };
  }
  if (messaggio.length > 4000) {
    return { statusCode: 400, body: JSON.stringify({ errore: 'Messaggio troppo lungo.' }) };
  }
  if (!process.env.ADMIN_EMAIL) {
    console.error('ADMIN_EMAIL non configurata: impossibile recapitare il messaggio di contatto.');
    return { statusCode: 500, body: JSON.stringify({ errore: 'Configurazione mancante lato server.' }) };
  }

  try {
    const etichettaOggetto = ETICHETTE_OGGETTO[oggetto] || escapeHtml(oggetto);

    const corpoHtml = `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#152238;line-height:1.6;">
        <p>Hai ricevuto un nuovo messaggio dal modulo Contatti del sito <strong>Iseo Sapori e Soggiorni</strong>.</p>
        <table style="margin:16px 0;border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;color:#5b6779;">Nome</td><td><strong>${escapeHtml(nome)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5b6779;">Email</td><td><strong>${escapeHtml(email)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5b6779;">Telefono</td><td><strong>${telefono ? escapeHtml(telefono) : 'Non fornito'}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5b6779;">Oggetto</td><td><strong>${etichettaOggetto}</strong></td></tr>
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
        to: process.env.ADMIN_EMAIL,
        reply_to: email,
        subject: `Nuovo messaggio dal sito — ${etichettaOggetto}`,
        html: corpoHtml
      })
    });

    if (!rispostaResend.ok) {
      const dettaglioErrore = await rispostaResend.text();
      console.error('Errore invio email Resend (contatto generico):', dettaglioErrore);
      return { statusCode: 502, body: JSON.stringify({ errore: "Errore durante l'invio dell'email." }) };
    }

    console.log(`Messaggio di contatto inviato correttamente da ${email}.`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('Errore invia-contatto-generico:', err);
    return { statusCode: 500, body: JSON.stringify({ errore: 'Errore interno del server.' }) };
  }
};
