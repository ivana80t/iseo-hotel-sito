/* ============================================================================
   ISEO SAPORI E SOGGIORNI — Cookie Consent (versione gratuita, GDPR-friendly)
   ============================================================================
   ⚠️ SOLUZIONE TEMPORANEA in attesa di passare a Iubenda (servizio a pagamento,
   ~30-40€/anno), più difendibile in caso di controllo del Garante Privacy
   perché genera un registro dei consensi scaricabile. Le istruzioni dettagliate
   su come effettuare il passaggio sono nel <head> di ogni pagina HTML, nella
   sezione di commento "PREDISPOSIZIONE IUBENDA". Finché non si attiva Iubenda,
   questo file resta pienamente funzionante e conforme.
   ============================================================================
   COME SI USA:
   1. Copia questo file (cookie-consent.js) nella cartella principale del sito,
      insieme a tutte le pagine HTML.
   2. In OGNI pagina, aggiungi UNA SOLA RIGA subito prima di </body>:
        <script src="cookie-consent.js"></script>
   3. Nella stessa pagina, sostituisci gli script "diretti" di Google Analytics
      e Google AdSense con le versioni "gestite dal consenso" che trovi in
      fondo a questo file (sezione "COME COLLEGARE GA4 E ADSENSE").

   COSA FA:
   - Mostra un banner cookie al primo accesso (in basso, su tutte le pagine).
   - Finché l'utente non sceglie, NESSUNO script di Analytics o AdSense parte:
     questo è il modo più semplice e sicuro per essere conformi al GDPR
     (i cookie non essenziali richiedono consenso PRIMA di essere attivati).
   - Salva la scelta in localStorage (dura finché l'utente non cancella i dati
     del browser, non richiede un vero e proprio backend/database).
   - Aggiunge in automatico un link "Preferenze cookie" nel footer di ogni
     pagina, per permettere di cambiare idea in qualsiasi momento.

   LIMITI DI QUESTA VERSIONE GRATUITA (rispetto a Iubenda/Cookiebot a pagamento):
   - Non genera un registro/log dei consensi scaricabile in caso di controllo
     (le versioni a pagamento lo fanno automaticamente).
   - Non rileva in automatico i cookie realmente presenti sul sito (li abbiamo
     mappati a mano qui sotto: Analytics + AdSense).
   - Se in futuro aggiungerai altri servizi che installano cookie (es. una chat
     dal vivo, un pixel Meta/Facebook, ecc.), andranno aggiunti manualmente
     nell'oggetto SERVIZI qui sotto.
   Per un portale che genera ricavi reali, valuta in futuro un servizio
   dedicato (es. Iubenda, circa 30-40€/anno) che gestisce tutto questo
   automaticamente ed è più difendibile in caso di controllo Garante Privacy.
   ============================================================================ */

(function () {
  'use strict';

  const CONSENT_KEY = 'iseo_cookie_consent_v1';
  const CONSENT_VERSION = 1;

  // ------------------------------------------------------------------------
  // Elenco dei servizi non essenziali attivi sul portale.
  // Aggiungi qui nuovi servizi in futuro (es. Meta Pixel, chat, ecc.).
  // ------------------------------------------------------------------------
  const SERVIZI = {
    analytics: {
      label: 'Cookie di analisi (Google Analytics)',
      descrizione: 'Ci aiutano a capire come i visitatori usano il sito (pagine più visitate, provenienza del traffico), in forma aggregata e anonima.',
    },
    ads: {
      label: 'Cookie pubblicitari (Google AdSense)',
      descrizione: 'Permettono di mostrare annunci pubblicitari, anche personalizzati in base ai tuoi interessi. Sono il modo in cui il portale si sostiene economicamente.',
    }
  };

  // ------------------------------------------------------------------------
  // Utility: lettura/scrittura del consenso salvato
  // ------------------------------------------------------------------------
  function leggiConsenso() {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.version !== CONSENT_VERSION) return null; // consenso di una versione precedente: richiedilo di nuovo
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function salvaConsenso(scelte) {
    const payload = {
      version: CONSENT_VERSION,
      date: new Date().toISOString(),
      analytics: !!scelte.analytics,
      ads: !!scelte.ads
    };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(payload)); } catch (e) {}
    applicaConsenso(payload);
  }

  // ------------------------------------------------------------------------
  // Attivazione effettiva degli script, SOLO dopo consenso
  // ------------------------------------------------------------------------
  function applicaConsenso(consenso) {
    if (consenso.analytics && !window.__iseoGA4Caricato) {
      window.__iseoGA4Caricato = true;
      if (typeof window.iseoCaricaGA4 === 'function') window.iseoCaricaGA4();
    }
    if (consenso.ads && !window.__iseoAdsCaricato) {
      window.__iseoAdsCaricato = true;
      if (typeof window.iseoCaricaAdSense === 'function') window.iseoCaricaAdSense();
    }
  }

  // ------------------------------------------------------------------------
  // Interfaccia: banner + modale "Personalizza"
  // ------------------------------------------------------------------------
  function iniettaStile() {
    const css = `
      #iseo-cookie-banner{
        position:fixed;left:0;right:0;bottom:0;z-index:9999;
        background:#12294f;color:#fff;
        padding:18px 24px;box-shadow:0 -8px 24px rgba(0,0,0,.18);
        display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;
        font-family:'Inter',system-ui,sans-serif;
      }
      #iseo-cookie-banner p{margin:0;font-size:13.5px;line-height:1.5;color:#e4e8f0;max-width:640px;flex:1 1 320px;}
      #iseo-cookie-banner a{color:#e0a940;text-decoration:underline;}
      #iseo-cookie-actions{display:flex;gap:10px;flex-wrap:wrap;flex-shrink:0;}
      .iseo-cookie-btn{
        border-radius:8px;padding:10px 18px;font-size:13.5px;font-weight:600;cursor:pointer;
        border:1.5px solid transparent;white-space:nowrap;font-family:inherit;
      }
      .iseo-cookie-btn.primary{background:#e0a940;color:#12294f;}
      .iseo-cookie-btn.primary:hover{background:#c99527;}
      .iseo-cookie-btn.ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.4);}
      .iseo-cookie-btn.ghost:hover{border-color:#fff;}
      .iseo-cookie-btn.text{background:none;color:#cfd7e4;text-decoration:underline;padding:10px 4px;}
      #iseo-cookie-modal-overlay{
        position:fixed;inset:0;background:rgba(13,23,45,.55);z-index:10000;
        display:flex;align-items:center;justify-content:center;padding:20px;
      }
      #iseo-cookie-modal{
        background:#fff;border-radius:14px;max-width:480px;width:100%;padding:28px;
        font-family:'Inter',system-ui,sans-serif;color:#1c2333;max-height:86vh;overflow-y:auto;
      }
      #iseo-cookie-modal h2{font-family:'Fraunces',serif;font-size:20px;margin:0 0 6px;color:#12294f;}
      #iseo-cookie-modal p.intro{font-size:13.5px;color:#5b6472;line-height:1.5;margin:0 0 20px;}
      .iseo-cookie-option{border:1px solid #e4e2dc;border-radius:10px;padding:14px 16px;margin-bottom:12px;}
      .iseo-cookie-option-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;}
      .iseo-cookie-option-head strong{font-size:14px;color:#12294f;}
      .iseo-cookie-option p{font-size:12.5px;color:#5b6472;line-height:1.45;margin:0;}
      .iseo-switch{position:relative;width:42px;height:24px;flex-shrink:0;}
      .iseo-switch input{opacity:0;width:0;height:0;}
      .iseo-switch-track{position:absolute;inset:0;background:#d5d9e0;border-radius:999px;cursor:pointer;transition:background .18s;}
      .iseo-switch-track::before{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.3);}
      .iseo-switch input:checked + .iseo-switch-track{background:#12294f;}
      .iseo-switch input:checked + .iseo-switch-track::before{transform:translateX(18px);}
      .iseo-switch input:disabled + .iseo-switch-track{opacity:.6;cursor:not-allowed;}
      #iseo-cookie-modal .iseo-cookie-modal-actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;}
      #iseo-cookie-modal .iseo-cookie-btn{flex:1 1 auto;text-align:center;}
      #iseo-cookie-prefs-link{
        position:fixed;left:16px;bottom:16px;z-index:9998;
        background:#fff;border:1px solid #e4e2dc;border-radius:999px;
        width:40px;height:40px;display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:pointer;
      }
      #iseo-cookie-prefs-link svg{width:19px;height:19px;stroke:#12294f;}
      @media (max-width:640px){
        #iseo-cookie-banner{flex-direction:column;align-items:stretch;text-align:left;padding:18px;}
        #iseo-cookie-actions{width:100%;}
        .iseo-cookie-btn{flex:1 1 auto;}
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function creaBanner() {
    const banner = document.createElement('div');
    banner.id = 'iseo-cookie-banner';
    banner.innerHTML = `
      <p>Usiamo cookie tecnici necessari al funzionamento del sito e, solo con il tuo consenso, cookie di analisi e pubblicitari per mostrare annunci pertinenti. Leggi la <a href="privacy.html">Privacy Policy</a>.</p>
      <div id="iseo-cookie-actions">
        <button type="button" class="iseo-cookie-btn text" id="iseo-cookie-personalizza">Personalizza</button>
        <button type="button" class="iseo-cookie-btn ghost" id="iseo-cookie-rifiuta">Rifiuta</button>
        <button type="button" class="iseo-cookie-btn primary" id="iseo-cookie-accetta">Accetta tutti</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('iseo-cookie-accetta').addEventListener('click', () => {
      salvaConsenso({ analytics: true, ads: true });
      rimuoviBanner();
    });
    document.getElementById('iseo-cookie-rifiuta').addEventListener('click', () => {
      salvaConsenso({ analytics: false, ads: false });
      rimuoviBanner();
    });
    document.getElementById('iseo-cookie-personalizza').addEventListener('click', () => {
      apriModale();
    });
  }

  function rimuoviBanner() {
    const b = document.getElementById('iseo-cookie-banner');
    if (b) b.remove();
  }

  function apriModale(scelteIniziali) {
    const attuali = scelteIniziali || leggiConsenso() || { analytics: false, ads: false };
    const overlay = document.createElement('div');
    overlay.id = 'iseo-cookie-modal-overlay';
    overlay.innerHTML = `
      <div id="iseo-cookie-modal" role="dialog" aria-modal="true" aria-labelledby="iseo-cookie-modal-title">
        <h2 id="iseo-cookie-modal-title">Preferenze cookie</h2>
        <p class="intro">Scegli quali categorie di cookie vuoi attivare. I cookie tecnici sono sempre attivi perché necessari al funzionamento del sito.</p>

        <div class="iseo-cookie-option">
          <div class="iseo-cookie-option-head">
            <strong>Cookie tecnici</strong>
            <label class="iseo-switch">
              <input type="checkbox" checked disabled>
              <span class="iseo-switch-track"></span>
            </label>
          </div>
          <p>Necessari al funzionamento base del sito (es. ricordare i preferiti, il menu mobile). Non possono essere disattivati.</p>
        </div>

        <div class="iseo-cookie-option">
          <div class="iseo-cookie-option-head">
            <strong>${SERVIZI.analytics.label}</strong>
            <label class="iseo-switch">
              <input type="checkbox" id="iseo-toggle-analytics" ${attuali.analytics ? 'checked' : ''}>
              <span class="iseo-switch-track"></span>
            </label>
          </div>
          <p>${SERVIZI.analytics.descrizione}</p>
        </div>

        <div class="iseo-cookie-option">
          <div class="iseo-cookie-option-head">
            <strong>${SERVIZI.ads.label}</strong>
            <label class="iseo-switch">
              <input type="checkbox" id="iseo-toggle-ads" ${attuali.ads ? 'checked' : ''}>
              <span class="iseo-switch-track"></span>
            </label>
          </div>
          <p>${SERVIZI.ads.descrizione}</p>
        </div>

        <div class="iseo-cookie-modal-actions">
          <button type="button" class="iseo-cookie-btn ghost" id="iseo-cookie-modal-rifiuta">Rifiuta tutti</button>
          <button type="button" class="iseo-cookie-btn primary" id="iseo-cookie-modal-salva">Salva preferenze</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Nota: gli switch sono <span> dentro un <label> che avvolge la checkbox,
    // quindi il click li attiva già nativamente (comportamento standard dei
    // <label> collegati a un input) — non serve alcun JS aggiuntivo qui.

    document.getElementById('iseo-cookie-modal-salva').addEventListener('click', () => {
      const analytics = document.getElementById('iseo-toggle-analytics').checked;
      const ads = document.getElementById('iseo-toggle-ads').checked;
      salvaConsenso({ analytics, ads });
      overlay.remove();
      rimuoviBanner();
    });
    document.getElementById('iseo-cookie-modal-rifiuta').addEventListener('click', () => {
      salvaConsenso({ analytics: false, ads: false });
      overlay.remove();
      rimuoviBanner();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  function creaLinkPreferenze() {
    const link = document.createElement('button');
    link.id = 'iseo-cookie-prefs-link';
    link.type = 'button';
    link.setAttribute('aria-label', 'Preferenze cookie');
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="8.5" r="1"/><circle cx="15" cy="14" r="1"/><circle cx="10" cy="15" r="1"/></svg>';
    link.addEventListener('click', () => apriModale());
    document.body.appendChild(link);
  }

  // ------------------------------------------------------------------------
  // Avvio: se il consenso non è mai stato dato, mostra il banner.
  // Se è già stato dato, applica subito le scelte salvate (nessun banner).
  // Il link "Preferenze cookie" resta sempre visibile in basso a sinistra.
  // ------------------------------------------------------------------------
  function avvia() {
    iniettaStile();
    const esistente = leggiConsenso();
    if (esistente) {
      applicaConsenso(esistente);
    } else {
      creaBanner();
    }
    creaLinkPreferenze();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia);
  } else {
    avvia();
  }

})();

/* ============================================================================
   COME COLLEGARE GA4 E ADSENSE A QUESTO SISTEMA DI CONSENSO
   ============================================================================
   Nella pagina HTML, invece di caricare gtag.js e adsbygoogle.js direttamente,
   definisci due funzioni globali che il cookie-consent.js chiamerà SOLO dopo
   che l'utente ha dato il consenso. Esempio da mettere nell'<head>, al posto
   degli script diretti:

   <script>
     // Verrà chiamata automaticamente da cookie-consent.js se l'utente
     // accetta i cookie di analisi.
     window.iseoCaricaGA4 = function() {
       const s = document.createElement('script');
       s.async = true;
       s.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX'; // <-- il tuo Measurement ID
       document.head.appendChild(s);
       window.dataLayer = window.dataLayer || [];
       window.gtag = function(){ dataLayer.push(arguments); };
       gtag('js', new Date());
       gtag('config', 'G-XXXXXXXXXX'); // <-- il tuo Measurement ID
     };

     // Verrà chiamata automaticamente da cookie-consent.js se l'utente
     // accetta i cookie pubblicitari.
     window.iseoCaricaAdSense = function() {
       const s = document.createElement('script');
       s.async = true;
       s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX'; // <-- il tuo Publisher ID
       s.crossOrigin = 'anonymous';
       document.head.appendChild(s);
       s.onload = function() {
         document.querySelectorAll('.adsbygoogle').forEach(function() {
           (window.adsbygoogle = window.adsbygoogle || []).push({});
         });
       };
     };
   </script>
   <script src="cookie-consent.js"></script>
   ============================================================================ */
