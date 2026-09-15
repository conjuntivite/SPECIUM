const { normalize } = require('./text');
const { detectExactCategory } = require('./specs');

function buildDependencyReason(anchorLabel, depLabel, critical, hasAlternatives) {
  if (critical && hasAlternatives) return `${anchorLabel} precisa de ${depLabel} ou de uma das alternativas para funcionar.`;
  if (critical) return `${anchorLabel} não funciona sem ${depLabel}.`;
  return `Recomendado para ${anchorLabel}.`;
}

// --- Motor de recursos/capacidade -----------------------------------------------------------
// Único motor de sugestões (o antigo motor de dependencies[] foi removido — ver SPEC.md/histórico
// de commits): toda categoria-âncora usa `requirements[]`/`provides[]`. Ver SPEC.md ("Motor de
// recursos e capacidade") e arquitetura_motor_regras_capacidade_comprador_inviolavel.txt (enviado
// pelo usuário) para o racional completo.
//
// A demanda de um recurso (ex.: `network.gigabit_port`) é somada uma vez só, GLOBALMENTE, entre
// todas as categorias-âncora presentes no orçamento que o exigem — não por âncora — porque duas
// categorias diferentes (ex.: Câmera IP e Câmera IP PoE) podem consumir o mesmo recurso ao mesmo
// tempo, e um mesmo equipamento (Switch PoE) pode fornecer mais de um recurso simultaneamente
// (portas Gigabit + portas PoE). Sem esse ledger global, a mesma capacidade seria contada errado.

// Soma a quantidade de itens do carrinho por categoria exata (não por título) — dois itens
// diferentes da mesma categoria (raro, mas possível) somam a mesma demanda/oferta.
function sumCategoryQuantities(detectedByItem) {
  const totals = new Map();
  for (const { category, quantity } of detectedByItem) {
    if (!category) continue;
    totals.set(category.value, (totals.get(category.value) || 0) + quantity);
  }
  return totals;
}

function pushBreakdown(breakdown, key, entry) {
  const list = breakdown.get(key);
  if (list) list.push(entry); else breakdown.set(key, [entry]);
}

// `breakdown` (Map<resource, [{category, label, quantity, amount, subtotal}]>) explica o `have`
// abrindo por equipamento — sem isso o card de sugestão só sabe o total, não quem fornece — pedido
// pra detalhar "o que já tenho instalado" ao clicar num achado do motor de regras.
function buildSupplyLedger(categoryTotals, byValue) {
  const supply = new Map();
  const breakdown = new Map();
  for (const [value, quantity] of categoryTotals) {
    const category = byValue.get(value);
    for (const p of category?.provides || []) {
      supply.set(p.resource, (supply.get(p.resource) || 0) + p.amount * quantity);
      pushBreakdown(breakdown, p.resource, { category: value, label: category.label, quantity, amount: p.amount, subtotal: p.amount * quantity });
    }
  }
  return { supply, breakdown };
}

// Demanda também é global por recurso: soma unitsPerItem * quantidade de TODA categoria-âncora
// presente que exija aquele recurso (via requisito de capacidade OU opção de capacidade dentro de
// um anyOf), não só da âncora que estiver sendo avaliada no momento. `breakdown` explica o `need`
// abrindo por âncora, mesmo espírito do `breakdown` de buildSupplyLedger.
function buildDemandLedger(categoryTotals, byValue) {
  const demand = new Map();
  const breakdown = new Map();
  const add = (resource, unitsPerItem, value, label, quantity) => {
    demand.set(resource, (demand.get(resource) || 0) + unitsPerItem * quantity);
    pushBreakdown(breakdown, resource, { category: value, label, quantity, unitsPerItem, subtotal: unitsPerItem * quantity });
  };
  for (const [value, quantity] of categoryTotals) {
    const category = byValue.get(value);
    for (const req of category?.requirements || []) {
      if (req.type === 'capacity') add(req.resource, req.unitsPerItem, value, category.label, quantity);
      else if (req.type === 'anyOf') {
        for (const option of req.options) {
          if (option.type === 'capacity') add(option.resource, option.unitsPerItem, value, category.label, quantity);
        }
      }
    }
  }
  return { demand, breakdown };
}

// Categorias candidatas pra resolver um déficit de um recurso — usadas tanto no `missing` quanto no
// ProductPickerDialog do front (prompt.categories), que já sabe mostrar produto por categoria quando
// há mais de uma opção. Prioriza quem também cobre OUTRO recurso ainda em déficit no orçamento atual
// (ex.: Câmera IP PoE precisando de Conectividade Gigabit E Alimentação PoE ao mesmo tempo — um
// Switch PoE Giga resolve as duas sozinho, então ele fica na frente de um Switch Giga comum tanto na
// sugestão de conectividade quanto na de alimentação, em vez do sistema empurrar dois switches
// diferentes pro carrinho). Dentro do mesmo placar, ordena da menor pra maior capacidade (sugestão
// "mais enxuta" primeiro, sem obrigar o comercial a escolher ela — ver seção 16 do documento de
// arquitetura).
function candidateCategoriesForResource(resource, categories, deficitResources = new Set()) {
  const jointDeficitScore = (c) =>
    (c.provides || []).filter((p) => p.resource !== resource && deficitResources.has(p.resource)).length;
  return categories
    .filter((c) => (c.provides || []).some((p) => p.resource === resource))
    .sort((a, b) => {
      const scoreDiff = jointDeficitScore(b) - jointDeficitScore(a);
      if (scoreDiff) return scoreDiff;
      return a.provides.find((p) => p.resource === resource).amount - b.provides.find((p) => p.resource === resource).amount;
    })
    .map((c) => c.value);
}

function isPresenceSatisfied(candidates, categoryTotals) {
  return candidates.some((value) => categoryTotals.has(value));
}

function satisfyingCategory(candidates, categoryTotals) {
  return candidates.find((value) => categoryTotals.has(value)) || null;
}

// Ledger global de requisitos `presence`, no mesmo espírito do buildDemandLedger/buildSupplyLedger
// de `capacity` — sem isso, um requisito de presença fica "satisfeito" assim que existe 1 unidade do
// candidato em QUALQUER lugar do orçamento, não importa quantas âncoras (ex.: 2 NVR) o exijam ao
// mesmo tempo, nem quando duas âncoras diferentes (DVR e NVR) disputam a mesma unidade (ex.: 1 HD
// Interno não cobre um DVR E um NVR simultaneamente). Chave = candidatos ordenados e unidos, a mesma
// já usada em `key`/`satisfied_by` do requisito.
function buildPresenceLedger(categoryTotals, byValue) {
  const demand = new Map();
  const supply = new Map();
  const demandBreakdown = new Map();
  const supplyBreakdown = new Map();
  for (const [anchorValue, quantity] of categoryTotals) {
    const anchor = byValue.get(anchorValue);
    for (const req of anchor?.requirements || []) {
      if (req.type !== 'presence') continue;
      const key = req.candidates.slice().sort().join('|');
      demand.set(key, (demand.get(key) || 0) + quantity);
      pushBreakdown(demandBreakdown, key, { category: anchorValue, label: anchor.label, quantity });
      if (!supply.has(key)) {
        const candidatesPresent = req.candidates.filter((value) => categoryTotals.has(value));
        supply.set(key, candidatesPresent.reduce((sum, value) => sum + categoryTotals.get(value), 0));
        supplyBreakdown.set(key, candidatesPresent.map((value) => ({ category: value, label: byValue.get(value)?.label || value, quantity: categoryTotals.get(value) })));
      }
    }
  }
  return { demand, supply, demandBreakdown, supplyBreakdown };
}

// Avalia `requirements[]` das categorias-âncora presentes no orçamento contra o ledger global de
// oferta/demanda. Retorna o mesmo formato de `requirements_by_category`/`missing` do motor antigo
// (key/label/reason/search_term/essential/severity/satisfied_by), com dois campos a mais:
// `categories` (candidatas pro ProductPickerDialog) e, em requisitos de capacidade, `need`/`have`/
// `deficit` (números, pra reason explicar o déficit em vez de só dizer "falta").
function computeResourceRequirements(categoryTotals, categories, byValue, resourceLabelByKey) {
  const { supply, breakdown: supplyBreakdown } = buildSupplyLedger(categoryTotals, byValue);
  const { demand, breakdown: demandBreakdown } = buildDemandLedger(categoryTotals, byValue);
  // Recursos com demanda > oferta no orçamento atual, calculado uma vez pra todo o carrinho — é o
  // que candidateCategoriesForResource usa pra priorizar equipamento que resolve mais de um déficit
  // de uma vez (ver comentário lá).
  const deficitResources = new Set([...demand.keys()].filter((resource) => (demand.get(resource) || 0) > (supply.get(resource) || 0)));
  const {
    demand: presenceDemand, supply: presenceSupply,
    demandBreakdown: presenceDemandBreakdown, supplyBreakdown: presenceSupplyBreakdown,
  } = buildPresenceLedger(categoryTotals, byValue);

  const requirementsByAnchor = {};
  const missingByKey = new Map();

  for (const anchorValue of categoryTotals.keys()) {
    const anchor = byValue.get(anchorValue);
    if (!anchor?.requirements?.length) continue;
    const evaluated = [];

    for (const req of anchor.requirements) {
      if (req.type === 'presence') {
        const presenceKey = req.candidates.slice().sort().join('|');
        const need = presenceDemand.get(presenceKey) || 0;
        const have = presenceSupply.get(presenceKey) || 0;
        const deficit = Math.max(0, need - have);
        const satisfied_by = deficit ? null : satisfyingCategory(req.candidates, categoryTotals);
        evaluated.push({
          key: `presence:${presenceKey}`, label: req.label,
          reason: deficit
            ? `${req.label}: faltam ${deficit} (${need} necessário${need === 1 ? '' : 's'}, ${have} disponíve${have === 1 ? 'l' : 'is'}).`
            : buildDependencyReason(anchor.label, req.label, req.critical, false),
          search_term: req.label, essential: true,
          severity: req.critical && deficit ? 'critical' : undefined,
          satisfied_by, categories: req.candidates,
          need, have, deficit,
          demandBreakdown: presenceDemandBreakdown.get(presenceKey) || [],
          supplyBreakdown: presenceSupplyBreakdown.get(presenceKey) || [],
        });
      } else if (req.type === 'capacity') {
        const need = demand.get(req.resource) || 0;
        const have = supply.get(req.resource) || 0;
        const deficit = Math.max(0, need - have);
        evaluated.push({
          key: `resource:${req.resource}`, label: req.label,
          reason: deficit
            ? `${req.label}: faltam ${deficit} (${need} necessário${need === 1 ? '' : 's'}, ${have} disponíve${have === 1 ? 'l' : 'is'}).`
            : buildDependencyReason(anchor.label, req.label, req.critical, false),
          search_term: req.label, essential: true,
          severity: req.critical && deficit ? 'critical' : undefined,
          satisfied_by: deficit ? null : 'ok',
          categories: candidateCategoriesForResource(req.resource, categories, deficitResources),
          need, have, deficit,
          demandBreakdown: demandBreakdown.get(req.resource) || [],
          supplyBreakdown: supplyBreakdown.get(req.resource) || [],
        });
      } else if (req.type === 'anyOf') {
        // Cada opção do anyOf precisa do próprio rótulo (ex.: "Porta PoE" vs "Fonte 12V") — usar só
        // req.label ("Alimentação") pras duas deixava os dois cards de sugestão idênticos na tela,
        // sem jeito de saber qual opção é qual (reportado pelo usuário). Presença usa o rótulo da(s)
        // categoria(s) candidata(s); capacidade usa o rótulo do recurso (aba Recursos).
        const optionLabel = (option) => option.type === 'presence'
          ? option.candidates.map((v) => byValue.get(v)?.label || v).join(' ou ')
          : (resourceLabelByKey.get(option.resource) || option.resource);
        const optionStates = req.options.map((option) => {
          const label = optionLabel(option);
          if (option.type === 'presence') {
            const presenceKey = option.candidates.slice().sort().join('|');
            return {
              option, label, satisfied: isPresenceSatisfied(option.candidates, categoryTotals), key: `presence:${presenceKey}`, categories: option.candidates,
              demandBreakdown: presenceDemandBreakdown.get(presenceKey) || [], supplyBreakdown: presenceSupplyBreakdown.get(presenceKey) || [],
            };
          }
          const need = demand.get(option.resource) || 0;
          const have = supply.get(option.resource) || 0;
          return {
            option, label, satisfied: need > 0 && have >= need, key: `resource:${option.resource}`, categories: candidateCategoriesForResource(option.resource, categories, deficitResources), need, have,
            demandBreakdown: demandBreakdown.get(option.resource) || [], supplyBreakdown: supplyBreakdown.get(option.resource) || [],
          };
        });
        const satisfiedBySome = optionStates.some((s) => s.satisfied);
        for (const state of optionStates) {
          const satisfied_by = state.satisfied
            ? (state.option.type === 'presence' ? satisfyingCategory(state.categories, categoryTotals) : 'ok')
            : null;
          evaluated.push({
            key: state.key, label: `${req.label}: ${state.label}`,
            reason: satisfiedBySome && !state.satisfied
              ? `Alternativa para ${req.label} (${anchor.label}): ${state.label}.`
              : req.critical
                ? `${anchor.label} precisa de ${state.label} (ou de uma das alternativas de ${req.label}) para funcionar.`
                : `Recomendado para ${anchor.label}: ${state.label}.`,
            search_term: req.label, essential: true,
            severity: state.satisfied ? null : (satisfiedBySome ? 'optional' : 'critical'),
            satisfied_by, categories: state.categories,
            demandBreakdown: state.demandBreakdown, supplyBreakdown: state.supplyBreakdown,
            ...(state.option.type === 'capacity' ? { need: state.need, have: state.have } : {}),
          });
        }
      }
    }

    requirementsByAnchor[anchorValue] = evaluated;
    for (const item of evaluated) {
      const existing = missingByKey.get(item.key);
      if (!existing || (item.severity === 'critical' && existing.severity !== 'critical')) missingByKey.set(item.key, item);
    }
  }

  return { requirementsByAnchor, missingByKey };
}

// Motor de sugestões cadastrável: lê `requirements[]`/`provides[]` de cada categoria (aba
// Categorias) em vez de regras fixas em código. `cartItems`: [{title, quantity}] ou (chamadas
// antigas/testes) [string], quantidade 1 no default. `categories` entra por parâmetro pra manter a
// função pura/testável sem depender de conexão com o Mongo.
function computeCategoryMissingEssentials(cartItems, categories, resources = []) {
  const items = (Array.isArray(cartItems) ? cartItems : []).map((item) => {
    const title = normalize(typeof item === 'string' ? item : item?.title);
    const quantity = typeof item === 'string' ? 1 : Math.max(1, Math.trunc(Number(item?.quantity)) || 1);
    return title ? { title, quantity } : null;
  }).filter(Boolean);

  const byValue = new Map(categories.map((c) => [c.value, c]));
  const detectedByItem = items.map((item) => ({ ...item, category: detectExactCategory(item.title, categories) }));
  const categoryTotals = sumCategoryQuantities(detectedByItem);

  const detected_categories = [...new Set(detectedByItem.map((d) => d.category?.value).filter(Boolean))]
    .filter((value) => byValue.get(value)?.requirements?.length);

  const resourceLabelByKey = new Map(resources.map((r) => [r.key, r.label]));
  const { requirementsByAnchor, missingByKey } = computeResourceRequirements(categoryTotals, categories, byValue, resourceLabelByKey);

  const missing = [...missingByKey.values()]
    .filter((item) => !item.satisfied_by)
    .map(({ key, label, reason, search_term, essential, categories }) => ({ key, label, reason, search_term, essential, categories }));
  return { detected_categories, missing, requirements_by_category: requirementsByAnchor };
}

module.exports = { computeCategoryMissingEssentials };
