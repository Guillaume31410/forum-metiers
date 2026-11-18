/* =====================================================================
   imports.js — lecture des fichiers fournis par l'utilisateur :
   liste des élèves (CSV ou Excel, ex. Pronote), intervenants (Excel),
   vœux (un Excel par classe, généré par le logiciel).
   Les fonctions ici ne touchent pas à l'écran : elles analysent et
   renvoient des résultats que les vues affichent.
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.imports = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele;

  /** Lit un fichier CSV ou Excel → { lignes, type, encodage, separateur, feuille } */
  async function lireTableau(fichier, feuillePreferee) {
    var buf = await fichier.arrayBuffer();
    var nom = fichier.name.toLowerCase();
    var estZip = new Uint8Array(buf.slice(0, 2));
    if (/\.xlsx$|\.xlsm$/.test(nom) || (estZip[0] === 0x50 && estZip[1] === 0x4B)) {
      var feuilles = await FM.xlsx.lire(buf);
      if (!feuilles.length) throw new Error('Le fichier Excel ne contient aucune feuille lisible.');
      var f = null;
      if (feuillePreferee) f = feuilles.filter(function (x) { return O.norm(x.nom) === O.norm(feuillePreferee); })[0];
      f = f || feuilles.filter(function (x) { return x.lignes.length; })[0] || feuilles[0];
      return { lignes: f.lignes, type: 'Excel', feuille: f.nom };
    }
    if (/\.xls$|\.ods$/.test(nom)) {
      throw new Error('Ce format (' + nom.split('.').pop() + ') n\'est pas lu directement : ouvrez le fichier dans votre tableur et enregistrez-le en .xlsx ou en .csv.');
    }
    var d = O.decoderTexte(buf), sep = O.detecterSeparateur(d.texte);
    return { lignes: O.lireCSV(d.texte, sep), type: 'CSV', encodage: d.encodage,
      separateur: sep === ';' ? 'point-virgule' : sep === ',' ? 'virgule' : 'tabulation' };
  }

  /* =================== ÉLÈVES =================== */

  var MOTS = {
    nom: function (h) { return /^nom( de famille| eleve| d'usage)?$|^nom\b(?!.*pr[eé]nom)/.test(h) && !/prenom/.test(h); },
    prenom: function (h) { return /prenom/.test(h) && !/^nom/.test(h); },
    classe: function (h) { return /classe|division|^div\b/.test(h); },
    unique: function (h) { return /^(eleve|eleves|nom prenom|nom et prenom|nom - prenom|identite|nom, prenom)$/.test(h); }
  };

  /** Trouve la ligne d'en-têtes parmi les 10 premières lignes. */
  function ligneEntete(lignes) {
    for (var i = 0; i < Math.min(10, lignes.length); i++) {
      var h = lignes[i].map(O.norm);
      if (h.some(MOTS.nom) || h.some(MOTS.prenom) || h.some(MOTS.classe) || h.some(MOTS.unique)) return i;
    }
    return 0;
  }

  /** Propose l'association des colonnes (index) d'après les en-têtes et le choix mémorisé. */
  function proposerColonnes(entetes, memo) {
    var h = entetes.map(O.norm), res = { nom: -1, prenom: -1, classe: -1, unique: false };
    function trouver(test) { for (var i = 0; i < h.length; i++) if (test(h[i])) return i; return -1; }
    if (memo) {
      ['nom', 'prenom', 'classe'].forEach(function (k) { if (memo[k]) res[k] = h.indexOf(O.norm(memo[k])); });
      res.unique = !!memo.unique;
    }
    if (res.nom < 0) res.nom = trouver(MOTS.nom);
    if (res.prenom < 0) res.prenom = trouver(MOTS.prenom);
    if (res.classe < 0) res.classe = trouver(MOTS.classe);
    if (res.nom < 0 && res.prenom < 0) {
      var u = trouver(MOTS.unique);
      if (u >= 0) { res.nom = u; res.unique = true; }
    }
    return res;
  }

  /** "DUPONT Jean" ou "DE LA FONTAINE Marie-Ève" → { nom, prenom } */
  function separerNomPrenom(texte) {
    var mots = String(texte).trim().split(/\s+/), nom = [], i = 0;
    while (i < mots.length - 1 && /\p{L}/u.test(mots[i]) && mots[i] === mots[i].toLocaleUpperCase('fr')) { nom.push(mots[i]); i++; }
    if (!nom.length) { nom.push(mots[0]); i = 1; }
    return { nom: nom.join(' '), prenom: mots.slice(i).join(' ') };
  }

  /** Transforme les lignes du fichier en élèves selon l'association choisie. */
  function extraireEleves(lignes, iEntete, col) {
    var res = [];
    for (var i = iEntete + 1; i < lignes.length; i++) {
      var l = lignes[i], nom = '', prenom = '';
      if (col.unique) {
        var np = separerNomPrenom(l[col.nom] || '');
        nom = np.nom; prenom = np.prenom;
      } else {
        nom = (l[col.nom] || '').trim(); prenom = (l[col.prenom] || '').trim();
      }
      var classe = (l[col.classe] || '').trim();
      res.push({ nom: nom, prenom: prenom, classe: classe, ligne: i + 1, incomplet: !nom || !prenom || !classe });
    }
    return res;
  }

  function cleEleve(e) { return O.norm(e.classe) + '|' + O.norm(e.nom) + '|' + O.norm(e.prenom); }

  /**
   * Intègre la liste lue. mode "remplacer" (les élèves déjà connus gardent
   * leur identifiant et leurs vœux) ou "ajouter".
   */
  function appliquerEleves(etat, liste, mode) {
    var complets = liste.filter(function (e) { return !e.incomplet; });
    var anciens = {}, pris = {}, stats = { ajoutes: 0, conserves: 0, retires: 0, doublons: 0 };
    etat.eleves.forEach(function (e) { anciens[cleEleve(e)] = e; });
    var nouveaux = mode === 'ajouter' ? etat.eleves.slice() : [], vus = {};
    if (mode === 'ajouter') nouveaux.forEach(function (e) { vus[cleEleve(e)] = true; });
    complets.forEach(function (e) {
      var k = cleEleve(e);
      if (vus[k]) { stats.doublons++; return; }
      vus[k] = true;
      if (anciens[k]) {
        if (mode !== 'ajouter') { nouveaux.push(anciens[k]); stats.conserves++; } else stats.doublons++;
      } else {
        nouveaux.push({ id: null, nom: e.nom, prenom: e.prenom, classe: e.classe });
        stats.ajoutes++;
      }
    });
    if (mode !== 'ajouter') stats.retires = etat.eleves.filter(function (e) { return !vus[cleEleve(e)]; }).length;
    nouveaux.forEach(function (e) { if (e.id) pris[e.id] = true; });
    var tmp = { eleves: [] };
    nouveaux.forEach(function (e) { if (!e.id) e.id = M.nouvelIdEleve(tmp, pris); });
    etat.eleves = nouveaux;
    // On oublie les vœux des élèves retirés
    var ids = {};
    nouveaux.forEach(function (e) { ids[e.id] = true; });
    Object.keys(etat.voeux).forEach(function (id) { if (!ids[id]) delete etat.voeux[id]; });
    M.oublierIndex(etat);
    return stats;
  }

  /* =================== INTERVENANTS =================== */

  var MOTS_INTER = {
    num: function (h) { return /atelier|^n ?°|^no\.?$|^num|^n$/.test(h) && !/nom/.test(h); },
    nom: function (h) { return /^nom|intervenant|professionnel/.test(h); },
    metier: function (h) { return /metier|profession|poste/.test(h); },
    secteur: function (h) { return /secteur|domaine/.test(h); },
    contact: function (h) { return /contact|mail|tel|courriel/.test(h); },
    salle: function (h) { return /salle|local/.test(h); },
    taille: function (h) { return /taille|groupe|capacite|places/.test(h); }
  };
  function estPresent(v) {
    var s = O.norm(v);
    return s !== '' && ['non', 'n', '0', 'absent', 'absente', '-', 'faux', 'false'].indexOf(s) < 0;
  }

  /** Analyse le fichier des intervenants → { intervenants, salles (noms nouveaux), avertissements, erreurs } */
  function analyserIntervenants(etat, lignes) {
    var res = { intervenants: [], nouvellesSalles: [], avertissements: [], erreurs: [] };
    var cr = M.creneaux(etat);
    var iE = -1;
    for (var i = 0; i < Math.min(10, lignes.length); i++) {
      var h0 = lignes[i].map(O.norm);
      if (h0.some(MOTS_INTER.metier) || h0.some(MOTS_INTER.num)) { iE = i; break; }
    }
    if (iE < 0) { res.erreurs.push('Impossible de trouver la ligne d\'en-têtes (colonnes « N° atelier », « Nom », « Métier »…).'); return res; }
    var h = lignes[iE].map(O.norm), col = {}, utilisees = {};
    Object.keys(MOTS_INTER).forEach(function (k) {
      for (var j = 0; j < h.length; j++) if (!utilisees[j] && MOTS_INTER[k](h[j])) { col[k] = j; utilisees[j] = true; return; }
      col[k] = -1;
    });
    ['num', 'nom', 'metier'].forEach(function (k) {
      if (col[k] < 0) res.erreurs.push('Colonne obligatoire introuvable : « ' + { num: 'N° atelier', nom: 'Nom', metier: 'Métier' }[k] + ' ».');
    });
    if (res.erreurs.length) return res;

    // Colonnes de disponibilité : une par créneau, repérée par son heure de début
    var colCreneau = new Array(cr.length).fill(-1), inconnues = [], colsHeure = [];
    lignes[iE].forEach(function (t, j) {
      if (utilisees[j]) return;
      var m = O.lireHeure(t);
      if (m === null) return;
      colsHeure.push(j);
      var c = cr.filter(function (x) { return x.debut === m; })[0];
      if (c) colCreneau[c.index] = j; else inconnues.push(t);
    });
    var trouvees = colCreneau.filter(function (x) { return x >= 0; }).length;
    if (!colsHeure.length) {
      res.avertissements.push('Aucune colonne de disponibilités trouvée : tous les intervenants sont considérés présents à tous les créneaux.');
    } else if (trouvees < cr.length && colsHeure.length === cr.length && !trouvees) {
      res.avertissements.push('Les heures des colonnes ne correspondent pas aux créneaux actuels : elles sont associées dans l\'ordre (' +
        colsHeure.map(function (j) { return lignes[iE][j]; }).join(', ') + ').');
      colsHeure.forEach(function (j, k) { colCreneau[k] = j; });
    } else {
      if (inconnues.length) res.avertissements.push('Colonnes ignorées car elles ne correspondent à aucun créneau : ' + inconnues.join(', ') + '.');
      cr.forEach(function (c) {
        if (colCreneau[c.index] < 0) res.avertissements.push('Pas de colonne pour le créneau ' + c.libelle + ' : intervenants considérés absents.');
      });
    }

    var nums = {}, sallesConnues = {};
    etat.salles.forEach(function (s) { sallesConnues[O.norm(s.nom)] = s.nom; sallesConnues[O.norm(M.libelleSalle(s))] = s.nom; });
    for (i = iE + 1; i < lignes.length; i++) {
      var l = lignes[i], num = parseInt(l[col.num], 10), n = i + 1;
      var nom = (l[col.nom] || '').trim(), metier = (l[col.metier] || '').trim();
      if (!nom && !metier && isNaN(num)) continue;
      if (isNaN(num) || num <= 0) { res.erreurs.push('Ligne ' + n + ' : numéro d\'atelier manquant ou incorrect (« ' + (l[col.num] || '') + ' »), ligne ignorée.'); continue; }
      if (nums[num]) { res.erreurs.push('Ligne ' + n + ' : le numéro d\'atelier ' + num + ' est déjà utilisé, ligne ignorée.'); continue; }
      nums[num] = true;
      if (!nom) res.avertissements.push('Ligne ' + n + ' (atelier ' + num + ') : nom manquant.');
      if (!metier) res.avertissements.push('Ligne ' + n + ' (atelier ' + num + ') : métier manquant.');
      var taille = col.taille >= 0 ? parseInt(l[col.taille], 10) : NaN;
      var salle = col.salle >= 0 ? (l[col.salle] || '').trim() : '';
      if (salle && !sallesConnues[O.norm(salle)] && !sallesConnues[O.norm(separerSalle(salle).nom)]) {
        sallesConnues[O.norm(salle)] = salle; sallesConnues[O.norm(separerSalle(salle).nom)] = salle; res.nouvellesSalles.push(salle);
      }
      var dispo = cr.map(function (c) {
        if (!colsHeure.length) return true;
        return colCreneau[c.index] >= 0 && estPresent(l[colCreneau[c.index]]);
      });
      res.intervenants.push({
        num: num, nom: nom, metier: metier,
        secteur: col.secteur >= 0 ? (l[col.secteur] || '').trim() : '',
        contact: col.contact >= 0 ? (l[col.contact] || '').trim() : '',
        salleNom: salle, taille: taille > 0 ? taille : null, dispo: dispo
      });
    }
    if (!res.intervenants.length) res.erreurs.push('Aucun intervenant trouvé dans le fichier.');
    return res;
  }

  /** "311 - santé" → { nom: "311", theme: "santé" } */
  function separerSalle(texte) {
    var m = /^(.*?)\s+[-–]\s+(.+)$/.exec(String(texte).trim());
    return m ? { nom: m[1].trim(), theme: m[2].trim() } : { nom: String(texte).trim(), theme: '' };
  }

  function appliquerIntervenants(etat, res) {
    res.nouvellesSalles.forEach(function (texte) {
      var sp = separerSalle(texte);
      etat.salles.push({ id: M.nouvelIdSalle(etat), nom: sp.nom, theme: sp.theme, maxAteliers: null });
    });
    var parNom = {};
    etat.salles.forEach(function (s) { parNom[O.norm(s.nom)] = s.id; parNom[O.norm(M.libelleSalle(s))] = s.id; });
    etat.intervenants = res.intervenants.map(function (i) {
      return { num: i.num, nom: i.nom, metier: i.metier, secteur: i.secteur, contact: i.contact,
        salle: i.salleNom ? (parNom[O.norm(i.salleNom)] || parNom[O.norm(separerSalle(i.salleNom).nom)] || '') : '', taille: i.taille, dispo: i.dispo };
    });
  }

  /* =================== VŒUX =================== */

  /**
   * Analyse un fichier de vœux rempli par un professeur.
   * Renvoie { voeux: {id: [...]}, erreurs: [{type, texte}], classes: [...], lus }
   */
  function analyserVoeux(etat, lignes, nomFichier) {
    var res = { voeux: {}, erreurs: [], classes: [], lus: 0 };
    function erreur(type, texte) { res.erreurs.push({ type: type, texte: texte, fichier: nomFichier }); }
    var iE = -1;
    for (var i = 0; i < Math.min(10, lignes.length); i++) {
      if (lignes[i].map(O.norm).some(function (h) { return /^v(oe|œ)?u\s*\d+/.test(h); })) { iE = i; break; }
    }
    if (iE < 0) { erreur('fichier', 'colonnes « Vœu 1 », « Vœu 2 »… introuvables : ce fichier n\'est pas un modèle de vœux.'); return res; }
    var h = lignes[iE].map(O.norm), colVoeux = [];
    var cNom = h.findIndex(function (x) { return /^nom/.test(x); });
    var cPrenom = h.findIndex(function (x) { return /prenom/.test(x); });
    var cClasse = h.findIndex(function (x) { return /classe/.test(x); });
    h.forEach(function (x, j) { var m = /^v(?:oe|œ)?u\s*(\d+)/.exec(x); if (m) colVoeux.push({ j: j, k: parseInt(m[1], 10) }); });
    colVoeux.sort(function (a, b) { return a.k - b.k; });
    if (cNom < 0 || cPrenom < 0) { erreur('fichier', 'colonnes « Nom » et « Prénom » introuvables.'); return res; }

    var index = {}, classesVues = {};
    etat.eleves.forEach(function (e) {
      var k = O.norm(e.classe) + '|' + O.norm(e.nom) + '|' + O.norm(e.prenom);
      (index[k] || (index[k] = [])).push(e);
    });
    var classeDefaut = '';
    for (i = iE + 1; i < lignes.length; i++) {
      var l = lignes[i], nom = l[cNom] || '', prenom = l[cPrenom] || '';
      if (!nom && !prenom) continue;
      var classe = cClasse >= 0 && l[cClasse] ? l[cClasse] : classeDefaut;
      classeDefaut = classe;
      var qui = nom + ' ' + prenom + (classe ? ' (' + classe + ')' : '');
      var trouves = index[O.norm(classe) + '|' + O.norm(nom) + '|' + O.norm(prenom)] || [];
      if (!trouves.length) { erreur('inconnu', 'élève inconnu : ' + qui + ' — ligne ' + (i + 1) + ' ignorée.'); continue; }
      if (trouves.length > 1) { erreur('inconnu', 'plusieurs élèves s\'appellent ' + qui + ' : saisissez leurs vœux à la main dans le logiciel.'); continue; }
      var e = trouves[0], liste = [];
      classesVues[e.classe] = true;
      colVoeux.forEach(function (cv) {
        var brut = (l[cv.j] || '').trim();
        if (!brut) return;
        // On accepte « 3 » comme « 3 - Plombier » (choix dans la liste déroulante)
        var mNum = /^\s*0*(\d+)(?:\.0+)?\s*(?:[-–:·.]\s*.*)?$/.exec(brut), num = mNum ? parseInt(mNum[1], 10) : NaN;
        if (isNaN(num)) {
          erreur('inexistant', qui + ' : vœu ' + cv.k + ' « ' + brut + ' » n\'est pas un numéro d\'atelier, ignoré.'); return;
        }
        if (!M.intervenant(etat, num)) { erreur('inexistant', qui + ' : vœu ' + cv.k + ' — l\'atelier n°' + num + ' n\'existe pas, ignoré.'); return; }
        if (liste.indexOf(num) >= 0) { erreur('double', qui + ' : l\'atelier n°' + num + ' est demandé deux fois, le doublon est ignoré.'); return; }
        liste.push(num);
      });
      res.voeux[e.id] = liste;
      if (liste.length) res.lus++;
    }
    res.classes = Object.keys(classesVues);
    return res;
  }

  return {
    lireTableau: lireTableau, ligneEntete: ligneEntete, proposerColonnes: proposerColonnes,
    separerNomPrenom: separerNomPrenom, extraireEleves: extraireEleves, appliquerEleves: appliquerEleves,
    analyserIntervenants: analyserIntervenants, appliquerIntervenants: appliquerIntervenants,
    analyserVoeux: analyserVoeux
  };
})();
