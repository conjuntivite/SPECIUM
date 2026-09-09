const { normalize, normalizeForComparison } = require('./text');
const { parseCsv, toCsv } = require('./csv');
const { validateProductRequest } = require('./validators');

const MAX_IMPORT_ROWS = 500;
const TEMPLATE_HEADER = ['Categoria (codigo)', 'Marca', 'Modelo', 'Icone (opcional)', '', 'Codigo', 'Grupo', 'Categoria'];

// A planilha traz, do lado das colunas de preenchimento (A-D), a lista de categorias numerada
// (colunas F-H) — o usuário digita só o código (coluna A) em vez do nome inteiro da categoria, o que
// elimina erro de digitação. Código é a posição da categoria nessa mesma lista (1, 2, 3...), gerada
// na hora a partir do cadastro atual — não é um campo salvo em lugar nenhum, só existe dentro do CSV.
//
// Linha de exemplo usa o código "0", que nunca existe de propósito: se o usuário esquecer de
// apagar/editar essa linha antes de subir a planilha, a importação recusa com um erro que já explica
// o que fazer, em vez de silenciosamente virar um produto "Modelo-Exemplo" de verdade.
function buildProductTemplateCsv(categories) {
  const legend = categories.map((c, i) => [String(i + 1), c.group, c.label]);
  const rows = [TEMPLATE_HEADER];
  const rowCount = Math.max(legend.length, 1);
  for (let i = 0; i < rowCount; i++) {
    const front = i === 0 ? ['0', 'Intelbras', 'Modelo-Exemplo', ''] : ['', '', '', ''];
    const back = legend[i] || ['', '', ''];
    rows.push([...front, '', ...back]);
  }
  return toCsv(rows);
}

// Aceita tanto o código numérico da legenda (preferido, gerado na mesma ordem de buildProductTemplateCsv)
// quanto o nome da categoria por extenso (compat — sem diferenciar maiúscula/acento), caso o usuário
// prefira digitar o nome mesmo com a legenda disponível.
function resolveCategory(rawValue, categories) {
  const clean = normalize(rawValue);
  if (!clean) return null;
  if (/^\d+$/.test(clean)) return categories[Number(clean) - 1]?.value || null;
  const match = categories.find((c) => normalizeForComparison(c.label) === normalizeForComparison(clean));
  return match?.value || null;
}

// Colunas são lidas por POSIÇÃO (mesma ordem de TEMPLATE_HEADER), não por nome de cabeçalho: só pula
// a 1ª linha, então não quebra se o usuário editar o texto do cabeçalho. "É linha de dado" olha só as
// colunas A-C (categoria/marca/modelo) — as colunas F-H (legenda de categorias) não contam, senão toda
// linha da legenda que sobrar além dos produtos preenchidos viraria um erro de "categoria vazia".
function parseProductImportCsv(csvText, categories) {
  const rows = parseCsv(csvText);
  const dataRows = rows.slice(1).filter((cols) => normalize(cols[0]) || normalize(cols[1]) || normalize(cols[2]));
  if (!dataRows.length) throw new Error('A planilha está vazia.');
  if (dataRows.length > MAX_IMPORT_ROWS) throw new Error(`Limite de ${MAX_IMPORT_ROWS} produtos por importação.`);

  const products = [];
  const errors = [];
  dataRows.forEach((cols, index) => {
    const line = index + 2; // linha 1 é o cabeçalho
    const [rawCategory, rawBrand, rawModel, rawIcon] = cols;
    const categoryInput = normalize(rawCategory);
    const categoryValue = resolveCategory(categoryInput, categories);
    if (!categoryValue) {
      errors.push({
        line,
        message: /^\d+$/.test(categoryInput)
          ? `Código de categoria "${categoryInput}" não encontrado. Confira a lista de categorias na planilha (colunas Código/Categoria).`
          : `Categoria "${categoryInput}" não encontrada. Use o código da lista de categorias na planilha.`,
      });
      return;
    }
    try {
      products.push(validateProductRequest({ category: categoryValue, brand: rawBrand, model: rawModel, icon: rawIcon }));
    } catch (error) {
      errors.push({ line, message: error.message });
    }
  });
  return { products, errors };
}

module.exports = { buildProductTemplateCsv, parseProductImportCsv, MAX_IMPORT_ROWS };
