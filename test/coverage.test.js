const test = require('node:test');
const assert = require('node:assert/strict');

// Geometria da área de cobertura é ESM do front (web/src/lib/coverage.js, sem dependência de
// Leaflet/React) — import dinâmico a partir do teste CommonJS.
const load = () => import('../web/src/lib/coverage.js');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('planFrame: heading 0 aponta pra cima (lat), 90 pra direita (lng), na escala em px/m', async () => {
  const { coverageHandle, planFrame } = await load();
  const frame = planFrame(20);
  const up = coverageHandle({ lat: 100, lng: 100, heading: 0, range: 10 }, 'cone', frame);
  near(up.lat, 300);
  near(up.lng, 100);
  const right = coverageHandle({ lat: 100, lng: 100, heading: 90, range: 10 }, 'cone', frame);
  near(right.lat, 100);
  near(right.lng, 300);
});

test('coverageFromHandle é o inverso do coverageHandle (cone: alcance + direção; círculo: só alcance)', async () => {
  const { coverageFromHandle, coverageHandle, geoFrame } = await load();
  const marker = { lat: -23.55, lng: -46.63, heading: 225, range: 30 };
  const back = coverageFromHandle(marker, 'cone', geoFrame, coverageHandle(marker, 'cone', geoFrame));
  near(back.range, 30, 1e-4);
  near(back.heading, 225, 1e-4);
  const circle = coverageFromHandle(marker, 'circle', geoFrame, coverageHandle(marker, 'circle', geoFrame));
  near(circle.range, 30, 1e-4);
  assert.equal(circle.heading, undefined);
});

test('coveragePolygon: cone parte do equipamento e não passa do alcance; círculo é 360° fechado', async () => {
  const { coveragePolygon, planFrame } = await load();
  const frame = planFrame(10);
  const marker = { lat: 0, lng: 0, heading: 0, range: 20, angle: 90 };
  const cone = coveragePolygon(marker, 'cone', frame);
  assert.deepEqual(cone[0], [0, 0]);
  for (const [lat, lng] of cone.slice(1)) near(Math.hypot(lat, lng), 200, 1e-6);
  const circle = coveragePolygon(marker, 'circle', frame);
  assert.equal(circle.length, 72);
  for (const [lat, lng] of circle) near(Math.hypot(lat, lng), 200, 1e-6);
});

test('resolutionFromTitle: lê MP/4K/HD do título e cai em Full HD sem sinal', async () => {
  const { resolutionFromTitle } = await load();
  assert.equal(resolutionFromTitle('Câmera IP Intelbras 4MP PoE'), 2560);
  assert.equal(resolutionFromTitle('Camera Bullet 8 MP'), 3840);
  assert.equal(resolutionFromTitle('Câmera 4K'), 3840);
  assert.equal(resolutionFromTitle('Câmera HD 720p'), 1280);
  assert.equal(resolutionFromTitle('Câmera Full HD'), 1920);
  assert.equal(resolutionFromTitle('Câmera bullet'), 1920);
});

test('faixas de densidade: 2MP com 90° identifica até 3,84 m e detecta até 38,4 m; o alcance corta as fatias', async () => {
  const { bandLimits, coverageBands, pixelDensity, planFrame } = await load();
  const marker = { lat: 0, lng: 0, heading: 0, range: 20, angle: 90, resolution: 1920 };
  const limits = bandLimits(marker);
  near(limits[0].distance, 1920 / (250 * 2), 1e-6); // tan(45°) = 1 → cena = 2·d
  near(limits[3].distance, 1920 / (25 * 2), 1e-6);
  near(pixelDensity(1920, 90, limits[1].distance), 125, 1e-6);
  // Alcance 20 m: 0–3,84 / 3,84–7,68 / 7,68–15,36 / 15,36–20 (a última é cortada); com 10 m sobram 3 faixas.
  assert.equal(coverageBands(marker, planFrame(1)).length, 4);
  const bands = coverageBands({ ...marker, range: 10 }, planFrame(1));
  assert.deepEqual(bands.map((b) => b.color), ['#22c55e', '#facc15', '#fb923c']);
  // Resolução maior empurra tudo pra longe: 4K vê 2x mais longe que 2MP com o mesmo ângulo.
  near(bandLimits({ ...marker, resolution: 3840 })[0].distance, limits[0].distance * 2, 1e-6);
});

test('coverageOf: marker sem valores salvos usa o padrão; valores fora do limite são contidos', async () => {
  const { COVERAGE_DEFAULTS, coverageOf } = await load();
  assert.deepEqual(coverageOf({}), COVERAGE_DEFAULTS);
  assert.equal(coverageOf({ range: 99999, angle: 1 }).range, 500);
  assert.equal(coverageOf({ range: 99999, angle: 1 }).angle, 10);
});
