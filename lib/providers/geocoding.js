const { getShoppingFetcher } = require('./shoppingFetcher');

// Nominatim (OpenStreetMap) — geocodificação gratuita, sem key e sem conta (trocado do Google
// Geocoding API a pedido do usuário, que não quer exigir cartão de crédito de quem for rodar este
// projeto). Política de uso exige um User-Agent identificando a aplicação — User-Agent padrão de
// biblioteca HTTP é rejeitado — e no máximo 1 requisição/segundo:
// https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_USER_AGENT = 'ComprradorInviolavel-OrcamentoCFTV/1.0';

async function geocodeAddress(address, fetchImpl = getShoppingFetcher()) {
  const params = new URLSearchParams({ q: address, format: 'json', limit: '1', countrycodes: 'br' });
  const response = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('O serviço de geocodificação não respondeu à consulta de endereço.');
  const results = await response.json();
  const result = results?.[0];
  if (!result) throw new Error('Não foi possível localizar esse endereço. Confira e tente novamente.');
  return { lat: Number(result.lat), lng: Number(result.lon), formatted_address: result.display_name };
}

module.exports = { geocodeAddress };
