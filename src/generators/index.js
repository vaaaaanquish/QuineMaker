// Language generator registry. Add new languages here; each generator
// implements { id, label, fileExt, verifyEngine, generate(mask, opts) }.
import { pythonGenerator } from './python.js';
import { javascriptGenerator } from './javascript.js';

export const generators = {
  python: pythonGenerator,
  javascript: javascriptGenerator,
};

export function getGenerator(id) {
  const g = generators[id];
  if (!g) throw new Error(`unknown language: ${id}`);
  return g;
}

export function listGenerators() {
  return Object.values(generators).map((g) => ({ id: g.id, label: g.label }));
}
