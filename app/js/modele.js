/* =====================================================================
   modele.js — structure des données du forum et calculs de base
   (créneaux, places disponibles, vérifications avant répartition).

   Toutes les données tiennent dans un seul objet "état", enregistré tel
   quel dans donnees/forum.json :
   {
     format: "forum-metiers", version: 1, nom,
     parametres: { dureeCreneau, battement, sessions:[{debut, fin}] (minutes),
                   tailleGroupe, nbVoeux, ateliersParSalle, date },
     salles:       [{ id, nom, theme, maxAteliers }]   (maxAteliers vide = valeur par défaut),
     intervenants: [{ num, nom, metier, secteur, contact, salle, taille, dispo:[bool par créneau] }],
     eleves:       [{ id, nom, prenom, classe }],
     voeux:        { idEleve: [numéros d'ateliers, du vœu 1 au dernier] },
     repartition:  null | { graine, date, nbCreneaux, liberes, affectations:[{ e, c, a, v }] },
                   (e = élève, c = n° de créneau, a = n° d'atelier, v = verrouillée)
     memo:         { colonnesEleves }
   }
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.modele = (function () {
  'use strict';
  var O = FM.outils;
  var VERSION = 1;

  function nouveau() {
    return {
      format: 'forum-metiers', version: VERSION,
      nom: 'Forum des métiers',
      parametres: {
        dureeCreneau: 15, battement: 5,
        sessions: [{ debut: 9 * 60, fin: 10 * 60 + 30 }, { debut: 10 * 60 + 45, fin: 12 * 60 }],
        tailleGroupe: 10, nbVoeux: 6, ateliersParSalle: 4, date: ''
      },
      salles: [], intervenants: [], eleves: [], voeux: {}, repartition: null,
      memo: { colonnesEleves: null }
    };
  }

  /** Vérifie et complète un état lu depuis un fichier (compatibilité des anciennes versions). */
  function migrer(d) {
    if (!d || typeof d !== 'object' || (d.format && d.format !== 'forum-metiers')) {
      throw new Error("Ce fichier n'est pas un fichier de données du Forum des métiers.");
    }
    if (d.version > VERSION) {
      throw new Error('Ce fichier a été créé par une version plus récente du logiciel.');
    }
    var base = nouveau();
    var e = Object.assign(base, d);
    e.parametres = Object.assign(nouveau().parametres, d.parametres || {});
    e.memo = Object.assign({ colonnesEleves: null }, d.memo || {});
    ['salles', 'intervenants', 'eleves'].forEach(function (k) { if (!Array.isArray(e[k])) e[k] = []; });
    if (!e.voeux || typeof e.voeux !== 'object') e.voeux = {};
    e.salles.forEach(function (s) {
      if (s.theme === undefined || s.theme === null) s.theme = '';
      if (s.maxAteliers === undefined) s.maxAteliers = null;
      delete s.capacite;     // ancienne version : capacité en places, abandonnée
    });
    e.intervenants.forEach(function (i) {
      i.num = parseInt(i.num, 10);
      if (!Array.isArray(i.dispo)) i.dispo = [];
      ['nom', 'metier', 'secteur', 'contact', 'salle'].forEach(function (k) { if (i[k] === undefined || i[k] === null) i[k] = ''; });
      if (i.taille === undefined || i.taille === '') i.taille = null;
    });
    e.format = 'forum-metiers'; e.version = VERSION;
    return e;
  }

  /* ---------------- Créneaux ---------------- */

  /** Découpe une session : n créneaux, minutes inutilisées. */
  function decouper(debut, fin, duree, battement) {
    var L = fin - debut;
    if (duree <= 0 || L < duree) return { n: 0, reste: Math.max(0, L) };
    var n = Math.floor((L + battement) / (duree + battement));
    return { n: n, reste: L - (n * duree + (n - 1) * battement) };
  }

  /** Liste de tous les créneaux, dans l'ordre : [{ index, session, debut, fin, libelle }] */
  function creneaux(etat) {
    var p = etat.parametres, liste = [], details = [];
    p.sessions.forEach(function (s, iS) {
      var d = decouper(s.debut, s.fin, p.dureeCreneau, p.battement), k;
      details.push({ debut: s.debut, fin: s.fin, n: d.n, reste: d.reste });
      for (k = 0; k < d.n; k++) {
        var deb = s.debut + k * (p.dureeCreneau + p.battement);
        liste.push({ index: liste.length, session: iS, debut: deb, fin: deb + p.dureeCreneau,
          libelle: O.hm(deb) + '–' + O.hm(deb + p.dureeCreneau),
          libelle0: O.hm0(deb) + '–' + O.hm0(deb + p.dureeCreneau) });
      }
    });
    liste.sessions = details;
    return liste;
  }

  /**
   * Propose des durées (créneau, battement) qui font tomber juste une session
   * ou, mieux, toutes les sessions à la fois. Renvoie au plus 2 propositions.
   */
  function suggestions(p, indexSession) {
    var sessions = indexSession === undefined ? p.sessions : [p.sessions[indexSession]];
    var minB = Math.min(p.battement, 2), res = [];
    for (var d = 8; d <= 40; d++) {
      for (var b = minB; b <= 15; b++) {
        var ok = sessions.every(function (s) {
          var r = decouper(s.debut, s.fin, d, b);
          return r.n > 0 && r.reste === 0;
        });
        if (ok && !(d === p.dureeCreneau && b === p.battement)) {
          res.push({ duree: d, battement: b, ecart: Math.abs(d - p.dureeCreneau) + Math.abs(b - p.battement) });
        }
      }
    }
    res.sort(function (a, b) { return a.ecart - b.ecart; });
    return res.slice(0, 2);
  }

  /* ---------------- Ateliers / salles ---------------- */

  function taille(etat, inter) {
    var t = parseInt(inter.taille, 10);
    return t > 0 ? t : etat.parametres.tailleGroupe;
  }
  function present(inter, c) { return !!inter.dispo[c]; }
  function intervenant(etat, num) {
    num = Number(num);
    for (var i = 0; i < etat.intervenants.length; i++) if (etat.intervenants[i].num === num) return etat.intervenants[i];
    return null;
  }
  function salle(etat, id) {
    for (var i = 0; i < etat.salles.length; i++) if (etat.salles[i].id === id) return etat.salles[i];
    return null;
  }
  /** Nom affiché d'une salle : « Salle 311 - santé » (le thème est facultatif). */
  function nomSalle(etat, inter) {
    var s = inter && salle(etat, inter.salle);
    return s ? nomSalleBrut(s) : '';
  }
  /** Libellé court pour les listes : « 311 - santé ». */
  function libelleSalle(s) { return s.nom + (s.theme ? ' - ' + s.theme : ''); }
  /** Nombre maximal d'ateliers de la salle (réglage de la salle, sinon valeur par défaut). */
  function maxAteliers(etat, s) { var m = parseInt(s.maxAteliers, 10); return m > 0 ? m : etat.parametres.ateliersParSalle; }
  function nouvelIdSalle(etat) {
    var n = 1;
    while (salle(etat, 's' + n)) n++;
    return 's' + n;
  }
  function intervenantsTries(etat) {
    return etat.intervenants.slice().sort(function (a, b) { return a.num - b.num; });
  }

  /** Places disponibles et intervenants présents, créneau par créneau. */
  function places(etat) {
    return creneaux(etat).map(function (c) {
      var total = 0, presents = 0;
      etat.intervenants.forEach(function (i) {
        if (present(i, c.index)) { total += taille(etat, i); presents++; }
      });
      return { creneau: c, places: total, presents: presents, manque: Math.max(0, etat.eleves.length - total) };
    });
  }

  function classes(etat) {
    var vues = {};
    etat.eleves.forEach(function (e) { vues[e.classe] = true; });
    return Object.keys(vues).sort(O.comparer);
  }
  function eleve(etat, id) {
    if (!etat._indexEleves || etat._indexEleves.n !== etat.eleves.length) {
      var idx = { n: etat.eleves.length, m: {} };
      etat.eleves.forEach(function (e) { idx.m[e.id] = e; });
      Object.defineProperty(etat, '_indexEleves', { value: idx, writable: true, configurable: true, enumerable: false });
    }
    return etat._indexEleves.m[id] || null;
  }
  function oublierIndex(etat) { if (etat._indexEleves) etat._indexEleves = null; }

  /** Identifiant interne tiré au sort, ex. "E-147" (jamais imprimé ni exporté). */
  function nouvelIdEleve(etat, pris) {
    pris = pris || {};
    etat.eleves.forEach(function (e) { pris[e.id] = true; });
    var max = etat.eleves.length + Object.keys(pris).length < 700 ? 900 : 9000, base = max === 900 ? 100 : 1000;
    for (var essai = 0; essai < 100000; essai++) {
      var id = 'E-' + (base + Math.floor(Math.random() * max));
      if (!pris[id]) { pris[id] = true; return id; }
    }
    throw new Error('Impossible de créer un identifiant élève.');
  }

  /* ---------------- Vérifications générales ---------------- */

  /** État de la répartition par rapport aux données actuelles. */
  function etatRepartition(etat) {
    var r = etat.repartition;
    if (!r) return { existe: false };
    var nbC = creneaux(etat).length, manquants = 0, inconnus = 0, parEleve = {};
    r.affectations.forEach(function (a) {
      if (!eleve(etat, a.e)) inconnus++;
      parEleve[a.e] = (parEleve[a.e] || 0) + 1;
    });
    etat.eleves.forEach(function (e) { manquants += Math.max(0, nbC - (parEleve[e.id] || 0)); });
    return {
      existe: true,
      creneauxChanges: r.nbCreneaux !== nbC,
      elevesInconnus: inconnus,
      casesVides: manquants
    };
  }

  /**
   * Liste des points à vérifier, affichée sur l'accueil.
   * niveau : "bloquant" (empêche la répartition), "attention" ou "ok".
   */
  function controles(etat) {
    var res = [], cr = creneaux(etat), p = etat.parametres;
    function ajouter(niveau, texte, page) { res.push({ niveau: niveau, texte: texte, page: page }); }

    // Paramètres
    if (!cr.length) ajouter('bloquant', 'Aucun créneau : vérifiez les sessions et la durée des créneaux.', 'parametres');
    else {
      var libres = cr.sessions.filter(function (s) { return s.reste > 0; });
      ajouter(libres.length ? 'attention' : 'ok',
        O.pluriel(cr.length, 'créneau', 'créneaux') + ' sur ' + O.pluriel(p.sessions.length, 'session') +
        (libres.length ? ' : du temps reste inutilisé dans ' + O.pluriel(libres.length, 'session') + '.' : ', tout tombe juste.'), 'parametres');
    }

    // Intervenants et faisabilité
    if (!etat.intervenants.length) ajouter('bloquant', 'Aucun intervenant : importez la liste des intervenants.', 'intervenants');
    else {
      var sansDispo = etat.intervenants.filter(function (i) { return !cr.some(function (c) { return present(i, c.index); }); });
      if (sansDispo.length) ajouter('attention', O.pluriel(sansDispo.length, 'intervenant') + ' sans aucun créneau coché (atelier ' +
        sansDispo.map(function (i) { return 'n°' + i.num; }).join(', ') + ').', 'intervenants');
      if (etat.eleves.length) {
        var pb = places(etat).filter(function (x) { return x.manque > 0; });
        if (pb.length) pb.forEach(function (x) {
          ajouter('bloquant', 'Créneau ' + x.creneau.libelle + ' : ' + x.places + ' places pour ' + etat.eleves.length +
            ' élèves, il manque ' + O.pluriel(x.manque, 'place') + '.', 'intervenants');
        });
        else ajouter('ok', 'Assez de places à chaque créneau pour les ' + etat.eleves.length + ' élèves.', 'intervenants');
      }
    }

    // Salles
    var sansSalle = etat.intervenants.filter(function (i) { return !salle(etat, i.salle); });
    if (etat.intervenants.length && sansSalle.length) {
      ajouter('attention', O.pluriel(sansSalle.length, 'atelier') + ' sans salle (la case salle restera vide sur les convocations).', 'salles');
    }
    etat.salles.forEach(function (s) {
      var n = etat.intervenants.filter(function (i) { return i.salle === s.id; }).length, max = maxAteliers(etat, s);
      if (n > max) ajouter('attention', nomSalleBrut(s) + ' : ' + n + ' ateliers pour ' + max + ' prévus au maximum.', 'salles');
    });

    // Élèves et vœux
    if (!etat.eleves.length) ajouter('bloquant', 'Aucun élève : importez la liste des élèves.', 'eleves');
    else {
      var cls = classes(etat), sansVoeuxClasse = [], sansVoeu = 0;
      cls.forEach(function (c) {
        var el = etat.eleves.filter(function (e) { return e.classe === c; });
        var avec = el.filter(function (e) { return (etat.voeux[e.id] || []).length; }).length;
        if (!avec) sansVoeuxClasse.push(c);
        else sansVoeu += el.length - avec;
      });
      ajouter('ok', etat.eleves.length + ' élèves dans ' + O.pluriel(cls.length, 'classe') + '.', 'eleves');
      if (sansVoeuxClasse.length) ajouter('attention', 'Vœux pas encore importés pour : ' + sansVoeuxClasse.join(', ') + '.', 'voeux');
      if (sansVoeu) ajouter('attention', O.pluriel(sansVoeu, 'élève') + ' sans vœu dans les autres classes : ' +
        (sansVoeu > 1 ? 'ils recevront' : 'il recevra') + ' des ateliers « découverte ».', 'voeux');
      if (!sansVoeuxClasse.length && !sansVoeu) ajouter('ok', 'Tous les élèves ont des vœux.', 'voeux');
    }

    // Répartition
    var er = etatRepartition(etat);
    if (er.existe) {
      if (er.creneauxChanges) ajouter('attention', 'Les créneaux ont changé depuis la répartition : relancez-la.', 'repartition');
      else if (er.elevesInconnus || er.casesVides) ajouter('attention', 'La répartition ne couvre pas tous les élèves actuels (' +
        O.pluriel(er.casesVides, 'passage') + ' sans atelier) : relancez-la ou corrigez à la main.', 'repartition');
    }
    return res;
  }
  function nomSalleBrut(s) { return (/^\d/.test(s.nom) ? 'Salle ' + s.nom : s.nom) + (s.theme ? ' - ' + s.theme : ''); }

  function bloquants(etat) { return controles(etat).filter(function (c) { return c.niveau === 'bloquant'; }); }

  return {
    VERSION: VERSION, nouveau: nouveau, migrer: migrer, decouper: decouper, creneaux: creneaux,
    suggestions: suggestions, taille: taille, present: present, intervenant: intervenant, salle: salle,
    nomSalle: nomSalle, nomSalleBrut: nomSalleBrut, libelleSalle: libelleSalle, maxAteliers: maxAteliers, nouvelIdSalle: nouvelIdSalle, intervenantsTries: intervenantsTries,
    places: places, classes: classes, eleve: eleve, oublierIndex: oublierIndex, nouvelIdEleve: nouvelIdEleve,
    etatRepartition: etatRepartition, controles: controles, bloquants: bloquants
  };
})();
