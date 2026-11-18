/* =====================================================================
   Écran « Planning » : grille ateliers × créneaux. Un clic sur une case
   affiche les élèves affectés, avec déplacement, échange et verrouillage.
   La recherche d'un élève affiche son emploi du temps.
   ===================================================================== */
FM.vues.planning = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, R = FM.repartition, esc = O.esc;
  var sel = null;            // { type: 'case', a, c } ou { type: 'eleve', id }
  var form = null;           // { e, mode: 'deplacer' | 'echanger' | 'affecter', c }
  var filtreSalle = '';

  function nomE(x) { return x.nom + ' ' + x.prenom; }

  function etiquetteRang(r) {
    if (r === null) return '<span class="etiquette e-vide">non attribué</span>';
    return '<span class="etiquette ' + (r === 1 ? 'e-voeu1' : r > 0 ? 'e-voeu' : 'e-decouverte') + '">' + R.libelleRang(r) + '</span>';
  }
  function iconeVerrou(on) {
    return on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
  }
  function boutonVerrou(af) {
    return '<button class="btn-verrou' + (af.v ? ' on' : '') + '" data-action="verrou" data-e="' + esc(af.e) + '" data-c="' + af.c + '" title="' +
      (af.v ? 'Verrouillée : une nouvelle répartition ne la changera pas (cliquer pour déverrouiller)' : 'Non verrouillée (cliquer pour verrouiller)') + '" aria-label="' + (af.v ? 'Déverrouiller' : 'Verrouiller') + '">' + iconeVerrou(af.v) + '</button>';
  }

  /* ---------- Grille ---------- */
  function grille(e, idx, cr) {
    var surligne = {};
    if (sel && sel.type === 'eleve') {
      var pe = idx.parEleve[sel.id] || {};
      Object.keys(pe).forEach(function (c) { surligne[pe[c].a + '|' + c] = true; });
    }
    var inters = M.intervenantsTries(e).filter(function (i) { return !filtreSalle || i.salle === filtreSalle; });
    var h = '<div class="planning-grille"><table class="grille"><thead><tr><th class="atelier">Atelier · salle</th>' +
      cr.map(function (c) { return '<th>' + esc(c.libelle) + '</th>'; }).join('') + '</tr></thead><tbody>';
    inters.forEach(function (i) {
      var cap = M.taille(e, i), salle = M.nomSalle(e, i);
      h += '<tr><td class="atelier" title="' + esc(i.nom) + '"><b>' + i.num + ' · ' + esc(i.metier || i.nom) + '</b><span>' + esc(salle || 'salle à définir') + '</span></td>';
      cr.forEach(function (c) {
        var k = i.num + '|' + c.index;
        if (!M.present(i, c.index)) { h += '<td><div class="case absente" title="Intervenant absent">absent</div></td>'; return; }
        var liste = idx.parCase[k] || [], n = liste.length, parCl = {}, mx = 0;
        liste.forEach(function (af) { var x = M.eleve(e, af.e); if (x) { parCl[x.classe] = (parCl[x.classe] || 0) + 1; mx = Math.max(mx, parCl[x.classe]); } });
        var cls = 'case' + (n >= cap ? ' pleine' : n / cap >= 0.8 ? ' niv2' : n / cap >= 0.5 ? ' niv1' : '');
        if (sel && sel.type === 'case' && sel.a === i.num && sel.c === c.index) cls += ' choisie';
        if (surligne[k]) cls += ' surligne';
        h += '<td><button class="' + cls + '" data-action="choisirCase" data-a="' + i.num + '" data-c="' + c.index + '" aria-label="Atelier ' + i.num + ', ' + esc(c.libelle) + ', ' + n + ' élèves sur ' + cap + '">' +
          '<span class="n">' + n + '/' + cap + '</span><span class="m">' + (n ? 'max ' + mx + '/cl.' : '') + '</span></button></td>';
      });
      h += '</tr>';
    });
    if (!inters.length) h += '<tr><td class="atelier" colspan="' + (cr.length + 1) + '">Aucun atelier dans cette salle.</td></tr>';
    return h + '</tbody></table></div>';
  }

  /* ---------- Panneau : une case ---------- */
  function panneauCase(e, idx, cr) {
    var i = M.intervenant(e, sel.a), c = cr[sel.c];
    if (!i || !c) { sel = null; return panneauVide(e); }
    var cap = M.taille(e, i), liste = (idx.parCase[i.num + '|' + c.index] || []).slice();
    liste.sort(function (a, b) { var x = M.eleve(e, a.e), y = M.eleve(e, b.e); return x && y ? O.trierEleves(x, y) : 0; });
    var h = '<p class="doux petit" style="margin:0">Case sélectionnée · ' + esc(c.libelle) + '</p><h2>Atelier ' + i.num + ' · ' + esc(i.metier) + '</h2>' +
      '<p class="doux petit">' + esc(i.nom) + ' · ' + esc(M.nomSalle(e, i) || 'salle à définir') + ' · <b>' + liste.length + '/' + cap + ' élèves</b></p>';
    var parCl = {};
    liste.forEach(function (af) { var x = M.eleve(e, af.e); if (x) parCl[x.classe] = (parCl[x.classe] || 0) + 1; });
    if (liste.length) h += '<p class="petit">Classes : ' + Object.keys(parCl).sort(O.comparer).map(function (k) { return esc(k) + ' ×' + parCl[k]; }).join(', ') + '</p>';
    h += '<div class="barre" style="margin-bottom:8px"><button class="btn btn-petit" data-action="verrouCase" data-val="1">Verrouiller la case</button>' +
      '<button class="btn btn-petit" data-action="verrouCase" data-val="0">Déverrouiller</button></div>';
    liste.forEach(function (af) {
      var x = M.eleve(e, af.e);
      if (!x) return;
      h += '<div class="ligne-eleve"><span class="qui"><button class="btn-lien" data-action="choisirEleve" data-id="' + esc(x.id) + '" style="color:inherit;text-decoration:none">' + esc(nomE(x)) + '</button><small>' + esc(x.classe) + '</small></span>' +
        etiquetteRang(R.rang(e, x.id, af.a)) + boutonVerrou(af) +
        '<button class="btn btn-petit" data-action="ouvrirForm" data-e="' + esc(x.id) + '" data-mode="deplacer">Déplacer</button>' +
        '<button class="btn btn-petit" data-action="ouvrirForm" data-e="' + esc(x.id) + '" data-mode="echanger">Échanger</button>';
      if (form && form.e === x.id && form.c === c.index) h += formulaire(e, idx, x, c, af);
      h += '</div>';
    });
    if (!liste.length) h += '<p class="doux">Aucun élève dans cet atelier sur ce créneau.</p>';
    return h;
  }

  /* ---------- Formulaire de déplacement / échange ---------- */
  function formulaire(e, idx, x, c, af) {
    var h = '<div class="form-correction"><select id="choix-correction" aria-label="Choix">';
    var inters = M.intervenantsTries(e).filter(function (i) { return M.present(i, c.index) && (!af || i.num !== af.a); });
    if (form.mode === 'echanger') {
      h += '<option value="">— échanger avec… —</option>';
      inters.forEach(function (i) {
        var autres = (idx.parCase[i.num + '|' + c.index] || []).map(function (a) { return M.eleve(e, a.e); }).filter(Boolean).sort(O.trierEleves);
        if (!autres.length) return;
        h += '<optgroup label="' + i.num + ' · ' + esc(i.metier) + '">';
        autres.forEach(function (y) {
          var pb = null;
          if (alreadySeen(e, x.id, i.num, c.index)) pb = x.prenom + ' a déjà vu cet intervenant';
          else if (af && alreadySeen(e, y.id, af.a, c.index)) pb = y.prenom + ' a déjà vu l\'atelier ' + af.a;
          h += '<option value="' + esc(y.id) + '"' + (pb ? ' disabled' : '') + '>' + esc(nomE(y)) + ' (' + esc(y.classe) + ')' + (pb ? ' — ' + esc(pb) : '') + '</option>';
        });
        h += '</optgroup>';
      });
    } else {
      h += '<option value="">— vers l\'atelier… —</option>';
      inters.forEach(function (i) {
        var n = (idx.parCase[i.num + '|' + c.index] || []).length, pb = R.empechement(e, x.id, i.num, c.index);
        h += '<option value="' + i.num + '"' + (pb ? ' disabled' : '') + '>' + i.num + ' · ' + esc(i.metier) + ' (' + n + '/' + M.taille(e, i) + ')' +
          (pb ? ' — ' + esc(pb) : (R.rang(e, x.id, i.num) ? ' — ' + R.libelleRang(R.rang(e, x.id, i.num)) : '')) + '</option>';
      });
    }
    return h + '</select><button class="btn btn-petit btn-principal" data-action="validerForm">Valider</button><button class="btn btn-petit" data-action="annulerForm">Annuler</button></div>';
  }
  function alreadySeen(e, eleve, a, sauf) {
    return e.repartition.affectations.some(function (af) { return af.e === eleve && af.a === a && af.c !== sauf; });
  }

  /* ---------- Panneau : un élève ---------- */
  function panneauEleve(e, idx, cr) {
    var x = M.eleve(e, sel.id);
    if (!x) { sel = null; return panneauVide(e); }
    var aff = idx.parEleve[x.id] || {}, v = e.voeux[x.id] || [], obtenus = {};
    Object.keys(aff).forEach(function (c) { obtenus[aff[c].a] = true; });
    var h = '<p class="doux petit" style="margin:0">Emploi du temps</p><h2>' + esc(nomE(x)) + ' — ' + esc(x.classe) + '</h2>';
    h += '<p class="petit">Vœux : ' + (v.length ? v.map(function (a, k) {
      var i = M.intervenant(e, a);
      return '<span class="etiquette ' + (obtenus[a] ? 'e-voeu' : 'e-vide') + '" title="' + esc(i ? i.metier : '') + '">' + (k + 1) + '. n°' + a + (obtenus[a] ? ' ✓' : '') + '</span>';
    }).join(' ') : '<i>aucun vœu</i>') + '</p>';
    cr.forEach(function (c) {
      var af = aff[c.index], i = af ? M.intervenant(e, af.a) : null;
      if (af && i) {
        h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><button class="edt-ligne" data-action="choisirCase" data-a="' + i.num + '" data-c="' + c.index + '">' +
          '<span class="h">' + esc(c.libelle) + '</span><span class="q">' + i.num + ' · ' + esc(i.metier) + '<br><span class="doux petit">' + esc(M.nomSalle(e, i) || 'salle ?') + '</span> ' +
          etiquetteRang(R.rang(e, x.id, i.num)) + '</span></button>' + boutonVerrou(af) + '</div>';
      } else {
        h += '<div class="ligne-eleve"><span class="qui"><b>' + esc(c.libelle) + '</b></span>' + etiquetteRang(null) +
          '<button class="btn btn-petit btn-principal" data-action="ouvrirForm" data-e="' + esc(x.id) + '" data-mode="affecter" data-c="' + c.index + '">Affecter</button>';
        if (form && form.e === x.id && form.c === c.index) h += formulaire(e, idx, x, c, null);
        h += '</div>';
      }
    });
    return h + '<p class="doux petit" style="margin-top:8px">Cliquez sur un créneau pour ouvrir l\'atelier et déplacer ou échanger l\'élève.</p>';
  }

  function panneauVide(e) {
    var ind = R.indicateurs(e);
    return '<h2>Mode d\'emploi</h2><p class="petit">Cliquez sur une case de la grille pour voir les élèves de cet atelier à ce créneau, puis <b>déplacez</b> un élève ou <b>échangez</b>-le avec un autre.</p>' +
      '<p class="petit">Recherchez un élève (en haut) pour voir son emploi du temps : ses ateliers sont entourés en orange dans la grille.</p>' +
      '<p class="petit">Toute correction manuelle est <b>verrouillée</b> automatiquement : une nouvelle répartition ne la modifiera pas.</p>' +
      (ind.casesVides ? '<div class="alerte alerte-erreur">' + O.pluriel(ind.casesVides, 'passage') + ' sans atelier : voir l\'écran Répartition.</div>' : '');
  }

  return {
    rendre: function (params) {
      var e = FM.app.etat, h = '<h1>7. Planning</h1>';
      if (!e.repartition) {
        return h + '<p class="sous-titre">Vue d\'ensemble des ateliers et corrections à la main.</p><div class="alerte alerte-info">Aucune répartition pour l\'instant. ' +
          '<button class="btn btn-principal" data-action="aller" data-page="repartition">Aller à la répartition</button></div>';
      }
      if (params.eleve) { sel = { type: 'eleve', id: params.eleve }; form = null; FM.app.params = {}; }
      var cr = M.creneaux(e), idx = R.index(e);
      var er = M.etatRepartition(e);
      h += '<p class="sous-titre">Cliquez sur une case pour voir et corriger les élèves affectés. Chaque case indique le remplissage et le nombre maximal d\'élèves d\'une même classe.</p>';
      if (er.creneauxChanges) h += '<div class="alerte alerte-attention">Les créneaux ont changé depuis la répartition : relancez-la avant de corriger.</div>';
      var eleves = e.eleves.slice().sort(function (a, b) { return O.comparer(a.nom, b.nom) || O.comparer(a.prenom, b.prenom); });
      h += '<div class="barre"><label class="petit">Salle <select data-change="salle"><option value="">Toutes</option>' + e.salles.map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (filtreSalle === s.id ? ' selected' : '') + '>' + esc(M.libelleSalle(s)) + '</option>'; }).join('') + '</select></label>' +
        '<label class="petit">Élève <input type="search" list="liste-eleves" placeholder="Rechercher un nom…" data-change="eleve" style="width:240px" value="' +
        (sel && sel.type === 'eleve' && M.eleve(e, sel.id) ? esc(nomE(M.eleve(e, sel.id)) + ' (' + M.eleve(e, sel.id).classe + ')') : '') + '"></label>' +
        '<datalist id="liste-eleves">' + eleves.map(function (x) { return '<option value="' + esc(nomE(x) + ' (' + x.classe + ')') + '">'; }).join('') + '</datalist>' +
        '<span class="espace"></span><div class="legende"><span><i style="background:#f3faf8"></i>peu rempli</span><span><i style="background:#93d0c3"></i>plein</span>' +
        '<span><i style="background:repeating-linear-gradient(45deg,#f1f1f1,#f1f1f1 3px,#e2e2e2 3px,#e2e2e2 6px)"></i>intervenant absent</span></div>' +
        '<button class="btn btn-petit" data-action="aller" data-page="impressions">Imprimer…</button></div>';
      h += '<div class="planning-zone">' + grille(e, idx, cr) + '<aside class="panneau" aria-live="polite">' +
        (sel && sel.type === 'case' ? panneauCase(e, idx, cr) : sel && sel.type === 'eleve' ? panneauEleve(e, idx, cr) : panneauVide(e)) +
        (sel ? '<p style="margin-top:10px"><button class="btn-lien" data-action="fermerPanneau">Fermer</button></p>' : '') + '</aside></div>';
      return h;
    },
    actions: {
      choisirCase: function (el) { sel = { type: 'case', a: +el.dataset.a, c: +el.dataset.c }; form = null; FM.app.rafraichir(); },
      choisirEleve: function (el) { sel = { type: 'eleve', id: el.dataset.id }; form = null; FM.app.rafraichir(); },
      fermerPanneau: function () { sel = null; form = null; FM.app.rafraichir(); },
      ouvrirForm: function (el) {
        var c = el.dataset.c !== undefined ? +el.dataset.c : sel.c;
        form = (form && form.e === el.dataset.e && form.mode === el.dataset.mode && form.c === c) ? null : { e: el.dataset.e, mode: el.dataset.mode, c: c };
        FM.app.rafraichir();
        var s = document.getElementById('choix-correction'); if (s) s.focus();
      },
      annulerForm: function () { form = null; FM.app.rafraichir(); },
      validerForm: function () {
        var e = FM.app.etat, s = document.getElementById('choix-correction'), val = s ? s.value : '';
        if (!val) { FM.ui.toast('Choisissez d\'abord dans la liste.', 'erreur'); return; }
        var err, x = M.eleve(e, form.e);
        if (form.mode === 'echanger') {
          var y = M.eleve(e, val);
          err = R.echanger(e, form.e, val, form.c);
          if (!err) FM.ui.toast(x.prenom + ' et ' + y.prenom + ' ont échangé leurs ateliers (corrections verrouillées).');
        } else {
          err = R.deplacer(e, form.e, form.c, +val);
          if (!err) FM.ui.toast(x.prenom + ' ' + x.nom + ' → atelier ' + val + ' (correction verrouillée).');
        }
        if (err) { FM.ui.toast('Impossible : ' + err + '.', 'erreur'); return; }
        var quoi = (form.mode === 'echanger' ? 'échange de ' : 'déplacement de ') + x.prenom + ' ' + x.nom;
        form = null;
        FM.app.changer({ quoi: quoi });
      },
      verrou: function (el) {
        var af = R.trouver(FM.app.etat, el.dataset.e, +el.dataset.c);
        if (af) { af.v = !af.v; FM.app.changer({ quoi: af.v ? 'verrouillage' : 'déverrouillage' }); }
      },
      verrouCase: function (el) {
        var on = el.dataset.val === '1', a = sel.a, c = sel.c;
        var n = R.verrouiller(FM.app.etat, function (af) { return af.a === a && af.c === c; }, on);
        FM.app.changer({ quoi: 'verrouillage de la case' });
        FM.ui.toast(O.pluriel(n, 'affectation') + ' ' + (on ? 'verrouillée' : 'déverrouillée') + (n > 1 ? 's' : '') + '.');
      }
    },
    changements: {
      salle: function (el) { filtreSalle = el.value; FM.app.rafraichir(); },
      eleve: function (el) {
        var e = FM.app.etat, t = O.norm(el.value);
        if (!t) { if (sel && sel.type === 'eleve') sel = null; FM.app.rafraichir(); return; }
        var trouve = e.eleves.filter(function (x) { return O.norm(nomE(x) + ' (' + x.classe + ')') === t; })[0] ||
          e.eleves.filter(function (x) { return O.norm(nomE(x) + ' ' + x.classe).indexOf(t) >= 0 || O.norm(x.prenom + ' ' + x.nom).indexOf(t) >= 0; })[0];
        if (!trouve) { FM.ui.toast('Aucun élève ne correspond à « ' + el.value + ' ».', 'erreur'); return; }
        sel = { type: 'eleve', id: trouve.id }; form = null;
        FM.app.rafraichir();
      }
    }
  };
})();
