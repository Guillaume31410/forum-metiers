/* =====================================================================
   repartition.js — répartition automatique des élèves dans les ateliers,
   indicateurs de satisfaction et corrections manuelles.

   Principe (cahier des charges §5) :
   1. tirage au sort d'un ordre de passage (graine enregistrée) ;
   2. tours en serpentin : à chaque tour, chaque élève obtient son meilleur
      vœu encore possible ; l'ordre s'inverse à chaque tour ;
   3. chaque atelier obtenu est placé sur un créneau où l'élève est libre et
      où l'atelier a de la place (en mélangeant au mieux les classes) ;
   4. complément « découverte » avec les ateliers les moins demandés ;
   5. réparation finale : si un élève reste sans atelier sur un créneau, on
      déplace d'autres élèves du même créneau pour lui faire une place.
   Les affectations verrouillées ne sont jamais modifiées.
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.repartition = (function () {
  'use strict';
  var M = FM.modele, O = FM.outils;

  /* ------------------------------------------------------------------
     Grille de travail : qui est où, combien par atelier, par classe…
     ------------------------------------------------------------------ */
  function Grille(etat) {
    this.etat = etat;
    this.C = M.creneaux(etat).length;
    this.ateliers = {};            // num → { cap, dispo[] }
    var g = this;
    etat.intervenants.forEach(function (i) {
      var d = [];
      for (var c = 0; c < g.C; c++) d.push(M.present(i, c));
      g.ateliers[i.num] = { num: i.num, cap: M.taille(etat, i), dispo: d };
    });
    this.nums = Object.keys(this.ateliers).map(Number).sort(function (a, b) { return a - b; });
    this.place = {};               // idEleve → [num ou null par créneau]
    this.verrou = {};              // idEleve → [bool par créneau]
    this.classe = {};
    etat.eleves.forEach(function (e) {
      g.place[e.id] = new Array(g.C).fill(null);
      g.verrou[e.id] = new Array(g.C).fill(false);
      g.classe[e.id] = e.classe;
    });
    this.membres = {};             // "num|c" → [idEleve]
  }
  Grille.prototype.cle = function (a, c) { return a + '|' + c; };
  Grille.prototype.liste = function (a, c) { var k = this.cle(a, c); return this.membres[k] || (this.membres[k] = []); };
  Grille.prototype.compte = function (a, c) { return this.liste(a, c).length; };
  Grille.prototype.aDeLaPlace = function (a, c) { var at = this.ateliers[a]; return at && at.dispo[c] && this.compte(a, c) < at.cap; };
  Grille.prototype.memeClasse = function (a, c, cl) {
    var g = this; return this.liste(a, c).filter(function (e) { return g.classe[e] === cl; }).length;
  };
  /** L'élève a-t-il déjà cet atelier sur un autre créneau que "sauf" ? */
  Grille.prototype.dejaVu = function (e, a, sauf) {
    var p = this.place[e];
    for (var c = 0; c < this.C; c++) if (c !== sauf && p[c] === a) return true;
    return false;
  };
  Grille.prototype.poser = function (e, a, c, verrou) {
    this.place[e][c] = a; this.liste(a, c).push(e);
    if (verrou) this.verrou[e][c] = true;
  };
  Grille.prototype.retirer = function (e, c) {
    var a = this.place[e][c];
    if (a === null) return;
    var l = this.liste(a, c), i = l.indexOf(e);
    if (i >= 0) l.splice(i, 1);
    this.place[e][c] = null;
  };
  Grille.prototype.libres = function (e) {
    var r = [], p = this.place[e];
    for (var c = 0; c < this.C; c++) if (p[c] === null) r.push(c);
    return r;
  };

  /* ------------------------------------------------------------------
     Placement d'un vœu dans le temps
     ------------------------------------------------------------------ */
  function placerVoeu(g, e, a) {
    var at = g.ateliers[a];
    if (!at || g.dejaVu(e, a, -1)) return false;
    var cl = g.classe[e], meilleur = -1, score = null;
    // Créneaux où l'élève est libre et où l'atelier a de la place
    for (var c = 0; c < g.C; c++) {
      if (g.place[e][c] !== null || !g.aDeLaPlace(a, c)) continue;
      // Règle souple de mixité : le moins d'élèves de la même classe, puis le groupe le moins rempli
      var s = [g.memeClasse(a, c, cl), g.compte(a, c), c];
      if (!score || s[0] < score[0] || (s[0] === score[0] && (s[1] < score[1] || (s[1] === score[1] && s[2] < score[2])))) {
        score = s; meilleur = c;
      }
    }
    if (meilleur >= 0) { g.poser(e, a, meilleur); return true; }
    // Sinon, on essaie de décaler un atelier déjà obtenu par l'élève vers un autre de ses créneaux libres
    var libres = g.libres(e);
    if (!libres.length) return false;
    for (c = 0; c < g.C; c++) {
      var autre = g.place[e][c];
      if (autre === null || g.verrou[e][c] || !g.aDeLaPlace(a, c)) continue;
      for (var k = 0; k < libres.length; k++) {
        var c2 = libres[k];
        if (g.aDeLaPlace(autre, c2)) {
          g.retirer(e, c); g.poser(e, autre, c2); g.poser(e, a, c);
          return true;
        }
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------
     Réparation : chemin de déplacements dans un même créneau
     ------------------------------------------------------------------ */
  function reparer(g, e, c, decouverteSeule, rangs) {
    var precedent = {}, file = [], i;
    function possibles(x) {
      return g.nums.filter(function (a) { return g.ateliers[a].dispo[c] && a !== g.place[x][c] && !g.dejaVu(x, a, c); });
    }
    possibles(e).forEach(function (a) { precedent[a] = { de: null, eleve: e }; file.push(a); });
    while (file.length) {
      var a = file.shift();
      if (g.compte(a, c) < g.ateliers[a].cap) {
        // On applique la chaîne de déplacements en remontant
        var cible = a;
        while (cible !== null) {
          var p = precedent[cible];
          g.retirer(p.eleve, c); g.poser(p.eleve, cible, c);
          cible = p.de;
        }
        return true;
      }
      var membres = g.liste(a, c).slice();
      for (i = 0; i < membres.length; i++) {
        var b = membres[i];
        if (g.verrou[b][c]) continue;
        if (decouverteSeule && rangs(b, a) > 0) continue;
        possibles(b).forEach(function (a2) {
          if (!precedent[a2]) { precedent[a2] = { de: a, eleve: b }; file.push(a2); }
        });
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------
     Répartition complète
     ------------------------------------------------------------------ */
  /**
   * Lance la répartition. options.graine : nombre entier (tirage au sort).
   * Renvoie { repartition, rapport }.
   */
  function repartir(etat, options) {
    var graine = options && options.graine ? options.graine >>> 0 : Math.floor(Math.random() * 900000) + 100000;
    var g = new Grille(etat), rapport = { liberes: [], nonPlaces: [] };
    var voeux = {};
    etat.eleves.forEach(function (e) {
      voeux[e.id] = (etat.voeux[e.id] || []).filter(function (a) { return g.ateliers[a]; });
    });
    function rang(e, a) { var i = voeux[e] ? voeux[e].indexOf(a) : -1; return i + 1; }

    // 0. Reprise des affectations verrouillées encore valables
    var ancienne = etat.repartition && etat.repartition.nbCreneaux === g.C ? etat.repartition.affectations : [];
    ancienne.forEach(function (af) {
      if (!af.v) return;
      var raison = null;
      if (!g.place[af.e]) raison = 'élève absent de la liste';
      else if (!g.ateliers[af.a]) raison = "l'atelier n°" + af.a + " n'existe plus";
      else if (!g.ateliers[af.a].dispo[af.c]) raison = "l'intervenant de l'atelier n°" + af.a + ' est absent sur ce créneau';
      else if (g.place[af.e][af.c] !== null) raison = 'doublon';
      else if (g.dejaVu(af.e, af.a, -1)) raison = 'atelier déjà vu';
      else if (g.compte(af.a, af.c) >= g.ateliers[af.a].cap) raison = 'atelier plein';
      if (raison) { if (g.place[af.e]) rapport.liberes.push({ e: af.e, c: af.c, a: af.a, raison: raison }); }
      else g.poser(af.e, af.a, af.c, true);
    });

    // 1. Tirage au sort de l'ordre de passage
    var rnd = O.hasard(graine);
    var ordre = O.melanger(etat.eleves.map(function (e) { return e.id; }).sort(), rnd);

    // 2-3. Tours en serpentin
    var nbTours = Math.min(etat.parametres.nbVoeux || 6, g.C);
    etat.eleves.forEach(function (e) { nbTours = Math.max(nbTours, Math.min(voeux[e.id].length, g.C)); });
    for (var t = 0; t < nbTours; t++) {
      var seq = t % 2 === 0 ? ordre : ordre.slice().reverse();
      seq.forEach(function (e) {
        if (!g.libres(e).length) return;
        var vs = voeux[e];
        for (var k = 0; k < vs.length; k++) {
          if (g.dejaVu(e, vs[k], -1)) continue;
          if (placerVoeu(g, e, vs[k])) break;
        }
      });
    }

    // 4. Complément « découverte » : ateliers les moins demandés ayant de la place
    var demande = {};
    g.nums.forEach(function (a) { demande[a] = 0; });
    etat.eleves.forEach(function (e) { voeux[e.id].forEach(function (a) { demande[a]++; }); });
    for (var c = 0; c < g.C; c++) {
      ordre.forEach(function (e) {
        if (g.place[e][c] !== null) return;
        var cl = g.classe[e], choix = null, score = null;
        g.nums.forEach(function (a) {
          if (!g.aDeLaPlace(a, c) || g.dejaVu(e, a, -1)) return;
          var s = [demande[a], g.memeClasse(a, c, cl), g.compte(a, c) / g.ateliers[a].cap];
          if (!score || s[0] < score[0] || (s[0] === score[0] && (s[1] < score[1] || (s[1] === score[1] && s[2] < score[2])))) {
            score = s; choix = a;
          }
        });
        if (choix !== null) g.poser(e, choix, c);
      });
    }

    // 5. Réparation des cases encore vides
    for (c = 0; c < g.C; c++) {
      ordre.forEach(function (e) {
        if (g.place[e][c] !== null) return;
        if (!reparer(g, e, c, true, rang) && !reparer(g, e, c, false, rang)) {
          rapport.nonPlaces.push({ e: e, c: c });
        }
      });
    }

    // Résultat
    var affectations = [];
    etat.eleves.forEach(function (e) {
      for (var c2 = 0; c2 < g.C; c2++) {
        var a = g.place[e.id][c2];
        if (a !== null) affectations.push({ e: e.id, c: c2, a: a, v: g.verrou[e.id][c2] });
      }
    });
    return {
      repartition: { graine: graine, date: new Date().toISOString(), nbCreneaux: g.C, affectations: affectations },
      rapport: rapport
    };
  }

  /* ------------------------------------------------------------------
     Lecture de la répartition
     ------------------------------------------------------------------ */
  /** Index pratique : par élève et par atelier/créneau. */
  function index(etat) {
    var r = etat.repartition, parEleve = {}, parCase = {};
    if (!r) return { parEleve: parEleve, parCase: parCase };
    r.affectations.forEach(function (af) {
      (parEleve[af.e] || (parEleve[af.e] = {}))[af.c] = af;
      var k = af.a + '|' + af.c;
      (parCase[k] || (parCase[k] = [])).push(af);
    });
    return { parEleve: parEleve, parCase: parCase };
  }

  /** Rang du vœu obtenu : 1 = vœu 1 … ; 0 = « découverte ». */
  function rang(etat, e, a) { var v = etat.voeux[e] || []; return v.indexOf(a) + 1; }
  function libelleRang(r) { return r > 0 ? 'vœu ' + r : 'découverte'; }

  /** Indicateurs affichés après la répartition (§5.3). */
  function indicateurs(etat) {
    var idx = index(etat), nbV = etat.parametres.nbVoeux, C = M.creneaux(etat).length;
    var parRang = [], sansAucun = [], totalObtenus = 0, avecVoeux = 0, parClasse = {}, casesVides = 0;
    for (var k = 1; k <= nbV; k++) parRang.push({ k: k, obtenu: 0, concernes: 0 });
    etat.eleves.forEach(function (e) {
      var v = etat.voeux[e.id] || [], aff = idx.parEleve[e.id] || {}, obtenus = {}, n = 0;
      for (var c = 0; c < C; c++) {
        if (!aff[c]) { casesVides++; continue; }
        if (v.indexOf(aff[c].a) >= 0) { obtenus[aff[c].a] = true; n++; }
      }
      var pc = parClasse[e.classe] || (parClasse[e.classe] = { classe: e.classe, eleves: 0, avecVoeux: 0, obtenus: 0, voeu1: 0 });
      pc.eleves++;
      if (!v.length) return;
      avecVoeux++; pc.avecVoeux++; totalObtenus += n; pc.obtenus += n;
      if (obtenus[v[0]]) pc.voeu1++;
      if (!n) sansAucun.push(e);
      parRang.forEach(function (pr) {
        if (v.length < pr.k) return;
        pr.concernes++;
        var tous = true;
        for (var j = 0; j < pr.k; j++) if (!obtenus[v[j]]) { tous = false; break; }
        if (tous) pr.obtenu++;
      });
    });
    var classes = Object.keys(parClasse).sort(O.comparer).map(function (c) { return parClasse[c]; });
    return {
      parRang: parRang, sansAucun: sansAucun.sort(O.trierEleves), avecVoeux: avecVoeux,
      moyenne: avecVoeux ? totalObtenus / avecVoeux : 0, parClasse: classes, casesVides: casesVides
    };
  }

  /* ------------------------------------------------------------------
     Corrections manuelles (§5.4)
     ------------------------------------------------------------------ */
  function trouver(etat, e, c) {
    var l = etat.repartition ? etat.repartition.affectations : [];
    for (var i = 0; i < l.length; i++) if (l[i].e === e && l[i].c === c) return l[i];
    return null;
  }
  function compte(etat, a, c) {
    return etat.repartition.affectations.filter(function (af) { return af.a === a && af.c === c; }).length;
  }
  function dejaVu(etat, e, a, sauf) {
    return etat.repartition.affectations.some(function (af) { return af.e === e && af.a === a && af.c !== sauf; });
  }

  /** Raison pour laquelle l'élève e ne peut pas aller dans l'atelier a au créneau c (ou null). */
  function empechement(etat, e, a, c) {
    var inter = M.intervenant(etat, a);
    if (!inter) return "cet atelier n'existe pas";
    if (!M.present(inter, c)) return 'intervenant absent sur ce créneau';
    var actuel = trouver(etat, e, c);
    if (actuel && actuel.a === a) return 'déjà dans cet atelier';
    if (dejaVu(etat, e, a, c)) return 'intervenant déjà vu par cet élève';
    if (compte(etat, a, c) >= M.taille(etat, inter)) return 'atelier plein';
    return null;
  }

  /** Déplace (ou affecte) l'élève e vers l'atelier a au créneau c. Renvoie un message d'erreur ou null. */
  function deplacer(etat, e, c, a) {
    var pb = empechement(etat, e, a, c);
    if (pb) return pb;
    var af = trouver(etat, e, c);
    if (af) { af.a = a; af.v = true; }
    else etat.repartition.affectations.push({ e: e, c: c, a: a, v: true });
    return null;
  }

  /** Échange les ateliers de deux élèves sur le même créneau. */
  function echanger(etat, e1, e2, c) {
    var a1 = trouver(etat, e1, c), a2 = trouver(etat, e2, c);
    if (!a1 || !a2) return 'les deux élèves doivent avoir un atelier sur ce créneau';
    if (a1.a === a2.a) return 'les deux élèves sont déjà dans le même atelier';
    if (dejaVu(etat, e1, a2.a, c)) return 'le premier élève a déjà vu cet intervenant';
    if (dejaVu(etat, e2, a1.a, c)) return 'le second élève a déjà vu cet intervenant';
    var t = a1.a; a1.a = a2.a; a2.a = t; a1.v = true; a2.v = true;
    return null;
  }

  function verrouiller(etat, filtre, valeur) {
    var n = 0;
    (etat.repartition ? etat.repartition.affectations : []).forEach(function (af) {
      if (filtre(af) && af.v !== valeur) { af.v = valeur; n++; }
    });
    return n;
  }

  return {
    repartir: repartir, index: index, rang: rang, libelleRang: libelleRang, indicateurs: indicateurs,
    trouver: trouver, compte: compte, empechement: empechement, deplacer: deplacer, echanger: echanger,
    verrouiller: verrouiller
  };
})();
