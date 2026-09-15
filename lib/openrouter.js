const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Conta é free-tier (sem crédito) — modelos ":free" dividem uma fila compartilhada e voltam 429
// (rate-limited) sem aviso prévio. Uma lista de fallback, não um modelo único, é o que faz essa
// conta funcionar de verdade: se o primeiro estiver sobrecarregado, tenta o próximo antes de desistir.
const DEFAULT_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'liquid/lfm-2.5-2.6b:free',
  'z-ai/glm-5.2:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];

function candidateModels() {
  const configured = (process.env.OPENROUTER_MODEL || '').trim();
  return configured ? [configured, ...DEFAULT_MODELS.filter((m) => m !== configured)] : DEFAULT_MODELS;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Medido nesta conta: até 1 em cada 3 chamadas pro MESMO modelo volta sem conteúdo (fila
// compartilhada do free-tier sobrecarrega de forma instável, não é erro de código) — retry simples
// no mesmo modelo resolve a maioria antes de precisar cair pro próximo da lista.
const RETRIES_PER_MODEL = 3;
const RETRY_DELAY_MS = 800;

async function attemptOnce(model, messages, temperature, apiKey) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `OpenRouter (${model}) respondeu ${res.status}.`);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter (${model}) não retornou conteúdo.`);
  return content;
}

// Tenta cada modelo da lista (com retry) em sequência até um responder com sucesso — só propaga o
// erro se TODOS falharem. `messages`: mesmo formato da Chat Completions API da OpenAI (OpenRouter é
// compatível).
async function callOpenRouter({ messages, temperature = 0.2, models = candidateModels() } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada no .env.');
  if (!Array.isArray(messages) || !messages.length) throw new Error('Informe ao menos uma mensagem pra IA.');

  let lastError = null;
  for (const model of models) {
    for (let attempt = 1; attempt <= RETRIES_PER_MODEL; attempt++) {
      try {
        const content = await attemptOnce(model, messages, temperature, apiKey);
        return { content, model };
      } catch (err) {
        lastError = err;
        if (attempt < RETRIES_PER_MODEL) await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw lastError || new Error('Nenhum modelo da OpenRouter respondeu.');
}

module.exports = { callOpenRouter };
