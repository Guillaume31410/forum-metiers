/* =====================================================================
   Écran « Intervenants » : import de l'Excel, tableau modifiable,
   grille de disponibilités et contrôle de faisabilité.
   ===================================================================== */
FM.vues.intervenants = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, I = FM.imports, esc = O.esc;

  function faisabilite(e) {
    var pl = M.places(e);
    if (!pl.length) return '';
    var h = '<section class="carte"><h2>Contrôle de faisabilité</h2><p class="doux petit">À chaque créneau, il faut au moins autant de places (somme des tailles de groupe des intervenants présents) que d\'élèves' +
      (e.eleves.length ? ' (' + e.eleves.length + ')' : ' — importez les élèves pour terminer ce contrôle') + '.</p>';
    h += '<div class="defile-x"><table class="tableau"><thead><tr><th>Créneau</th>' + pl.map(function (x) { return '<th class="centre">' + esc(x.creneau.libelle) + '</th>'; }).join('') +
      '</tr></thead><tbody><tr><td>Intervenants présents</td>' + pl.map(function (x) { return '<td class="centre">' + x.presents + '</td>'; }).join('') +
      '</tr><tr><td>Places</td>' + pl.map(function (x) { return '<td class="centre">' + x.places + '</td>'; }).join('') + '</tr>';
    if (e.eleves.length) {
      h += '<tr><td>État</td>' + pl.map(function (x) {
        return '<td class="centre">' + (x.manque ? '<span class="pastille p-bloquant">−' + x.manque + ' places</span>' : '<span class="pastille p-ok">OK</span>') + '</td>';
      }).join('') + '</tr>';
    }
    h += '</tbody></table></div>';
    var pb = pl.filter(function (x) { return x.manque; });
    if (e.eleves.length && pb.length) {
      h += '<div class="alerte alerte-erreur" style="margin-top:12px">' + pb.map(function (x) {
        return 'Créneau ' + esc(x.creneau.libelle) + ' : il manque ' + O.pluriel(x.manque, 'place') + '.';
      }).join('<br>') + ' Augmentez la taille de certains groupes ou ajoutez des intervenants.</div>';
    }
    return h + '</section>';
  }

  function tableau(e) {
    var cr = M.creneaux(e), inters = M.intervenantsTries(e);
    if (!inters.length) {
      return '<section class="carte"><h2>Aucun intervenant</h2><p>Importez le fichier Excel des intervenants (une ligne par intervenant, une colonne par créneau avec « x » si présent). ' +
        'Téléchargez le modèle pour avoir les bonnes colonnes, ou ajoutez les intervenants un par un.</p></section>';
    }
    var options = '<option value="">—</option>' + e.salles.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(M.libelleSalle(s)) + '</option>'; }).join('');
    var h = '<section class="carte"><h2>' + O.pluriel(inters.length, 'intervenant') + '</h2>' +
      '<p class="doux petit">Les modifications sont prises en compte immédiatement. Cochez les créneaux où l\'intervenant est présent (arrivée tardive, départ anticipé, pause). Le contact n\'apparaît sur aucun document élève.</p>' +
      '<div class="defile"><table class="tableau"><thead><tr><th>N°</th><th>Nom</th><th>Métier</th><th>Secteur</th><th>Contact</th><th>Salle</th><th title="Taille de groupe (vide = valeur par défaut)">Groupe</th>' +
      cr.map(function (c) { return '<th class="centre" title="' + esc(c.libelle) + '">' + esc(O.hm(c.debut)) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>';
    inters.forEach(function (i) {
      var n = i.num;
      h += '<tr><td style="width:62px"><input type="number" min="1" value="' + n + '" data-change="champ" data-num="' + n + '" data-cle="num" style="width:58px"></td>' +
        ['nom', 'metier', 'secteur', 'contact'].map(function (k) {
          var larg = { nom: 130, metier: 165, secteur: 105, contact: 125 }[k];
          return '<td><input type="text" style="min-width:' + larg + 'px" title="' + esc(i[k]) + '" value="' + esc(i[k]) + '" data-change="champ" data-num="' + n + '" data-cle="' + k + '"' + (k === 'metier' && !i.metier ? ' class="invalide"' : '') + '></td>';
        }).join('') +
        '<td style="width:96px"><select data-change="champ" data-num="' + n + '" data-cle="salle">' + options.replace('value="' + esc(i.salle) + '"', 'value="' + esc(i.salle) + '" selected') + '</select></td>' +
        '<td style="width:70px"><input type="number" min="1" placeholder="' + e.parametres.tailleGroupe + '" value="' + (i.taille || '') + '" data-change="champ" data-num="' + n + '" data-cle="taille"></td>' +
        cr.map(function (c) {
          return '<td class="centre"><input type="checkbox" class="case-dispo" aria-label="Présent ' + esc(c.libelle) + '"' + (M.present(i, c.index) ? ' checked' : '') +
            ' data-change="dispo" data-num="' + n + '" data-c="' + c.index + '"></td>';
        }).join('') +
        '<td><button class="btn btn-petit btn-danger" data-action="supprimer" data-num="' + n + '" title="Supprimer">Suppr.</button></td></tr>';
    });
    return h + '</tbody></table></div></section>';
  }

  function rapportImport(res) {
    var h = '';
    if (res.erreurs.length) h += '<div class="alerte alerte-erreur"><b>' + O.pluriel(res.erreurs.length, 'erreur') + '</b><ul>' + res.erreurs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    if (res.avertissements.length) h += '<div class="alerte alerte-attention"><b>À vérifier</b><ul>' + res.avertissements.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    return h;
  }

  return {
    rendre: function () {
      var e = FM.app.etat;
      var h = '<h1>2. Intervenants</h1><p class="sous-titre">Un atelier = un intervenant. Son numéro d\'atelier est celui que les professeurs saisissent pour les vœux.</p>';
      h += '<div class="barre"><button class="btn btn-principal" data-action="importer">Importer l\'Excel des intervenants</button>' +
        '<button class="btn" data-action="modele">' + (e.intervenants.length ? 'Exporter la liste (Excel)' : 'Télécharger le modèle Excel') + '</button>' +
        '<button class="btn" data-action="ajouter">+ Ajouter un intervenant</button><span class="espace"></span>' +
        '<button class="btn" data-action="aller" data-page="salles">Étape suivante : Salles →</button></div>';
      h += faisabilite(e) + tableau(e);
      return h;
    },
    actions: {
      importer: async function () {
        var fichiers = await FM.ui.choisirFichier('.xlsx,.csv,.txt');
        if (!fichiers.length) return;
        var e = FM.app.etat, t = await I.lireTableau(fichiers[0]);
        var res = I.analyserIntervenants(e, t.lignes);
        if (res.erreurs.length && !res.intervenants.length) { await FM.ui.information('Import impossible', rapportImport(res)); return; }
        var cr = M.creneaux(e);
        var apercu = '<p>Fichier « ' + esc(fichiers[0].name) + ' » : <b>' + O.pluriel(res.intervenants.length, 'intervenant') + '</b> trouvé' + (res.intervenants.length > 1 ? 's' : '') +
          (res.nouvellesSalles.length ? ', ' + O.pluriel(res.nouvellesSalles.length, 'nouvelle salle', 'nouvelles salles') + ' (' + esc(res.nouvellesSalles.join(', ')) + ')' : '') + '.</p>' +
          rapportImport(res) +
          '<div class="defile" style="max-height:40vh"><table class="tableau"><thead><tr><th>N°</th><th>Nom</th><th>Métier</th><th>Salle</th><th>Groupe</th><th>Présent</th></tr></thead><tbody>' +
          res.intervenants.slice(0, 60).map(function (i) {
            var n = i.dispo.filter(Boolean).length;
            return '<tr><td>' + i.num + '</td><td>' + esc(i.nom) + '</td><td>' + esc(i.metier) + '</td><td>' + esc(i.salleNom) + '</td><td>' + (i.taille || '') + '</td><td>' + n + ' / ' + cr.length + ' créneaux</td></tr>';
          }).join('') + '</tbody></table></div>' +
          (e.intervenants.length ? '<div class="alerte alerte-attention" style="margin-top:12px">La liste actuelle (' + O.pluriel(e.intervenants.length, 'intervenant') + ') sera remplacée.' +
            (e.repartition ? ' La répartition devra être relancée.' : '') + '</div>' : '') +
          '<div class="fenetre-boutons"><button class="btn" data-fenetre="non">Annuler</button><button class="btn btn-principal" data-fenetre="oui">Importer ces intervenants</button></div>';
        FM.ui.fenetre('<h2>Import des intervenants</h2>' + apercu, {
          surClic: function (a) {
            FM.ui.fermer();
            if (a !== 'oui') return;
            I.appliquerIntervenants(FM.app.etat, res);
            FM.app.changer({ quoi: 'import des intervenants' });
            FM.ui.toast(O.pluriel(res.intervenants.length, 'intervenant') + ' importé' + (res.intervenants.length > 1 ? 's' : '') + '.');
          }
        });
      },
      modele: async function () {
        var nom = FM.app.etat.intervenants.length ? 'intervenants_' + O.horodatage() + '.xlsx' : 'modele_intervenants.xlsx';
        var ou = await FM.fichiers.exporter(nom, FM.excel.modeleIntervenants(FM.app.etat));
        FM.ui.toast(ou ? 'Fichier créé : ' + ou : 'Fichier téléchargé : ' + nom);
      },
      ajouter: function () {
        var e = FM.app.etat, num = 1, cr = M.creneaux(e);
        while (M.intervenant(e, num)) num++;
        e.intervenants.push({ num: num, nom: '', metier: '', secteur: '', contact: '', salle: '', taille: null, dispo: cr.map(function () { return true; }) });
        FM.app.changer({ quoi: 'ajout de l\'atelier n°' + num });
        FM.ui.toast('Atelier n°' + num + ' ajouté en bas du tableau : complétez le nom et le métier.');
      },
      supprimer: async function (el) {
        var e = FM.app.etat, num = +el.dataset.num, i = M.intervenant(e, num);
        var nbV = e.eleves.filter(function (x) { return (e.voeux[x.id] || []).indexOf(num) >= 0; }).length;
        var ok = await FM.ui.confirmer('Supprimer l\'atelier n°' + num + ' (' + (i.metier || i.nom || 'sans nom') + ') ?' +
          (nbV ? '\n' + O.pluriel(nbV, 'élève') + ' l\'avai' + (nbV > 1 ? 'en' : '') + 't demandé en vœu : ce vœu sera retiré.' : ''), { oui: 'Supprimer', danger: true });
        if (!ok) return;
        e.intervenants = e.intervenants.filter(function (x) { return x.num !== num; });
        Object.keys(e.voeux).forEach(function (id) { e.voeux[id] = e.voeux[id].filter(function (a) { return a !== num; }); });
        FM.app.changer({ quoi: 'suppression de l\'atelier n°' + num });
      }
    },
    changements: {
      champ: function (el) {
        var e = FM.app.etat, i = M.intervenant(e, el.dataset.num), cle = el.dataset.cle;
        if (!i) return;
        if (cle === 'num') {
          var n = parseInt(el.value, 10);
          if (!(n > 0) || (n !== i.num && M.intervenant(e, n))) { FM.ui.toast('Ce numéro est invalide ou déjà utilisé.', 'erreur'); FM.app.rafraichir(); return; }
          var ancien = i.num;
          Object.keys(e.voeux).forEach(function (id) { e.voeux[id] = e.voeux[id].map(function (a) { return a === ancien ? n : a; }); });
          if (e.repartition) e.repartition.affectations.forEach(function (af) { if (af.a === ancien) af.a = n; });
          i.num = n;
          FM.app.changer({ quoi: 'changement de numéro d\'atelier' });
          return;
        }
        if (cle === 'taille') { var t = parseInt(el.value, 10); i.taille = t > 0 ? t : null; FM.app.changer({ quoi: 'taille de groupe de l\'atelier n°' + i.num }); return; }
        i[cle] = el.value.trim();
        FM.app.changer({ quoi: 'modification de l\'atelier n°' + i.num, rendre: cle === 'salle' || cle === 'metier' });
      },
      dispo: function (el) {
        var e = FM.app.etat, i = M.intervenant(e, el.dataset.num), c = +el.dataset.c, cr = M.creneaux(e);
        while (i.dispo.length < cr.length) i.dispo.push(false);
        i.dispo[c] = el.checked;
        FM.app.changer({ quoi: 'disponibilité de l\'atelier n°' + i.num });
      }
    }
  };
})();
