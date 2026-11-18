/* =====================================================================
   impression.js — documents imprimables (fonction « Imprimer » du
   navigateur, qui permet aussi d'enregistrer en PDF) :
   - convocations élèves : 4 par feuille A4, à découper ;
   - listes d'émargement : une page par intervenant ;
   - planning par classe : une page par classe (paysage).
   Le contact des intervenants n'apparaît jamais sur ces documents.
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.impression = (function () {
  'use strict';
  var O = FM.outils, M = FM.modele, R = FM.repartition, esc = O.esc;

  function lancer(html, page) {
    var zone = document.getElementById('impression');
    var style = document.getElementById('style-page');
    zone.innerHTML = html;
    style.textContent = '@page { ' + page + ' }';
    document.body.classList.add('mode-impression');
    var fin = function () {
      document.body.classList.remove('mode-impression');
      zone.innerHTML = ''; style.textContent = '';
      window.removeEventListener('afterprint', fin);
    };
    window.addEventListener('afterprint', fin);
    setTimeout(function () { window.print(); }, 50);
  }

  function titreForum(etat) {
    return esc(etat.nom || 'Forum des métiers') + (etat.parametres.date ? ' — ' + esc(etat.parametres.date) : '');
  }

  function nomAffiche(e, format) {
    if (format === 'complet') return e.prenom + ' ' + e.nom;
    return e.prenom + ' ' + (e.nom ? e.nom.charAt(0).toLocaleUpperCase('fr') + '.' : '');
  }

  /** Salle sur la convocation : le numéro, puis le thème en petit dessous. */
  function salleConvoc(etat, inter) {
    var sl = M.salle(etat, inter.salle);
    if (!sl) return '';
    return esc(/^\d/.test(sl.nom) ? 'Salle ' + sl.nom : sl.nom) + (sl.theme ? '<br><small>' + esc(sl.theme) + '</small>' : '');
  }

  /** Convocations élèves, classe par classe (chaque classe commence sur une nouvelle feuille). */
  function convocations(etat, classe, format) {
    var cr = M.creneaux(etat), idx = R.index(etat), html = '';
    var classes = classe ? [classe] : M.classes(etat);
    classes.forEach(function (cl) {
      var eleves = etat.eleves.filter(function (e) { return e.classe === cl; }).sort(O.trierEleves);
      for (var i = 0; i < eleves.length; i += 4) {
        html += '<section class="feuille-convoc">';
        eleves.slice(i, i + 4).forEach(function (e) {
          var aff = idx.parEleve[e.id] || {};
          html += '<article class="convoc"><p class="convoc-forum">' + titreForum(etat) + '</p>' +
            '<h2>' + esc(nomAffiche(e, format)) + ' — ' + esc(e.classe) + '</h2><table><tbody>';
          cr.forEach(function (c) {
            var af = aff[c.index], inter = af ? M.intervenant(etat, af.a) : null;
            html += '<tr><td class="h">' + esc(c.libelle) + '</td><td>' + (inter ? esc(inter.metier) : '—') +
              '</td><td class="s">' + (inter ? salleConvoc(etat, inter) : '') + '</td></tr>';
          });
          html += '</tbody></table></article>';
        });
        html += '</section>';
      }
    });
    lancer(html, 'size: A4 portrait; margin: 0;');
  }

  /** Listes d'émargement : une page par intervenant. */
  function listesIntervenants(etat, num) {
    var cr = M.creneaux(etat), idx = R.index(etat), html = '';
    var inters = M.intervenantsTries(etat).filter(function (i) { return !num || i.num === num; });
    inters.forEach(function (i) {
      var salle = M.nomSalle(etat, i);
      html += '<section class="page-liste"><p class="liste-forum">' + titreForum(etat) + '</p>' +
        '<h2>Atelier n°' + i.num + ' — ' + esc(i.metier) + '</h2>' +
        '<p class="liste-sous">' + esc(i.nom) + (salle ? ' · ' + esc(salle) : '') + '</p><div class="liste-creneaux">';
      cr.forEach(function (c) {
        if (!M.present(i, c.index)) {
          html += '<div class="bloc-creneau absent"><h3>' + esc(c.libelle) + '</h3><p>Pas de groupe (absent)</p></div>';
          return;
        }
        var el = (idx.parCase[i.num + '|' + c.index] || []).map(function (af) { return M.eleve(etat, af.e); })
          .filter(Boolean).sort(function (a, b) { return O.comparer(a.nom, b.nom) || O.comparer(a.prenom, b.prenom); });
        html += '<div class="bloc-creneau"><h3>' + esc(c.libelle) + ' <span>(' + O.pluriel(el.length, 'élève') + ')</span></h3>' +
          '<table><thead><tr><th>Nom</th><th>Prénom</th><th>Classe</th><th class="em">Émargement</th></tr></thead><tbody>';
        el.forEach(function (e) {
          html += '<tr><td>' + esc(e.nom) + '</td><td>' + esc(e.prenom) + '</td><td>' + esc(e.classe) + '</td><td class="em"></td></tr>';
        });
        if (!el.length) html += '<tr><td colspan="4">Aucun élève</td></tr>';
        html += '</tbody></table></div>';
      });
      html += '</div></section>';
    });
    lancer(html, 'size: A4 portrait; margin: 10mm;');
  }

  /** Planning d'une classe (vue d'ensemble pour le professeur). */
  function planningClasses(etat, classe) {
    var cr = M.creneaux(etat), idx = R.index(etat), html = '';
    var classes = classe ? [classe] : M.classes(etat);
    classes.forEach(function (cl) {
      var eleves = etat.eleves.filter(function (e) { return e.classe === cl; }).sort(O.trierEleves);
      html += '<section class="page-classe"><p class="liste-forum">' + titreForum(etat) + '</p><h2>Planning de la classe ' + esc(cl) + '</h2>' +
        '<table><thead><tr><th>Élève</th>' + cr.map(function (c) { return '<th>' + esc(c.libelle) + '</th>'; }).join('') + '</tr></thead><tbody>';
      eleves.forEach(function (e) {
        var aff = idx.parEleve[e.id] || {};
        html += '<tr><td class="nom">' + esc(e.nom) + ' ' + esc(e.prenom) + '</td>' + cr.map(function (c) {
          var af = aff[c.index], inter = af ? M.intervenant(etat, af.a) : null;
          if (!inter) return '<td>—</td>';
          return '<td><div>' + esc(inter.metier) + '</div><div><span>n°' + inter.num + (M.nomSalle(etat, inter) ? ' · ' + esc(M.nomSalle(etat, inter)) : '') + '</span></div></td>';
        }).join('') + '</tr>';
      });
      html += '</tbody></table></section>';
    });
    lancer(html, 'size: A4 landscape; margin: 6mm 8mm;');
  }

  return { convocations: convocations, listesIntervenants: listesIntervenants, planningClasses: planningClasses };
})();
