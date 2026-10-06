const test = require('node:test');
const assert = require('node:assert/strict');

const { geocodeAddress } = require('../lib/providers/geocoding');

const PAULISTA = { street: 'Avenida Paulista', number: '1000', district: 'Bela Vista', city: 'São Paulo', state: 'SP', cep: '01310100' };

// Responde em sequência, uma resposta por chamada, e guarda a query de cada uma.
function fakeFetch(...responses) {
  const queries = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers['User-Agent'], 'ComprradorInviolavel-OrcamentoCFTV/1.0');
    queries.push(Object.fromEntries(new URL(url).searchParams));
    const [payload, ok = true] = responses[queries.length - 1];
    return { ok, json: async () => payload };
  };
  return { fetchImpl, queries };
}

test('geocodifica com busca estruturada (rua+número, cidade, UF)', async () => {
  const { fetchImpl, queries } = fakeFetch([[{ lat: '-23.561', lon: '-46.655', display_name: 'Av. Paulista, São Paulo - SP' }]]);
  const result = await geocodeAddress(PAULISTA, fetchImpl);
  assert.deepEqual(result, { lat: -23.561, lng: -46.655, formatted_address: 'Av. Paulista, São Paulo - SP' });
  assert.equal(queries.length, 1);
  assert.equal(queries[0].street, '1000 Avenida Paulista');
  assert.equal(queries[0].city, 'São Paulo');
  assert.equal(queries[0].state, 'SP');
});

test('cai pra linha livre com bairro e CEP quando a estruturada não acha', async () => {
  const { fetchImpl, queries } = fakeFetch([[]], [[{ lat: '-1', lon: '-2', display_name: 'x' }]]);
  const result = await geocodeAddress(PAULISTA, fetchImpl);
  assert.equal(result.lat, -1);
  assert.equal(queries[1].q, 'Avenida Paulista, 1000, Bela Vista, São Paulo - SP, 01310100');
});

test('erro amigável quando nenhuma das buscas acha', async () => {
  const { fetchImpl } = fakeFetch([[]], [[]]);
  await assert.rejects(() => geocodeAddress(PAULISTA, fetchImpl), /Não foi possível localizar/);
});

test('erro amigável quando o Nominatim não responde', async () => {
  const { fetchImpl } = fakeFetch([{}, false]);
  await assert.rejects(() => geocodeAddress(PAULISTA, fetchImpl), /serviço de geocodificação/);
});
