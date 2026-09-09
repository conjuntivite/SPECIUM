// CSV minimalista compatível com o que o Excel (pt-BR) lê e grava: separador ";", aspas duplas
// escapando aspas duplas dobradas, BOM UTF-8 na saída (senão o Excel abre acento errado). Não é um
// parser RFC4180 completo — campo entre aspas com quebra de linha não é suportado, mas marca/modelo
// de produto nunca tem quebra de linha, então não vale a complexidade extra.
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      cells.push(cur); cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function parseCsv(text) {
  return String(text || '')
    .replace(/^﻿/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.length)
    .map(parseCsvLine);
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(rows) {
  return `﻿${rows.map((row) => row.map(csvEscape).join(';')).join('\r\n')}`;
}

module.exports = { parseCsv, toCsv };
