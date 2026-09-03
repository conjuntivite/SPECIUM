// Drawflow only draws cubic-bezier connections natively. Overriding its path generator gives the
// right-angle "elbow" connectors used by Supabase's Schema Visualizer, which is the look this
// budget canvas is modeled after — same (startX, startY, endX, endY, curvature, type) signature,
// curvature/type ignored since a step path doesn't need bezier control points.
if (typeof Drawflow !== 'undefined') {
  Drawflow.prototype.createCurvature = function (startX, startY, endX, endY) {
    const midX = startX + (endX - startX) / 2;
    return ` M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY} `;
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // View tabs: orçamento (canvas) x busca avançada — mutuamente exclusivos, só um <div class="tab-view">
  // fica visível por vez, para o canvas usar a tela inteira em vez de dividir espaço com a busca.
  const viewTabButtons = document.querySelectorAll('.view-tab-btn');
  const tabViews = { budget: document.getElementById('tab-budget'), search: document.getElementById('tab-search') };
  viewTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      viewTabButtons.forEach((b) => b.classList.toggle('active', b === btn));
      Object.entries(tabViews).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.tab));
    });
  });

  const form = document.getElementById('search-form');
  const itemNameInput = document.getElementById('item_name');
  const brandInput = document.getElementById('brand');
  const modelInput = document.getElementById('model');
  const providerSelect = document.getElementById('provider');
  const btnSearch = document.getElementById('btn-search');

  const loadingSection = document.getElementById('loading');
  const errorBox = document.getElementById('error-box');
  const errorMessage = document.getElementById('error-message');
  const resultsSection = document.getElementById('results-section');
  const insightBanner = document.getElementById('insight-banner');
  const insightText = document.getElementById('insight-text');
  const resultsCount = document.getElementById('results-count');
  const dealsGrid = document.getElementById('deals-grid');
  const quickTagButtons = document.querySelectorAll('.tag-btn');

  const compareBar = document.getElementById('compare-bar');
  const compareCount = document.getElementById('compare-count');
  const btnCompare = document.getElementById('btn-compare');
  const btnCompareClear = document.getElementById('btn-compare-clear');
  const compareSection = document.getElementById('compare-section');
  const compareLoading = document.getElementById('compare-loading');
  const compareTableWrap = document.getElementById('compare-table-wrap');
  const btnCompareClose = document.getElementById('btn-compare-close');

  const selectedDeals = new Map();

  function updateCompareBar() {
    const count = selectedDeals.size;
    compareCount.textContent = `${count}/3 selecionados para comparar`;
    compareBar.classList.toggle('hidden', count === 0);
    btnCompare.disabled = count < 2;
    document.querySelectorAll('.compare-checkbox').forEach((checkbox) => {
      if (!checkbox.checked) checkbox.disabled = count >= 3;
    });
  }

  function resetCompareState() {
    selectedDeals.clear();
    updateCompareBar();
    compareSection.classList.add('hidden');
    compareTableWrap.innerHTML = '';
  }

  btnCompareClear.addEventListener('click', () => {
    document.querySelectorAll('.compare-checkbox').forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.disabled = false;
    });
    selectedDeals.clear();
    updateCompareBar();
  });

  btnCompareClose.addEventListener('click', () => {
    compareSection.classList.add('hidden');
  });

  btnCompare.addEventListener('click', async () => {
    const items = [...selectedDeals.values()];
    compareSection.classList.remove('hidden');
    compareTableWrap.innerHTML = '';
    compareLoading.classList.remove('hidden');
    compareSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map((item) => ({ url: item.url, title: item.title })) }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Não foi possível comparar os produtos selecionados.');
      }
      const data = await response.json();
      renderCompareTable(items, data.results || []);
    } catch (err) {
      compareTableWrap.innerHTML = `<p class="compare-error">${escapeHtml(err.message || 'Erro ao comparar produtos.')}</p>`;
    } finally {
      compareLoading.classList.add('hidden');
    }
  });

  function renderCompareTable(items, results) {
    const resultsByUrl = new Map(results.map((result) => [result.url, result]));
    const specKeys = [];
    const seenSpecKeys = new Set();
    items.forEach((item) => {
      const specs = resultsByUrl.get(item.url)?.specs;
      if (!specs) return;
      Object.keys(specs).forEach((key) => {
        if (!seenSpecKeys.has(key)) {
          seenSpecKeys.add(key);
          specKeys.push(key);
        }
      });
    });

    const rowsHtml = [];
    rowsHtml.push(buildCompareRow('Loja', items.map((item) => escapeHtml(item.store || '—'))));
    rowsHtml.push(buildCompareRow('Preço', items.map((item) => escapeHtml(item.price_estimated || '—'))));
    specKeys.forEach((key) => {
      const cells = items.map((item) => {
        const value = resultsByUrl.get(item.url)?.specs?.[key];
        return value ? escapeHtml(value) : '<span class="compare-na">—</span>';
      });
      rowsHtml.push(buildCompareRow(key, cells));
    });

    const notes = items
      .map((item) => resultsByUrl.get(item.url)?.note)
      .filter(Boolean)
      .map((note) => `<p class="compare-note">${escapeHtml(note)}</p>`)
      .join('');

    const links = items
      .map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn-deal">Ver na ${escapeHtml(item.store || 'loja')} ↗</a>`)
      .join('');

    compareTableWrap.innerHTML = `
      <div class="compare-table-scroll">
        <table class="compare-table">
          <thead>
            <tr>
              <th>Especificação</th>
              ${items.map((item) => `<th title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml.join('')}
          </tbody>
        </table>
      </div>
      ${notes}
      <div class="compare-links">${links}</div>
    `;
  }

  function buildCompareRow(label, cells) {
    return `<tr><td class="compare-row-label">${escapeHtml(label)}</td>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
  }

  // Category selector: prefills the component field and adjusts placeholders per component type
  const categorySelect = document.getElementById('category');
  const CATEGORY_PRESETS = {
    dvr_nvr: { item: 'DVR/NVR', brandPlaceholder: 'Ex: Intelbras, Hikvision', modelPlaceholder: 'Ex: MHDX 1116, 16 canais Full HD' },
    facial: { item: 'Terminal de Reconhecimento Facial', brandPlaceholder: 'Ex: Intelbras, Hikvision', modelPlaceholder: 'Ex: 3000 usuários' },
    porteiro: { item: 'Vídeo Porteiro', brandPlaceholder: 'Ex: Intelbras', modelPlaceholder: 'Ex: Wi-Fi, 1 ponto' },
    switch: { item: 'Switch', brandPlaceholder: 'Ex: Intelbras, TP-Link', modelPlaceholder: 'Ex: 8 portas PoE gerenciável' },
    fonte: { item: 'Fonte', brandPlaceholder: 'Ex: Intelbras', modelPlaceholder: 'Ex: 12V 5A Chaveada' },
    cabo: { item: 'Cabo', brandPlaceholder: 'Ex: Furukawa, Lynx', modelPlaceholder: 'Ex: CAT5e 305m' },
    mikrotik: { item: 'Mikrotik', brandPlaceholder: 'Ex: Mikrotik', modelPlaceholder: 'Ex: hAP ac2, RB750Gr3' },
    roteador: { item: 'Roteador', brandPlaceholder: 'Ex: TP-Link, Intelbras', modelPlaceholder: 'Ex: Wi-Fi 6 Dual Band' },
    acabamento: { item: 'Solução de Acabamento', brandPlaceholder: 'Ex: Steck, Dutotec', modelPlaceholder: 'Ex: Canaleta 20x10mm, Rack 12U' },
  };
  const defaultBrandPlaceholder = brandInput.placeholder;
  const defaultModelPlaceholder = modelInput.placeholder;

  function updatePlaceholders(categoryKey) {
    const preset = CATEGORY_PRESETS[categoryKey];
    brandInput.placeholder = preset ? preset.brandPlaceholder : defaultBrandPlaceholder;
    modelInput.placeholder = preset ? preset.modelPlaceholder : defaultModelPlaceholder;
  }

  categorySelect.addEventListener('change', () => {
    const preset = CATEGORY_PRESETS[categorySelect.value];
    updatePlaceholders(categorySelect.value);
    if (preset) {
      itemNameInput.value = preset.item;
      modelInput.focus();
    }
  });

  // Quick tags auto-fill and submit
  quickTagButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      categorySelect.value = btn.dataset.category || '';
      updatePlaceholders(btn.dataset.category || '');
      itemNameInput.value = btn.dataset.item || '';
      brandInput.value = btn.dataset.brand || '';
      modelInput.value = btn.dataset.model || '';
      form.dispatchEvent(new Event('submit'));
    });
  });

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const itemName = itemNameInput.value.trim();
    const brand = brandInput.value.trim();
    const model = modelInput.value.trim();
    const provider = providerSelect.value;

    if (!itemName) {
      showError('Por favor, informe ao menos o nome do produto.');
      return;
    }

    // UI State: Loading
    setLoadingState(true);
    hideError();
    resultsSection.classList.add('hidden');
    resetCompareState();

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item_name: itemName,
          brand: brand,
          model: model,
          provider: provider,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Não foi possível completar a busca.');
      }

      const data = await response.json();
      renderResults(data);
    } catch (err) {
      showError(err.message || 'Erro ao comunicar com o servidor.');
    } finally {
      setLoadingState(false);
    }
  });

  function setLoadingState(isLoading) {
    if (isLoading) {
      loadingSection.classList.remove('hidden');
      btnSearch.disabled = true;
      btnSearch.style.opacity = '0.6';
    } else {
      loadingSection.classList.add('hidden');
      btnSearch.disabled = false;
      btnSearch.style.opacity = '1';
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  function hideError() {
    errorBox.classList.add('hidden');
  }

  function renderResults(data) {
    dealsGrid.innerHTML = '';
    const exactDeals = data.deals || [];
    const similarDeals = data.similar_deals || [];
    const visibleDeals = [...exactDeals, ...similarDeals];

    // Render Insight Text
    if (data.summary_insight) {
      insightText.innerHTML = formatMarkdownLike(data.summary_insight);
      insightBanner.classList.remove('hidden');
    } else {
      insightBanner.classList.add('hidden');
    }

    // Update count badge
    const providerLabels = { all: 'todos os provedores', intelbras: 'Intelbras', amazon: 'Amazon', serper: 'Serper', serpapi: 'SerpApi' };
    const providerSuffix = providerLabels[data.provider] ? ` · via ${providerLabels[data.provider]}` : '';
    resultsCount.textContent = `${visibleDeals.length} ${visibleDeals.length === 1 ? 'oferta' : 'ofertas'}${providerSuffix}`;
    if (!visibleDeals.length) {
      dealsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #94a3b8;">
          <p>Nenhuma oferta foi retornada automaticamente. Tente outra busca ou confira diretamente no Google Shopping.</p>
          ${data.shopping_url ? `<a href="${escapeHtml(data.shopping_url)}" target="_blank" rel="noopener noreferrer" class="btn-deal">Abrir no Google Shopping</a>` : ''}
        </div>
      `;
      resultsSection.classList.remove('hidden');
      return;
    }

    if (!data.exact_found && visibleDeals.length) {
      dealsGrid.innerHTML = '<div class="similar-notice">Produto exato nao encontrado. Estas sao opcoes semelhantes.</div>';
    }

    // Render Cards
    visibleDeals.forEach((deal, index) => {
      if (data.exact_found && similarDeals.length && index === exactDeals.length) {
        const divider = document.createElement('div');
        divider.className = 'similar-divider';
        divider.textContent = 'Ofertas semelhantes';
        dealsGrid.appendChild(divider);
      }
      const card = document.createElement('div');
      card.className = `deal-card${data.exact_found && index === 0 ? ' primary-deal' : ''}`;

      const scoreDisplay = deal.cost_benefit_score
        ? `<span class="score-badge">★ ${deal.cost_benefit_score.toFixed(1)} / 10</span>`
        : '';

      const rankingDisplay = data.exact_found && index < exactDeals.length
        ? `<span class="ranking-badge">${index + 1}o menor preco</span>`
        : '';

      const reasonDisplay = deal.recommendation_reason
        ? `<div class="deal-reason">💡 ${escapeHtml(deal.recommendation_reason)}</div>`
        : '';

      const installmentDisplay = deal.installment_info
        ? `<p class="deal-snippet">Cartao: ${escapeHtml(deal.installment_info)}</p>`
        : '';

      card.innerHTML = `
        <div>
          <div class="card-top">
            <span class="store-badge">${escapeHtml(deal.store)}</span>
            ${rankingDisplay}
            ${scoreDisplay}
          </div>
          <label class="compare-check" title="Selecionar para comparar ficha técnica">
            <input type="checkbox" class="compare-checkbox" />
            <span>Comparar ficha técnica</span>
          </label>
          <h3 class="deal-title" title="${escapeHtml(deal.title)}">${escapeHtml(deal.title)}</h3>
          <p class="deal-snippet">${escapeHtml(deal.snippet || 'Clique para conferir os detalhes na loja.')}</p>
          ${reasonDisplay}
          ${installmentDisplay}
        </div>
        <div class="card-bottom">
          <div class="price-box">
            <span class="price-label">Preço Estimado</span>
            <span class="price-val">${escapeHtml(deal.price_estimated || 'Ver no site')}</span>
          </div>
          <a href="${escapeHtml(deal.url)}" target="_blank" rel="noopener noreferrer" class="btn-deal">
            Ver Oferta ↗
          </a>
        </div>
      `;

      const compareCheckbox = card.querySelector('.compare-checkbox');
      compareCheckbox.addEventListener('change', () => {
        if (compareCheckbox.checked) {
          selectedDeals.set(deal.url, deal);
        } else {
          selectedDeals.delete(deal.url);
        }
        updateCompareBar();
      });

      card.addEventListener('click', (e) => {
        if (!e.target.closest('a') && !e.target.closest('.compare-check')) {
          window.open(deal.url, '_blank', 'noopener,noreferrer');
        }
      });

      dealsGrid.appendChild(card);
    });

    resultsSection.classList.remove('hidden');

  }

  function formatMarkdownLike(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Orçamento (budget builder), como um canvas de fluxo estilo n8n ---
  // As arestas são inteiramente derivadas do orçamento (âncora → requisito) e recalculadas a cada
  // mudança — não é um editor de diagrama genérico, então uma conexão manual entre dois nós não
  // sobrevive ao próximo add/remove/verificar-preço. Posição e zoom/pan são livres e persistem.
  const BUDGET_STORAGE_KEY = 'comprador-inviolavel:budget:v2';
  const POSITIONS_STORAGE_KEY = 'comprador-inviolavel:budget:positions';

  const budgetAddForm = document.getElementById('budget-add-form');
  const budgetItemInput = document.getElementById('budget-item-input');
  const budgetItemQuantityInput = document.getElementById('budget-item-quantity');
  const budgetEmpty = document.getElementById('budget-empty');
  const budgetTotal = document.getElementById('budget-total');
  const btnBudgetPrices = document.getElementById('btn-budget-prices');
  const btnBudgetClear = document.getElementById('btn-budget-clear');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');
  const budgetPricesLoading = document.getElementById('budget-prices-loading');
  const flowContainer = document.getElementById('drawflow');
  const flowSuggestionsList = document.getElementById('flow-suggestions-list');
  const flowSuggestionsEmpty = document.getElementById('flow-suggestions-empty');

  let nextItemId = 0;
  let budgetItems = loadBudget();
  let nodePositions = loadPositions();
  let priceLoading = false;

  function clampQuantity(value) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 1;
  }

  function loadBudget() {
    try {
      const saved = JSON.parse(localStorage.getItem(BUDGET_STORAGE_KEY) || '{}');
      const items = Array.isArray(saved.items)
        ? saved.items.filter((item) => item && typeof item.title === 'string' && item.title.trim() && Number.isFinite(item.id))
        : [];
      nextItemId = Number.isFinite(saved.nextItemId) ? saved.nextItemId : items.reduce((max, item) => Math.max(max, item.id), 0);
      return items.map((item) => ({ id: item.id, title: item.title, quantity: clampQuantity(item.quantity), averagePrice: null, bestOffer: null }));
    } catch {
      return [];
    }
  }

  function saveBudget() {
    try {
      localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify({ items: budgetItems.map(({ id, title, quantity }) => ({ id, title, quantity })), nextItemId }));
    } catch { /* storage indisponível, segue sem persistir */ }
  }

  function parseBRL(text) {
    const match = String(text || '').match(/[\d.]+,\d{2}/);
    return match ? Number(match[0].replace(/\./g, '').replace(',', '.')) : null;
  }

  function formatBRL(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function loadPositions() {
    try {
      const saved = JSON.parse(localStorage.getItem(POSITIONS_STORAGE_KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  }

  function savePositions() {
    try { localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(nodePositions)); } catch { /* storage indisponível */ }
  }

  const itemFlowKey = (item) => `item-${item.id}`;

  // Nós no estilo "tabela" do Schema Visualizer do Supabase: barra de cabeçalho colorida com o
  // nome, corpo escuro com linhas tipo coluna (ícone · rótulo · valor à direita).
  function confirmedNodeHtml(item, flowKey) {
    const unitValue = parseBRL(item.averagePrice);
    const priceRow = item.averagePrice
      ? `<div class="flow-node-row"><span class="flow-node-row-icon">$</span><span class="flow-node-row-label">Preço médio (un.)</span><span class="flow-node-row-value">~${escapeHtml(item.averagePrice)}</span></div>`
      : '';
    const subtotalRow = unitValue !== null && item.quantity > 1
      ? `<div class="flow-node-row"><span class="flow-node-row-icon">Σ</span><span class="flow-node-row-label">Subtotal</span><span class="flow-node-row-value">${escapeHtml(formatBRL(unitValue * item.quantity))}</span></div>`
      : '';
    const offerRow = item.bestOffer
      ? `<div class="flow-node-row"><span class="flow-node-row-icon">↗</span><span class="flow-node-row-label">Melhor oferta</span><span class="flow-node-row-value"><a href="${escapeHtml(item.bestOffer.url)}" target="_blank" rel="noopener noreferrer" onmousedown="event.stopPropagation()">${escapeHtml(item.bestOffer.store)}</a></span></div>`
      : '';
    return `
      <div class="flow-node flow-node--confirmed" data-flow-key="${escapeHtml(flowKey)}">
        <div class="flow-node-header">
          <span class="flow-node-header-text" title="${escapeHtml(item.title)}">${item.quantity > 1 ? `${item.quantity}× ` : ''}${escapeHtml(item.title)}</span>
          <button type="button" class="flow-node-remove" data-item-id="${item.id}" title="Remover" onmousedown="event.stopPropagation()">✕</button>
        </div>
        <div class="flow-node-body">
          <div class="flow-node-row">
            <span class="flow-node-row-icon">#</span>
            <span class="flow-node-row-label">Quantidade</span>
            <span class="flow-node-qty-controls">
              <button type="button" class="flow-node-qty-btn" data-qty-item-id="${item.id}" data-qty-delta="-1" onmousedown="event.stopPropagation()">−</button>
              <span class="flow-node-qty-value">${item.quantity}</span>
              <button type="button" class="flow-node-qty-btn" data-qty-item-id="${item.id}" data-qty-delta="1" onmousedown="event.stopPropagation()">+</button>
            </span>
          </div>
          ${priceRow}
          ${subtotalRow}
          ${offerRow}
        </div>
      </div>
    `;
  }

  // Item da listinha lateral: o usuário segura e arrasta para o canvas — nada aparece
  // pré-posicionado ou pré-conectado no quadro, a conexão é feita à mão pelo usuário.
  function suggestionListItemHtml(req) {
    return `
      <div
        class="flow-suggestion-item ${req.essential ? 'flow-suggestion-item--essential' : ''}"
        draggable="true"
        data-add-label="${escapeHtml(req.label)}"
        title="Arraste para o quadro"
      >
        <span class="flow-suggestion-item-label">${escapeHtml(req.label)}</span>
        <span class="flow-suggestion-item-kind">${req.essential ? '◆ Essencial' : '◇ Recomendado'}</span>
        <span class="flow-suggestion-item-reason">${escapeHtml(req.reason || '')}</span>
      </div>
    `;
  }

  let editor = null;

  function initFlow() {
    editor = new Drawflow(flowContainer);
    editor.curvature = 0.4;
    editor.start();

    editor.on('nodeMoved', (drawflowId) => {
      const el = document.getElementById(`node-${drawflowId}`);
      const flowKey = el?.querySelector('.flow-node')?.dataset.flowKey;
      const node = editor.getNodeFromId(drawflowId);
      if (!flowKey || !node) return;
      nodePositions[flowKey] = { x: node.pos_x, y: node.pos_y };
      savePositions();
    });

    flowContainer.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.flow-node-remove');
      if (removeBtn) {
        const itemId = Number(removeBtn.dataset.itemId);
        budgetItems = budgetItems.filter((item) => item.id !== itemId);
        saveBudget();
        renderFlow();
        return;
      }
      const qtyBtn = e.target.closest('.flow-node-qty-btn');
      if (qtyBtn) {
        const itemId = Number(qtyBtn.dataset.qtyItemId);
        const delta = Number(qtyBtn.dataset.qtyDelta);
        const item = budgetItems.find((entry) => entry.id === itemId);
        if (item) {
          item.quantity = clampQuantity(item.quantity + delta);
          saveBudget();
          renderFlow();
        }
      }
    });

    // Drag-and-drop de sugestão (listinha lateral) para dentro do canvas: o nó nasce onde o
    // usuário soltar, e é ele quem puxa a conexão até o equipamento correspondente.
    flowContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      flowContainer.classList.add('flow-drop-target');
    });
    flowContainer.addEventListener('dragleave', () => flowContainer.classList.remove('flow-drop-target'));
    flowContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      flowContainer.classList.remove('flow-drop-target');
      const label = e.dataTransfer.getData('text/plain');
      if (!label) return;
      const rect = editor.precanvas.getBoundingClientRect();
      const pos = { x: (e.clientX - rect.x) / editor.zoom, y: (e.clientY - rect.y) / editor.zoom };
      nodePositions[itemFlowKey({ id: nextItemId + 1 })] = pos;
      savePositions();
      addBudgetItem(label);
    });
  }

  function addBudgetItem(rawTitle, rawQuantity = 1) {
    const title = (rawTitle || '').trim();
    if (!title) return;
    nextItemId += 1;
    budgetItems.push({ id: nextItemId, title, quantity: clampQuantity(rawQuantity), averagePrice: null, bestOffer: null });
    saveBudget();
    renderFlow();
  }

  async function renderFlow() {
    budgetEmpty.classList.toggle('hidden', budgetItems.length > 0);
    btnBudgetPrices.disabled = budgetItems.length === 0 || priceLoading;
    editor.clear();
    updateBudgetTotal();
    if (!budgetItems.length) {
      flowSuggestionsList.innerHTML = '';
      flowSuggestionsEmpty.classList.remove('hidden');
      return;
    }

    let suggestionsData = { requirements_by_category: {}, items: [] };
    try {
      const response = await fetch('/api/recipe/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: budgetItems.map((item) => ({ title: item.title })) }),
      });
      if (response.ok) suggestionsData = await response.json();
    } catch { /* segue exibindo só os itens confirmados, sem sugestões, se o servidor não responder */ }

    const drawflowIdByFlowKey = new Map();
    const firstItemByTitle = new Map();
    budgetItems.forEach((item) => { if (!firstItemByTitle.has(item.title)) firstItemByTitle.set(item.title, item); });

    // Linha 1: itens confirmados do orçamento.
    budgetItems.forEach((item, index) => {
      const flowKey = itemFlowKey(item);
      const pos = nodePositions[flowKey] || { x: 60 + index * 260, y: 60 };
      const id = editor.addNode(flowKey, 1, 1, pos.x, pos.y, 'flow-node-wrap', {}, confirmedNodeHtml(item, flowKey));
      drawflowIdByFlowKey.set(flowKey, id);
    });

    // Sugestões ainda não satisfeitas viram itens da listinha lateral (deduplicadas entre âncoras
    // que compartilham o mesmo requisito, ex.: câmera analógica e DVR ambos pedem fonte 12V) — o
    // usuário arrasta uma para o canvas e conecta ele mesmo, nada é pré-posicionado no quadro.
    const unsatisfiedByKey = new Map();
    Object.values(suggestionsData.requirements_by_category || {}).forEach((requirements) => {
      requirements.forEach((req) => {
        if (!req.satisfied_by && !unsatisfiedByKey.has(req.key)) unsatisfiedByKey.set(req.key, req);
      });
    });
    flowSuggestionsList.innerHTML = [...unsatisfiedByKey.values()].map(suggestionListItemHtml).join('');
    flowSuggestionsEmpty.classList.toggle('hidden', unsatisfiedByKey.size > 0);
    flowSuggestionsList.querySelectorAll('.flow-suggestion-item').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.addLabel);
        e.dataTransfer.effectAllowed = 'copy';
        el.classList.add('flow-suggestion-item--dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('flow-suggestion-item--dragging'));
    });

    // Arestas: de cada item-âncora para quem já satisfaz cada requisito seu (nó real já
    // confirmado no orçamento) — requisitos ainda não satisfeitos ficam sem aresta até o usuário
    // arrastar a sugestão correspondente para o canvas.
    budgetItems.forEach((item, index) => {
      const category = suggestionsData.items?.[index]?.category;
      const requirements = category && suggestionsData.requirements_by_category?.[category];
      if (!requirements) return;
      const fromId = drawflowIdByFlowKey.get(itemFlowKey(item));
      requirements.forEach((req) => {
        if (!req.satisfied_by) return;
        const toId = drawflowIdByFlowKey.get(itemFlowKey(firstItemByTitle.get(req.satisfied_by) || {}));
        if (toId && fromId !== toId) editor.addConnection(fromId, toId, 'output_1', 'input_1');
      });
    });
  }

  function updateBudgetTotal() {
    const total = budgetItems.reduce((sum, item) => {
      const unitValue = parseBRL(item.averagePrice);
      return unitValue !== null ? sum + unitValue * item.quantity : sum;
    }, 0);
    budgetTotal.classList.toggle('hidden', total <= 0);
    if (total > 0) budgetTotal.textContent = `Total estimado: ${formatBRL(total)}`;
  }

  budgetAddForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addBudgetItem(budgetItemInput.value, budgetItemQuantityInput.value);
    budgetItemInput.value = '';
    budgetItemQuantityInput.value = '1';
    budgetItemInput.focus();
  });

  btnBudgetClear.addEventListener('click', () => {
    budgetItems = [];
    nodePositions = {};
    saveBudget();
    savePositions();
    renderFlow();
  });

  btnZoomIn.addEventListener('click', () => editor.zoom_in());
  btnZoomOut.addEventListener('click', () => editor.zoom_out());
  btnZoomReset.addEventListener('click', () => editor.zoom_reset());

  btnBudgetPrices.addEventListener('click', async () => {
    if (!budgetItems.length || priceLoading) return;
    priceLoading = true;
    btnBudgetPrices.disabled = true;
    budgetPricesLoading.classList.remove('hidden');
    try {
      const response = await fetch('/api/recipe/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: budgetItems.map((item) => ({ label: item.title, search_term: item.title })) }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Não foi possível verificar os preços.');
      }
      const data = await response.json();
      const resultByLabel = new Map((data.results || []).map((result) => [result.label, result]));
      budgetItems.forEach((item) => {
        const result = resultByLabel.get(item.title);
        item.averagePrice = result?.average_price || null;
        item.bestOffer = (result?.deals && result.deals[0]) || null;
      });
    } catch (err) {
      showError(err.message || 'Erro ao verificar preços.');
    } finally {
      priceLoading = false;
      budgetPricesLoading.classList.add('hidden');
      renderFlow();
    }
  });

  initFlow();
  renderFlow();
});
