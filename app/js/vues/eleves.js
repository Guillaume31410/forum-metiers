/* =====================================================================
   Écran « Élèves » : import souple de la liste (CSV ou Excel, ex. export
   Pronote) avec association des colonnes et aperçu, liste modifiable.
   Seuls nom, prénom et classe sont conservés.
   ===================================================================== */
FM.vues.eleves = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, I = FM.imports, esc = O.esc;
  var filtre = { classe: '', texte: '' };
  var importEnCours = null;   // { nomFichier, info, lignes, iEntete, col, mode }

  /* ---------- Fenêtre d'import : association des colonnes + aperçu ---------- */
  function fenetreImport() {
    var imp = importEnCours, entetes = imp.lignes[imp.iEntete] || [], col = imp.col;
    var liste = I.extraireEleves(imp.lignes, imp.iEntete, col);
    var incomplets = liste.filter(function (x) { return x.incomplet; });
    function choix(cle, libelle) {
      return '<label class="champ">' + libelle + '<select data-fenetre-change="col" data-cle="' + cle + '"' + (col[cle] < 0 ? ' class="invalide"' : '') + '>' +
        '<option value="-1">— choisir —</option>' + entetes.map(function (t, j) {
          return '<option value="' + j + '"' + (col[cle] === j ? ' selected' : '') + '>' + esc(t || ('Colonne ' + (j + 1))) + '</option>';
        }).join('') + '</select></label>';
    }
    var h = '<h2>Import des élèves</h2><p class="doux petit">Fichier « ' + esc(imp.nomFichier) + ' » · ' + esc(imp.info.type) +
      (imp.info.separateur ? ' · séparateur : ' + imp.info.separateur : '') + (imp.info.encodage ? ' · accents : ' + esc(imp.info.encodage) : '') +
      (imp.info.feuille ? ' · feuille « ' + esc(imp.info.feuille) + ' »' : '') + ' · ' + O.pluriel(liste.length, 'ligne') + '</p>';
    h += '<p>Indiquez quelle colonne contient chaque information. Les autres colonnes du fichier sont ignorées et ne sont pas conservées.</p>';
    h += '<div class="grille-champs">' +
      '<label class="champ">Ligne des en-têtes<select data-fenetre-change="entete">' + imp.lignes.slice(0, 10).map(function (l, i) {
        return '<option value="' + i + '"' + (i === imp.iEntete ? ' selected' : '') + '>Ligne ' + (i + 1) + ' : ' + esc(l.slice(0, 3).join(' | ').slice(0, 40)) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="champ" style="justify-content:flex-end"><span><input type="checkbox" data-fenetre-change="unique"' + (col.unique ? ' checked' : '') +
      '> Nom et prénom dans la même colonne</span></label><span></span>' +
      choix('nom', col.unique ? 'Colonne « Nom Prénom »' : 'Nom') + (col.unique ? '<span></span>' : choix('prenom', 'Prénom')) + choix('classe', 'Classe') + '</div>';
    h += '<h3>Aperçu des 10 premières lignes</h3><div class="defile" style="max-height:32vh"><table class="tableau"><thead><tr><th>Ligne</th><th>Nom</th><th>Prénom</th><th>Classe</th><th></th></tr></thead><tbody>' +
      liste.slice(0, 10).map(function (x) {
        return '<tr' + (x.incomplet ? ' style="background:#fff3f1"' : '') + '><td>' + x.ligne + '</td><td>' + esc(x.nom) + '</td><td>' + esc(x.prenom) + '</td><td>' + esc(x.classe) +
          '</td><td>' + (x.incomplet ? '<span class="pastille p-bloquant">incomplète</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    if (incomplets.length) {
      h += '<div class="alerte alerte-attention" style="margin-top:10px">' + O.pluriel(incomplets.length, 'ligne incomplète', 'lignes incomplètes') +
        ' (nom, prénom ou classe manquant) ser' + (incomplets.length > 1 ? 'ont ignorées' : 'a ignorée') + ' : lignes ' +
        incomplets.slice(0, 15).map(function (x) { return x.ligne; }).join(', ') + (incomplets.length > 15 ? '…' : '') + '.</div>';
    }
    var e = FM.app.etat, valides = liste.length - incomplets.length;
    if (e.eleves.length) {
      h += '<div class="barre" style="margin-top:10px"><b>La liste actuelle compte ' + e.eleves.length + ' élèves :</b>' +
        '<label><input type="radio" name="mode" value="remplacer" data-fenetre-change="mode"' + (imp.mode !== 'ajouter' ? ' checked' : '') + '> la remplacer</label>' +
        '<label><input type="radio" name="mode" value="ajouter" data-fenetre-change="mode"' + (imp.mode === 'ajouter' ? ' checked' : '') + '> ajouter ces élèves</label></div>' +
        '<p class="doux petit">En remplaçant, les élèves déjà présents (même nom, prénom et classe) gardent leurs vœux.</p>';
    }
    var pret = col.nom >= 0 && (col.unique || col.prenom >= 0) && col.classe >= 0 && valides > 0;
    h += '<div class="fenetre-boutons"><button class="btn" data-fenetre="annuler">Annuler</button>' +
      '<button class="btn btn-principal" data-fenetre="valider"' + (pret ? '' : ' disabled') + '>Importer ' + O.pluriel(valides, 'élève') + '</button></div>';
    FM.ui.fenetre(h, { surClic: surClicImport, surChangement: surChangementImport });
  }

  function surChangementImport(el) {
    var imp = importEnCours, quoi = el.getAttribute('data-fenetre-change');
    if (!quoi) return;
    if (quoi === 'col') imp.col[el.dataset.cle] = parseInt(el.value, 10);
    else if (quoi === 'unique') { imp.col.unique = el.checked; if (el.checked) imp.col.prenom = -1; }
    else if (quoi === 'entete') { imp.iEntete = parseInt(el.value, 10); imp.col = I.proposerColonnes(imp.lignes[imp.iEntete], FM.app.etat.memo.colonnesEleves); }
    else if (quoi === 'mode') imp.mode = el.value;
    fenetreImport();
  }

  function surClicImport(action) {
    if (action === 'annuler') { FM.ui.fermer(); importEnCours = null; return; }
    if (action !== 'valider') return;
    var imp = importEnCours, e = FM.app.etat, ent = imp.lignes[imp.iEntete];
    var liste = I.extraireEleves(imp.lignes, imp.iEntete, imp.col);
    var stats = I.appliquerEleves(e, liste, e.eleves.length ? imp.mode : 'remplacer');
    // On mémorise l'association des colonnes pour le prochain import
    e.memo.colonnesEleves = { nom: ent[imp.col.nom] || '', prenom: imp.col.prenom >= 0 ? ent[imp.col.prenom] : '', classe: ent[imp.col.classe] || '', unique: imp.col.unique };
    try { localStorage.setItem('forummetiers-colonnes', JSON.stringify(e.memo.colonnesEleves)); } catch (er) { /* sans gravité */ }
    FM.ui.fermer(); importEnCours = null;
    FM.app.changer({ quoi: 'import de la liste des élèves' });
    var msg = stats.ajoutes + ' élève(s) ajouté(s)';
    if (stats.conserves) msg += ', ' + stats.conserves + ' déjà connu(s)';
    if (stats.retires) msg += ', ' + stats.retires + ' retiré(s)';
    if (stats.doublons) msg += ', ' + stats.doublons + ' doublon(s) ignoré(s)';
    FM.ui.toast(msg + '.');
  }

  return {
    rendre: function () {
      var e = FM.app.etat, cls = M.classes(e), h = '';
      h += '<h1>4. Élèves</h1><p class="sous-titre">Importez la liste depuis Pronote (CSV ou Excel). Seuls le nom, le prénom et la classe sont conservés.</p>';
      h += '<div class="barre"><button class="btn btn-principal" data-action="importer">Importer la liste des élèves</button>' +
        '<button class="btn" data-action="ajouterForm">+ Ajouter un élève</button><span class="espace"></span>' +
        '<button class="btn" data-action="aller" data-page="voeux">Étape suivante : Vœux →</button></div>';
      if (!e.eleves.length) {
        return h + '<section class="carte"><h2>Aucun élève</h2><p>Dans Pronote, exportez la liste des élèves de 4e (nom, prénom, classe) au format CSV ou Excel, puis cliquez sur « Importer la liste des élèves ». ' +
          'Le logiciel reconnaît le séparateur et les accents, et vous laisse choisir les colonnes.</p>' + formulaireAjout() + '</section>';
      }
      h += '<section class="carte"><h2>' + e.eleves.length + ' élèves</h2><div class="barre">' + cls.map(function (c) {
        var n = e.eleves.filter(function (x) { return x.classe === c; }).length;
        return '<button class="btn btn-petit' + (filtre.classe === c ? ' btn-principal' : '') + '" data-action="filtrer" data-classe="' + esc(c) + '">' + esc(c) + ' (' + n + ')</button>';
      }).join('') + '<button class="btn btn-petit' + (!filtre.classe ? ' btn-principal' : '') + '" data-action="filtrer" data-classe="">Toutes</button>' +
        '<span class="espace"></span><input type="search" placeholder="Rechercher un nom…" value="' + esc(filtre.texte) + '" data-input="recherche" id="recherche-eleve"></div>';
      h += formulaireAjout();
      var liste = e.eleves.filter(function (x) {
        return (!filtre.classe || x.classe === filtre.classe) && (!filtre.texte || O.norm(x.nom + ' ' + x.prenom).indexOf(O.norm(filtre.texte)) >= 0);
      }).sort(O.trierEleves);
      h += '<div class="defile"><table class="tableau" id="table-eleves"><thead><tr><th>Nom</th><th>Prénom</th><th>Classe</th><th class="num">Vœux</th><th></th></tr></thead><tbody>' +
        liste.map(function (x) {
          return '<tr><td>' + esc(x.nom) + '</td><td>' + esc(x.prenom) + '</td><td>' + esc(x.classe) + '</td><td class="num">' + (e.voeux[x.id] || []).length +
            '</td><td class="num"><button class="btn btn-petit btn-danger" data-action="supprimer" data-id="' + esc(x.id) + '">Suppr.</button></td></tr>';
        }).join('') + '</tbody></table></div></section>';
      return h;
    },
    actions: {
      importer: async function () {
        var fichiers = await FM.ui.choisirFichier('.csv,.txt,.xlsx');
        if (!fichiers.length) return;
        var t = await I.lireTableau(fichiers[0]);
        if (!t.lignes.length) throw new Error('Le fichier est vide.');
        var iE = I.ligneEntete(t.lignes), memo = FM.app.etat.memo.colonnesEleves;
        if (!memo) { try { memo = JSON.parse(localStorage.getItem('forummetiers-colonnes')); } catch (er) { memo = null; } }
        importEnCours = { nomFichier: fichiers[0].name, info: t, lignes: t.lignes, iEntete: iE, col: I.proposerColonnes(t.lignes[iE], memo), mode: 'remplacer' };
        fenetreImport();
      },
      filtrer: function (el) { filtre.classe = el.dataset.classe; FM.app.rafraichir(); },
      ajouterForm: function () {
        var f = document.getElementById('form-ajout');
        if (f) { f.classList.toggle('cache'); var n = document.getElementById('aj-nom'); if (n) n.focus(); }
      },
      ajouter: function () {
        var e = FM.app.etat;
        var x = { nom: document.getElementById('aj-nom').value.trim(), prenom: document.getElementById('aj-prenom').value.trim(), classe: document.getElementById('aj-classe').value.trim() };
        if (!x.nom || !x.prenom || !x.classe) { FM.ui.toast('Nom, prénom et classe sont obligatoires.', 'erreur'); return; }
        x.id = M.nouvelIdEleve(e);
        e.eleves.push(x);
        FM.app.changer({ quoi: 'ajout de ' + x.prenom + ' ' + x.nom });
        FM.ui.toast(x.prenom + ' ' + x.nom + ' ajouté(e) en ' + x.classe + '.');
      },
      supprimer: async function (el) {
        var e = FM.app.etat, x = M.eleve(e, el.dataset.id);
        if (!(await FM.ui.confirmer('Supprimer ' + x.prenom + ' ' + x.nom + ' (' + x.classe + ') de la liste ?', { oui: 'Supprimer', danger: true }))) return;
        e.eleves = e.eleves.filter(function (y) { return y.id !== x.id; });
        delete e.voeux[x.id];
        if (e.repartition) e.repartition.affectations = e.repartition.affectations.filter(function (a) { return a.e !== x.id; });
        FM.app.changer({ quoi: 'suppression de ' + x.prenom + ' ' + x.nom });
      }
    },
    saisies: {
      recherche: function (el) {
        filtre.texte = el.value;
        // Filtrage direct du tableau (sans tout réafficher)
        var t = O.norm(el.value);
        document.querySelectorAll('#table-eleves tbody tr').forEach(function (tr) {
          tr.style.display = !t || O.norm(tr.cells[0].textContent + ' ' + tr.cells[1].textContent).indexOf(t) >= 0 ? '' : 'none';
        });
      }
    }
  };

  function formulaireAjout() {
    var cls = M.classes(FM.app.etat);
    return '<div id="form-ajout" class="barre cache" style="background:#f7f9f9;padding:10px;border-radius:6px">' +
      '<input type="text" id="aj-nom" placeholder="NOM"><input type="text" id="aj-prenom" placeholder="Prénom">' +
      '<input type="text" id="aj-classe" placeholder="Classe" list="liste-classes" class="moyen"><datalist id="liste-classes">' +
      cls.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<button class="btn btn-principal" data-action="ajouter">Ajouter</button></div>';
  }
})();
