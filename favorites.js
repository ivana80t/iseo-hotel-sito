/*
 * Iseo Sapori e Soggiorni — gestione preferiti (lato client, via localStorage)
 * Condiviso da hotel.html, hotel-dettaglio.html e preferiti.html.
 * NOTA: essendo salvati solo nel browser dell'utente, i preferiti non sono legati
 * a un account e non sono sincronizzati tra dispositivi diversi. Per una gestione
 * "vera" (multi-dispositivo, legata all'utente loggato) andranno spostati lato server.
 */
(function(){
  var STORAGE_KEY = 'iseoFavorites';

  function getFavorites(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(err){
      return {};
    }
  }

  function saveFavorites(favs){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
      // Notifica le altre parti della stessa pagina che i preferiti sono cambiati
      window.dispatchEvent(new CustomEvent('iseo-favorites-changed'));
    }catch(err){
      // localStorage non disponibile (es. navigazione privata con restrizioni):
      // i preferiti restano validi solo per la sessione corrente, in memoria.
    }
  }

  function isFavorite(slug){
    if(!slug) return false;
    var favs = getFavorites();
    return Object.prototype.hasOwnProperty.call(favs, slug);
  }

  // Aggiunge/rimuove un preferito. Ritorna true se dopo il toggle è salvato, false se rimosso.
  function toggleFavorite(slug, data){
    if(!slug) return false;
    var favs = getFavorites();
    if(favs[slug]){
      delete favs[slug];
    }else{
      favs[slug] = data;
    }
    saveFavorites(favs);
    return !!favs[slug];
  }

  function removeFavorite(slug){
    var favs = getFavorites();
    delete favs[slug];
    saveFavorites(favs);
  }

  function countFavorites(){
    return Object.keys(getFavorites()).length;
  }

  // Legge slug e dati di un preferito. Supporta due formati:
  // 1) una scheda .hotel-row (usata in hotel.html / preferiti.html), leggendo i dati dal DOM;
  // 2) un contenitore qualunque con attributi data-fav-* (usato in hotel-dettaglio.html,
  //    dove il bottone preferiti non vive dentro una card in stile elenco).
  function readCardData(container){
    if(container && container.dataset && container.dataset.favSlug){
      return {
        slug: container.dataset.favSlug,
        name: container.dataset.favName || '',
        image: container.dataset.favImage || '',
        imageAlt: container.dataset.favImageAlt || '',
        badge: container.dataset.favBadge || '',
        stars: container.dataset.favStars || '',
        scoreLabel: container.dataset.favScore || '',
        loc: container.dataset.favLoc || '',
        desc: container.dataset.favDesc || '',
        priceHtml: container.dataset.favPrice || '',
        detailHref: container.dataset.favHref || ''
      };
    }

    var link = container.querySelector('.row-footer a.btn, a.btn');
    var href = link ? link.getAttribute('href') || '' : '';
    var slugMatch = href.match(/slug=([^&]+)/);
    var slug = slugMatch ? decodeURIComponent(slugMatch[1]) : null;
    var img = container.querySelector('img');
    return {
      slug: slug,
      name: (container.querySelector('h3') || {}).textContent ? container.querySelector('h3').textContent.trim() : '',
      image: img ? img.getAttribute('src') : '',
      imageAlt: img ? img.getAttribute('alt') : '',
      badge: (container.querySelector('.tag-badge') || {}).textContent ? container.querySelector('.tag-badge').textContent.trim() : '',
      stars: (container.querySelector('.stars-inline') || {}).textContent ? container.querySelector('.stars-inline').textContent.trim() : '',
      scoreLabel: (container.querySelector('.score') || {}).textContent ? container.querySelector('.score').textContent.trim() : '',
      loc: (container.querySelector('.loc') || {}).textContent ? container.querySelector('.loc').textContent.trim() : '',
      desc: (container.querySelector('.desc') || {}).textContent ? container.querySelector('.desc').textContent.trim() : '',
      priceHtml: (container.querySelector('.price-tag') || {}).innerHTML || '',
      detailHref: href
    };
  }

  // Collega automaticamente tutti i bottoni .fav-btn presenti nella pagina,
  // impostando lo stato iniziale corretto e gestendo il click.
  function wireFavButtons(root){
    (root || document).querySelectorAll('.fav-btn').forEach(function(btn){
      var container = btn.closest('[data-fav-slug]') || btn.closest('.hotel-row');
      if(!container) return;
      var data = readCardData(container);
      var slug = data.slug;

      var setState = function(saved){
        btn.classList.toggle('saved', saved);
        btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
        btn.setAttribute('aria-label', saved ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti');
      };
      setState(isFavorite(slug));

      btn.addEventListener('click', function(e){
        e.preventDefault();
        if(!slug) return;
        var nowSaved = toggleFavorite(slug, readCardData(container));
        setState(nowSaved);
      });
    });
  }

  // Aggiorna il contatore mostrato accanto al link "Preferiti" nell'header, se presente.
  function updateFavCountBadge(){
    var badge = document.getElementById('favCountBadge');
    if(!badge) return;
    var n = countFavorites();
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  window.IseoFavorites = {
    STORAGE_KEY: STORAGE_KEY,
    getFavorites: getFavorites,
    saveFavorites: saveFavorites,
    isFavorite: isFavorite,
    toggleFavorite: toggleFavorite,
    removeFavorite: removeFavorite,
    countFavorites: countFavorites,
    readCardData: readCardData,
    wireFavButtons: wireFavButtons,
    updateFavCountBadge: updateFavCountBadge
  };

  document.addEventListener('DOMContentLoaded', updateFavCountBadge);
  window.addEventListener('iseo-favorites-changed', updateFavCountBadge);
})();
