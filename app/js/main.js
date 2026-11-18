/* =====================================================================
   main.js — démarrage du logiciel, menu latéral, navigation entre les
   écrans et enregistrement des modifications.
   Chaque écran est décrit dans app/js/vues/*.js sous la forme :
     FM.vues.nom = { rendre(): html, actions: {...}, changements: {...} }
   Les boutons portent data-action="…", les champs data-change="…".
   ===================================================================== */
var FM = window.FM = window.FM || {};
FM.vues = FM.vues || {};

FM.app = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, F = FM.fichiers, esc = O.esc;

  var app = {
    etat: M.nouveau(),
    page: 'accueil',
    params: {},
    nonEnregistre: false,
    derniere: null,         // heure du dernier enregistrement
    origine: 'nouveau',     // nouveau | dossier | secours | import | exemple
    secoursDisponible: null
  };

  var MENU = [
    { page: 'accueil', nom: 'Accueil' },
    { sep: true },
    { page: 'parametres', nom: 'Paramètres', num: 1 },
    { page: 'intervenants', nom: 'Intervenants', num: 2 },
    { page: 'salles', nom: 'Salles et ateliers', num: 3 },
    { page: 'eleves', nom: 'Élèves', num: 4 },
    { page: 'voeux', nom: 'Vœux', num: 5 },
    { page: 'repartition', nom: 'Répartition', num: 6 },
    { page: 'planning', nom: 'Planning', num: 7 },
    { page: 'impressions', nom: 'Impressions et exports', num: 8 }
  ];

  function badge(page) {
    var e = app.etat;
    switch (page) {
      case 'intervenants': return e.intervenants.length ? String(e.intervenants.length) : '';
      case 'eleves': return e.eleves.length ? String(e.eleves.length) : '';
      case 'voeux':
        var cls = M.classes(e);
        if (!cls.length) return '';
        var faites = cls.filter(function (c) {
          return e.eleves.some(function (el) { return el.classe === c && (e.voeux[el.id] || []).length; });
        }).length;
        return faites + '/' + cls.length;
      case 'repartition': return e.repartition ? 'faite' : '';
      default: return '';
    }
  }

  var ICONE_ANNULER = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>';
  var ICONE_RETABLIR = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>';

  function rendreMenu() {
    var F_ = F.etat, html = '<div class="logo"><img src="app/img/icone.svg" alt="" width="26" height="26">Forum des métiers</div>' +
      (app.etat.nom && app.etat.nom !== 'Forum des métiers' ? '<div class="logo-sous" title="' + esc(app.etat.nom) + '">' + esc(app.etat.nom) + '</div>' : '<div style="height:12px"></div>') +
      '<nav aria-label="Menu principal">';
    MENU.forEach(function (m) {
      if (m.sep) { html += '<div class="menu-sep"></div>'; return; }
      var b = badge(m.page);
      html += '<a href="#' + m.page + '" class="menu-lien' + (app.page === m.page ? ' actif' : '') + '" data-page="' + m.page + '">' +
        '<span>' + (m.num ? '<span class="num">' + m.num + '</span>' : '') + esc(m.nom) + '</span>' +
        (b ? '<span class="badge">' + esc(b) + '</span>' : '') + '</a>';
    });
    html += '</nav><div class="menu-bas">';
    var pA = historique.passe[historique.passe.length - 1], pR = historique.futur[historique.futur.length - 1];
    html += '<div class="rangee"><button class="btn-menu" data-global="annuler"' + (pA ? ' title="Annuler : ' + esc(pA.quoi) + ' (Ctrl+Z)"' : ' disabled title="Rien à annuler"') + '>' + ICONE_ANNULER + ' Annuler</button>' +
      '<button class="btn-menu" data-global="retablir"' + (pR ? ' title="Rétablir : ' + esc(pR.quoi) + ' (Ctrl+Y)"' : ' disabled title="Rien à rétablir"') + '>Rétablir ' + ICONE_RETABLIR + '</button></div>';
    html += '<button class="btn-enregistrer" data-global="enregistrer">Enregistrer</button>';
    html += '<div class="rangee"><button class="btn-menu" data-global="exporter" title="Télécharger une copie de sauvegarde (.json)">Exporter</button>' +
      '<button class="btn-menu" data-global="importer" title="Recharger une sauvegarde (.json)">Importer</button></div>';
    var statut;
    if (F_.dossier && F_.autorise) statut = app.nonEnregistre ? 'Modifications en cours d\'enregistrement…' : (app.derniere ? 'Enregistré dans donnees/forum.json à ' + app.derniere : 'Relié au dossier « ' + esc(F_.dossier.name) + ' »');
    else statut = app.nonEnregistre ? 'Modifications non enregistrées dans un fichier' : (app.derniere ? 'Exporté à ' + app.derniere : 'Pas encore enregistré');
    html += '<div class="statut' + (app.nonEnregistre && !(F_.dossier && F_.autorise) ? ' non-enregistre' : '') + '">' + statut + '</div></div>';
    document.getElementById('menu').innerHTML = html;
  }

  function rendre() {
    var vue = FM.vues[app.page] || FM.vues.accueil;
    var c = document.getElementById('contenu');
    var defil = window.scrollY;
    // On note le champ qui a le focus pour le retrouver après l'affichage
    var actif = document.activeElement, selecteur = null, defilInterne = [];
    if (actif && c.contains(actif) && actif !== c) {
      selecteur = actif.tagName.toLowerCase() + Array.prototype.slice.call(actif.attributes)
        .filter(function (a) { return /^data-/.test(a.name); })
        .map(function (a) { return '[' + a.name + '="' + String(a.value).replace(/"/g, '\\"') + '"]'; }).join('');
    }
    c.querySelectorAll('.defile, .planning-grille, .panneau').forEach(function (z, i) { defilInterne[i] = [z.scrollTop, z.scrollLeft]; });
    try { c.innerHTML = vue.rendre(app.params || {}); }
    catch (e) { console.error(e); c.innerHTML = '<div class="alerte alerte-erreur">Erreur d\'affichage : ' + esc(e.message) + '</div>'; }
    if (app.garderDefilement) {
      c.querySelectorAll('.defile, .planning-grille, .panneau').forEach(function (z, i) {
        if (defilInterne[i]) { z.scrollTop = defilInterne[i][0]; z.scrollLeft = defilInterne[i][1]; }
      });
    }
    if (selecteur && selecteur.indexOf('[') > 0) {
      try { var cible = c.querySelector(selecteur); if (cible) cible.focus({ preventScroll: true }); } catch (e) { /* sans gravité */ }
    }
    if (vue.apres) vue.apres();
    rendreMenu();
    if (app.garderDefilement) window.scrollTo(0, defil);
    app.garderDefilement = false;
  }

  /** Va sur un écran. */
  function aller(page, params) {
    app.page = FM.vues[page] ? page : 'accueil';
    app.params = params || {};
    if (location.hash !== '#' + app.page) history.replaceState(null, '', '#' + app.page);
    window.scrollTo(0, 0);
    rendre();
  }

  /** Réaffiche l'écran courant sans revenir en haut. */
  function rafraichir() { app.garderDefilement = true; rendre(); }

  /* ---------- Annuler / Rétablir ----------
     Après chaque modification, on garde une copie de l'état précédent
     (au plus 40). « Annuler » revient à cette copie, « Rétablir » refait. */
  var MAX_HISTORIQUE = 40;
  var historique = { passe: [], futur: [], reference: null };
  function photo(etat) { return JSON.stringify(etat); }
  function memoriser(quoi) {
    if (historique.reference === null) return;
    var maintenant = photo(app.etat);
    if (maintenant === historique.reference) return;          // rien n'a changé
    historique.passe.push({ etat: historique.reference, quoi: quoi || 'dernière modification' });
    if (historique.passe.length > MAX_HISTORIQUE) historique.passe.shift();
    historique.futur = [];
    historique.reference = maintenant;
  }
  function restaurer(depuis, vers, verbe) {
    var pas = depuis.pop();
    if (!pas) return;
    vers.push({ etat: historique.reference, quoi: pas.quoi });
    app.etat = M.migrer(JSON.parse(pas.etat));
    historique.reference = pas.etat;
    M.oublierIndex(app.etat);
    app.nonEnregistre = true;
    F.copieSecours(app.etat);
    if (F.etat.dossier && F.etat.autorise) { clearTimeout(minuteur); minuteur = setTimeout(function () { enregistrer(true); }, 800); }
    rafraichir();
    FM.ui.toast(verbe + ' : ' + pas.quoi + '.');
  }
  function annuler() {
    if (!historique.passe.length) { FM.ui.toast('Rien à annuler.'); return; }
    restaurer(historique.passe, historique.futur, 'Annulé');
  }
  function retablir() {
    if (!historique.futur.length) { FM.ui.toast('Rien à rétablir.'); return; }
    restaurer(historique.futur, historique.passe, 'Rétabli');
  }

  var minuteur = null;
  /**
   * À appeler après chaque modification des données.
   * options.quoi : description courte de l'action (affichée par « Annuler »).
   */
  function changer(options) {
    options = options || {};
    memoriser(options.quoi);
    M.oublierIndex(app.etat);
    app.nonEnregistre = true;
    F.copieSecours(app.etat);
    if (options.rendre !== false) rafraichir(); else rendreMenu();
    if (F.etat.dossier && F.etat.autorise) {
      clearTimeout(minuteur);
      minuteur = setTimeout(function () { enregistrer(true); }, 1500);
    }
  }

  async function enregistrer(auto) {
    try {
      if (!(F.etat.dossier && F.etat.autorise)) {
        if (auto) return;
        if (F.etat.supporte) {
          if (F.etat.dossier) {
            if (!(await F.demanderAutorisation())) return;
          } else {
            await FM.ui.information('Enregistrer dans le dossier ForumMetiers',
              '<p>Le navigateur va vous demander de choisir un dossier.</p><p><b>Choisissez le dossier ForumMetiers</b> (celui qui contient <code>index.html</code>), puis acceptez l\'autorisation de modifier les fichiers.</p><p class="doux petit">Vous n\'aurez à le faire qu\'une fois : ensuite, les données seront enregistrées automatiquement dans donnees/forum.json.</p>');
            if (!(await F.choisirDossier())) return;
          }
        } else {
          F.exporterJSON(app.etat);
          app.nonEnregistre = false; app.derniere = O.heureCourte();
          FM.ui.toast('Sauvegarde téléchargée. Ce navigateur ne peut pas écrire directement dans le dossier : rangez ce fichier dans ForumMetiers/donnees.');
          rendreMenu();
          return;
        }
      }
      await F.enregistrer(app.etat);
      app.nonEnregistre = false; app.derniere = O.heureCourte();
      if (!auto) FM.ui.toast('Enregistré dans donnees/forum.json');
      rendreMenu();
      if (!auto && app.page === 'accueil') rafraichir();
    } catch (e) { FM.ui.erreur(e); }
  }

  /** Remplace toutes les données (chargement, import, exemple…). */
  function remplacer(etat, origine) {
    var avant = historique.reference;
    app.etat = etat; app.origine = origine;
    if (origine === 'dossier') { historique.passe = []; historique.futur = []; }
    else if (avant !== null) {
      historique.passe.push({ etat: avant, quoi: { exemple: 'chargement des données d\'exemple', nouveau: 'nouveau forum (tout effacer)',
        import: 'import d\'une sauvegarde', secours: 'restauration de la copie de secours' }[origine] || 'remplacement des données' });
      if (historique.passe.length > MAX_HISTORIQUE) historique.passe.shift();
      historique.futur = [];
    }
    historique.reference = photo(etat);
    M.oublierIndex(etat);
    F.etat.sauvegardeAvant = false;   // l'ancien forum.json sera copié dans donnees/sauvegardes avant d'être remplacé
    app.nonEnregistre = origine !== 'dossier';
    F.copieSecours(etat);
    if (app.nonEnregistre && F.etat.dossier && F.etat.autorise) {
      clearTimeout(minuteur);
      minuteur = setTimeout(function () { enregistrer(true); }, 800);
    }
    rafraichir();
  }

  async function reprendreDossier() {
    try {
      if (!F.etat.autorise && !(await F.demanderAutorisation())) return;
      var d = await F.lireForum();
      if (d) { remplacer(d, 'dossier'); app.derniere = null; FM.ui.toast('Forum repris depuis donnees/forum.json'); }
      else FM.ui.toast('Dossier relié. Aucun fichier forum.json pour l\'instant : il sera créé au premier enregistrement.');
      rafraichir();
    } catch (e) { FM.ui.erreur(e); }
  }

  async function choisirDossier() {
    try {
      if (!(await F.choisirDossier())) return;
      var d = await F.lireForum();
      if (d && (app.etat.eleves.length || app.etat.intervenants.length)) {
        var garder = await FM.ui.confirmer('Ce dossier contient déjà un forum enregistré. Voulez-vous le reprendre (les données affichées actuellement seront remplacées) ?',
          { oui: 'Reprendre le forum du dossier', non: 'Garder les données actuelles' });
        if (garder) remplacer(d, 'dossier'); else await enregistrer(true);
      } else if (d) remplacer(d, 'dossier');
      else await enregistrer(true);
      FM.ui.toast('Dossier relié : les modifications seront enregistrées automatiquement.');
      rafraichir();
    } catch (e) { FM.ui.erreur(e); }
  }

  function exporter() {
    var nom = F.exporterJSON(app.etat);
    if (!(F.etat.dossier && F.etat.autorise)) { app.nonEnregistre = false; app.derniere = O.heureCourte(); }
    FM.ui.toast('Copie de sauvegarde téléchargée : ' + nom);
    rendreMenu();
  }

  function importer() {
    FM.ui.choisirFichier('.json,application/json').then(async function (fichiers) {
      if (!fichiers.length) return;
      try {
        var d = await F.importerJSON(fichiers[0]);
        var ok = await FM.ui.confirmer('Remplacer toutes les données actuelles par celles du fichier « ' + fichiers[0].name + ' » ?', { oui: 'Remplacer', danger: true });
        if (!ok) return;
        remplacer(d, 'import');
        FM.ui.toast('Données importées.');
      } catch (e) { FM.ui.erreur(e); }
    });
  }

  /* ---------- Événements ---------- */
  function vueCourante() { return FM.vues[app.page] || FM.vues.accueil; }

  function brancher() {
    document.getElementById('menu').addEventListener('click', function (ev) {
      var lien = ev.target.closest('[data-page]');
      if (lien) { ev.preventDefault(); aller(lien.getAttribute('data-page')); return; }
      var g = ev.target.closest('[data-global]');
      if (!g) return;
      var a = g.getAttribute('data-global');
      if (a === 'enregistrer') enregistrer(false);
      else if (a === 'exporter') exporter();
      else if (a === 'importer') importer();
      else if (a === 'annuler') annuler();
      else if (a === 'retablir') retablir();
    });
    var c = document.getElementById('contenu');
    c.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-action]');
      if (!el || el.disabled) return;
      var vue = vueCourante(), nom = el.getAttribute('data-action');
      var f = (vue.actions && vue.actions[nom]) || ACTIONS_COMMUNES[nom];
      if (f) {
        ev.preventDefault();
        try { var r = f.call(vue, el, ev); if (r && r.catch) r.catch(FM.ui.erreur); } catch (e) { FM.ui.erreur(e); }
      }
    });
    function surChamp(attr) {
      return function (ev) {
        var el = ev.target.closest('[' + attr + ']');
        if (!el) return;
        var vue = vueCourante(), nom = el.getAttribute(attr);
        var f = attr === 'data-input' ? vue.saisies && vue.saisies[nom] : vue.changements && vue.changements[nom];
        if (f) { try { var r = f.call(vue, el, ev); if (r && r.catch) r.catch(FM.ui.erreur); } catch (e) { FM.ui.erreur(e); } }
      };
    }
    c.addEventListener('change', surChamp('data-change'));
    c.addEventListener('input', surChamp('data-input'));
    // Champs validés seulement quand on les quitte (ex. heures : le navigateur
    // signale un changement à chaque chiffre tapé, il ne faut pas réafficher avant la fin)
    c.addEventListener('focusout', function (ev) {
      var el = ev.target.closest('[data-blur]');
      if (!el || el.value === el.getAttribute('data-initial')) return;
      var vue = vueCourante(), f = vue.changements && vue.changements[el.getAttribute('data-blur')];
      if (!f) return;
      el.setAttribute('data-initial', el.value);
      // On attend que le focus soit arrivé sur le champ suivant pour qu'il soit conservé après le réaffichage
      setTimeout(function () { try { f.call(vue, el, ev); } catch (e) { FM.ui.erreur(e); } }, 0);
    });
    c.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.closest('[data-blur]')) ev.target.blur();
    });
    window.addEventListener('hashchange', function () {
      var p = location.hash.slice(1);
      if (p && p !== app.page && FM.vues[p]) aller(p);
    });
    window.addEventListener('beforeunload', function (ev) {
      if (app.nonEnregistre && !(F.etat.dossier && F.etat.autorise)) { ev.preventDefault(); ev.returnValue = ''; }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !document.getElementById('fenetre').hidden) FM.ui.fermer();
      var champ = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (!(ev.ctrlKey || ev.metaKey) || champ || !document.getElementById('fenetre').hidden) return;
      var k = ev.key.toLowerCase();
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); annuler(); }
      else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); retablir(); }
    });
  }

  /** Actions utilisables depuis n'importe quel écran. */
  var ACTIONS_COMMUNES = {
    aller: function (el) { aller(el.getAttribute('data-page'), el.dataset.param ? JSON.parse(el.dataset.param) : {}); },
    choisirDossier: function () { return choisirDossier(); },
    reprendreDossier: function () { return reprendreDossier(); },
    enregistrer: function () { return enregistrer(false); },
    exporterJSON: function () { exporter(); },
    importerJSON: function () { importer(); }
  };

  async function demarrer() {
    brancher();
    await F.init();
    app.secoursDisponible = F.lireSecours();
    if (F.etat.dossier && F.etat.autorise) {
      try {
        var d = await F.lireForum();
        if (d) { app.etat = d; app.origine = 'dossier'; }
      } catch (e) { FM.ui.erreur(e); }
    } else if (!F.etat.dossier && app.secoursDisponible) {
      // Navigateur sans accès au dossier (ex. Firefox) : on reprend la copie de secours
      app.etat = app.secoursDisponible.donnees; app.origine = 'secours';
    }
    historique.reference = photo(app.etat);
    var p = location.hash.slice(1);
    aller(FM.vues[p] ? p : 'accueil');
  }

  app.aller = aller; app.rafraichir = rafraichir; app.changer = changer; app.enregistrer = enregistrer;
  app.remplacer = remplacer; app.demarrer = demarrer; app.rendreMenu = rendreMenu;
  app.annuler = annuler; app.retablir = retablir; app.historique = historique;
  return app;
})();

document.addEventListener('DOMContentLoaded', function () { FM.app.demarrer(); });
