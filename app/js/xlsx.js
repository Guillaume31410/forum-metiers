/* =====================================================================
   xlsx.js — lecture et écriture de fichiers Excel (.xlsx) sans bibliothèque
   externe. Un fichier .xlsx est une archive ZIP contenant du XML :
   - lecture : on décompresse avec DecompressionStream (intégré aux
     navigateurs récents) et on lit le XML avec DOMParser ;
   - écriture : on fabrique le XML et une archive ZIP non compressée,
     parfaitement acceptée par Excel et LibreOffice.
   ===================================================================== */
var FM = window.FM = window.FM || {};

FM.xlsx = (function () {
  'use strict';

  /* ---------------- ZIP : CRC32 ---------------- */
  var TABLE_CRC = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(octets) {
    var c = 0xFFFFFFFF, i;
    for (i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------------- ZIP : écriture (sans compression) ---------------- */
  function creerZip(fichiers) {   // fichiers : [{nom, contenu (string)}]
    var enc = new TextEncoder(), morceaux = [], central = [], position = 0;
    fichiers.forEach(function (f) {
      var nom = enc.encode(f.nom), data = enc.encode(f.contenu), crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, nom.length, true); local.setUint16(28, 0, true);
      morceaux.push(new Uint8Array(local.buffer), nom, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, nom.length, true); c.setUint32(42, position, true);
      central.push(new Uint8Array(c.buffer), nom);
      position += 30 + nom.length + data.length;
    });
    var tailleCentral = central.reduce(function (s, m) { return s + m.length; }, 0);
    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true); fin.setUint32(16, position, true);
    return new Blob(morceaux.concat(central, [new Uint8Array(fin.buffer)]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------------- ZIP : lecture ---------------- */
  async function decompresser(octets) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Ce navigateur est trop ancien pour lire les fichiers Excel. Utilisez Edge, Chrome ou Firefox à jour, ou enregistrez le fichier en CSV.');
    }
    var flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  async function lireZip(buffer) {
    var o = new Uint8Array(buffer), v = new DataView(buffer), i, fin = -1, fichiers = {};
    for (i = o.length - 22; i >= Math.max(0, o.length - 70000); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error("Ce fichier n'est pas un fichier Excel (.xlsx) valide.");
    var nb = v.getUint16(fin + 10, true), p = v.getUint32(fin + 16, true), dec = new TextDecoder();
    for (i = 0; i < nb; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      var methode = v.getUint16(p + 10, true), tailleC = v.getUint32(p + 20, true);
      var lgNom = v.getUint16(p + 28, true), lgExtra = v.getUint16(p + 30, true), lgCom = v.getUint16(p + 32, true);
      var offset = v.getUint32(p + 42, true);
      var nom = dec.decode(o.subarray(p + 46, p + 46 + lgNom));
      fichiers[nom] = { methode: methode, taille: tailleC, offset: offset };
      p += 46 + lgNom + lgExtra + lgCom;
    }
    return {
      noms: Object.keys(fichiers),
      lire: async function (nom) {
        var f = fichiers[nom];
        if (!f) return null;
        var debut = f.offset + 30 + v.getUint16(f.offset + 26, true) + v.getUint16(f.offset + 28, true);
        var brut = o.subarray(debut, debut + f.taille);
        var data = f.methode === 0 ? brut : await decompresser(brut);
        return new TextDecoder().decode(data);
      }
    };
  }

  /* ---------------- Lecture d'un classeur ---------------- */
  function xml(texte) { return new DOMParser().parseFromString(texte, 'application/xml'); }
  function tous(noeud, nom) { return Array.prototype.slice.call(noeud.getElementsByTagNameNS('*', nom)); }
  function texteDe(noeud) { return tous(noeud, 't').map(function (t) { return t.textContent; }).join(''); }
  function colonne(ref) {   // "C12" → 2
    var m = /^([A-Z]+)/.exec(ref || ''), n = 0, i;
    if (!m) return -1;
    for (i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  /** Lit un .xlsx → [{nom, lignes: [[texte, ...], ...]}] (une entrée par feuille). */
  async function lire(buffer) {
    var zip = await lireZip(buffer);
    var wb = xml(await zip.lire('xl/workbook.xml') || '');
    var relsTxt = await zip.lire('xl/_rels/workbook.xml.rels');
    var cibles = {};
    if (relsTxt) tous(xml(relsTxt), 'Relationship').forEach(function (r) {
      var t = r.getAttribute('Target');
      t = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t;
      cibles[r.getAttribute('Id')] = t;
    });
    var partages = [], ssTxt = await zip.lire('xl/sharedStrings.xml');
    if (ssTxt) partages = tous(xml(ssTxt), 'si').map(function (si) {
      return tous(si, 't').filter(function (t) { return t.parentNode.localName !== 'rPh'; })
        .map(function (t) { return t.textContent; }).join('');
    });
    var feuilles = [], defs = tous(wb, 'sheet');
    for (var k = 0; k < defs.length; k++) {
      var s = defs[k];
      var id = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      var chemin = cibles[id] || ('xl/worksheets/sheet' + (k + 1) + '.xml');
      var contenu = await zip.lire(chemin);
      if (!contenu) continue;
      var lignes = [];
      tous(xml(contenu), 'row').forEach(function (row, iRow) {
        var nr = parseInt(row.getAttribute('r'), 10);
        nr = isNaN(nr) ? iRow : nr - 1;
        var ligne = [], idx = 0;
        tous(row, 'c').forEach(function (c) {
          var col = colonne(c.getAttribute('r'));
          if (col < 0) col = idx;
          idx = col + 1;
          var type = c.getAttribute('t'), vNoeud = tous(c, 'v')[0], val = vNoeud ? vNoeud.textContent : '';
          if (type === 's') val = partages[parseInt(val, 10)] || '';
          else if (type === 'inlineStr') val = texteDe(c);
          else if (type === 'b') val = val === '1' ? 'VRAI' : 'FAUX';
          else if (type === 'e') val = '';
          else if (type !== 'str' && val !== '' && !isNaN(Number(val))) {
            var n = Number(val);
            val = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(n);
          }
          ligne[col] = String(val).trim();
        });
        for (var j = 0; j < ligne.length; j++) if (ligne[j] === undefined) ligne[j] = '';
        lignes[nr] = ligne;
      });
      lignes = Array.prototype.slice.call(lignes).map(function (l) { return l || []; })
        .filter(function (l) { return l.some(function (x) { return x !== ''; }); });
      feuilles.push({ nom: s.getAttribute('name'), lignes: lignes });
    }
    return feuilles;
  }

  /* ---------------- Écriture d'un classeur ---------------- */
  function x(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  function lettre(n) {   // 0 → "A"
    var s = ''; n++;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function nomFeuille(nom, pris) {
    var base = String(nom).replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31) || 'Feuille', n = base, i = 2;
    while (pris[n.toLowerCase()]) { n = base.slice(0, 28) + ' ' + i++; }
    pris[n.toLowerCase()] = true;
    return n;
  }

  // Styles : 0 normal · 1 en-tête (gras, fond, bordure) · 2 gras · 3 case à remplir (bordure) · 4 texte à la ligne
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E8E6"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFB4B4B4"/></left><right style="thin"><color rgb="FFB4B4B4"/></right>' +
    '<top style="thin"><color rgb="FFB4B4B4"/></top><bottom style="thin"><color rgb="FFB4B4B4"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  var STYLE_NOMS = { entete: 1, gras: 2, saisie: 3, cadre: 4 };

  function celluleXML(ref, cel) {
    var v = cel, style = 0;
    if (cel && typeof cel === 'object') { v = cel.v; style = STYLE_NOMS[cel.style] || 0; }
    var s = style ? ' s="' + style + '"' : '';
    if (v === null || v === undefined || v === '') return style ? '<c r="' + ref + '"' + s + '/>' : '';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
  }

  function feuilleXML(f) {
    var nbCol = f.lignes.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
    var nbLig = Math.max(1, f.lignes.length);
    var out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + lettre(nbCol - 1) + nbLig + '"/>';
    out += '<sheetViews><sheetView workbookViewId="0">';
    if (f.figer) {
      var fc = f.figer.colonnes || 0, fl = f.figer.lignes || 0;
      out += '<pane' + (fc ? ' xSplit="' + fc + '"' : '') + (fl ? ' ySplit="' + fl + '"' : '') +
        ' topLeftCell="' + lettre(fc) + (fl + 1) + '" activePane="' + (fc && fl ? 'bottomRight' : fl ? 'bottomLeft' : 'topRight') + '" state="frozen"/>';
    }
    out += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    if (f.largeurs && f.largeurs.length) {
      out += '<cols>' + f.largeurs.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>';
    }
    out += '<sheetData>';
    f.lignes.forEach(function (l, i) {
      var cellules = l.map(function (c, j) { return celluleXML(lettre(j) + (i + 1), c); }).join('');
      var ht = f.hauteurs && f.hauteurs[i] ? ' ht="' + f.hauteurs[i] + '" customHeight="1"' : '';
      out += '<row r="' + (i + 1) + '"' + ht + '>' + cellules + '</row>';
    });
    out += '</sheetData>';
    if (f.filtre) out += '<autoFilter ref="A1:' + lettre(nbCol - 1) + nbLig + '"/>';
    if (f.validations && f.validations.length) {
      out += '<dataValidations count="' + f.validations.length + '">' + f.validations.map(function (val) {
        return '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="' + (val.sansErreur ? '0' : '1') + '"' +
          ' errorTitle="Valeur non prévue" error="' + x(val.erreur || 'Choisissez une valeur dans la liste.') + '"' +
          ' sqref="' + val.plage + '"><formula1>' + x(val.formule) + '</formula1></dataValidation>';
      }).join('') + '</dataValidations>';
    }
    out += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
    if (f.paysage) out += '<pageSetup paperSize="9" orientation="landscape"/>';
    return out + '</worksheet>';
  }

  /**
   * Écrit un classeur. feuilles : [{nom, lignes:[[valeur ou {v, style}]], largeurs:[…],
   *   figer:{lignes, colonnes}, filtre:bool, validations:[{plage, formule}], paysage:bool}]
   * Renvoie un Blob .xlsx.
   */
  function ecrire(feuilles) {
    var pris = {}, noms = feuilles.map(function (f) { return nomFeuille(f.nom, pris); });
    var fichiers = [];
    fichiers.push({ nom: '[Content_Types].xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      noms.map(function (n, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') + '</Types>' });
    fichiers.push({ nom: '_rels/.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>' });
    var noms_definis = '';
    feuilles.forEach(function (f, i) {
      if (!f.filtre) return;
      var nbCol = f.lignes.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
      noms_definis += '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' +
        x(noms[i].replace(/'/g, "''")) + '\'!$A$1:$' + lettre(nbCol - 1) + '$' + Math.max(1, f.lignes.length) + '</definedName>';
    });
    fichiers.push({ nom: 'xl/workbook.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView/></bookViews><sheets>' +
      noms.map(function (n, i) { return '<sheet name="' + x(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets>' + (noms_definis ? '<definedNames>' + noms_definis + '</definedNames>' : '') + '</workbook>' });
    fichiers.push({ nom: 'xl/_rels/workbook.xml.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      noms.map(function (n, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (noms.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>' });
    fichiers.push({ nom: 'xl/styles.xml', contenu: STYLES });
    feuilles.forEach(function (f, i) { fichiers.push({ nom: 'xl/worksheets/sheet' + (i + 1) + '.xml', contenu: feuilleXML(f) }); });
    return creerZip(fichiers);
  }

  return { lire: lire, ecrire: ecrire, lettre: lettre };
})();
