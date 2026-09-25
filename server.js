const http = require('node:http');
const { URL } = require('node:url');
const {
  listProducts, createProduct, updateProduct, deleteProduct, importProducts,
  listCategories, createCategory, updateCategory, deleteCategory,
  listGroups, createGroup, deleteGroup,
  listResources, createResource, updateResource, deleteResource,
  getAiInstructions, updateAiInstructions, getSmtpSettings, saveSmtpSettings, logAssistantExchange,
  listAssistantChats, getAssistantChat, saveAssistantChat, deleteAssistantChat,
  createUser, findUserByEmail, createPasswordReset, consumePasswordReset, resetUserPassword, listUsers, updateUser, seedDevAdmin,
  createSession, findSessionUser, deleteSession,
  createBudget, listBudgetsForUser, getBudgetForUser, updateBudgetForUser, setBudgetAddressForUser, deleteBudgetForUser,
  closeDb,
} = require('./db');

// server.js é só a composição: boot de ambiente, o router HTTP puro e o start do processo. Toda
// regra de negócio (extração de specs, motor de recursos/capacidade, provedores de busca,
// validação) mora em lib/ — ver lib/ para o detalhamento por módulo.
const { PORT, HOST, APP_URL, UPLOADS_DIRECTORY } = require('./lib/env');
const { RESET_TTL_MS, hashResetToken, generateResetToken, allowResetRequest } = require('./lib/passwordReset');
const { sendResetEmail, sendTestEmail } = require('./lib/mailer');
const { encryptSecret } = require('./lib/secretBox');
const { normalize } = require('./lib/text');
const { FLOORPLAN_EXTENSIONS, FLOORPLAN_MAX_BYTES, saveFloorPlanFile, deleteFloorPlanFile } = require('./lib/floorPlan');
const {
  detectSecurityCategory, detectExactCategory, matchesRequestedModel, isStandaloneProductOffer,
  extractDvrNvrSpecs, extractCameraSpecs, extractFacialSpecs, extractPorteiroSpecs, extractSwitchSpecs,
  extractFonteSpecs, extractCaboSpecs, extractMikrotikSpecs, extractRoteadorSpecs, extractAcabamentoSpecs,
} = require('./lib/specs');
const { computeCategoryMissingEssentials } = require('./lib/recipeEngine');
const { sendJson, sendCsv, readJson, readBinary, serveStatic, serveFromDirectory, parseCookies } = require('./lib/http');
const {
  validateSearchRequest, validateCompareRequest, validateRecipeItems, validateRecipePriceItems,
  validateProductRequest, validateCategoryRequest, validateResourceRequest,
  validateAuthRequest, validateEmailRequest, validateResetRequest, validateSmtpSettingsRequest, validateAssistantChatRequest, validateUserUpdateRequest, validateSetAddressRequest, validateBudgetSaveRequest,
  validateAiInstructionsRequest,
} = require('./lib/validators');
const {
  canAccessScreen, hashPassword, verifyPassword, generateSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_MS,
  serializeSessionCookie, serializeClearSessionCookie,
} = require('./lib/auth');
const { geocodeAddress } = require('./lib/providers/geocoding');
const { buildProductTemplateCsv, parseProductImportCsv } = require('./lib/productImport');
const {
  extractPdfText, classifyQuoteItems, auditQuoteWithAI, PDF_AUDIT_MAX_BYTES,
  DEFAULT_CLASSIFICATION_INSTRUCTIONS, DEFAULT_AUDIT_INSTRUCTIONS,
} = require('./lib/quoteAudit');
const { askEquipmentAssistant, extractBudgetLines, buildBudgetFromClassified } = require('./lib/equipmentKnowledge');
const { setShoppingFetcher } = require('./lib/providers/shoppingFetcher');
const { excludePriceOutliers, selectTopDistinctStores, buildGoogleShoppingUrl } = require('./lib/providers/shared');
const {
  normalizeIntelbrasOffers, searchIntelbrasShopping, buildIntelbrasSpecs, fetchIntelbrasProductSpecs, fetchProductSpecs,
} = require('./lib/providers/intelbras');
const { normalizeAmazonOffers, searchAmazonShopping, setAmazonBrowserLauncher } = require('./lib/providers/amazon');
const { normalizeSerperShopping, searchSerperShopping } = require('./lib/providers/serper');
const { normalizeSerpApiShopping, searchSerpApiShopping } = require('./lib/providers/serpapi');
const { SEARCH_PROVIDERS, AGGREGATE_PROVIDER, DEFAULT_PROVIDER, searchAllProviders, fetchRecipeItemPrice } = require('./lib/providers');

function getAuthenticatedUser(request) {
  return findSessionUser(parseCookies(request)[SESSION_COOKIE_NAME]);
}

// Login + permissão de tela (ver SCREENS em lib/auth.js). Já responde 401/403 e devolve null —
// quem chama só faz `if (!user) return;`.
async function requireScreen(request, response, ...screens) {
  const user = await getAuthenticatedUser(request);
  if (!user) { sendJson(response, 401, { detail: 'Não autenticado.' }); return null; }
  if (!canAccessScreen(user, ...screens)) { sendJson(response, 403, { detail: 'Você não tem permissão para esta tela.' }); return null; }
  return user;
}

async function requestHandler(request, response) {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {});
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      const providers = Object.fromEntries(Object.entries(SEARCH_PROVIDERS).map(([key, provider]) => [key, provider.hasKey()]));
      providers[AGGREGATE_PROVIDER] = true;
      return sendJson(response, 200, { status: 'healthy', search_providers: providers });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const { email, password } = validateAuthRequest(await readJson(request));
      const user = await createUser({ email, passwordHash: hashPassword(password) });
      const token = generateSessionToken();
      await createSession(token, user.id, new Date(Date.now() + SESSION_TTL_MS));
      return sendJson(response, 201, user, { 'Set-Cookie': serializeSessionCookie(token) });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email, password } = validateAuthRequest(await readJson(request));
      const userDoc = await findUserByEmail(email);
      if (!userDoc || !verifyPassword(password, userDoc.passwordHash)) throw new Error('E-mail ou senha inválidos.');
      const token = generateSessionToken();
      await createSession(token, userDoc._id.toString(), new Date(Date.now() + SESSION_TTL_MS));
      const loggedInUser = { id: userDoc._id.toString(), email: userDoc.email, name: userDoc.name || null, role: userDoc.role || 'user', unrestricted: userDoc.unrestricted === true, avatar: userDoc.avatar || null, screens: Array.isArray(userDoc.screens) ? userDoc.screens : null };
      return sendJson(response, 200, loggedInUser, { 'Set-Cookie': serializeSessionCookie(token) });
    }
    // Sempre 200 (não revela quais e-mails têm conta). O envio não é aguardado: o tempo de resposta
    // não diferencia e-mail existente de inexistente; falha de SMTP só vai pro log.
    if (request.method === 'POST' && url.pathname === '/api/auth/forgot') {
      const { email } = validateEmailRequest(await readJson(request));
      const userDoc = await findUserByEmail(email);
      if (userDoc && allowResetRequest(email)) {
        const { token, tokenHash } = generateResetToken();
        await createPasswordReset(userDoc._id.toString(), tokenHash, new Date(Date.now() + RESET_TTL_MS));
        sendResetEmail(email, `${APP_URL}/?reset=${token}`).catch((err) => console.error('[mailer] falha ao enviar:', err.message));
      }
      return sendJson(response, 200, { sent: true });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/reset') {
      const { token, password } = validateResetRequest(await readJson(request));
      const userId = await consumePasswordReset(hashResetToken(token));
      if (!userId) throw new Error('Link inválido ou expirado.');
      const user = await resetUserPassword(userId, hashPassword(password));
      const sessionToken = generateSessionToken();
      await createSession(sessionToken, user.id, new Date(Date.now() + SESSION_TTL_MS));
      return sendJson(response, 200, user, { 'Set-Cookie': serializeSessionCookie(sessionToken) });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = parseCookies(request)[SESSION_COOKIE_NAME];
      if (token) await deleteSession(token);
      return sendJson(response, 200, { loggedOut: true }, { 'Set-Cookie': serializeClearSessionCookie() });
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const user = await getAuthenticatedUser(request);
      if (!user) return sendJson(response, 401, { detail: 'Não autenticado.' });
      return sendJson(response, 200, user);
    }
    // Cadastro de usuários e permissões — só administrador enxerga ou edita conta de terceiros.
    if (request.method === 'GET' && url.pathname === '/api/users') {
      const user = await getAuthenticatedUser(request);
      if (!user) return sendJson(response, 401, { detail: 'Não autenticado.' });
      if (user.role !== 'admin') return sendJson(response, 403, { detail: 'Só administradores podem ver os usuários cadastrados.' });
      return sendJson(response, 200, { users: await listUsers() });
    }
    const userIdMatch = url.pathname.match(/^\/api\/users\/([a-f0-9]{24})$/i);
    if (userIdMatch && request.method === 'PATCH') {
      const user = await getAuthenticatedUser(request);
      if (!user) return sendJson(response, 401, { detail: 'Não autenticado.' });
      if (user.role !== 'admin') return sendJson(response, 403, { detail: 'Só administradores podem editar usuários.' });
      const { password, ...rest } = validateUserUpdateRequest(await readJson(request));
      const patch = password ? { ...rest, passwordHash: hashPassword(password) } : rest;
      const updated = await updateUser(userIdMatch[1], patch);
      if (!updated) return sendJson(response, 404, { detail: 'Usuário não encontrado.' });
      return sendJson(response, 200, updated);
    }
    // Instruções de negócio das etapas de IA (ver lib/quoteAudit.js) — mesma regra de acesso do
    // cadastro de usuários: edição é coisa de administrador.
    if (request.method === 'GET' && url.pathname === '/api/ai-instructions') {
      const user = await getAuthenticatedUser(request);
      if (!user) return sendJson(response, 401, { detail: 'Não autenticado.' });
      if (user.role !== 'admin') return sendJson(response, 403, { detail: 'Só administradores podem ver as instruções da IA.' });
      const stored = await getAiInstructions();
      return sendJson(response, 200, {
        classification: stored.classification || DEFAULT_CLASSIFICATION_INSTRUCTIONS,
        audit: stored.audit || DEFAULT_AUDIT_INSTRUCTIONS,
      });
    }
    if (request.method === 'PUT' && url.pathname === '/api/ai-instructions') {
      const user = await getAuthenticatedUser(request);
      if (!user) return sendJson(response, 401, { detail: 'Não autenticado.' });
      if (user.role !== 'admin') return sendJson(response, 403, { detail: 'Só administradores podem editar as instruções da IA.' });
      const { classification, audit } = validateAiInstructionsRequest(await readJson(request));
      return sendJson(response, 200, await updateAiInstructions({ classification, audit }));
    }
    // Configuração SMTP (admin). A senha só entra (PUT) e nunca sai: o GET devolve `hasPassword`.
    if (url.pathname === '/api/smtp-settings' || url.pathname === '/api/smtp-settings/test') {
      const user = await getAuthenticatedUser(request);
      if (!user) return sendJson(response, 401, { detail: 'Não autenticado.' });
      if (user.role !== 'admin') return sendJson(response, 403, { detail: 'Só administradores podem configurar o SMTP.' });
      const publicView = (cfg) => ({
        host: cfg?.host || '', port: cfg?.port || 465, security: cfg?.security || 'ssl',
        user: cfg?.user || '', from: cfg?.from || '', hasPassword: Boolean(cfg?.pass),
      });
      if (request.method === 'GET' && url.pathname === '/api/smtp-settings') {
        return sendJson(response, 200, publicView(await getSmtpSettings()));
      }
      if (request.method === 'PUT' && url.pathname === '/api/smtp-settings') {
        const { password, ...fields } = validateSmtpSettingsRequest(await readJson(request));
        const previous = await getSmtpSettings();
        if (!password && !previous?.pass) throw new Error('Informe a senha do SMTP.');
        const saved = { ...fields, pass: password ? encryptSecret(password) : previous.pass };
        await saveSmtpSettings(saved);
        return sendJson(response, 200, publicView(saved));
      }
      if (request.method === 'POST' && url.pathname === '/api/smtp-settings/test') {
        await sendTestEmail(user.email);
        return sendJson(response, 200, { sent: true, to: user.email });
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/search') {
      if (!(await requireScreen(request, response, 'search'))) return;
      const body = await readJson(request);
      const { query } = validateSearchRequest(body);
      const requestedProvider = normalize(body.provider).toLowerCase();
      const providerKey = requestedProvider === AGGREGATE_PROVIDER || !SEARCH_PROVIDERS[requestedProvider] ? DEFAULT_PROVIDER : requestedProvider;
      const result = providerKey === AGGREGATE_PROVIDER ? await searchAllProviders(query) : await SEARCH_PROVIDERS[providerKey].search(query);
      return sendJson(response, 200, { ...result, provider: providerKey });
    }
    if (request.method === 'POST' && url.pathname === '/api/compare') {
      if (!(await requireScreen(request, response, 'search'))) return;
      const body = await readJson(request);
      const items = validateCompareRequest(body);
      const results = await Promise.all(items.map(async (item) => ({ url: item.url, ...(await fetchProductSpecs(item.url, item.title)) })));
      return sendJson(response, 200, { results });
    }
    if (request.method === 'POST' && url.pathname === '/api/recipe/suggestions') {
      if (!(await requireScreen(request, response, 'budget'))) return;
      const body = await readJson(request);
      const cartItems = validateRecipeItems(body);
      const categories = await listCategories();
      const resources = await listResources();
      // "items" ecoa a categoria exata detectada de cada item de entrada, na mesma ordem — o canvas
      // (estilo n8n) usa isso pra saber de qual nó desenhar a aresta, sem duplicar detecção em JS.
      const items = cartItems.map(({ title }) => ({ title, category: detectExactCategory(title, categories)?.value || null }));
      return sendJson(response, 200, { ...computeCategoryMissingEssentials(cartItems, categories, resources), items });
    }
    if (request.method === 'POST' && url.pathname === '/api/recipe/prices') {
      if (!(await requireScreen(request, response, 'budget'))) return;
      const body = await readJson(request);
      const items = validateRecipePriceItems(body);
      const results = await Promise.all(items.map(fetchRecipeItemPrice));
      return sendJson(response, 200, { results });
    }
    if (request.method === 'POST' && url.pathname === '/api/pdf-audit') {
      const user = await requireScreen(request, response, 'quote-audit');
      if (!user) return;
      const filename = normalize(url.searchParams.get('filename'));
      if ((filename.split('.').pop() || '').toLowerCase() !== 'pdf') return sendJson(response, 400, { detail: 'Envie um arquivo PDF.' });
      const buffer = await readBinary(request, PDF_AUDIT_MAX_BYTES);
      const [categories, resources, aiInstructions, products] = await Promise.all([listCategories(), listResources(), getAiInstructions(), listProducts()]);
      const pdfText = await extractPdfText(buffer);
      // Ordem importa (pedido explícito do usuário): extrai os itens e casa cada um com uma
      // categoria do cadastro primeiro, roda o motor de regras determinístico sobre esse resultado,
      // e só DEPOIS manda os itens já casados + as pendências do motor pra IA auditar por cima —
      // a IA nunca vê o PDF cru de novo nem as seções (erradas) do sistema de origem. Produto já
      // cadastrado (aba Produtos) vence o palpite da IA quando o nome do item bate com um modelo
      // conhecido (ver applyRegisteredProductOverrides em lib/quoteAudit.js).
      const items = await classifyQuoteItems(pdfText, categories, aiInstructions.classification || undefined, products);
      const cartItems = items.filter((i) => i.category).map((i) => ({ title: i.category, quantity: i.quantity }));
      const engineResult = computeCategoryMissingEssentials(cartItems, categories, resources);
      const aiAudit = await auditQuoteWithAI(items, categories, engineResult.missing, aiInstructions.audit || undefined);
      return sendJson(response, 200, { items, engineResult, aiAudit });
    }
    if (request.method === 'POST' && url.pathname === '/api/assistant') {
      const user = await requireScreen(request, response, 'assistant');
      if (!user) return;
      const body = await readJson(request);
      const { answer, model } = await askEquipmentAssistant(body.messages);
      // Log é só pra análise: se o Mongo falhar aqui, o comercial ainda recebe a resposta.
      await logAssistantExchange({ userId: user.id, userEmail: user.email, question: body.messages.at(-1).content, answer, model })
        .catch((err) => console.error('Falha ao gravar log do assistente:', err.message));
      return sendJson(response, 200, { answer });
    }
    // Conversas salvas do Assistente (até 10 por usuário, ver db.js). Sempre filtradas pelo dono.
    if (url.pathname === '/api/assistant/chats' || /^\/api\/assistant\/chats\/[^/]+$/.test(url.pathname)) {
      const user = await requireScreen(request, response, 'assistant');
      if (!user) return;
      const chatId = url.pathname.split('/')[4];
      const notFound = () => sendJson(response, 404, { detail: 'Conversa não encontrada.' });
      if (!chatId && request.method === 'GET') return sendJson(response, 200, await listAssistantChats(user.id));
      if (!chatId && request.method === 'PUT') {
        const saved = await saveAssistantChat(user.id, validateAssistantChatRequest(await readJson(request)));
        return saved ? sendJson(response, 200, saved) : notFound();
      }
      if (chatId && request.method === 'GET') {
        const chat = await getAssistantChat(user.id, chatId);
        return chat ? sendJson(response, 200, chat) : notFound();
      }
      if (chatId && request.method === 'DELETE') {
        return (await deleteAssistantChat(user.id, chatId)) ? sendJson(response, 200, { deleted: true }) : notFound();
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/assistant/budget') {
      const user = await requireScreen(request, response, 'assistant');
      if (!user) return;
      if (!canAccessScreen(user, 'budget')) return sendJson(response, 403, { detail: 'Você não tem permissão para a tela de Orçamentos.' });
      const { answer } = await readJson(request);
      const lines = extractBudgetLines(answer);
      if (!lines.length) return sendJson(response, 400, { detail: 'A resposta não tem itens no formato "- 2x Equipamento".' });
      const [categories, aiInstructions, products] = await Promise.all([listCategories(), getAiInstructions(), listProducts()]);
      const classified = await classifyQuoteItems(lines.join('\n'), categories, aiInstructions.classification || undefined, products);
      const { items, positions, connections, skipped } = buildBudgetFromClassified(classified, categories);
      if (!items.length) return sendJson(response, 422, { detail: 'Nenhum item da resposta bateu com o catálogo de categorias.', skipped });
      const budget = await createBudget(user.id);
      await updateBudgetForUser(budget.id, user.id, { items, positions, connections });
      return sendJson(response, 201, { budgetId: budget.id, itemCount: items.length, skipped });
    }
    if (request.method === 'GET' && url.pathname === '/api/products/template') {
      if (!(await requireScreen(request, response, 'products', 'quote-audit'))) return;
      const categories = await listCategories();
      return sendCsv(response, 'produtos-modelo.csv', buildProductTemplateCsv(categories));
    }
    if (request.method === 'POST' && url.pathname === '/api/products/import') {
      if (!(await requireScreen(request, response, 'products', 'quote-audit'))) return;
      const body = await readJson(request);
      const csvText = typeof body.csv === 'string' ? body.csv : '';
      if (!csvText.trim()) throw new Error('Envie o conteúdo da planilha.');
      const categories = await listCategories();
      const { products, errors } = parseProductImportCsv(csvText, categories);
      if (errors.length) return sendJson(response, 400, { detail: 'A planilha tem linhas inválidas.', errors });
      return sendJson(response, 200, await importProducts(products));
    }
    if (request.method === 'GET' && url.pathname === '/api/products') {
      const category = normalize(url.searchParams.get('category'));
      return sendJson(response, 200, { products: await listProducts(category || undefined) });
    }
    if (request.method === 'POST' && url.pathname === '/api/products') {
      if (!(await requireScreen(request, response, 'products', 'quote-audit'))) return;
      const body = await readJson(request);
      return sendJson(response, 201, await createProduct(validateProductRequest(body)));
    }
    const productIdMatch = url.pathname.match(/^\/api\/products\/([a-f0-9]{24})$/i);
    if (productIdMatch && request.method === 'PUT') {
      if (!(await requireScreen(request, response, 'products', 'quote-audit'))) return;
      const id = productIdMatch[1];
      const data = validateProductRequest(await readJson(request));
      if (!(await updateProduct(id, data))) return sendJson(response, 404, { detail: 'Produto não encontrado.' });
      return sendJson(response, 200, { id, ...data });
    }
    if (productIdMatch && request.method === 'DELETE') {
      if (!(await requireScreen(request, response, 'products', 'quote-audit'))) return;
      const id = productIdMatch[1];
      if (!(await deleteProduct(id))) return sendJson(response, 404, { detail: 'Produto não encontrado.' });
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/categories') {
      return sendJson(response, 200, { categories: await listCategories() });
    }
    if (request.method === 'POST' && url.pathname === '/api/categories') {
      if (!(await requireScreen(request, response, 'categories', 'products', 'quote-audit'))) return;
      const body = await readJson(request);
      return sendJson(response, 201, await createCategory(validateCategoryRequest(body)));
    }
    const categoryIdMatch = url.pathname.match(/^\/api\/categories\/([a-f0-9]{24})$/i);
    if (categoryIdMatch && request.method === 'PUT') {
      if (!(await requireScreen(request, response, 'categories', 'products', 'quote-audit'))) return;
      const id = categoryIdMatch[1];
      const data = validateCategoryRequest(await readJson(request));
      if (!(await updateCategory(id, data))) return sendJson(response, 404, { detail: 'Categoria não encontrada.' });
      return sendJson(response, 200, { id, ...data });
    }
    if (categoryIdMatch && request.method === 'DELETE') {
      if (!(await requireScreen(request, response, 'categories', 'products', 'quote-audit'))) return;
      const id = categoryIdMatch[1];
      if (!(await deleteCategory(id))) return sendJson(response, 404, { detail: 'Categoria não encontrada.' });
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/groups') {
      return sendJson(response, 200, { groups: await listGroups() });
    }
    if (request.method === 'POST' && url.pathname === '/api/groups') {
      if (!(await requireScreen(request, response, 'categories', 'products', 'quote-audit'))) return;
      const body = await readJson(request);
      return sendJson(response, 201, await createGroup(body?.name));
    }
    const groupIdMatch = url.pathname.match(/^\/api\/groups\/([a-f0-9]{24})$/i);
    if (groupIdMatch && request.method === 'DELETE') {
      if (!(await requireScreen(request, response, 'categories', 'products', 'quote-audit'))) return;
      const id = groupIdMatch[1];
      if (!(await deleteGroup(id))) return sendJson(response, 404, { detail: 'Grupo não encontrado.' });
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/resources') {
      return sendJson(response, 200, { resources: await listResources() });
    }
    if (request.method === 'POST' && url.pathname === '/api/resources') {
      if (!(await requireScreen(request, response, 'categories', 'products', 'quote-audit'))) return;
      const body = await readJson(request);
      return sendJson(response, 201, await createResource(validateResourceRequest(body)));
    }
    const resourceIdMatch = url.pathname.match(/^\/api\/resources\/([a-f0-9]{24})$/i);
    if (resourceIdMatch && request.method === 'PUT') {
      if (!(await requireScreen(request, response, 'categories', 'products', 'quote-audit'))) return;
      const id = resourceIdMatch[1];
      const label = normalize((await readJson(request)).label);
      if (!label || label.length > 100) throw new Error('Informe um nome para o recurso (até 100 caracteres).');
      if (!(await updateResource(id, { label }))) return sendJson(response, 404, { detail: 'Recurso não encontrado.' });
      return sendJson(response, 200, { id, label });
    }
    if (resourceIdMatch && request.method === 'DELETE') {
      if (!(await requireScreen(request, response, 'categories', 'products', 'quote-audit'))) return;
      const id = resourceIdMatch[1];
      if (!(await deleteResource(id))) return sendJson(response, 404, { detail: 'Recurso não encontrado.' });
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/budgets') {
      const user = await requireScreen(request, response, 'budget');
      if (!user) return;
      return sendJson(response, 200, { budgets: await listBudgetsForUser(user.id, user.unrestricted) });
    }
    if (request.method === 'POST' && url.pathname === '/api/budgets') {
      const user = await requireScreen(request, response, 'budget');
      if (!user) return;
      return sendJson(response, 201, await createBudget(user.id));
    }
    const budgetAddressMatch = url.pathname.match(/^\/api\/budgets\/([a-f0-9]{24})\/address$/i);
    if (budgetAddressMatch && request.method === 'POST') {
      const user = await requireScreen(request, response, 'budget');
      if (!user) return;
      const { clientName, address, number } = validateSetAddressRequest(await readJson(request));
      const { lat, lng } = await geocodeAddress(`${address}, ${number}`);
      const budget = await setBudgetAddressForUser(budgetAddressMatch[1], user.id, { clientName, address, number, lat, lng }, user.unrestricted);
      if (!budget) return sendJson(response, 404, { detail: 'Orçamento não encontrado.' });
      return sendJson(response, 200, budget);
    }
    // Alternativa ao mapa (endereço geocodificado): consultor envia uma imagem da planta baixa e
    // posiciona os itens em cima dela, mesma interação do mapa (ver FloorPlanCanvas). Corpo cru
    // (o arquivo em bytes), não JSON — filename/width/height chegam na query string porque o
    // navegador já sabe as dimensões da imagem antes de mandar (lido com createImageBitmap).
    const floorPlanMatch = url.pathname.match(/^\/api\/budgets\/([a-f0-9]{24})\/floorplan$/i);
    if (floorPlanMatch && request.method === 'POST') {
      const user = await requireScreen(request, response, 'budget');
      if (!user) return;
      const existing = await getBudgetForUser(floorPlanMatch[1], user.id, user.unrestricted);
      if (!existing) return sendJson(response, 404, { detail: 'Orçamento não encontrado.' });
      if (existing.status === 'fechado') return sendJson(response, 400, { detail: 'Orçamento fechado só pode ser visualizado — não é possível editar.' });
      const filename = normalize(url.searchParams.get('filename'));
      const ext = (filename.split('.').pop() || '').toLowerCase();
      if (!FLOORPLAN_EXTENSIONS.includes(ext)) return sendJson(response, 400, { detail: 'Envie uma imagem PNG ou JPG.' });
      const width = Number(url.searchParams.get('width'));
      const height = Number(url.searchParams.get('height'));
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return sendJson(response, 400, { detail: 'Dimensões da imagem inválidas.' });
      const buffer = await readBinary(request, FLOORPLAN_MAX_BYTES);
      const floorPlanPath = await saveFloorPlanFile(floorPlanMatch[1], buffer, ext);
      // Planta nova invalida as posições da anterior (imagem diferente) — reseta o layout junto.
      const budget = await updateBudgetForUser(floorPlanMatch[1], user.id, { floorPlan: { path: floorPlanPath, width, height }, floorPlanLayout: {} }, user.unrestricted);
      return sendJson(response, 200, budget);
    }
    const budgetIdMatch = url.pathname.match(/^\/api\/budgets\/([a-f0-9]{24})$/i);
    if (budgetIdMatch && request.method === 'GET') {
      const user = await requireScreen(request, response, 'budget');
      if (!user) return;
      const budget = await getBudgetForUser(budgetIdMatch[1], user.id, user.unrestricted);
      if (!budget) return sendJson(response, 404, { detail: 'Orçamento não encontrado.' });
      return sendJson(response, 200, budget);
    }
    if (budgetIdMatch && request.method === 'PATCH') {
      const user = await requireScreen(request, response, 'budget');
      if (!user) return;
      const patch = validateBudgetSaveRequest(await readJson(request));
      const budget = await updateBudgetForUser(budgetIdMatch[1], user.id, patch, user.unrestricted);
      if (!budget) return sendJson(response, 404, { detail: 'Orçamento não encontrado.' });
      return sendJson(response, 200, budget);
    }
    if (budgetIdMatch && request.method === 'DELETE') {
      const user = await requireScreen(request, response, 'budget');
      if (!user) return;
      const result = await deleteBudgetForUser(budgetIdMatch[1], user.id, user.unrestricted);
      if (!result.deleted) {
        if (result.reason === 'not_found') return sendJson(response, 404, { detail: 'Orçamento não encontrado.' });
        return sendJson(response, 400, { detail: 'Só é possível excluir orçamentos com status "aberto".' });
      }
      await deleteFloorPlanFile(budgetIdMatch[1]).catch(() => {}); // órfão no disco não impede a exclusão do orçamento
      return sendJson(response, 200, { deleted: true });
    }
    const floorPlanFileMatch = url.pathname.match(/^\/uploads\/floorplans\/([a-zA-Z0-9_.-]+)$/);
    if (floorPlanFileMatch && request.method === 'GET') return serveFromDirectory(UPLOADS_DIRECTORY, floorPlanFileMatch[1], response);
    if (request.method === 'GET') return serveStatic(url.pathname, response);
    return sendJson(response, 404, { detail: 'Rota não encontrada.' });
  } catch (error) {
    return sendJson(response, 400, { detail: error.message || 'Erro interno do servidor.' });
  }
}

function startServer() {
  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, async () => {
    const { DEV_EMAIL, DEV_PASSWORD } = process.env;
    if (DEV_EMAIL && DEV_PASSWORD) {
      await seedDevAdmin({ email: DEV_EMAIL, passwordHash: hashPassword(DEV_PASSWORD) });
      console.log(`Usuário dev (admin) pronto: ${DEV_EMAIL}`);
    }
    console.log(`SPECIUM em http://localhost:${PORT}`);
  });
  return server;
}

function setGoogleShoppingFetcher(fetcher) {
  setShoppingFetcher(fetcher);
}

if (require.main === module) startServer();

module.exports = {
  buildGoogleShoppingUrl,
  buildIntelbrasSpecs,
  computeCategoryMissingEssentials,
  detectExactCategory,
  detectSecurityCategory,
  excludePriceOutliers,
  extractAcabamentoSpecs,
  extractCaboSpecs,
  extractCameraSpecs,
  extractDvrNvrSpecs,
  extractFacialSpecs,
  extractFonteSpecs,
  extractMikrotikSpecs,
  extractPorteiroSpecs,
  extractRoteadorSpecs,
  extractSwitchSpecs,
  fetchIntelbrasProductSpecs,
  fetchProductSpecs,
  fetchRecipeItemPrice,
  isStandaloneProductOffer,
  matchesRequestedModel,
  normalizeAmazonOffers,
  normalizeIntelbrasOffers,
  normalizeSerperShopping,
  normalizeSerpApiShopping,
  requestHandler,
  searchAllProviders,
  searchAmazonShopping,
  searchIntelbrasShopping,
  searchSerperShopping,
  searchSerpApiShopping,
  selectTopDistinctStores,
  setAmazonBrowserLauncher,
  setGoogleShoppingFetcher,
  startServer,
  validateProductRequest,
  closeDb,
};
