#!/usr/bin/env node
// Exporta/importa o catálogo (grupos, recursos, categorias, produtos, instruções da IA) do/para o Mongo.
//
//   node scripts/catalog-sync.js export [arquivo]
//   node scripts/catalog-sync.js import [arquivo] [--apply] [--with-instructions]
//
// Arquivo padrão: data/catalog-snapshot.json (versionado no Git). O import só SIMULA, a menos que você
// passe --apply, e nunca apaga nada. As instruções da IA só entram com --with-instructions, porque
// sobrescreveriam o que foi editado pela tela "Instruções da IA".
const fs = require('node:fs');
const path = require('node:path');
require('../lib/env');
const db = require('../db');
const { buildSnapshot, planImport } = require('../lib/catalogSync');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'catalog-snapshot.json');

async function readCurrent() {
  const [groups, resources, categories, products, aiInstructions] = await Promise.all([
    db.listGroups(), db.listResources(), db.listCategories(), db.listProducts(), db.getAiInstructions(),
  ]);
  return { groups, resources, categories, products, aiInstructions };
}

async function exportSnapshot(file) {
  const snapshot = buildSnapshot(await readCurrent());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`Exportado para ${file}: ${snapshot.groups.length} grupos, ${snapshot.resources.length} recursos, ${snapshot.categories.length} categorias, ${snapshot.products.length} produtos, instruções da IA ${snapshot.aiInstructions.classification ? 'sim' : 'padrão'}.`);
}

async function importSnapshot(file, { apply, withInstructions }) {
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (snapshot.version !== 1) throw new Error(`Versão de snapshot não suportada: ${snapshot.version}`);
  const plan = planImport(snapshot, await readCurrent(), { withInstructions });
  console.log([
    `grupos: +${plan.groups.create.length}`,
    `recursos: +${plan.resources.create.length} ~${plan.resources.update.length}`,
    `categorias: +${plan.categories.create.length} ~${plan.categories.update.length}`,
    `produtos: +${plan.products.create.length} ~${plan.products.update.length}`,
    `instruções da IA: ${plan.aiInstructions ? 'serão substituídas' : withInstructions ? 'já iguais' : 'não incluídas (use --with-instructions)'}`,
  ].join(' | '));
  if (plan.extrasInDb) console.log(`(${plan.extrasInDb} item(ns) existem só no banco e ficam como estão: o import nunca apaga)`);
  for (const c of plan.categories.update) console.log(`  ~ categoria "${c.value}" será atualizada`);
  if (!apply) { console.log(plan.total ? 'SIMULAÇÃO: nada foi gravado. Rode de novo com --apply.' : 'Nada a fazer: o banco já está igual ao arquivo.'); return; }

  // Ordem importa: recursos e grupos antes das categorias, categorias antes dos produtos.
  for (const name of plan.groups.create) await db.createGroup(name);
  for (const r of plan.resources.create) await db.createResource({ key: r.key, label: r.label });
  for (const r of plan.resources.update) await db.updateResource(r.id, { label: r.label });
  for (const { id, ...c } of plan.categories.update) await db.updateCategory(id, c);
  for (const c of plan.categories.create) await db.createCategory(c);
  for (const p of plan.products.create) await db.createProduct(p);
  for (const { id, ...p } of plan.products.update) await db.updateProduct(id, p);
  if (plan.aiInstructions) await db.updateAiInstructions(snapshot.aiInstructions);
  console.log(`Aplicado: ${plan.total} alteração(ões).`);
}

(async () => {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const file = rest.find((a) => !a.startsWith('--')) || DEFAULT_FILE;
  try {
    if (command === 'export') await exportSnapshot(file);
    else if (command === 'import') await importSnapshot(file, { apply: flags.has('--apply'), withInstructions: flags.has('--with-instructions') });
    else { console.log('uso: node scripts/catalog-sync.js export [arquivo]\n     node scripts/catalog-sync.js import [arquivo] [--apply] [--with-instructions]'); process.exitCode = 1; }
  } catch (err) {
    console.error('Erro:', err.message);
    process.exitCode = 1;
  } finally {
    await db.closeDb();
  }
})();
