const fs = require('node:fs/promises');
const path = require('node:path');
const { UPLOADS_DIRECTORY } = require('./env');

const FLOORPLAN_EXTENSIONS = ['png', 'jpg', 'jpeg'];
// Folgado pra planta baixa em boa resolução sem deixar um upload gigante travar o servidor.
const FLOORPLAN_MAX_BYTES = 15 * 1024 * 1024;

async function removeExistingFiles(budgetId) {
  const files = await fs.readdir(UPLOADS_DIRECTORY).catch(() => []);
  await Promise.all(
    files.filter((f) => f.startsWith(`${budgetId}.`)).map((f) => fs.unlink(path.join(UPLOADS_DIRECTORY, f)).catch(() => {}))
  );
}

// Um orçamento tem no máximo uma planta baixa — reenviar troca a anterior (inclusive se a extensão
// mudou, ex: era .png e o novo envio é .jpg). O timestamp no nome faz cada envio ter URL nova —
// senão o navegador seguiria mostrando a imagem antiga (mesma URL, cache) e o canvas não remontaria.
async function saveFloorPlanFile(budgetId, buffer, ext) {
  await removeExistingFiles(budgetId);
  const fileName = `${budgetId}.${Date.now()}.${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIRECTORY, fileName), buffer);
  return `/uploads/floorplans/${fileName}`;
}

async function deleteFloorPlanFile(budgetId) {
  await removeExistingFiles(budgetId);
}

module.exports = { FLOORPLAN_EXTENSIONS, FLOORPLAN_MAX_BYTES, saveFloorPlanFile, deleteFloorPlanFile };
