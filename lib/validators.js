const { normalize } = require('./text');
const { SCREENS } = require('./auth');

const COVERAGE_SHAPES = ['cone', 'circle', 'camera'];

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
  if (!category || category.length > 100) throw new Error('Informe uma categoria válida.');
  if (!brand || brand.length > 50) throw new Error('Informe a marca (até 50 caracteres).');
  if (!model || model.length > 100) throw new Error('Informe o modelo (até 100 caracteres).');
  return { category, brand, model };
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
  const icon = normalize(request.icon);
  if (icon && !/^[a-z0-9-]{1,40}$/.test(icon)) throw new Error('Ícone inválido.');
  const provides = validateProvidesShape(request.provides);
  const requirements = validateRequirementsShape(request.requirements);
  const canBeContainer = request.canBeContainer === true;
  // Forma da área de cobertura desenhada no mapa/planta: 'cone' (setor com direção), 'circle' (360°)
  // ou 'camera' (cone com faixas de cor por densidade de pixels). Ausente/inválido = sem cobertura.
  const coverage = COVERAGE_SHAPES.includes(request.coverage) ? request.coverage : null;
  return { group, label, capacity, icon, provides, requirements, canBeContainer, coverage };
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

const AI_INSTRUCTIONS_MAX_LENGTH = 8000;

// Texto livre em várias linhas (parágrafos, lista com "-") — não usa normalize() aqui de propósito,
// pois ele colapsa toda sequência de espaço/quebra de linha numa só, o que destruiria a formatação
// da instrução. Só trim nas pontas.
function validateAiInstructionsRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const classification = String(request.classification || '').trim();
  const audit = String(request.audit || '').trim();
  if (!classification || classification.length > AI_INSTRUCTIONS_MAX_LENGTH) {
    throw new Error(`Informe a instrução de classificação (até ${AI_INSTRUCTIONS_MAX_LENGTH} caracteres).`);
  }
  if (!audit || audit.length > AI_INSTRUCTIONS_MAX_LENGTH) {
    throw new Error(`Informe a instrução de auditoria (até ${AI_INSTRUCTIONS_MAX_LENGTH} caracteres).`);
  }
  return { classification, audit };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateAuthRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const email = normalize(request.email).toLowerCase();
  const password = String(request.password || '');
  if (!email || email.length > 200 || !EMAIL_PATTERN.test(email)) throw new Error('Informe um e-mail válido.');
  if (password.length < 8 || password.length > 200) throw new Error('A senha precisa ter entre 8 e 200 caracteres.');
  return { email, password };
}

function validateEmailRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const email = normalize(request.email).toLowerCase();
  if (!email || email.length > 200 || !EMAIL_PATTERN.test(email)) throw new Error('Informe um e-mail válido.');
  return { email };
}

function validateResetRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const token = String(request.token || '');
  const password = String(request.password || '');
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Link inválido ou expirado.');
  if (password.length < 8 || password.length > 200) throw new Error('A senha precisa ter entre 8 e 200 caracteres.');
  return { token, password };
}

const USER_ROLES = ['user', 'admin'];

// Admin editando outra conta (cadastro de usuários) — todo campo é opcional, só entra no patch o
// que veio no corpo. Senha em texto puro aqui (server.js faz o hash antes de gravar); nunca aceita
// passwordHash pronto vindo do cliente.
const AVATAR_MAX_CHARS = 200_000;
const AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

function validateUserUpdateRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const result = {};
  if (request.name !== undefined) {
    const name = normalize(request.name);
    if (name.length > 150) throw new Error('Nome muito longo (até 150 caracteres).');
    result.name = name || null;
  }
  if (request.email !== undefined) {
    const email = normalize(request.email).toLowerCase();
    if (!email || email.length > 200 || !EMAIL_PATTERN.test(email)) throw new Error('Informe um e-mail válido.');
    result.email = email;
  }
  if (request.password !== undefined && request.password !== '') {
    const password = String(request.password);
    if (password.length < 8 || password.length > 200) throw new Error('A senha precisa ter entre 8 e 200 caracteres.');
    result.password = password;
  }
  if (request.role !== undefined) {
    if (!USER_ROLES.includes(request.role)) throw new Error('Papel de usuário inválido.');
    result.role = request.role;
  }
  if (request.screens !== undefined) {
    if (!Array.isArray(request.screens) || request.screens.some((s) => !SCREENS.includes(s))) throw new Error('Lista de telas inválida.');
    result.screens = [...new Set(request.screens)];
  }
  // Foto do usuário: data URL pequena (o front já reduz pra 128px) guardada no próprio documento —
  // null remove. Só png/jpeg/webp em base64, nada de SVG (pode carregar script).
  if (request.avatar !== undefined) {
    if (request.avatar === null || request.avatar === '') result.avatar = null;
    else if (typeof request.avatar !== 'string' || request.avatar.length > AVATAR_MAX_CHARS || !AVATAR_PATTERN.test(request.avatar)) throw new Error('Foto inválida (use PNG, JPG ou WEBP pequena).');
    else result.avatar = request.avatar;
  }
  return result;
}

// Etapas do orçamento: aberto (consultor monta o fluxo no canvas, sem endereço ainda) -> negociação
// (endereço definido e orçamento salvo de novo) -> fechado (concluído). A ordem aqui é só
// documentação — o servidor não impede pular etapa, quem decide a transição é o botão que o
// consultor clicou na tela (ver useBudget.js: save/finalize).
const BUDGET_STATUSES = ['aberto', 'negociacao', 'fechado'];

function validateSetAddressRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const clientName = normalize(request.clientName);
  const address = normalize(request.address);
  const number = normalize(request.number);
  if (!clientName || clientName.length > 150) throw new Error('Informe o nome do cliente (até 150 caracteres).');
  if (!address || address.length > 300) throw new Error('Informe o endereço do cliente (até 300 caracteres).');
  // Número do local separado do resto do endereço — sem ele a geocodificação erra pro lado errado
  // da rua/quadra com frequência (fica só na aproximação do logradouro).
  if (!number || number.length > 20) throw new Error('Informe o número do local (até 20 caracteres).');
  return { clientName, address, number };
}

// Shape leniente (sem regra de negócio) — items/positions/connections/mapLayout são o mesmo
// blob que hoje já é gravado no localStorage por useBudget.js; aqui só garantimos os tipos.
function validateBudgetSaveRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const result = {};
  if (request.items !== undefined) {
    if (!Array.isArray(request.items)) throw new Error('Itens do orçamento inválidos.');
    if (request.items.length > 200) throw new Error('Limite de 200 itens por orçamento.');
    result.items = request.items;
  }
  if (request.positions !== undefined) {
    if (typeof request.positions !== 'object' || Array.isArray(request.positions)) throw new Error('Posições do canvas inválidas.');
    result.positions = request.positions;
  }
  if (request.connections !== undefined) {
    if (!Array.isArray(request.connections)) throw new Error('Conexões do canvas inválidas.');
    result.connections = request.connections;
  }
  if (request.mapLayout !== undefined) {
    if (typeof request.mapLayout !== 'object' || Array.isArray(request.mapLayout)) throw new Error('Layout do mapa inválido.');
    result.mapLayout = request.mapLayout;
  }
  if (request.floorPlanLayout !== undefined) {
    if (typeof request.floorPlanLayout !== 'object' || Array.isArray(request.floorPlanLayout)) throw new Error('Layout da planta baixa inválido.');
    result.floorPlanLayout = request.floorPlanLayout;
  }
  if (request.status !== undefined) {
    if (!BUDGET_STATUSES.includes(request.status)) throw new Error('Etapa de orçamento inválida.');
    result.status = request.status;
  }
  return result;
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
  validateAiInstructionsRequest,
  validateAuthRequest, validateEmailRequest, validateResetRequest,
  validateUserUpdateRequest,
  validateSetAddressRequest,
  validateBudgetSaveRequest,
  BUDGET_STATUSES,
  COVERAGE_SHAPES,
};
