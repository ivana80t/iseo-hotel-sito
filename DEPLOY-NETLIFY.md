# Deploy su Netlify — Iseo Sapori e Soggiorni

Guida passo-passo aggiornata per pubblicare il sito su **Netlify** invece
di Vercel (piano gratuito che ammette esplicitamente l'uso commerciale).

---

## 1. Struttura delle cartelle

Netlify riconosce come funzione serverless ogni file `.js` dentro
**`netlify/functions/`** (percorso dichiarato anche in `netlify.toml`).

```
iseo-sapori-e-soggiorni/
├── netlify/
│   └── functions/
│       ├── create-checkout-session.js
│       ├── create-renewal-checkout-session.js
│       ├── stripe-webhook.js
│       ├── invia-richiesta-info.js
│       ├── pubblica-struttura.js
│       └── controlla-scadenze.js      (Scheduled Function)
├── index.html
├── hotel.html
├── hotel-dettaglio.html
├── pubblica-struttura.html
├── crea-sessione-pagamento.html
├── rinnova-struttura.html
├── pagamento-confermato.html
├── package.json
└── netlify.toml
```

Gli HTML restano nella root, **senza modifiche**: il file `netlify.toml`
include un redirect che fa in modo che le chiamate del frontend a
`/api/nome-funzione` continuino a funzionare esattamente come su Vercel,
inoltrandole internamente a `/.netlify/functions/nome-funzione`.

---

## 2. Creare il sito su Netlify

1. Vai su **netlify.com** e crea un account gratuito (email o GitHub).
2. **Opzione consigliata — con Git**: carica la struttura di cartelle qui
   sopra su un repository (es. GitHub), poi su Netlify scegli
   **"Add new site" → "Import an existing project"** e collega il
   repository. Ogni push ripubblica automaticamente.
3. **Opzione alternativa — senza Git**: trascina l'intera cartella del
   progetto nella pagina "Sites" di Netlify (drag & drop), oppure installa
   la CLI (`npm install -g netlify-cli`) e lancia `netlify deploy` dalla
   cartella del progetto.

---

## 3. Variabili d'ambiente

Su Netlify: **Site configuration → Environment variables → Add a variable**.
Le variabili sono le stesse già usate su Vercel:

| Variabile | Dove trovarla |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key (⚠️ mai nel codice) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | Vedi punto 5 |
| `RESEND_API_KEY` | Resend → API Keys |
| `RESEND_FROM` | Es. `Iseo Sapori e Soggiorni <richieste@tuodominio.it>` (dominio verificato su Resend) |
| `SITE_URL` | URL pubblico del sito, es. `https://www.iseosaporiesoggiorni.it` (o quello temporaneo `.netlify.app`) |

**Nota:** `CRON_SECRET` non serve più — Netlify protegge da sola le
Scheduled Functions da chiamate esterne non autorizzate (vedi punto 6).

Dopo aver aggiunto/modificato variabili, serve un **redeploy** (Netlify lo
propone in automatico, oppure "Deploys → Trigger deploy").

---

## 4. Database Supabase

Invariato rispetto a prima — esegui in ordine nell'SQL Editor di Supabase:
1. `schema.sql`
2. `schema-addendum-storage.sql`
3. `schema-addendum-scadenze.sql`

E crea il bucket Storage **`strutture-immagini`** come **Public**, se non
esiste già.

---

## 5. Collegare il webhook Stripe

1. Fai un primo deploy per ottenere l'URL del sito (es.
   `https://iseo-sapori-e-soggiorni.netlify.app`).
2. Su **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
   - URL: `https://tuo-dominio/api/stripe-webhook`
   - Evento: `checkout.session.completed`
3. Copia il **Signing secret** (`whsec_...`) nella variabile
   `STRIPE_WEBHOOK_SECRET` su Netlify e fai un redeploy.

---

## 6. Verificare la Scheduled Function (cron)

`controlla-scadenze.js` è già configurata per girare ogni giorno alle 6:00
UTC tramite l'helper `schedule()` di `@netlify/functions` — non serve
nessun file di configurazione separato (a differenza di `vercel.json`).

Dopo il deploy, controlla in **Netlify → Site → Functions** che la
funzione compaia con l'etichetta "Scheduled" e l'orario della prossima
esecuzione. Netlify blocca automaticamente qualsiasi chiamata esterna
diretta a quell'URL (risponde 401), quindi non serve alcun controllo di
sicurezza aggiuntivo lato codice.

Il piano gratuito di Netlify include le Scheduled Functions senza
limitazioni particolari di frequenza per un cron giornaliero.

---

## 7. Collegare il dominio personalizzato (opzionale)

Se hai già registrato un dominio (altrove, es. Aruba, Namecheap, ecc.):
1. **Site configuration → Domain management → Add a domain**.
2. Netlify mostra i record DNS da impostare presso il tuo registrar.
3. Aggiorna `SITE_URL` con il dominio definitivo e rifai il redeploy.

---

## 8. Checklist finale prima di andare live con pagamenti reali

- [ ] Tutti gli script SQL eseguiti su Supabase (schema + i due addendum)
- [ ] Bucket Storage `strutture-immagini` creato come Public
- [ ] Tutte le variabili d'ambiente impostate su Netlify (tabella al punto 3)
- [ ] Webhook Stripe creato e `STRIPE_WEBHOOK_SECRET` impostato
- [ ] Testata almeno un'iscrizione completa in modalità Stripe **test**
- [ ] Verificato che `/api/...` risponda correttamente (il redirect in
      `netlify.toml` è attivo) prima di collegare Stripe
- [ ] Verificata la Scheduled Function nella dashboard Netlify
- [ ] Solo a questo punto: sostituire `sk_test_...` con la chiave Stripe
      **live**, ripetendo la configurazione del webhook

---

## Differenze principali rispetto alla versione Vercel (riepilogo)

| Aspetto | Vercel | Netlify |
|---|---|---|
| Cartella funzioni | `api/` | `netlify/functions/` |
| Firma funzione | `(req, res)` | `(event, context)` + `return` |
| Corpo richiesta | `req.body` (già parsato) | `JSON.parse(event.body)` |
| Risposta | `res.status(x).json(y)` | `return { statusCode, body: JSON.stringify(y) }` |
| Config cron | `vercel.json` | helper `schedule()` dentro la funzione stessa |
| Protezione cron | header `CRON_SECRET` manuale | bloccato in automatico da Netlify |
| Config generale | `vercel.json` | `netlify.toml` |

## Nota sui placeholder Supabase nel frontend

Resta invariato: vanno comunque sostituiti `SUPABASE_URL` /
`SUPABASE_ANON_KEY` nei file `.html`, a prescindere dalla piattaforma di
hosting scelta.
