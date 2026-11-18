/* =====================================================================
   Écran « Vœux » : génération des modèles Excel par classe, import des
   fichiers remplis avec contrôles, saisie et correction à la main.
   ===================================================================== */
FM.vues.voeux = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, I = FM.imports, esc = O.esc;
  var classeOuverte = '';
  var dernierRapport = null;   // résultat du dernier import

  function rapport() {
    var r = dernierRapport;
    if (!r) return '';
    var types = { fichier: 'Fichiers non reconnus', inconnu: 'Élèves inconnus', inexistant: 'Numéros d\'atelier inexistants', double: 'Vœux en double', sansVoeu: 'Élèves sans vœu' };
    var h = '<section class="carte"><h2>Résultat du dernier import</h2><p>' + O.pluriel(r.fichiers, 'fichier') + ' lu' + (r.fichiers > 1 ? 's' : '') + ' · vœux enregistrés pour <b>' +
      O.pluriel(r.lus, 'élève') + '</b>' + (r.classes.length ? ' (' + esc(r.classes.join(', ')) + ')' : '') + '.</p>';
    var groupes = {};
    r.erreurs.forEach(function (x) { (groupes[x.type] || (groupes[x.type] = [])).push(x); });
    if (!r.erreurs.length) h += '<div class="alerte alerte-ok">Aucun problème détecté.</div>';
    Object.keys(types).forEach(function (t) {
      if (!groupes[t]) return;
      h += '<div class="alerte ' + (t === 'sansVoeu' ? 'alerte-attention' : 'alerte-erreur') + '"><b>' + types[t] + ' (' + groupes[t].length + ')</b><ul>' +
        groupes[t].slice(0, 40).map(function (x) { return '<li>' + (x.fichier && r.fichiers > 1 ? esc(x.fichier) + ' — ' : '') + esc(x.texte) + '</li>'; }).join('') +
        (groupes[t].length > 40 ? '<li>…</li>' : '') + '</ul></div>';
    });
    return h + '<button class="btn btn-petit" data-action="fermerRapport">Masquer ce résultat</button></section>';
  }

  function resume(e) {
    var cls = M.classes(e);
    var h = '<section class="carte"><h2>Vœux par classe</h2><table class="tableau"><thead><tr><th>Classe</th><th class="num">Élèves</th><th class="num">Avec vœux</th><th class="num">Sans vœu</th><th>Modèle Excel</th><th></th></tr></thead><tbody>';
    cls.forEach(function (c) {
      var el = e.eleves.filter(function (x) { return x.classe === c; });
      var avec = el.filter(function (x) { return (e.voeux[x.id] || []).length; }).length;
      h += '<tr><td><b>' + esc(c) + '</b></td><td class="num">' + el.length + '</td><td class="num">' + avec + '</td><td class="num">' +
        (el.length - avec ? '<span class="pastille ' + (avec ? 'p-attention' : 'p-neutre') + '" style="min-width:40px">' + (el.length - avec) + '</span>' : '0') + '</td>' +
        '<td><button class="btn btn-petit" data-action="modele" data-classe="' + esc(c) + '">Télécharger</button></td>' +
        '<td><button class="btn btn-petit' + (classeOuverte === c ? ' btn-principal' : '') + '" data-action="ouvrir" data-classe="' + esc(c) + '">' + (classeOuverte === c ? 'Fermer' : 'Voir / modifier') + '</button></td></tr>';
    });
    return h + '</tbody></table></section>';
  }

  function saisie(e) {
    if (!classeOuverte) return '';
    var nbV = e.parametres.nbVoeux;
    var el = e.eleves.filter(function (x) { return x.classe === classeOuverte; }).sort(O.trierEleves);
    var h = '<section class="carte"><h2>Vœux de la classe ' + esc(classeOuverte) + '</h2><p class="doux petit">Saisissez les numéros d\'ateliers (vœu 1 = premier choix). Les cases en rouge signalent un numéro inexistant ou en double.</p>' +
      '<datalist id="liste-ateliers">' + M.intervenantsTries(e).map(function (i) { return '<option value="' + i.num + '">' + esc(i.metier) + '</option>'; }).join('') + '</datalist>' +
      '<div class="defile"><table class="tableau"><thead><tr><th>Nom</th><th>Prénom</th>';
    for (var k = 1; k <= nbV; k++) h += '<th class="centre">Vœu ' + k + '</th>';
    h += '</tr></thead><tbody>';
    el.forEach(function (x) {
      var v = e.voeux[x.id] || [];
      h += '<tr><td>' + esc(x.nom) + '</td><td>' + esc(x.prenom) + '</td>';
      for (var k2 = 0; k2 < nbV; k2++) {
        var n = v[k2], inter = n ? M.intervenant(e, n) : null;
        h += '<td class="centre"><input type="text" inputmode="numeric" list="liste-ateliers" value="' + (n || '') + '" title="' + (inter ? esc(inter.metier) : '') + '" style="width:56px;text-align:center" data-change="voeu" data-id="' + esc(x.id) + '" data-k="' + k2 + '"></td>';
      }
      h += '</tr>';
    });
    return h + '</tbody></table></div></section>';
  }

  function demande(e) {
    var inters = M.intervenantsTries(e);
    if (!inters.length || !Object.keys(e.voeux).length) return '';
    var v1 = {}, tot = {};
    Object.keys(e.voeux).forEach(function (id) {
      e.voeux[id].forEach(function (a, k) { tot[a] = (tot[a] || 0) + 1; if (!k) v1[a] = (v1[a] || 0) + 1; });
    });
    var cr = M.creneaux(e);
    var h = '<section class="carte"><h2>Demande par atelier</h2><p class="doux petit">Pour repérer les ateliers très demandés (les élèves risquent de ne pas tous les obtenir) et ceux qui serviront d\'ateliers « découverte ».</p>' +
      '<div class="defile" style="max-height:40vh"><table class="tableau"><thead><tr><th>N°</th><th>Métier</th><th class="num">En vœu 1</th><th class="num">Tous vœux</th><th class="num">Places sur le forum</th></tr></thead><tbody>';
    inters.slice().sort(function (a, b) { return (tot[b.num] || 0) - (tot[a.num] || 0); }).forEach(function (i) {
      var places = cr.filter(function (c) { return M.present(i, c.index); }).length * M.taille(e, i);
      h += '<tr><td>' + i.num + '</td><td>' + esc(i.metier) + '</td><td class="num">' + (v1[i.num] || 0) + '</td><td class="num">' + (tot[i.num] || 0) +
        '</td><td class="num">' + places + ((tot[i.num] || 0) > places ? ' <span class="pastille p-attention" style="min-width:0">très demandé</span>' : '') + '</td></tr>';
    });
    return h + '</tbody></table></div></section>';
  }

  return {
    rendre: function () {
      var e = FM.app.etat, h = '<h1>5. Vœux</h1><p class="sous-titre">Chaque élève choisit ' + e.parametres.nbVoeux + ' ateliers, par ordre de préférence.</p>';
      if (!e.eleves.length || !e.intervenants.length) {
        return h + '<div class="alerte alerte-info">Importez d\'abord ' + (!e.intervenants.length ? 'les intervenants (étape 2)' : '') +
          (!e.intervenants.length && !e.eleves.length ? ' et ' : '') + (!e.eleves.length ? 'les élèves (étape 4)' : '') + ' : les modèles de vœux en ont besoin.</div>';
      }
      h += '<section class="carte"><h2>Comment faire</h2><ol style="margin:0 0 12px;padding-left:20px;line-height:1.7">' +
        '<li>Téléchargez un <b>modèle Excel par classe</b> : la liste des élèves est déjà remplie, chaque colonne de vœu propose une liste déroulante de numéros d\'ateliers.</li>' +
        '<li>Le professeur saisit les vœux à partir des fiches papier, puis rend le fichier.</li>' +
        '<li>Importez les fichiers remplis (vous pouvez en sélectionner plusieurs à la fois).</li></ol>' +
        '<div class="barre"><button class="btn" data-action="tousModeles">Télécharger les modèles de toutes les classes</button>' +
        '<button class="btn btn-principal" data-action="importer">Importer des fichiers de vœux</button><span class="espace"></span>' +
        '<button class="btn" data-action="aller" data-page="repartition">Étape suivante : Répartition →</button></div></section>';
      h += rapport() + resume(e) + saisie(e) + demande(e);
      return h;
    },
    actions: {
      modele: async function (el) {
        var c = el.dataset.classe, nom = 'voeux_' + O.nomFichier(c) + '.xlsx';
        var ou = await FM.fichiers.exporter(nom, FM.excel.modeleVoeux(FM.app.etat, c));
        FM.ui.toast(ou ? 'Fichier créé : ' + ou : 'Fichier téléchargé : ' + nom);
      },
      tousModeles: async function () {
        var e = FM.app.etat, cls = M.classes(e), dossier = FM.fichiers.etat.dossier && FM.fichiers.etat.autorise;
        for (var i = 0; i < cls.length; i++) {
          await FM.fichiers.exporter('voeux_' + O.nomFichier(cls[i]) + '.xlsx', FM.excel.modeleVoeux(e, cls[i]));
          if (!dossier) await new Promise(function (ok) { setTimeout(ok, 400); });
        }
        FM.ui.toast(cls.length + ' modèles ' + (dossier ? 'créés dans exports/' : 'téléchargés (le navigateur peut demander l\'autorisation de télécharger plusieurs fichiers)'));
      },
      importer: async function () {
        var fichiers = await FM.ui.choisirFichier('.xlsx', true);
        if (!fichiers.length) return;
        var e = FM.app.etat, total = { fichiers: fichiers.length, lus: 0, classes: [], erreurs: [] }, voeux = {};
        for (var i = 0; i < fichiers.length; i++) {
          try {
            var t = await I.lireTableau(fichiers[i], 'Vœux');
            var r = I.analyserVoeux(e, t.lignes, fichiers[i].name);
            Object.assign(voeux, r.voeux);
            total.lus += r.lus; total.erreurs = total.erreurs.concat(r.erreurs);
            r.classes.forEach(function (c) { if (total.classes.indexOf(c) < 0) total.classes.push(c); });
          } catch (er) { total.erreurs.push({ type: 'fichier', texte: er.message, fichier: fichiers[i].name }); }
        }
        Object.keys(voeux).forEach(function (id) { e.voeux[id] = voeux[id]; });
        // Élèves des classes importées restés sans vœu
        e.eleves.filter(function (x) { return total.classes.indexOf(x.classe) >= 0 && !(e.voeux[x.id] || []).length; }).sort(O.trierEleves).forEach(function (x) {
          total.erreurs.push({ type: 'sansVoeu', texte: x.nom + ' ' + x.prenom + ' (' + x.classe + ') n\'a aucun vœu : il recevra des ateliers « découverte ».' });
        });
        total.classes.sort(O.comparer);
        dernierRapport = total;
        FM.app.changer({ quoi: 'import des vœux' });
        FM.ui.toast('Vœux importés pour ' + O.pluriel(total.lus, 'élève') + '.');
      },
      fermerRapport: function () { dernierRapport = null; FM.app.rafraichir(); },
      ouvrir: function (el) { classeOuverte = classeOuverte === el.dataset.classe ? '' : el.dataset.classe; FM.app.rafraichir(); }
    },
    changements: {
      voeu: function (el) {
        var e = FM.app.etat, id = el.dataset.id, k = +el.dataset.k, v = (e.voeux[id] || []).slice();
        var brut = el.value.trim(), n = parseInt(brut, 10);
        if (brut && (isNaN(n) || !M.intervenant(e, n))) { el.classList.add('invalide'); FM.ui.toast('L\'atelier « ' + brut + ' » n\'existe pas.', 'erreur'); return; }
        if (brut && v.some(function (a, j) { return a === n && j !== k; })) { el.classList.add('invalide'); FM.ui.toast('Ce vœu est déjà demandé par cet élève.', 'erreur'); return; }
        while (v.length < k) v.push(null);
        v[k] = brut ? n : null;
        e.voeux[id] = v.filter(function (a) { return a; });   // on resserre la liste (pas de trou)
        FM.app.changer({ quoi: 'modification d\'un vœu' });
      }
    }
  };
})();
