const test = require('node:test');
const assert = require('node:assert/strict');

const { geocodeAddress } = require('../lib/providers/geocoding');

function fakeJsonFetch(payload, ok = true) {
  return async (url, options) => {
    assert.equal(options.headers['User-Agent'], 'ComprradorInviolavel-OrcamentoCFTV/1.0');
    return { ok, json: async () => payload };
  };
}

test('geocodes an address into lat/lng via Nominatim', async () => {
  const fetchImpl = fakeJsonFetch([{ lat: '-23.561', lon: '-46.655', display_name: 'Av. Paulista, São Paulo - SP' }]);
  const result = await geocodeAddress('Av. Paulista 1000', fetchImpl);
  assert.deepEqual(result, { lat: -23.561, lng: -46.655, formatted_address: 'Av. Paulista, São Paulo - SP' });
});

test('throws a friendly error when the address is not found', async () => {
  const fetchImpl = fakeJsonFetch([]);
  await assert.rejects(() => geocodeAddress('endereço inexistente', fetchImpl), /Não foi possível localizar/);
});

test('throws a friendly error when Nominatim does not respond', async () => {
  const fetchImpl = fakeJsonFetch({}, false);
  await assert.rejects(() => geocodeAddress('Av. Paulista 1000', fetchImpl), /serviço de geocodificação/);
});
