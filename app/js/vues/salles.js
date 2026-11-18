/* =====================================================================
   Écran « Salles et ateliers » : création des salles (nom, thème
   facultatif, nombre maximal d'ateliers), placement des ateliers.
   ===================================================================== */
FM.vues.salles = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, esc = O.esc;

  function nbAteliers(e, s) { return e.intervenants.filter(function (i) { return i.salle === s.id; }).length; }

  return {
    rendre: function () {
      var e = FM.app.etat, p = e.parametres, h = '';
      h += '<h1>3. Salles et ateliers</h1><p class="sous-titre">Créez les salles puis placez-y les ateliers. Une salle accueille ' + p.ateliersParSalle +
        ' ateliers par défaut (réglable salle par salle). Le thème est facultatif : la salle 311 avec le thème « Santé » s\'affichera « 311 - Santé ».</p>';
      h += '<div class="deux-colonnes"><section class="carte"><h2>Salles</h2>';
      h += '<div class="barre"><input type="text" id="nouvelle-salle" placeholder="Nom ou n° (ex. 311)" style="width:150px" aria-label="Nom ou numéro de la salle">' +
        '<input type="text" id="nouveau-theme" placeholder="Thème (facultatif)" style="width:170px" aria-label="Thème de la salle">' +
        '<input type="number" id="nouveau-max" placeholder="' + p.ateliersParSalle + '" min="1" style="width:76px" title="Nombre maximal d\'ateliers" aria-label="Nombre maximal d\'ateliers">' +
        '<button class="btn btn-principal" data-action="ajouter">+ Ajouter la salle</button></div>';
      if (!e.salles.length) h += '<p class="doux">Aucune salle pour l\'instant.</p>';
      else {
        h += '<div class="defile-x"><table class="tableau"><thead><tr><th>Salle</th><th>Thème (facultatif)</th><th class="centre" title="Nombre maximal d\'ateliers dans la salle">Max.</th><th class="centre">Placés</th><th>État</th><th></th></tr></thead><tbody>';
        e.salles.slice().sort(function (a, b) { return O.comparer(a.nom, b.nom); }).forEach(function (s) {
          var n = nbAteliers(e, s), max = M.maxAteliers(e, s), etat;
          if (n > max) etat = '<span class="pastille p-attention" style="min-width:0">' + (n - max) + ' de trop</span>';
          else if (n === max) etat = '<span class="pastille p-ok" style="min-width:0">complète</span>';
          else if (!n) etat = '<span class="pastille p-neutre" style="min-width:0">vide</span>';
          else etat = '<span class="pastille p-neutre" style="min-width:0">' + O.pluriel(max - n, 'place libre', 'places libres') + '</span>';
          h += '<tr><td><input type="text" value="' + esc(s.nom) + '" data-change="salle" data-id="' + esc(s.id) + '" data-cle="nom" style="width:70px" aria-label="Nom de la salle"></td>' +
            '<td><input type="text" value="' + esc(s.theme) + '" placeholder="—" data-change="salle" data-id="' + esc(s.id) + '" data-cle="theme" style="width:100%;min-width:120px" aria-label="Thème"></td>' +
            '<td class="centre"><input type="number" min="1" placeholder="' + p.ateliersParSalle + '" value="' + (s.maxAteliers || '') + '" data-change="salle" data-id="' + esc(s.id) + '" data-cle="maxAteliers" style="width:56px" aria-label="Ateliers maximum"></td>' +
            '<td class="centre">' + n + '</td><td style="white-space:nowrap">' + etat + '</td>' +
            '<td><button class="btn btn-petit btn-danger" data-action="supprimer" data-id="' + esc(s.id) + '" title="Supprimer la salle" aria-label="Supprimer la salle ' + esc(s.nom) + '" style="padding:0 7px">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></td></tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '</section>';

      h += '<section class="carte"><h2>Placement des ateliers</h2>';
      var inters = M.intervenantsTries(e);
      if (!inters.length) h += '<p class="doux">Importez d\'abord les intervenants (étape 2).</p>';
      else {
        var salles = e.salles.slice().sort(function (a, b) { return O.comparer(a.nom, b.nom); });
        h += '<div class="defile"><table class="tableau"><thead><tr><th>N°</th><th>Métier</th><th>Intervenant</th><th>Salle</th></tr></thead><tbody>';
        inters.forEach(function (i) {
          var options = '<option value="">— à définir —</option>' + salles.map(function (s) {
            var n = nbAteliers(e, s), max = M.maxAteliers(e, s), ici = i.salle === s.id;
            var pleine = n >= max && !ici;
            return '<option value="' + esc(s.id) + '"' + (ici ? ' selected' : '') + (pleine ? ' disabled' : '') + '>' + esc(M.libelleSalle(s)) +
              ' (' + n + '/' + max + (pleine ? ', complète' : '') + ')</option>';
          }).join('');
          h += '<tr><td>' + i.num + '</td><td>' + esc(i.metier) + '</td><td>' + esc(i.nom) + '</td>' +
            '<td><select data-change="placer" data-num="' + i.num + '"' + (i.salle ? '' : ' class="invalide"') + ' style="min-width:200px">' + options + '</select></td></tr>';
        });
        h += '</tbody></table></div><p class="doux petit" style="margin-top:8px">Entre parenthèses : ateliers placés / maximum. Une salle complète ne peut plus être choisie ; augmentez son maximum si besoin.</p>';
      }
      h += '</section></div>';
      h += '<div class="barre"><span class="espace"></span><button class="btn btn-principal" data-action="aller" data-page="eleves">Étape suivante : Élèves →</button></div>';
      return h;
    },
    actions: {
      ajouter: function () {
        var e = FM.app.etat, nom = document.getElementById('nouvelle-salle').value.trim();
        var theme = document.getElementById('nouveau-theme').value.trim();
        var max = parseInt(document.getElementById('nouveau-max').value, 10);
        if (!nom) { FM.ui.toast('Indiquez le nom ou le numéro de la salle.', 'erreur'); return; }
        if (e.salles.some(function (s) { return O.norm(s.nom) === O.norm(nom); })) { FM.ui.toast('Cette salle existe déjà.', 'erreur'); return; }
        e.salles.push({ id: M.nouvelIdSalle(e), nom: nom, theme: theme, maxAteliers: max > 0 ? max : null });
        FM.app.changer({ quoi: 'ajout de la salle ' + nom });
        var champ = document.getElementById('nouvelle-salle'); if (champ) champ.focus();
      },
      supprimer: async function (el) {
        var e = FM.app.etat, s = M.salle(e, el.dataset.id), n = nbAteliers(e, s);
        if (!(await FM.ui.confirmer('Supprimer la salle « ' + M.libelleSalle(s) + ' » ?' + (n ? '\nSes ' + n + ' ateliers n\'auront plus de salle.' : ''), { oui: 'Supprimer', danger: true }))) return;
        e.salles = e.salles.filter(function (x) { return x.id !== s.id; });
        e.intervenants.forEach(function (i) { if (i.salle === s.id) i.salle = ''; });
        FM.app.changer({ quoi: 'suppression de la salle ' + s.nom });
      },
      rien: function () {}
    },
    changements: {
      salle: function (el) {
        var s = M.salle(FM.app.etat, el.dataset.id), cle = el.dataset.cle;
        if (cle === 'nom') { if (!el.value.trim()) { FM.app.rafraichir(); return; } s.nom = el.value.trim(); }
        else if (cle === 'theme') s.theme = el.value.trim();
        else { var m = parseInt(el.value, 10); s.maxAteliers = m > 0 ? m : null; }
        FM.app.changer({ quoi: 'modification de la salle ' + s.nom });
      },
      placer: function (el) {
        M.intervenant(FM.app.etat, el.dataset.num).salle = el.value;
        FM.app.changer({ quoi: 'placement de l\'atelier n°' + el.dataset.num });
      }
    }
  };
})();
