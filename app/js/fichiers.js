/* =====================================================================
   fichiers.js — enregistrement et chargement des données.

   - Edge / Chrome : on relie une fois le logiciel au dossier ForumMetiers
     (le navigateur demande l'autorisation). Les données sont alors écrites
     dans donnees/forum.json et les fichiers générés dans exports/.
     Au lancement suivant, un clic sur « Reprendre » suffit.
   - Tous navigateurs (dont Firefox) : « Exporter » télécharge un fichier
     .json de sauvegarde ; « Importer » le recharge.
   - En plus, une copie de secours est gardée dans le navigateur
     (jamais utilisée comme seule sauvegarde).
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.fichiers = (function () {
  'use strict';
  var O = FM.outils;
  var CLE_SECOURS = 'forummetiers-copie-secours';

  var etat = {
    supporte: typeof window.showDirectoryPicker === 'function',
    dossier: null,        // poignée du dossier ForumMetiers
    autorise: false,      // autorisation d'écriture accordée pour cette session
    sauvegardeAvant: false
  };

  /* ---------- Petite base IndexedDB pour se souvenir du dossier ---------- */
  function base() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open('forummetiers', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('reglages'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }
  async function idbLire(cle) {
    try {
      var db = await base();
      return await new Promise(function (ok) {
        var r = db.transaction('reglages').objectStore('reglages').get(cle);
        r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ok(null); };
      });
    } catch (e) { return null; }
  }
  async function idbEcrire(cle, valeur) {
    try {
      var db = await base();
      await new Promise(function (ok) {
        var t = db.transaction('reglages', 'readwrite');
        t.objectStore('reglages').put(valeur, cle); t.oncomplete = ok; t.onerror = ok;
      });
    } catch (e) { /* sans gravité */ }
  }

  /* ---------- Dossier ForumMetiers ---------- */
  async function init() {
    if (!etat.supporte) return;
    etat.dossier = await idbLire('dossier');
    if (etat.dossier && etat.dossier.queryPermission) {
      try { etat.autorise = (await etat.dossier.queryPermission({ mode: 'readwrite' })) === 'granted'; }
      catch (e) { etat.autorise = false; }
    }
  }

  async function choisirDossier() {
    var h = await window.showDirectoryPicker({ id: 'forummetiers', mode: 'readwrite' });
    var noms = [];
    for await (var entree of h.values()) noms.push(entree.name);
    if (h.name === 'donnees' || h.name === 'exports' || h.name === 'app') {
      throw new Error('Vous avez choisi le sous-dossier « ' + h.name + ' ». Choisissez le dossier ForumMetiers lui-même (celui qui contient index.html).');
    }
    if (noms.indexOf('index.html') < 0 && noms.indexOf('donnees') < 0) {
      var ok = await FM.ui.confirmer('Ce dossier (« ' + h.name + ' ») ne semble pas être le dossier ForumMetiers : il ne contient pas index.html. L\'utiliser quand même ?');
      if (!ok) return false;
    }
    etat.dossier = h; etat.autorise = true; etat.sauvegardeAvant = false;
    await idbEcrire('dossier', h);
    return true;
  }

  async function demanderAutorisation() {
    if (!etat.dossier) return false;
    var r = await etat.dossier.requestPermission({ mode: 'readwrite' });
    etat.autorise = r === 'granted';
    return etat.autorise;
  }

  async function sousDossier(nom) { return etat.dossier.getDirectoryHandle(nom, { create: true }); }
  async function ecrireDans(dossier, nom, contenu) {
    var f = await dossier.getFileHandle(nom, { create: true });
    var w = await f.createWritable();
    await w.write(contenu); await w.close();
  }

  /** Lit donnees/forum.json dans le dossier relié (null s'il n'existe pas encore). */
  async function lireForum() {
    var d = await sousDossier('donnees');
    try {
      var f = await (await d.getFileHandle('forum.json')).getFile();
      return FM.modele.migrer(JSON.parse(await f.text()));
    } catch (e) {
      if (e && e.name === 'NotFoundError') return null;
      throw e;
    }
  }

  /** Écrit donnees/forum.json (et garde une copie de l'ancienne version au premier enregistrement). */
  async function enregistrer(donnees) {
    var d = await sousDossier('donnees');
    if (!etat.sauvegardeAvant) {
      try {
        var ancien = await (await d.getFileHandle('forum.json')).getFile();
        var s = await d.getDirectoryHandle('sauvegardes', { create: true });
        await ecrireDans(s, 'forum_' + O.horodatage() + '.json', await ancien.text());
      } catch (e) { /* pas encore de fichier : rien à garder */ }
      etat.sauvegardeAvant = true;
    }
    await ecrireDans(d, 'forum.json', JSON.stringify(donnees, null, 1));
  }

  /** Enregistre un fichier généré : dans exports/ si le dossier est relié, sinon téléchargement. */
  async function exporter(nom, blob) {
    if (etat.dossier && etat.autorise) {
      try {
        await ecrireDans(await sousDossier('exports'), nom, blob);
        return 'exports/' + nom;
      } catch (e) { console.warn(e); }
    }
    O.telecharger(nom, blob);
    return null;
  }

  /* ---------- Exporter / Importer (tous navigateurs) ---------- */
  function exporterJSON(donnees) {
    var nom = 'forum_' + O.horodatage() + '.json';
    O.telecharger(nom, new Blob([JSON.stringify(donnees, null, 1)], { type: 'application/json' }));
    return nom;
  }
  async function importerJSON(fichier) {
    var texte = O.decoderTexte(await fichier.arrayBuffer()).texte;
    var d;
    try { d = JSON.parse(texte); } catch (e) { throw new Error("Ce fichier n'est pas un fichier de sauvegarde valide (.json)."); }
    return FM.modele.migrer(d);
  }

  /* ---------- Copie de secours dans le navigateur ---------- */
  function copieSecours(donnees) {
    try { localStorage.setItem(CLE_SECOURS, JSON.stringify({ date: new Date().toISOString(), donnees: donnees })); }
    catch (e) { /* stockage plein ou interdit : sans gravité */ }
  }
  function lireSecours() {
    try {
      var s = JSON.parse(localStorage.getItem(CLE_SECOURS));
      if (s && s.donnees) return { date: s.date, donnees: FM.modele.migrer(s.donnees) };
    } catch (e) { /* ignorée */ }
    return null;
  }

  return {
    etat: etat, init: init, choisirDossier: choisirDossier, demanderAutorisation: demanderAutorisation,
    lireForum: lireForum, enregistrer: enregistrer, exporter: exporter,
    exporterJSON: exporterJSON, importerJSON: importerJSON, copieSecours: copieSecours, lireSecours: lireSecours
  };
})();
