/* =====================================================================
   Écran « Répartition » : lancement de la répartition automatique,
   tirage au sort enregistré, verrouillage et indicateurs.
   ===================================================================== */
FM.vues.repartition = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, R = FM.repartition, esc = O.esc;
  var dernierRapport = null;

  function indicateurs(e) {
    var ind = R.indicateurs(e), h = '', er = M.etatRepartition(e);
    var r = e.repartition, verrous = r.affectations.filter(function (a) { return a.v; }).length;
    h += '<section class="carte"><h2>Résultats</h2><p class="doux petit">Répartition du ' + esc(O.dateCourte(r.date)) + ' · tirage n° <b>' + r.graine + '</b> · ' +
      O.pluriel(verrous, 'affectation verrouillée', 'affectations verrouillées') + ' sur ' + r.affectations.length + '.</p>';
    if (er.creneauxChanges) h += '<div class="alerte alerte-attention">Les créneaux ont changé depuis cette répartition : relancez-la.</div>';
    if (ind.casesVides) h += '<div class="alerte alerte-erreur"><b>' + O.pluriel(ind.casesVides, 'passage') + ' sans atelier.</b> Ouvrez le planning, recherchez les élèves concernés et affectez-les à la main, ou relancez la répartition.</div>';
    var v1 = ind.parRang[0] || { obtenu: 0, concernes: 0 }, v3 = ind.parRang[2] || ind.parRang[ind.parRang.length - 1] || v1;
    h += '<div class="grille-cartes">' +
      '<div class="carte-chiffre"><span class="t">Vœu 1 obtenu</span><span class="c">' + O.pourcent(v1.obtenu, v1.concernes) + '</span><span class="d">' + v1.obtenu + ' élèves sur ' + v1.concernes + '</span></div>' +
      '<div class="carte-chiffre"><span class="t">' + v3.k + ' premiers vœux obtenus</span><span class="c">' + O.pourcent(v3.obtenu, v3.concernes) + '</span><span class="d">' + v3.obtenu + ' élèves sur ' + v3.concernes + '</span></div>' +
      '<div class="carte-chiffre"><span class="t">Vœux obtenus en moyenne</span><span class="c">' + ind.moyenne.toFixed(1).replace('.', ',') + '</span><span class="d">par élève ayant des vœux</span></div>' +
      '<div class="carte-chiffre"><span class="t">Aucun vœu obtenu</span><span class="c">' + ind.sansAucun.length + '</span><span class="d">' + (ind.sansAucun.length ? 'voir la liste ci-dessous' : 'tout le monde a au moins un vœu') + '</span></div></div>';
    h += '<div class="deux-colonnes"><div><h3>Élèves ayant obtenu…</h3><table class="tableau"><thead><tr><th>…leurs premiers vœux</th><th class="num">Élèves</th><th class="num">%</th></tr></thead><tbody>' +
      ind.parRang.map(function (p) {
        return '<tr><td>' + (p.k === 1 ? 'Vœu 1' : 'Les ' + p.k + ' premiers vœux') + '</td><td class="num">' + p.obtenu + ' / ' + p.concernes + '</td><td class="num">' + O.pourcent(p.obtenu, p.concernes) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    h += '<div><h3>Par classe</h3><table class="tableau"><thead><tr><th>Classe</th><th class="num">Élèves</th><th class="num">Vœux obtenus (moyenne)</th><th class="num">Vœu 1</th></tr></thead><tbody>' +
      ind.parClasse.map(function (c) {
        return '<tr><td>' + esc(c.classe) + '</td><td class="num">' + c.eleves + '</td><td class="num">' + (c.avecVoeux ? (c.obtenus / c.avecVoeux).toFixed(1).replace('.', ',') : '—') +
          '</td><td class="num">' + O.pourcent(c.voeu1, c.avecVoeux) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    if (ind.sansAucun.length) {
      h += '<h3 style="margin-top:14px">Élèves n\'ayant obtenu aucun de leurs vœux</h3><p>' + ind.sansAucun.map(function (x) {
        return '<button class="btn-lien" data-action="voirEleve" data-id="' + esc(x.id) + '">' + esc(x.nom + ' ' + x.prenom) + ' (' + esc(x.classe) + ')</button>';
      }).join(', ') + '</p>';
    }
    h += '</section>';
    // Remplissage des ateliers
    var cr = M.creneaux(e), idx = R.index(e);
    h += '<section class="carte"><h2>Remplissage des ateliers</h2><div class="defile" style="max-height:44vh"><table class="tableau"><thead><tr><th>N°</th><th>Métier</th><th class="num">Élèves reçus</th><th class="num">Places</th><th class="num">Remplissage</th></tr></thead><tbody>';
    M.intervenantsTries(e).forEach(function (i) {
      var places = 0, recus = 0;
      cr.forEach(function (c) { if (M.present(i, c.index)) { places += M.taille(e, i); recus += (idx.parCase[i.num + '|' + c.index] || []).length; } });
      h += '<tr><td>' + i.num + '</td><td>' + esc(i.metier) + '</td><td class="num">' + recus + '</td><td class="num">' + places + '</td><td class="num">' + O.pourcent(recus, places) + '</td></tr>';
    });
    return h + '</tbody></table></div><p class="doux petit" style="margin-top:8px">Le détail par créneau (et le mélange des classes) est visible dans le planning.</p></section>';
  }

  function rapportLancement() {
    var r = dernierRapport;
    if (!r) return '';
    var e = FM.app.etat, cr = M.creneaux(e), h = '';
    function nomE(id) { var x = M.eleve(e, id); return x ? x.nom + ' ' + x.prenom + ' (' + x.classe + ')' : id; }
    if (r.liberes.length) {
      h += '<div class="alerte alerte-attention"><b>' + O.pluriel(r.liberes.length, 'affectation verrouillée', 'affectations verrouillées') + ' n\'' + (r.liberes.length > 1 ? 'étaient' : 'était') + ' plus possible' + (r.liberes.length > 1 ? 's' : '') + '</b> et ' + (r.liberes.length > 1 ? 'ont été refaites' : 'a été refaite') + ' :<ul>' +
        r.liberes.slice(0, 30).map(function (x) { return '<li>' + esc(nomE(x.e)) + ', ' + esc(cr[x.c] ? cr[x.c].libelle : '') + ' : ' + esc(x.raison) + '</li>'; }).join('') + '</ul></div>';
    }
    if (r.nonPlaces.length) {
      h += '<div class="alerte alerte-erreur"><b>' + O.pluriel(r.nonPlaces.length, 'passage') + ' sans atelier possible</b> (pas de place libre que l\'élève n\'a pas déjà vue, compte tenu des verrous) :<ul>' +
        r.nonPlaces.slice(0, 30).map(function (x) { return '<li>' + esc(nomE(x.e)) + ', ' + esc(cr[x.c].libelle) + '</li>'; }).join('') + '</ul>Déverrouillez une partie de la répartition puis relancez, ou corrigez à la main dans le planning.</div>';
    }
    return h;
  }

  async function lancer(graine) {
    var e = FM.app.etat, bl = M.bloquants(e);
    if (bl.length) { FM.ui.toast('Répartition impossible : ' + bl[0].texte, 'erreur'); return; }
    var res = R.repartir(e, { graine: graine });
    e.repartition = res.repartition;
    dernierRapport = res.rapport;
    FM.app.changer({ quoi: 'répartition' });
    FM.ui.toast('Répartition terminée (tirage n° ' + res.repartition.graine + ').');
  }

  return {
    rendre: function (params) {
      var e = FM.app.etat, h = '<h1>6. Répartition</h1><p class="sous-titre">Chaque élève reçoit un atelier par créneau, en servant d\'abord les vœux les mieux classés, de façon équitable (tours en serpentin après un tirage au sort).</p>';
      var bl = M.bloquants(e), r = e.repartition;
      if (bl.length) {
        h += '<div class="alerte alerte-erreur"><b>La répartition n\'est pas encore possible :</b><ul>' + bl.map(function (b) {
          return '<li>' + esc(b.texte) + ' <button class="btn-lien" data-action="aller" data-page="' + b.page + '">Corriger</button></li>';
        }).join('') + '</ul></div>';
      }
      var verrous = r ? r.affectations.filter(function (a) { return a.v; }).length : 0;
      h += '<section class="carte"><h2>' + (r ? 'Relancer la répartition' : 'Lancer la répartition') + '</h2>';
      if (r) {
        h += '<p>' + (verrous ? '<b>' + O.pluriel(verrous, 'affectation verrouillée', 'affectations verrouillées') + '</b> ser' + (verrous > 1 ? 'ont conservées' : 'a conservée') +
          ' ; seules les autres seront refaites (utile en cas de désistement d\'un intervenant).' : 'Aucune affectation verrouillée : toute la répartition sera refaite.') + '</p>';
      }
      h += '<div class="barre"><button class="btn btn-principal btn-grand" data-action="lancer"' + (bl.length ? ' disabled' : '') + '>' + (r ? 'Nouvelle répartition (nouveau tirage)' : 'Lancer la répartition') + '</button>' +
        (r ? '<span class="doux petit">ou refaire avec le tirage n°</span><input type="number" id="graine" value="' + r.graine + '" style="width:110px">' +
          '<button class="btn" data-action="memeTirage"' + (bl.length ? ' disabled' : '') + '>Refaire avec ce tirage</button>' : '') + '</div>';
      if (r) {
        h += '<div class="barre" style="margin:0"><button class="btn" data-action="aller" data-page="planning">Voir le planning et corriger</button>' +
          '<button class="btn" data-action="toutVerrouiller">Tout verrouiller</button><button class="btn" data-action="toutDeverrouiller">Tout déverrouiller</button>' +
          '<span class="espace"></span><button class="btn btn-danger" data-action="effacer">Effacer la répartition</button></div>';
      }
      h += '</section>';
      h += rapportLancement();
      if (r) h += indicateurs(e);
      if (params.lancer && !r && !bl.length) {
        FM.app.params = {};
        setTimeout(function () { lancer(); }, 0);
      }
      return h;
    },
    actions: {
      lancer: async function () {
        var e = FM.app.etat, r = e.repartition;
        if (r && !r.affectations.some(function (a) { return a.v; })) {
          if (!(await FM.ui.confirmer('Toute la répartition actuelle (y compris vos corrections non verrouillées) sera remplacée. Continuer ?', { oui: 'Nouvelle répartition' }))) return;
        }
        lancer();
      },
      memeTirage: async function () {
        var g = parseInt(document.getElementById('graine').value, 10);
        if (!(g > 0)) { FM.ui.toast('Numéro de tirage invalide.', 'erreur'); return; }
        lancer(g);
      },
      toutVerrouiller: function () {
        var n = R.verrouiller(FM.app.etat, function () { return true; }, true);
        FM.app.changer({ quoi: 'tout verrouiller' }); FM.ui.toast(O.pluriel(n, 'affectation verrouillée', 'affectations verrouillées') + '.');
      },
      toutDeverrouiller: function () {
        var n = R.verrouiller(FM.app.etat, function () { return true; }, false);
        FM.app.changer({ quoi: 'tout déverrouiller' }); FM.ui.toast(O.pluriel(n, 'affectation déverrouillée', 'affectations déverrouillées') + '.');
      },
      effacer: async function () {
        if (!(await FM.ui.confirmer('Effacer complètement la répartition (et toutes les corrections manuelles) ?', { oui: 'Effacer', danger: true }))) return;
        FM.app.etat.repartition = null; dernierRapport = null;
        FM.app.changer({ quoi: 'effacement de la répartition' });
      },
      voirEleve: function (el) { FM.app.aller('planning', { eleve: el.dataset.id }); }
    }
  };
})();
