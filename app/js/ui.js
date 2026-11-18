/* =====================================================================
   ui.js — petits outils d'interface : boîte de dialogue, confirmation,
   messages temporaires, choix de fichiers.
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.ui = (function () {
  'use strict';
  var esc = FM.outils.esc;

  /** Ouvre une boîte de dialogue. options : { etroite, surClic(action, el) } */
  function fenetre(html, options) {
    options = options || {};
    var f = document.getElementById('fenetre');
    f.innerHTML = '<div class="fenetre-boite' + (options.etroite ? ' etroite' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    f.hidden = false;
    f.onclick = function (ev) {
      var el = ev.target.closest('[data-fenetre]');
      if (el && options.surClic) options.surClic(el.getAttribute('data-fenetre'), el, ev);
    };
    f.onchange = function (ev) { if (options.surChangement) options.surChangement(ev.target, ev); };
    var premier = f.querySelector('[autofocus], .btn-principal');
    if (premier) premier.focus();
    return f.firstChild;
  }
  function fermer() {
    var f = document.getElementById('fenetre');
    f.hidden = true; f.innerHTML = ''; f.onclick = null; f.onchange = null;
  }

  /** Demande une confirmation. Renvoie une promesse (true / false). */
  function confirmer(message, options) {
    options = options || {};
    return new Promise(function (ok) {
      fenetre('<h2>' + esc(options.titre || 'Confirmation') + '</h2><p>' + esc(message).replace(/\n/g, '<br>') + '</p>' +
        '<div class="fenetre-boutons"><button class="btn" data-fenetre="non">' + esc(options.non || 'Annuler') + '</button>' +
        '<button class="btn ' + (options.danger ? 'btn-danger' : 'btn-principal') + '" data-fenetre="oui">' + esc(options.oui || 'Continuer') + '</button></div>',
        { etroite: true, surClic: function (a) { fermer(); ok(a === 'oui'); } });
    });
  }

  /** Affiche un message (HTML autorisé) avec un bouton OK. */
  function information(titre, html) {
    return new Promise(function (ok) {
      fenetre('<h2>' + esc(titre) + '</h2>' + html + '<div class="fenetre-boutons"><button class="btn btn-principal" data-fenetre="ok">OK</button></div>',
        { surClic: function () { fermer(); ok(); } });
    });
  }

  /** Message temporaire en bas de l'écran. */
  function toast(message, type) {
    var t = document.createElement('div');
    t.className = 'toast' + (type === 'erreur' ? ' erreur' : '');
    t.textContent = message;
    var zone = document.getElementById('toast');
    zone.appendChild(t);
    while (zone.children.length > 3) zone.firstChild.remove();
    setTimeout(function () { t.remove(); }, type === 'erreur' ? 7000 : 3500);
  }

  /** Ouvre le sélecteur de fichiers. À appeler directement dans un clic. */
  function choisirFichier(accept, multiple) {
    return new Promise(function (ok) {
      var i = document.createElement('input');
      i.type = 'file'; i.accept = accept || ''; i.multiple = !!multiple; i.className = 'fichier-cache';
      i.onchange = function () { var f = Array.prototype.slice.call(i.files || []); i.remove(); ok(f); };
      document.body.appendChild(i);
      i.click();
    });
  }

  /** Affiche une erreur de façon lisible. */
  function erreur(e) {
    console.error(e);
    if (e && e.name === 'AbortError') return;   // l'utilisateur a annulé
    toast((e && e.message) || String(e), 'erreur');
  }

  return { fenetre: fenetre, fermer: fermer, confirmer: confirmer, information: information,
    toast: toast, choisirFichier: choisirFichier, erreur: erreur };
})();
