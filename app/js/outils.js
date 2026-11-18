/* =====================================================================
   outils.js — petites fonctions utilitaires partagées par tout le logiciel
   (texte, heures, CSV, téléchargement, tirage au sort reproductible…)
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.outils = (function () {
  'use strict';

  /** Protège un texte avant de l'insérer dans du HTML. */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function deux(n) { return (n < 10 ? '0' : '') + n; }

  /** 540 → "9h00" */
  function hm(min) { return Math.floor(min / 60) + 'h' + deux(min % 60); }
  /** 540 → "09h00" (pratique pour trier dans un tableur) */
  function hm0(min) { return deux(Math.floor(min / 60)) + 'h' + deux(min % 60); }
  /** 540 → "09:00" (format des champs <input type="time">) */
  function hhmm(min) { return deux(Math.floor(min / 60)) + ':' + deux(min % 60); }

  /** Lit une heure écrite "9h", "9h05", "09:05", "9.05" → minutes, ou null. */
  function lireHeure(txt) {
    var m = String(txt || '').match(/(\d{1,2})\s*[hH:.]\s*(\d{2})?/);
    if (!m) return null;
    var h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0;
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /** Texte simplifié pour les comparaisons : minuscules, sans accents ni espaces superflus. */
  function norm(s) {
    return String(s === undefined || s === null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[œ]/g, 'oe').replace(/[Œ]/g, 'oe')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** Décode un fichier texte : UTF-8 si possible, sinon Windows-1252 (Excel / Pronote). */
  function decoderTexte(buffer) {
    var octets = new Uint8Array(buffer), texte, encodage;
    try {
      texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
      encodage = 'UTF-8';
    } catch (e) {
      texte = new TextDecoder('windows-1252').decode(octets);
      encodage = 'Windows-1252 (ANSI)';
    }
    if (texte.charCodeAt(0) === 0xFEFF) texte = texte.slice(1);
    return { texte: texte, encodage: encodage };
  }

  /** Devine le séparateur d'un CSV en regardant les premières lignes. */
  function detecterSeparateur(texte) {
    var lignes = texte.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 5);
    var candidats = [';', ',', '\t'], meilleur = ';', score = -1;
    candidats.forEach(function (sep) {
      var total = 0;
      lignes.forEach(function (l) { total += lireCSV(l, sep)[0].length - 1; });
      if (total > score) { score = total; meilleur = sep; }
    });
    return meilleur;
  }

  /** Découpe un texte CSV en tableau de lignes (gère les guillemets). */
  function lireCSV(texte, sep) {
    var lignes = [], ligne = [], champ = '', guillemets = false, i, c;
    for (i = 0; i < texte.length; i++) {
      c = texte[i];
      if (guillemets) {
        if (c === '"') {
          if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false;
        } else champ += c;
      } else if (c === '"') guillemets = true;
      else if (c === sep) { ligne.push(champ); champ = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texte[i + 1] === '\n') i++;
        ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
      } else champ += c;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes.map(function (l) { return l.map(function (x) { return x.trim(); }); })
      .filter(function (l) { return l.some(function (x) { return x !== ''; }); });
  }

  /** Fabrique un CSV lisible par Excel en français (point-virgule, BOM UTF-8). */
  function versCSV(lignes) {
    var corps = lignes.map(function (l) {
      return l.map(function (v) {
        var s = String(v === null || v === undefined ? '' : v);
        return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');
    return new Blob(['﻿' + corps + '\r\n'], { type: 'text/csv;charset=utf-8' });
  }

  /** Propose un fichier au téléchargement (dossier Téléchargements du navigateur). */
  function telecharger(nom, blob) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  /** Générateur pseudo-aléatoire reproductible : même graine = même tirage. */
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

  /** Mélange un tableau (copie) avec le générateur fourni. */
  function melanger(tab, rnd) {
    var t = tab.slice(), i, j, x;
    for (i = t.length - 1; i > 0; i--) {
      j = Math.floor(rnd() * (i + 1)); x = t[i]; t[i] = t[j]; t[j] = x;
    }
    return t;
  }

  /** "2026-10-25_20h15" pour nommer les fichiers. */
  function horodatage() {
    var d = new Date();
    return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()) + '_' + deux(d.getHours()) + 'h' + deux(d.getMinutes());
  }
  function heureCourte(d) { d = d ? new Date(d) : new Date(); return deux(d.getHours()) + ':' + deux(d.getMinutes()); }
  function dateCourte(d) { d = new Date(d); return deux(d.getDate()) + '/' + deux(d.getMonth() + 1) + '/' + d.getFullYear() + ' à ' + heureCourte(d); }

  function pluriel(n, un, plusieurs) { return n + ' ' + (n > 1 ? (plusieurs || un + 's') : un); }
  function pourcent(n, total) { return total ? Math.round(100 * n / total) + ' %' : '—'; }

  /** Nom de fichier sans caractères interdits par Windows. */
  function nomFichier(s) { return String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_'); }

  var collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  function comparer(a, b) { return collator.compare(String(a || ''), String(b || '')); }
  function trierEleves(a, b) {
    return comparer(a.classe, b.classe) || comparer(a.nom, b.nom) || comparer(a.prenom, b.prenom);
  }

  return {
    esc: esc, hm: hm, hm0: hm0, hhmm: hhmm, lireHeure: lireHeure, norm: norm,
    decoderTexte: decoderTexte, detecterSeparateur: detecterSeparateur, lireCSV: lireCSV, versCSV: versCSV,
    telecharger: telecharger, hasard: hasard, melanger: melanger, horodatage: horodatage,
    heureCourte: heureCourte, dateCourte: dateCourte, pluriel: pluriel, pourcent: pourcent,
    nomFichier: nomFichier, comparer: comparer, trierEleves: trierEleves
  };
})();
