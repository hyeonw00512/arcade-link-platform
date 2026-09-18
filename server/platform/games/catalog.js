import { readFile } from 'node:fs/promises';

const catalogUrl = new URL('../../../shared/config/games.json', import.meta.url);

export async function loadGameCatalog() {
  const games = JSON.parse(await readFile(catalogUrl, 'utf8'));
  return games.filter((game) => game.enabled);
}

export function findGame(games, gameId) {
  return games.find((game) => game.id === gameId);
}
