// `fetch` usado por todo provedor HTTP (Intelbras, Serper, SerpApi) — indireção só pra permitir
// mockar a rede nos testes (setShoppingFetcher), sem passar um fetchImpl explícito em cada chamada.
let fetcher = (...args) => fetch(...args);

function getShoppingFetcher() {
  return fetcher;
}

function setShoppingFetcher(fn) {
  fetcher = fn;
}

module.exports = { getShoppingFetcher, setShoppingFetcher };
