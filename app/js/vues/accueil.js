/* =====================================================================
   Écran « Accueil » : tableau de bord de la préparation du forum.
   ===================================================================== */
FM.vues.accueil = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, F = FM.fichiers, esc = O.esc;

  function bandeauFichier() {
    var app = FM.app, f = F.etat, h = '';
    if (f.dossier && f.autorise) {
      h += '<div class="alerte alerte-ok">Relié au dossier <b>« ' + esc(f.dossier.name) + ' »</b> : chaque modification est enregistrée automatiquement dans <code>donnees/forum.json</code>, et les fichiers générés vont dans <code>exports/</code>.</div>';
    } else if (f.supporte && f.dossier) {
      h += '<div class="alerte alerte-info"><b>Reprendre votre travail.</b> Le logiciel se souvient du dossier « ' + esc(f.dossier.name) + ' ». Cliquez pour autoriser à nouveau l\'accès et recharger le forum enregistré.<br>' +
        '<button class="btn btn-principal" data-action="reprendreDossier">Reprendre le forum enregistré</button>' +
        '<button class="btn" data-action="choisirDossier">Choisir un autre dossier</button></div>';
    } else if (f.supporte) {
      h += '<div class="alerte alerte-attention"><b>Vos données ne sont pas encore enregistrées dans un fichier.</b> Reliez le logiciel au dossier ForumMetiers (une seule fois) : tout sera ensuite enregistré automatiquement dans <code>donnees/forum.json</code>.<br>' +
        '<button class="btn btn-principal" data-action="choisirDossier">Choisir le dossier ForumMetiers</button></div>';
    } else {
      h += '<div class="alerte alerte-attention"><b>Ce navigateur ne peut pas écrire directement dans le dossier ForumMetiers</b> (c\'est le cas de Firefox). Utilisez <b>Exporter</b> (en bas du menu) pour enregistrer une copie de vos données, et <b>Importer</b> pour la reprendre. Avec Edge ou Chrome, l\'enregistrement se fait automatiquement dans le dossier.' +
        (app.origine === 'secours' && app.secoursDisponible ? '<br><span class="petit">Données reprises de la copie de secours du navigateur (' + esc(O.dateCourte(app.secoursDisponible.date)) + ').</span>' : '') + '</div>';
    }
    var s = app.secoursDisponible, e = app.etat;
    if (s && app.origine === 'nouveau' && !e.eleves.length && !e.intervenants.length && (s.donnees.eleves.length || s.donnees.intervenants.length)) {
      h += '<div class="alerte alerte-info">Une copie de secours existe dans ce navigateur (' + esc(O.dateCourte(s.date)) + ', ' +
        O.pluriel(s.donnees.eleves.length, 'élève') + ', ' + O.pluriel(s.donnees.intervenants.length, 'intervenant') + ').<br>' +
        '<button class="btn" data-action="restaurerSecours">Restaurer cette copie</button></div>';
    }
    return h;
  }

  function cartes() {
    var e = FM.app.etat, cls = M.classes(e), cr = M.creneaux(e);
    var avecVoeux = cls.filter(function (c) { return e.eleves.some(function (el) { return el.classe === c && (e.voeux[el.id] || []).length; }); });
    var er = M.etatRepartition(e), h = '<div class="grille-cartes">';
    function carte(page, titre, chiffre, detail, etat, niveau) {
      h += '<button class="carte-chiffre" data-action="aller" data-page="' + page + '"><span class="t">' + titre + '</span><span class="c">' + chiffre +
        '</span><span class="d">' + detail + '</span><span class="pastille p-' + niveau + '" style="align-self:flex-start;margin-top:6px">' + etat + '</span></button>';
    }
    carte('eleves', 'Élèves', e.eleves.length || '—', e.eleves.length ? O.pluriel(cls.length, 'classe') + ' importée' + (cls.length > 1 ? 's' : '') : 'liste à importer',
      e.eleves.length ? 'Prêt' : 'À faire', e.eleves.length ? 'ok' : 'neutre');
    carte('intervenants', 'Intervenants', e.intervenants.length || '—', O.pluriel(e.salles.length, 'salle') + ' · ' + O.pluriel(cr.length, 'créneau', 'créneaux'),
      e.intervenants.length ? 'Prêt' : 'À faire', e.intervenants.length ? 'ok' : 'neutre');
    var manque = cls.filter(function (c) { return avecVoeux.indexOf(c) < 0; });
    carte('voeux', 'Vœux', cls.length ? avecVoeux.length + ' / ' + cls.length : '—',
      cls.length ? (manque.length ? 'classes importées · manque ' + esc(manque.slice(0, 3).join(', ')) + (manque.length > 3 ? '…' : '') : 'toutes les classes') : 'après les élèves',
      cls.length && !manque.length ? 'Prêt' : cls.length ? 'À compléter' : 'À faire', cls.length && !manque.length ? 'ok' : cls.length ? 'attention' : 'neutre');
    var detail = 'pas encore lancée', etiquette = 'En attente', niv = 'neutre';
    if (er.existe) {
      var ind = FM.repartition.indicateurs(e), v1 = ind.parRang[0];
      detail = v1 && v1.concernes ? O.pourcent(v1.obtenu, v1.concernes) + ' ont leur vœu 1' : 'faite';
      etiquette = er.creneauxChanges || er.casesVides ? 'À revoir' : 'Faite'; niv = er.creneauxChanges || er.casesVides ? 'attention' : 'ok';
    }
    carte(er.existe ? 'planning' : 'repartition', 'Répartition', er.existe ? 'Faite' : '—', detail, etiquette, niv);
    return h + '</div>';
  }

  function verifications() {
    var e = FM.app.etat, ctrl = M.controles(e);
    var h = '<section class="carte"><h2>Vérifications avant répartition</h2>';
    ctrl.forEach(function (c) {
      var lib = { ok: 'OK', attention: 'Attention', bloquant: 'Bloquant' }[c.niveau];
      h += '<div class="controle"><span class="pastille p-' + c.niveau + '">' + lib + '</span><span class="texte">' + esc(c.texte) + '</span>' +
        '<button class="btn-lien" data-action="aller" data-page="' + c.page + '">Voir</button></div>';
    });
    var bloque = ctrl.some(function (c) { return c.niveau === 'bloquant'; });
    h += '<div class="barre" style="margin:14px 0 0"><button class="btn btn-principal btn-grand" data-action="lancer"' + (bloque ? ' disabled' : '') + '>' +
      (e.repartition ? 'Refaire la répartition' : 'Lancer la répartition') + '</button>' +
      (bloque ? '<span style="color:var(--err-texte);font-size:14px">Corrigez d\'abord les points « Bloquant » ci-dessus.</span>' :
        '<span class="doux petit">Vous pourrez ensuite corriger à la main dans le planning.</span>') + '</div>';
    return h + '</section>';
  }

  function demarrage() {
    var e = FM.app.etat;
    if (e.eleves.length || e.intervenants.length) return '';
    return '<section class="carte"><h2>Pour commencer</h2>' +
      '<p>Suivez les étapes du menu de gauche dans l\'ordre : <b>1. Paramètres</b> (horaires), <b>2. Intervenants</b>, <b>3. Salles</b>, <b>4. Élèves</b>, <b>5. Vœux</b>, puis <b>6. Répartition</b>.</p>' +
      '<p class="doux">Pour découvrir le logiciel sans vos fichiers, chargez des données d\'exemple entièrement fictives (210 élèves, 24 intervenants).</p>' +
      '<div class="barre"><button class="btn btn-principal" data-action="aller" data-page="parametres">Commencer par les paramètres</button>' +
      '<button class="btn" data-action="exemple">Charger des données d\'exemple</button></div></section>';
  }

  return {
    rendre: function () {
      var e = FM.app.etat;
      return '<h1>Accueil</h1><p class="sous-titre">' + esc(e.nom) + (e.parametres.date ? ' — ' + esc(e.parametres.date) : '') +
        ' · Où en est la préparation ? Cliquez sur une carte pour y aller.</p>' +
        bandeauFichier() + demarrage() + cartes() + verifications() +
        '<p class="doux petit">Besoin d\'aide ? Le fichier <b>LISEZMOI.txt</b> du dossier ForumMetiers explique chaque étape. ' +
        '<button class="btn-lien" data-action="nouveau">Commencer un nouveau forum (tout effacer)</button></p>';
    },
    actions: {
      lancer: function () { FM.app.aller('repartition', { lancer: true }); },
      exemple: function () {
        FM.app.remplacer(FM.modele.migrer(FM.exemple()), 'exemple');
        FM.ui.toast('Données d\'exemple chargées (fictives).');
      },
      restaurerSecours: function () {
        var s = FM.app.secoursDisponible;
        if (s) { FM.app.remplacer(s.donnees, 'secours'); FM.ui.toast('Copie de secours restaurée.'); }
      },
      nouveau: async function () {
        var ok = await FM.ui.confirmer('Effacer toutes les données affichées et commencer un nouveau forum ?\nPensez à exporter une copie avant si besoin.',
          { oui: 'Tout effacer', danger: true });
        if (ok) FM.app.remplacer(FM.modele.nouveau(), 'nouveau');
      }
    }
  };
})();
