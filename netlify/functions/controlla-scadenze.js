// ============================================================
// FUNZIONE SERVERLESS PROGRAMMATA — controlla-scadenze
// Piattaforma di riferimento: Netlify Scheduled Functions
//
// Differenza importante rispetto a Vercel:
// - Su Vercel il cron si configurava in vercel.json e chiamava l'endpoint
//   HTTP normale /api/controlla-scadenze una volta al giorno; per questo
//   c'era un controllo manuale con CRON_SECRET nell'header Authorization,
//   per evitare che un visitatore esterno la richiamasse a piacere.
// - Su Netlify le "Scheduled Functions" si dichiarano avvolgendo il
//   gestore con l'helper schedule() del pacchetto @netlify/functions
//   (va aggiunto a package.json). Netlify le invoca da solo, in base alla
//   sintassi cron scritta qui sotto, e — protezione integrata di Netlify —
//   se qualcuno prova a raggiungere l'URL della funzione programmata
//   manualmente dall'esterno riceve automaticamente un 401 Unauthorized.
//   Per questo motivo qui NON serve più il controllo manuale su
//   CRON_SECRET: la piattaforma stessa impedisce chiamate non autorizzate.
//
// Se in futuro vuoi comunque poter richiamare il controllo manualmente
// (es. per un test da cron-job.org come rete di sicurezza), duplica
// questa logica in una seconda funzione NON programmata, tipo
// controlla-scadenze-manuale.js, mantenendo lì il controllo CRON_SECRET.
//
// Variabili d'ambiente necessarie:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY
//   RESEND_FROM
//   SITE_URL
// ============================================================

const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');

function formattaData(dataIso) {
  const d = new Date(dataIso);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function inviaEmailPromemoria(struttura, giorniRimanenti) {
  const linkRinnovo = `${process.env.SITE_URL}/rinnova-struttura.html?struttura_id=${struttura.id}`;
  const oggetto = giorniRimanenti === 30
    ? `La tua scheda su Iseo Sapori e Soggiorni scade tra 30 giorni`
    : `Ultimi 7 giorni: la tua scheda sta per scadere`;

  const corpoHtml = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#152238;line-height:1.6;">
      <p>Ciao,</p>
      <p>la pubblicazione di <strong>${struttura.nome_struttura}</strong> su
      <strong>Iseo Sapori e Soggiorni</strong> scadrà il
      <strong>${formattaData(struttura.data_scadenza)}</strong> (tra ${giorniRimanenti} giorni).</p>
      <p>Se non rinnovi entro quella data, la scheda smetterà di essere visibile
      sul sito ai visitatori — resterà comunque salvata con tutti i suoi dati
      e potrai riattivarla in qualsiasi momento rinnovando in seguito.</p>
      <p style="margin:28px 0;">
        <a href="${linkRinnovo}" style="background:#12294f;color:#fff;text-decoration:none;
           padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block;">
          Rinnova ora — 59,00 €
        </a>
      </p>
      <p style="color:#5b6779;font-size:13px;">Se il pulsante non funziona, copia questo link nel browser: ${linkRinnovo}</p>
    </div>
  `;

  const risposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: struttura.email,
      subject: oggetto,
      html: corpoHtml
    })
  });

  if (!risposta.ok) {
    const dettaglio = await risposta.text();
    throw new Error(`Invio email fallito per struttura ${struttura.id}: ${dettaglio}`);
  }
}

async function inviaEmailSollecitoPostScadenza(struttura) {
  const linkRinnovo = `${process.env.SITE_URL}/rinnova-struttura.html?struttura_id=${struttura.id}`;
  const oggetto = `${struttura.nome_struttura} non è più visibile su Iseo Sapori e Soggiorni`;

  const corpoHtml = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#152238;line-height:1.6;">
      <p>Ciao,</p>
      <p>l'abbonamento di <strong>${struttura.nome_struttura}</strong> è scaduto il
      <strong>${formattaData(struttura.data_scadenza)}</strong> e da quel momento la scheda
      non è più visibile ai visitatori del sito.</p>
      <p>In questi giorni, chi cercava una struttura come la tua a Iseo semplicemente
      non ti ha trovato.</p>
      <p>Buona notizia: non hai perso nulla. Foto, descrizione e contatti sono ancora
      tutti al loro posto — ti basta rinnovare per tornare subito online e farti
      trovare di nuovo.</p>
      <p style="margin:28px 0;">
        <a href="${linkRinnovo}" style="background:#d1503c;color:#fff;text-decoration:none;
           padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block;">
          Rendi di nuovo visibile la scheda — 59,00 €
        </a>
      </p>
      <p style="color:#5b6779;font-size:13px;">Se il pulsante non funziona, copia questo link nel browser: ${linkRinnovo}</p>
    </div>
  `;

  const risposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: struttura.email,
      subject: oggetto,
      html: corpoHtml
    })
  });

  if (!risposta.ok) {
    const dettaglio = await risposta.text();
    throw new Error(`Invio sollecito post-scadenza fallito per struttura ${struttura.id}: ${dettaglio}`);
  }
}

function dataPiuGiorni(giorni) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setDate(d.getDate() + giorni);
  return d.toISOString().slice(0, 10);
}

async function eseguiControlloScadenze() {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const risultato = {
    scadute: 0,
    promemoria_30_inviati: 0,
    promemoria_7_inviati: 0,
    solleciti_post_scadenza_inviati: 0,
    errori: []
  };

  const oggiIso = dataPiuGiorni(0);

  // --- 1. Scade le strutture il cui termine è passato ---
  const { data: struttureScadute, error: erroreScadenza } = await supabaseAdmin
    .from('strutture')
    .update({ stato: 'scaduta' })
    .eq('stato', 'attiva')
    .lt('data_scadenza', oggiIso)
    .select('id');

  if (erroreScadenza) throw erroreScadenza;
  risultato.scadute = (struttureScadute || []).length;

  // --- 2. Promemoria a 30 giorni dalla scadenza ---
  const { data: strutturePromemoria30, error: errore30 } = await supabaseAdmin
    .from('strutture')
    .select('id, nome_struttura, email, data_scadenza')
    .eq('stato', 'attiva')
    .eq('data_scadenza', dataPiuGiorni(30))
    .eq('promemoria_30_inviato', false);

  if (errore30) throw errore30;

  for (const struttura of strutturePromemoria30 || []) {
    try {
      await inviaEmailPromemoria(struttura, 30);
      await supabaseAdmin
        .from('strutture')
        .update({ promemoria_30_inviato: true })
        .eq('id', struttura.id);
      risultato.promemoria_30_inviati++;
    } catch (err) {
      console.error(err);
      risultato.errori.push(err.message);
    }
  }

  // --- 3. Promemoria a 7 giorni dalla scadenza ---
  const { data: strutturePromemoria7, error: errore7 } = await supabaseAdmin
    .from('strutture')
    .select('id, nome_struttura, email, data_scadenza')
    .eq('stato', 'attiva')
    .eq('data_scadenza', dataPiuGiorni(7))
    .eq('promemoria_7_inviato', false);

  if (errore7) throw errore7;

  for (const struttura of strutturePromemoria7 || []) {
    try {
      await inviaEmailPromemoria(struttura, 7);
      await supabaseAdmin
        .from('strutture')
        .update({ promemoria_7_inviato: true })
        .eq('id', struttura.id);
      risultato.promemoria_7_inviati++;
    } catch (err) {
      console.error(err);
      risultato.errori.push(err.message);
    }
  }

  // --- 4. Sollecito 7 giorni DOPO la scadenza ---
  const { data: struttureSollecito, error: erroreSollecito } = await supabaseAdmin
    .from('strutture')
    .select('id, nome_struttura, email, data_scadenza')
    .eq('stato', 'scaduta')
    .eq('data_scadenza', dataPiuGiorni(-7))
    .eq('promemoria_post_scadenza_inviato', false);

  if (erroreSollecito) throw erroreSollecito;

  for (const struttura of struttureSollecito || []) {
    try {
      await inviaEmailSollecitoPostScadenza(struttura);
      await supabaseAdmin
        .from('strutture')
        .update({ promemoria_post_scadenza_inviato: true })
        .eq('id', struttura.id);
      risultato.solleciti_post_scadenza_inviati++;
    } catch (err) {
      console.error(err);
      risultato.errori.push(err.message);
    }
  }

  console.log('Esito controlla-scadenze:', risultato);
  return risultato;
}

// schedule() registra la funzione come Scheduled Function su Netlify.
// Sintassi cron identica a quella usata su Vercel: "0 6 * * *" = ogni
// giorno alle 6:00 UTC.
exports.handler = schedule('0 6 * * *', async () => {
  try {
    const risultato = await eseguiControlloScadenze();
    return { statusCode: 200, body: JSON.stringify(risultato) };
  } catch (err) {
    console.error('Errore controlla-scadenze:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ errore: 'Errore durante il controllo delle scadenze.', dettaglio: err.message })
    };
  }
});
