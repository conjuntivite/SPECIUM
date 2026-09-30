// Memória de classificação: guarda o que a IA respondeu para cada item (pelo código do produto no
// SERVICE) e reaproveita quando o mesmo item aparece de novo, sem chamar a IA. Uma resposta só
// passa a valer depois de MIN_VOTES acertos iguais — um erro isolado da IA nunca vira regra fixa.
// Produto cadastrado (aba Produtos) continua mandando por cima disso (applyRegisteredProductOverrides).

const MIN_VOTES = 2;

// Linha de serviço de instalação ("INSTALAÇÃO DE ...", "INST CONTROLE ACESSO ..."): não é equipamento.
const INSTALLATION_NAME = /\bINST(ALA|\b)/i;

const ROW = /^\s*(\d{4,7})\s+(\d+(?:[.,]\d+)?)\s+(.+?)\s*$/;

// Linhas de equipamento do PDF (layout do SERVICE: "código qtdade nome"). O nome pode quebrar em
// várias linhas no PDF, por isso só a primeira linha entra aqui — serve de conferência da chave.
function parseQuoteRows(pdfText) {
  return pdfText.split('\n').flatMap((line) => {
    const match = line.match(ROW);
    if (!match || INSTALLATION_NAME.test(line)) return [];
    const quantity = Math.max(1, Math.trunc(Number(match[2].replace(',', '.'))) || 1);
    return [{ code: match[1], quantity, firstLine: match[3] }];
  });
}

// Divide o texto em lotes de `rowsPerChunk` linhas de item. Só corta ANTES de uma linha de item, então a
// continuação do nome (linhas soltas que vêm depois) fica sempre junto da sua linha. Lote menor = resposta
// menor da IA, que omite bem menos itens do que numa lista de 50+ (medido: 42 de 53 itens).
function chunkQuoteText(pdfText, rowsPerChunk) {
  const chunks = [];
  let current = [];
  let rows = 0;
  for (const line of pdfText.split('\n')) {
    const startsRow = /^\s*\d{4,7}\s+\d/.test(line);
    if (startsRow && rows >= rowsPerChunk) { chunks.push(current.join('\n')); current = []; rows = 0; }
    if (startsRow) rows++;
    current.push(line);
  }
  chunks.push(current.join('\n'));
  return chunks;
}

const rowKey = (row) => `${row.code}|${row.firstLine}`;

// docs: [{ code, firstLine, category, count, name }] — um doc por (código, primeira linha, categoria).
// Devolve Map(chave -> { category, name }) só das chaves confiáveis: uma única categoria com >= MIN_VOTES.
function buildMemoryIndex(docs) {
  const byKey = new Map();
  for (const doc of docs) {
    const key = rowKey(doc);
    (byKey.get(key) || byKey.set(key, []).get(key)).push(doc);
  }
  const index = new Map();
  for (const [key, group] of byKey) {
    if (group.length === 1 && group[0].count >= MIN_VOTES) index.set(key, { category: group[0].category, name: group[0].name });
  }
  return index;
}

module.exports = { chunkQuoteText, parseQuoteRows, buildMemoryIndex, rowKey, INSTALLATION_NAME, MIN_VOTES };
