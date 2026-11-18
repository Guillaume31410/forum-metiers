/* =====================================================================
   Écran « Impressions et exports » : convocations, listes d'émargement,
   planning par classe, classeur Excel, CSV, sauvegarde.
   ===================================================================== */
FM.vues.impressions = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, R = FM.repartition, P = FM.impression, esc = O.esc;
  var choix = { classe: '', format: 'initiale', inter: '', classePlanning: '' };

  function selectClasses(e, cle, valeur) {
    return '<select data-change="choix" data-cle="' + cle + '"><option value="">Toutes les classes</option>' + M.classes(e).map(function (c) {
      return '<option value="' + esc(c) + '"' + (valeur === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>';
  }

  /** Après une impression, propose de verrouiller la répartition imprimée. */
  async function proposerVerrou() {
    var e = FM.app.etat;
    if (!e.repartition || !e.repartition.affectations.some(function (a) { return !a.v; })) return;
    await new Promise(function (ok) { setTimeout(ok, 300); });
    var oui = await FM.ui.confirmer('Voulez-vous verrouiller toute la répartition maintenant qu\'elle est imprimée ?\nUne nouvelle répartition (par exemple après un désistement) ne changera alors que les affectations concernées.',
      { titre: 'Verrouiller la répartition imprimée ?', oui: 'Verrouiller', non: 'Plus tard' });
    if (oui) {
      R.verrouiller(e, function () { return true; }, true);
      FM.app.changer({ quoi: 'verrouillage de la répartition' });
      FM.ui.toast('Répartition verrouillée.');
    }
  }
  function imprimer(fn) {
    var avant = function () { window.removeEventListener('afterprint', avant); proposerVerrou(); };
    window.addEventListener('afterprint', avant);
    fn();
  }

  return {
    rendre: function () {
      var e = FM.app.etat, r = e.repartition, h = '<h1>8. Impressions et exports</h1><p class="sous-titre">Les documents passent par la fonction « Imprimer » du navigateur, qui permet aussi d\'enregistrer en PDF (choisir l\'imprimante « Enregistrer au format PDF »).</p>';
      var dis = r ? '' : ' disabled';
      if (!r) h += '<div class="alerte alerte-info">Lancez d\'abord la répartition pour imprimer les documents. <button class="btn" data-action="aller" data-page="repartition">Aller à la répartition</button></div>';
      else {
        var er = M.etatRepartition(e), sansSalle = e.intervenants.filter(function (i) { return !M.salle(e, i.salle); }).length;
        if (er.casesVides) h += '<div class="alerte alerte-attention">' + O.pluriel(er.casesVides, 'passage') + ' sans atelier : il apparaîtra avec un tiret.</div>';
        if (sansSalle) h += '<div class="alerte alerte-info">' + O.pluriel(sansSalle, 'atelier') + ' sans salle : la case salle restera vide (vous pourrez réimprimer plus tard).</div>';
      }
      h += '<div class="deux-colonnes"><section class="carte"><h2>Convocations élèves</h2><p class="petit">Un quart de page A4 par élève (4 par feuille, à découper), classe par classe. Contient les horaires, le métier et la salle.</p>' +
        '<div class="barre">' + selectClasses(e, 'classe', choix.classe) + '<select data-change="choix" data-cle="format">' +
        '<option value="initiale"' + (choix.format === 'initiale' ? ' selected' : '') + '>Prénom + initiale du nom</option>' +
        '<option value="complet"' + (choix.format === 'complet' ? ' selected' : '') + '>Prénom + nom complet</option></select>' +
        '<button class="btn btn-principal" data-action="convocations"' + dis + '>Imprimer</button></div></section>';
      h += '<section class="carte"><h2>Listes par intervenant</h2><p class="petit">Une page par intervenant : nom, métier, salle, puis pour chaque créneau la liste des élèves avec une colonne d\'émargement.</p>' +
        '<div class="barre"><select data-change="choix" data-cle="inter"><option value="">Tous les intervenants</option>' + M.intervenantsTries(e).map(function (i) {
          return '<option value="' + i.num + '"' + (String(choix.inter) === String(i.num) ? ' selected' : '') + '>' + i.num + ' · ' + esc(i.metier) + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn-principal" data-action="listes"' + dis + '>Imprimer</button></div></section></div>';
      h += '<div class="deux-colonnes"><section class="carte"><h2>Planning par classe</h2><p class="petit">Vue d\'ensemble pour le professeur : élèves en lignes, créneaux en colonnes (A4 paysage).</p>' +
        '<div class="barre">' + selectClasses(e, 'classePlanning', choix.classePlanning) + '<button class="btn btn-principal" data-action="plannings"' + dis + '>Imprimer</button></div></section>';
      h += '<section class="carte"><h2>Exports</h2><p class="petit">Classeur Excel : onglet « Tout » (une ligne par passage, filtrable et triable) et un onglet par classe. Le CSV contient le même tableau que l\'onglet « Tout ».' +
        (FM.fichiers.etat.dossier && FM.fichiers.etat.autorise ? ' Les fichiers sont créés dans le dossier <b>exports/</b>.' : ' Les fichiers sont téléchargés (dossier Téléchargements).') + '</p>' +
        '<div class="barre"><button class="btn btn-principal" data-action="excel"' + dis + '>Classeur Excel récapitulatif</button><button class="btn" data-action="csv"' + dis + '>Export CSV</button></div></section></div>';
      h += '<section class="carte"><h2>Sauvegarde des données</h2><p class="petit">Copie complète du forum dans un fichier .json, à garder en lieu sûr ou à rouvrir sur un autre ordinateur avec « Importer ».</p>' +
        '<div class="barre"><button class="btn" data-action="exporterJSON">Exporter les données</button><button class="btn" data-action="importerJSON">Importer des données</button></div></section>';
      return h;
    },
    actions: {
      convocations: function () { imprimer(function () { P.convocations(FM.app.etat, choix.classe, choix.format); }); },
      listes: function () { imprimer(function () { P.listesIntervenants(FM.app.etat, choix.inter ? +choix.inter : null); }); },
      plannings: function () { imprimer(function () { P.planningClasses(FM.app.etat, choix.classePlanning); }); },
      excel: async function () {
        var nom = 'repartition_' + O.horodatage() + '.xlsx';
        var ou = await FM.fichiers.exporter(nom, FM.excel.classeurRecap(FM.app.etat));
        FM.ui.toast(ou ? 'Classeur créé : ' + ou : 'Classeur téléchargé : ' + nom);
      },
      csv: async function () {
        var nom = 'repartition_' + O.horodatage() + '.csv';
        var ou = await FM.fichiers.exporter(nom, FM.excel.csvRepartition(FM.app.etat));
        FM.ui.toast(ou ? 'Fichier créé : ' + ou : 'Fichier téléchargé : ' + nom);
      }
    },
    changements: {
      choix: function (el) { choix[el.dataset.cle] = el.value; }
    }
  };
})();
