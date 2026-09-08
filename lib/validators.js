const { normalize } = require('./text');

function validateSearchRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const item_name = normalize(request.item_name);
  const brand = normalize(request.brand);
  const model = normalize(request.model);
  if (item_name.length < 2 || item_name.length > 100) throw new Error('Informe um produto com 2 a 100 caracteres.');
  if (brand.length > 50 || model.length > 100) throw new Error('Marca ou modelo excede o tamanho permitido.');
  return { item_name, brand, model, query: [item_name, brand, model].filter(Boolean).join(' ') };
}

function validateCompareRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const items = Array.isArray(request.items) ? request.items.filter((item) => item && typeof item === 'object' && normalize(item.title)) : [];
  if (items.length < 2 || items.length > 3) throw new Error('Selecione de 2 a 3 produtos para comparar.');
  return items.map((item) => ({ url: normalize(item.url), title: normalize(item.title) }));
}

function validateRecipeItems(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const rawItems = Array.isArray(request.items) ? request.items : [];
  const items = rawItems.map((item) => {
    const title = normalize(typeof item === 'string' ? item : item?.title);
    if (!title) return null;
    const rawQuantity = Math.trunc(Number(typeof item === 'string' ? 1 : item?.quantity));
    return { title, quantity: Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1 };
  }).filter(Boolean);
  if (!items.length) throw new Error('Informe ao menos um item no orçamento.');
  if (items.length > 50) throw new Error('Limite de 50 itens por orçamento.');
  return items;
}

function validateRecipePriceItems(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const items = Array.isArray(request.items) ? request.items : [];
  const parsed = items
    .map((item) => ({ label: normalize(item?.label) || normalize(item?.search_term), search_term: normalize(item?.search_term) }))
    .filter((item) => item.search_term);
  if (!parsed.length) throw new Error('Informe ao menos um item para verificar preço.');
  if (parsed.length > 20) throw new Error('Limite de 20 itens por verificação de preço.');
  return parsed;
}

function validateProductRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const category = normalize(request.category);
  const brand = normalize(request.brand);
  const model = normalize(request.model);
  const icon = normalize(request.icon);
  if (!category || category.length > 100) throw new Error('Informe uma categoria válida.');
  if (!brand || brand.length > 50) throw new Error('Informe a marca (até 50 caracteres).');
  if (!model || model.length > 100) throw new Error('Informe o modelo (até 100 caracteres).');
  if (icon && !/^[a-z0-9-]{1,40}$/.test(icon)) throw new Error('Ícone inválido.');
  return { category, brand, model, icon };
}

// provides: [{ resource, amount }] — quanto desse recurso uma unidade desta categoria fornece (ex.:
// Switch PoE Giga 16 Portas fornece 16 de `network.gigabit_port` e 16 de `power.poe_port`).
// requirements: [{ id, label, critical, type: 'presence'|'capacity', ... } | { type: 'anyOf', options: [...] }]
// — o que uma unidade desta categoria exige. Validação aqui é só de forma (shape); sanitização fina
// (dedupe, limites) fica em db.js. Ver categoryResourceSeed.js e SPEC.md ("Motor de recursos e
// capacidade") pro racional — ambos são opcionais aqui (undefined = chamador não enviou o campo).
function validateProvidesShape(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('Recursos fornecidos inválidos.');
  if (raw.length > 20) throw new Error('Limite de 20 recursos fornecidos por categoria.');
  return raw.map((entry) => {
    const resource = normalize(entry?.resource);
    if (!resource) throw new Error('Cada recurso fornecido precisa de um identificador.');
    return { resource, amount: entry?.amount };
  });
}

function validateRequirementOptionShape(raw) {
  if (raw?.type === 'capacity') {
    const resource = normalize(raw?.resource);
    if (!resource) throw new Error('Requisito de capacidade precisa de um recurso.');
    return { type: 'capacity', resource, unitsPerItem: raw?.unitsPerItem };
  }
  const candidates = Array.isArray(raw?.candidates) ? raw.candidates.map((v) => normalize(v)).filter(Boolean) : [];
  if (!candidates.length) throw new Error('Requisito de presença precisa de ao menos uma categoria candidata.');
  return { type: 'presence', candidates };
}

function validateRequirementsShape(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('Requisitos inválidos.');
  if (raw.length > 30) throw new Error('Limite de 30 requisitos por categoria.');
  return raw.map((req) => {
    const id = normalize(req?.id);
    const label = normalize(req?.label);
    if (!id || !label) throw new Error('Cada requisito precisa de id e rótulo.');
    const critical = !!req?.critical;
    if (req?.type === 'anyOf') {
      const options = Array.isArray(req.options) ? req.options.map(validateRequirementOptionShape) : [];
      if (options.length < 2) throw new Error('Requisito "qualquer um" precisa de ao menos 2 opções.');
      return { id, label, type: 'anyOf', critical, options };
    }
    return { id, label, critical, ...validateRequirementOptionShape(req) };
  });
}

// capacity: opcional — quantas unidades de outra coisa uma unidade DESTA categoria comporta (portas
// de switch, canais de DVR/NVR). Ausente/0 = categoria sem noção de capacidade. Campo legado,
// mantido pelo cadastro atual; não confundir com `provides`, que é o mesmo conceito só que por
// recurso nomeado (ver acima).
function validateCategoryRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const group = normalize(request.group);
  const label = normalize(request.label);
  if (!group || group.length > 60) throw new Error('Informe um grupo válido (até 60 caracteres).');
  if (!label || label.length > 100) throw new Error('Informe um nome de categoria válido (até 100 caracteres).');
  const rawCapacity = Number(request.capacity);
  const capacity = Number.isFinite(rawCapacity) && rawCapacity > 0 ? Math.trunc(rawCapacity) : null;
  const provides = validateProvidesShape(request.provides);
  const requirements = validateRequirementsShape(request.requirements);
  const canBeContainer = request.canBeContainer === true;
  return { group, label, capacity, provides, requirements, canBeContainer };
}

// key: identificador técnico gravado em provides[].resource/requirements[].resource (ex.:
// "network.gigabit_port") — letras/números/ponto/underscore, mesmo formato usado por
// categoryResourceSeed.js. label: nome amigável mostrado nos seletores de recurso.
function validateResourceRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const key = normalize(request.key).toLowerCase();
  const label = normalize(request.label);
  if (!key || key.length > 100 || !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(key)) {
    throw new Error('Informe uma chave válida (ex: network.gigabit_port — letras, números, ponto e underscore, começando com letra).');
  }
  if (!label || label.length > 100) throw new Error('Informe um nome para o recurso (até 100 caracteres).');
  return { key, label };
}

module.exports = {
  validateSearchRequest,
  validateCompareRequest,
  validateRecipeItems,
  validateRecipePriceItems,
  validateProductRequest,
  validateProvidesShape,
  validateRequirementOptionShape,
  validateRequirementsShape,
  validateCategoryRequest,
  validateResourceRequest,
};
