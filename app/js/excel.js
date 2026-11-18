/* =====================================================================
   excel.js — fichiers Excel et CSV produits par le logiciel :
   modèle intervenants, modèles de vœux par classe, classeur récapitulatif,
   export CSV. (Aucun contact d'intervenant dans les fichiers destinés
   aux élèves ou aux professeurs.)
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.excel = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, R = FM.repartition, X = FM.xlsx;

  function entete(t) { return { v: t, style: 'entete' }; }

  /** Modèle (ou export) de la liste des intervenants, avec une colonne par créneau. */
  function modeleIntervenants(etat) {
    var cr = M.creneaux(etat);
    var lignes = [['N° atelier', 'Nom', 'Métier', 'Secteur', 'Contact', 'Salle', 'Taille de groupe']
      .concat(cr.map(function (c) { return c.libelle; })).map(entete)];
    var inters = M.intervenantsTries(etat);
    if (!inters.length) {
      lignes.push([1, 'Exemple : Mme Martin', 'Infirmière', 'Santé', 'contact@exemple.fr', '311', '']
        .concat(cr.map(function () { return { v: 'x', style: 'saisie' }; })));
    }
    inters.forEach(function (i) {
      var s = M.salle(etat, i.salle);
      lignes.push([i.num, i.nom, i.metier, i.secteur, i.contact, s ? M.libelleSalle(s) : '', i.taille || '']
        .concat(cr.map(function (c) { return { v: M.present(i, c.index) ? 'x' : '', style: 'saisie' }; })));
    });
    var n = Math.max(lignes.length + 20, 40);
    var fin = X.lettre(6 + cr.length);
    return X.ecrire([{
      nom: 'Intervenants', lignes: lignes, figer: { lignes: 1 },
      largeurs: [11, 24, 26, 16, 26, 10, 10].concat(cr.map(function () { return 12; })),
      validations: cr.length ? [{ plage: 'H2:' + fin + n, formule: '"x"', erreur: 'Mettez « x » si l\'intervenant est présent, sinon laissez vide.' }] : []
    }]);
  }

  /** Modèle de vœux pour une classe : élèves déjà remplis, liste déroulante de numéros. */
  function modeleVoeux(etat, classe) {
    var nbV = etat.parametres.nbVoeux, inters = M.intervenantsTries(etat);
    var eleves = etat.eleves.filter(function (e) { return e.classe === classe; }).sort(O.trierEleves);
    var titres = ['Classe', 'Nom', 'Prénom'];
    for (var k = 1; k <= nbV; k++) titres.push('Vœu ' + k);
    var lignes = [titres.map(entete)];
    eleves.forEach(function (e) {
      var v = etat.voeux[e.id] || [], l = [e.classe, e.nom, e.prenom];
      for (var k2 = 0; k2 < nbV; k2++) l.push({ v: v[k2] ? choix(v[k2]) : '', style: 'saisie' });
      lignes.push(l);
    });
    // La liste déroulante affiche « 1 - Avocat » ; elle lit la colonne A de la feuille « Ateliers »
    function choix(num) { var i = M.intervenant(etat, num); return i ? i.num + ' - ' + (i.metier || i.nom) : String(num); }
    var formule = 'Ateliers!$A$2:$A$' + (inters.length + 1);
    var ateliers = [['Atelier (liste)', 'N°', 'Métier', 'Secteur'].map(entete)].concat(inters.map(function (i) {
      return [choix(i.num), i.num, i.metier, i.secteur];
    }));
    var aide = [[{ v: 'Mode d\'emploi', style: 'gras' }],
      ['1. Dans la feuille « Vœux », choisissez pour chaque élève ses ateliers dans la liste déroulante (ex. « 3 - Plombier »), vœu 1 = son premier choix.'],
      ['   Vous pouvez aussi taper simplement le numéro de l\'atelier (ex. 3).'],
      ['2. Les numéros et les métiers correspondants sont dans la feuille « Ateliers ».'],
      ['3. Ne modifiez pas les colonnes Classe, Nom et Prénom, et n\'ajoutez pas de ligne.'],
      ['4. Laissez vide une case si l\'élève a moins de ' + nbV + ' vœux.'],
      ['5. Enregistrez le fichier (format .xlsx) et rendez-le à l\'organisateur du forum.']];
    return X.ecrire([
      { nom: 'Vœux', lignes: lignes, figer: { lignes: 1, colonnes: 3 }, largeurs: [8, 22, 18].concat(new Array(nbV).fill(24)),
        validations: eleves.length && inters.length ? [{ plage: 'D2:' + X.lettre(2 + nbV) + (eleves.length + 1), formule: formule, sansErreur: true }] : [] },
      { nom: 'Ateliers', lignes: ateliers, figer: { lignes: 1 }, largeurs: [34, 6, 30, 22] },
      { nom: 'Mode d\'emploi', lignes: aide, largeurs: [110] }
    ]);
  }

  /** Tableau unique de la répartition : une ligne par passage (§6). */
  function tableauRepartition(etat) {
    var cr = M.creneaux(etat), lignes = [];
    var eleves = etat.eleves.slice().sort(O.trierEleves), idx = R.index(etat);
    eleves.forEach(function (e) {
      var aff = idx.parEleve[e.id] || {};
      cr.forEach(function (c) {
        var af = aff[c.index], inter = af ? M.intervenant(etat, af.a) : null;
        lignes.push({
          nom: e.nom, prenom: e.prenom, classe: e.classe, creneau: c.libelle0,
          num: af ? af.a : '', intervenant: inter ? inter.nom : '', metier: inter ? inter.metier : '',
          salle: inter ? M.nomSalle(etat, inter) : '',
          voeu: af ? R.libelleRang(R.rang(etat, e.id, af.a)) : 'non attribué'
        });
      });
    });
    return lignes;
  }
  var TITRES_TOUT = ['Nom', 'Prénom', 'Classe', 'Créneau', 'N° atelier', 'Intervenant', 'Métier', 'Salle', 'Vœu obtenu'];
  function versLigne(l) { return [l.nom, l.prenom, l.classe, l.creneau, l.num, l.intervenant, l.metier, l.salle, l.voeu]; }

  /** Classeur récapitulatif : onglet « Tout » + un onglet par classe. */
  function classeurRecap(etat) {
    var cr = M.creneaux(etat), idx = R.index(etat);
    var feuilles = [{
      nom: 'Tout', filtre: true, figer: { lignes: 1 }, largeurs: [18, 16, 8, 14, 10, 22, 26, 12, 12],
      lignes: [TITRES_TOUT.map(entete)].concat(tableauRepartition(etat).map(versLigne))
    }];
    M.classes(etat).forEach(function (cl) {
      var eleves = etat.eleves.filter(function (e) { return e.classe === cl; }).sort(O.trierEleves);
      var lignes = [['Nom', 'Prénom'].concat(cr.map(function (c) { return c.libelle; })).map(entete)];
      eleves.forEach(function (e) {
        var aff = idx.parEleve[e.id] || {};
        lignes.push([e.nom, e.prenom].concat(cr.map(function (c) {
          var af = aff[c.index], inter = af ? M.intervenant(etat, af.a) : null;
          if (!inter) return { v: '—', style: 'cadre' };
          var salle = M.nomSalle(etat, inter);
          return { v: 'n°' + inter.num + ' ' + inter.metier + (salle ? '\n' + salle : ''), style: 'cadre' };
        })));
      });
      feuilles.push({ nom: cl, lignes: lignes, figer: { lignes: 1, colonnes: 2 }, paysage: true,
        largeurs: [18, 14].concat(cr.map(function () { return 19; })),
        hauteurs: lignes.map(function (l, i) { return i ? 32 : 20; }) });
    });
    return X.ecrire(feuilles);
  }

  function csvRepartition(etat) {
    return O.versCSV([TITRES_TOUT].concat(tableauRepartition(etat).map(versLigne)));
  }

  return { modeleIntervenants: modeleIntervenants, modeleVoeux: modeleVoeux, classeurRecap: classeurRecap,
    csvRepartition: csvRepartition, tableauRepartition: tableauRepartition };
})();
