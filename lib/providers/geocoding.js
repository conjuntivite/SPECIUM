const { getShoppingFetcher } = require('./shoppingFetcher');

// Nominatim (OpenStreetMap) — geocodificação gratuita, sem key e sem conta (trocado do Google
// Geocoding API a pedido do usuário, que não quer exigir cartão de crédito de quem for rodar este
// projeto). Política de uso exige um User-Agent identificando a aplicação — User-Agent padrão de
// biblioteca HTTP é rejeitado — e no máximo 1 requisição/segundo:
// https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_USER_AGENT = 'ComprradorInviolavel-OrcamentoCFTV/1.0';

async function nominatimSearch(query, fetchImpl) {
  const params = new URLSearchParams({ ...query, format: 'json', limit: '1', countrycodes: 'br' });
  const response = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('O serviço de geocodificação não respondeu à consulta de endereço.');
  const results = await response.json();
  return results?.[0] || null;
}

// Busca estruturada (rua+número, cidade, UF) primeiro — acerta o ponto da casa bem mais que texto
// livre. Se o OSM não tiver a rua com esse nome exato, cai pra linha livre com bairro e CEP.
async function geocodeAddress({ street, number, district, city, state, cep }, fetchImpl = getShoppingFetcher()) {
  const result = await nominatimSearch({ street: `${number} ${street}`, city, state, country: 'Brasil' }, fetchImpl)
    || await nominatimSearch({ q: [`${street}, ${number}`, district, `${city} - ${state}`, cep].filter(Boolean).join(', ') }, fetchImpl);
  if (!result) throw new Error('Não foi possível localizar esse endereço. Confira e tente novamente.');
  return { lat: Number(result.lat), lng: Number(result.lon), formatted_address: result.display_name };
}

module.exports = { geocodeAddress };
