const registry = new Map();

export function registerSim(SimClass) {
  registry.set(SimClass.id, SimClass);
}

export function getSim(id) {
  return registry.get(id);
}

export function getAllSims() {
  return [...registry.values()];
}
