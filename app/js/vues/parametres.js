/* =====================================================================
   Écran « Paramètres de la rencontre » : durées, sessions, découpage
   automatique en créneaux avec avertissements et suggestions.
   ===================================================================== */
FM.vues.parametres = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, esc = O.esc;

  function champ(cle, libelle, valeur, type, aide) {
    return '<label class="champ">' + libelle + '<input type="' + (type || 'number') + '" min="1" value="' + esc(valeur) + '" data-change="param" data-cle="' + cle + '">' +
      (aide ? '<span class="doux" style="font-size:12px">' + aide + '</span>' : '') + '</label>';
  }

  return {
    rendre: function () {
      var e = FM.app.etat, p = e.parametres, cr = M.creneaux(e), h = '';
      h += '<h1>1. Paramètres de la rencontre</h1><p class="sous-titre">Réglez les durées et les sessions : le logiciel en déduit les créneaux, affichés à droite.</p>';
      if (e.repartition) h += '<div class="alerte alerte-attention">Une répartition existe déjà : si vous modifiez les créneaux, il faudra la relancer.</div>';
      var avecDispo = e.intervenants.filter(function (i) { return i.dispo.length && i.dispo.length !== cr.length; }).length;
      if (avecDispo) h += '<div class="alerte alerte-attention">Le nombre de créneaux a changé : vérifiez les disponibilités des intervenants (écran 2).</div>';
      h += '<div class="deux-colonnes"><section class="carte"><h2>Réglages</h2>';
      h += '<div class="grille-champs" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
        '<label class="champ" style="grid-column:1/-1">Nom du forum<input type="text" value="' + esc(e.nom) + '" data-change="nom"></label>' +
        '<label class="champ" style="grid-column:1/-1">Date (affichée sur les convocations, facultatif)<input type="text" placeholder="ex. Jeudi 12 mars" value="' + esc(p.date) + '" data-change="param" data-cle="date"></label>' +
        champ('dureeCreneau', 'Durée d\'un créneau (min)', p.dureeCreneau) +
        champ('battement', 'Battement entre deux créneaux (min)', p.battement, 'number', 'temps de déplacement') +
        champ('tailleGroupe', 'Taille de groupe par défaut', p.tailleGroupe, 'number', 'modifiable atelier par atelier') +
        champ('nbVoeux', 'Nombre de vœux demandés', p.nbVoeux) +
        champ('ateliersParSalle', 'Ateliers par salle (par défaut)', p.ateliersParSalle, 'number', 'modifiable salle par salle') + '</div>';
      h += '<h3>Sessions</h3>';
      p.sessions.forEach(function (s, i) {
        h += '<div class="session-ligne"><b style="width:80px">Session ' + (i + 1) + '</b>' +
          '<label>de <input type="time" step="300" value="' + O.hhmm(s.debut) + '" data-initial="' + O.hhmm(s.debut) + '" data-blur="session" data-i="' + i + '" data-cle="debut"></label>' +
          '<label>à <input type="time" step="300" value="' + O.hhmm(s.fin) + '" data-initial="' + O.hhmm(s.fin) + '" data-blur="session" data-i="' + i + '" data-cle="fin"></label>' +
          (s.fin <= s.debut ? '<span class="pastille p-bloquant">fin avant le début</span>' : '') +
          '<span class="espace" style="flex:1"></span>' +
          (p.sessions.length > 1 ? '<button class="btn btn-petit btn-danger" data-action="supprimerSession" data-i="' + i + '">Supprimer</button>' : '') + '</div>';
      });
      h += '<button class="btn" data-action="ajouterSession">+ Ajouter une session</button></section>';

      // Créneaux obtenus
      h += '<section class="carte"><h2>Créneaux obtenus : ' + cr.length + '</h2>';
      h += '<p class="doux petit">Durée occupée = n × durée du créneau + (n − 1) × battement (pas de battement après le dernier créneau).</p>';
      h += '<div class="deux-colonnes" style="gap:14px">';
      cr.sessions.forEach(function (s, iS) {
        h += '<div style="flex:1 1 180px"><h3>Session ' + (iS + 1) + ' · ' + O.pluriel(s.n, 'créneau', 'créneaux') + '</h3><div class="liste-creneaux">';
        cr.filter(function (c) { return c.session === iS; }).forEach(function (c) {
          h += '<span class="creneau-ligne">' + (c.index + 1) + '. ' + esc(c.libelle) + '</span>';
        });
        if (s.reste > 0) h += '<span class="creneau-libre">' + O.hm(s.fin - s.reste) + '–' + O.hm(s.fin) + ' : ' + s.reste + ' min inutilisées</span>';
        else if (s.n) h += '<span class="petit" style="color:var(--ok-texte)">Tombe juste</span>';
        h += '</div></div>';
      });
      h += '</div>';
      var libres = cr.sessions.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return x.s.reste > 0; });
      if (libres.length) {
        var toutes = M.suggestions(p);
        h += '<div class="alerte alerte-attention" style="margin-top:14px"><b>Du temps reste inutilisé</b> dans ' + libres.map(function (x) {
          return 'la session ' + (x.i + 1) + ' (' + x.s.reste + ' min)'; }).join(' et ') + '.';
        if (toutes.length) {
          h += '<br>' + toutes.map(function (sg) {
            return 'Avec <b>' + sg.duree + ' min</b> de créneau et <b>' + sg.battement + ' min</b> de battement, toutes les sessions tombent juste. ' +
              '<button class="btn btn-petit" data-action="appliquer" data-d="' + sg.duree + '" data-b="' + sg.battement + '">Appliquer</button>';
          }).join('<br>');
        } else {
          libres.forEach(function (x) {
            M.suggestions(p, x.i).forEach(function (sg) {
              h += '<br>Avec <b>' + sg.duree + ' min</b> de créneau et <b>' + sg.battement + ' min</b> de battement, la session ' + (x.i + 1) + ' tombe juste. ' +
                '<button class="btn btn-petit" data-action="appliquer" data-d="' + sg.duree + '" data-b="' + sg.battement + '">Appliquer</button>';
            });
          });
        }
        h += '</div>';
      }
      h += '</section></div>';
      h += '<div class="barre"><span class="espace"></span><button class="btn btn-principal" data-action="aller" data-page="intervenants">Étape suivante : Intervenants →</button></div>';
      return h;
    },
    actions: {
      ajouterSession: function () {
        var s = FM.app.etat.parametres.sessions, der = s[s.length - 1];
        var debut = der ? der.fin + 15 : 9 * 60;
        s.push({ debut: debut, fin: debut + 60 });
        FM.app.changer({ quoi: 'ajout d\'une session' });
      },
      supprimerSession: async function (el) {
        if (!(await FM.ui.confirmer('Supprimer la session ' + (+el.dataset.i + 1) + ' ?', { oui: 'Supprimer', danger: true }))) return;
        FM.app.etat.parametres.sessions.splice(+el.dataset.i, 1);
        FM.app.changer({ quoi: 'suppression d\'une session' });
      },
      appliquer: function (el) {
        var p = FM.app.etat.parametres;
        p.dureeCreneau = +el.dataset.d; p.battement = +el.dataset.b;
        FM.app.changer({ quoi: 'réglage proposé appliqué' });
        FM.ui.toast('Réglage appliqué : ' + p.dureeCreneau + ' min de créneau, ' + p.battement + ' min de battement.');
      }
    },
    changements: {
      nom: function (el) { FM.app.etat.nom = el.value.trim() || 'Forum des métiers'; FM.app.changer({ quoi: 'nom du forum' }); },
      param: function (el) {
        var p = FM.app.etat.parametres, cle = el.dataset.cle;
        if (cle === 'date') { p.date = el.value.trim(); FM.app.changer({ quoi: 'date du forum', rendre: false }); return; }
        var v = parseInt(el.value, 10);
        var min = cle === 'battement' ? 0 : 1;
        if (isNaN(v) || v < min) { FM.ui.toast('Valeur incorrecte.', 'erreur'); FM.app.rafraichir(); return; }
        p[cle] = v;
        FM.app.changer({ quoi: 'modification des paramètres' });
      },
      session: function (el) {
        var s = FM.app.etat.parametres.sessions[+el.dataset.i], m = O.lireHeure(el.value);
        if (m === null) return;
        s[el.dataset.cle] = m;
        FM.app.changer({ quoi: 'horaires de la session ' + (+el.dataset.i + 1) });
      }
    }
  };
})();
