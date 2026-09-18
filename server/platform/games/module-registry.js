/**
 * Platform-owned registry for game modules.
 * A game remains isolated: the platform only asks it for a public screen state
 * and forwards explicitly namespaced actions.
 */
export class GameModuleRegistry {
  constructor() {
    this.modules = new Map();
  }

  register(gameId, module) {
    if (!module || typeof module.createGame !== 'function') {
      throw new Error(`${gameId} 게임 모듈에 createGame이 필요합니다.`);
    }
    this.modules.set(gameId, module);
  }

  get(gameId) {
    return this.modules.get(gameId) || null;
  }

  getPublicState(gameId, game) {
    const module = this.get(gameId);
    return module?.getPublicState ? module.getPublicState(game) : null;
  }
}
