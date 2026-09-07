// Node 22+ exposes a native, global `localStorage`/`sessionStorage` (the Web
// Storage API), inert unless the process was started with `--localstorage-file`.
// Vitest's jsdom environment only overrides a global key that already exists on
// `globalThis` if that key is in its own curated list of browser globals, and
// `localStorage`/`sessionStorage` aren't in that list - so on any Node version
// that defines the native one, it silently shadows a working `Storage` for the
// whole test file (and the environment's own `window`/`document.defaultView`
// are made to alias `globalThis` itself, so there's no other in-scope object to
// pull jsdom's own instance from either). A minimal, self-contained in-memory
// implementation sidesteps both problems: it works identically regardless of
// the running Node version or any Node CLI flag.
class MemoryStorage {
  #map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#map.has(key) ? this.#map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.#map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.#map.delete(key);
  }
  clear(): void {
    this.#map.clear();
  }
  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }
  get length(): number {
    return this.#map.size;
  }
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, key, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
