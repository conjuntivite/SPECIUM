// O título gravado do item é "categoria marca modelo" (BudgetCanvas.composeProductTitle) — a categoria
// fica no texto de propósito, porque sugestões, busca de preço e planta reconhecem o equipamento por
// ele. Só na exibição a categoria sai quando há produto escolhido; item sem produto (título = só a
// categoria) continua mostrando a categoria. A mais longa é testada primeiro ("Câmera IP DOMME" antes
// de "Câmera IP").
export function displayTitle(title, categoryValues) {
  const prefix = [...categoryValues]
    .sort((a, b) => b.length - a.length)
    .find((value) => title.startsWith(`${value} `))
  return prefix ? title.slice(prefix.length + 1) : title
}
