/* =====================================================================
   exemple.js — données d'exemple entièrement fictives, pour essayer le
   logiciel sans fichier : 7 classes de 4e (210 élèves), 24 intervenants,
   6 salles, des vœux tirés au sort. Toujours les mêmes à chaque essai.
   ===================================================================== */
(function (racine) {
  'use strict';

  function hasard(graine) {
    var a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var PRENOMS = ['Léa', 'Hugo', 'Chloé', 'Lucas', 'Emma', 'Nathan', 'Manon', 'Louis', 'Inès', 'Gabriel', 'Jade', 'Raphaël',
    'Camille', 'Arthur', 'Sarah', 'Jules', 'Lina', 'Adam', 'Zoé', 'Noah', 'Lola', 'Tom', 'Ambre', 'Sacha', 'Alice', 'Maël',
    'Rose', 'Ethan', 'Anna', 'Timéo', 'Louise', 'Nolan', 'Juliette', 'Théo', 'Mila', 'Enzo', 'Clara', 'Paul', 'Lou', 'Yanis',
    'Margaux', 'Titouan', 'Romane', 'Mathis', 'Agathe', 'Axel', 'Éva', 'Malo', 'Nina', 'Léon', 'Capucine', 'Kenzo', 'Elsa', 'Aaron'];
  var NOMS = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'RICHARD', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON',
    'LAURENT', 'LEFEBVRE', 'MICHEL', 'GARCIA', 'DAVID', 'BERTRAND', 'ROUX', 'VINCENT', 'FOURNIER', 'MOREL', 'GIRARD',
    'ANDRÉ', 'MERCIER', 'DUPONT', 'LAMBERT', 'BONNET', 'FRANÇOIS', 'MARTINEZ', 'LEGRAND', 'GARNIER', 'FAURE', 'ROUSSEAU',
    'BLANC', 'GUÉRIN', 'MULLER', 'HENRY', 'ROUSSEL', 'NICOLAS', 'PERRIN', 'MORIN', 'MATHIEU', 'CLÉMENT', 'GAUTHIER',
    'DUMONT', 'LOPEZ', 'FONTAINE', 'CHEVALIER', 'ROBIN', 'MASSON', 'SANCHEZ', 'HERVÉ', 'NOËL', 'LE GALL', 'DE SOUSA'];
  var METIERS = [
    ['Infirmière', 'Santé'], ['Électricien', 'Bâtiment'], ['Plombier', 'Bâtiment'], ['Ingénieur généraliste', 'Industrie'],
    ['Avocate', 'Droit'], ['Cuisinier', 'Hôtellerie-restauration'], ['Développeuse web', 'Numérique'], ['Sapeur-pompier', 'Sécurité'],
    ['Vétérinaire', 'Santé'], ['Architecte', 'Bâtiment'], ['Journaliste', 'Communication'], ['Policière', 'Sécurité'],
    ['Kinésithérapeute', 'Santé'], ['Mécanicien automobile', 'Transport'], ['Comptable', 'Gestion'], ['Agricultrice', 'Agriculture'],
    ['Graphiste', 'Arts et design'], ['Professeur des écoles', 'Éducation'], ['Boulangère', 'Artisanat'], ['Pilote de ligne', 'Transport'],
    ['Aide-soignant', 'Santé'], ['Technicienne de laboratoire', 'Sciences'], ['Coiffeuse', 'Artisanat'], ['Militaire', 'Défense']];
  var NOMS_INTER = ['Mme Lemoine', 'M. Barbier', 'M. Caron', 'Mme Renaud', 'Me Aubert', 'M. Perrot', 'Mme Colin', 'Cdt Vidal',
    'Dr Marchand', 'Mme Brunet', 'M. Royer', 'Lt Picard', 'M. Lucas', 'M. Fabre', 'Mme Benoit', 'Mme Huet', 'M. Bailly',
    'Mme Hubert', 'Mme Giraud', 'Cdt Arnaud', 'M. Leclerc', 'Mme Payet', 'Mme Joly', 'Sgt Mallet'];
  var POPULARITE = [5, 4, 2, 4, 5, 6, 7, 6, 8, 3, 3, 5, 4, 4, 1, 1, 4, 3, 2, 6, 2, 2, 3, 4];

  function exemple() {
    var rnd = hasard(20261025), i, k;
    var classes = ['4eA', '4eB', '4eC', '4eD', '4eE', '4eF', '4eG'];
    var eleves = [], pris = {}, ids = {};
    classes.forEach(function (cl) {
      for (k = 0; k < 30; k++) {
        var nom, prenom, cle;
        do {
          nom = NOMS[Math.floor(rnd() * NOMS.length)]; prenom = PRENOMS[Math.floor(rnd() * PRENOMS.length)];
          cle = cl + nom + prenom;
        } while (pris[cle]);
        pris[cle] = true;
        var id;
        do { id = 'E-' + (100 + Math.floor(rnd() * 900)); } while (ids[id]);
        ids[id] = true;
        eleves.push({ id: id, nom: nom, prenom: prenom, classe: cl });
      }
    });
    var salles = [['311', 'Santé'], ['312', 'Bâtiment et mécanique'], ['313', 'Droit et sécurité'],
      ['214', 'Sciences et numérique'], ['215', 'Artisanat et création'], ['CDI', '']].map(function (n, j) {
      return { id: 's' + (j + 1), nom: n[0], theme: n[1], maxAteliers: null };
    });
    // Salle de chaque atelier (n° d'atelier → n° de salle), regroupés par thème
    var SALLE_ATELIER = { 1: 1, 9: 1, 13: 1, 21: 1, 2: 2, 3: 2, 10: 2, 14: 2, 5: 3, 8: 3, 12: 3, 24: 3,
      4: 4, 7: 4, 15: 4, 22: 4, 11: 5, 17: 5, 19: 5, 23: 5, 6: 6, 16: 6, 18: 6, 20: 6 };
    var nbCreneaux = 8;
    var intervenants = METIERS.map(function (m, j) {
      var dispo = [];
      for (var c = 0; c < nbCreneaux; c++) dispo.push(true);
      if (j === 4) dispo[7] = false;     // départ anticipé
      if (j === 17) dispo[0] = false;    // arrivée tardive
      if (j === 11) dispo[4] = false;    // pause
      return { num: j + 1, nom: NOMS_INTER[j], metier: m[0], secteur: m[1],
        contact: 'intervenant' + (j + 1) + '@exemple.fr', salle: 's' + SALLE_ATELIER[j + 1], taille: null, dispo: dispo };
    });
    var voeux = {};
    eleves.forEach(function (e, n) {
      if (n === 61 || n === 75 || n === 88) return;  // trois élèves de 4eC sans vœu
      var liste = [];
      while (liste.length < 6) {
        var total = 0, poids = POPULARITE.map(function (p, j) { var w = liste.indexOf(j + 1) >= 0 ? 0 : p; total += w; return w; });
        var r = rnd() * total;
        for (i = 0; i < poids.length; i++) { r -= poids[i]; if (r < 0) { liste.push(i + 1); break; } }
      }
      voeux[e.id] = liste;
    });
    return {
      format: 'forum-metiers', version: 1, nom: 'Forum des métiers (exemple)',
      parametres: { dureeCreneau: 15, battement: 5, sessions: [{ debut: 540, fin: 630 }, { debut: 645, fin: 720 }],
        tailleGroupe: 10, nbVoeux: 6, ateliersParSalle: 4, date: 'Jeudi 12 mars' },
      salles: salles, intervenants: intervenants, eleves: eleves, voeux: voeux, repartition: null,
      memo: { colonnesEleves: null }
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = exemple;
  else { racine.FM = racine.FM || {}; racine.FM.exemple = exemple; }
})(this);
