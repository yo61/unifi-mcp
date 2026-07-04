export class PromiseCache<K, V> {
  readonly #map = new Map<K, Promise<V>>();

  async getOrLoad(key: K, loader: () => Promise<V>): Promise<V> {
    const existing = this.#map.get(key);
    if (existing !== undefined) return existing;
    const p = loader();
    this.#map.set(key, p);
    try {
      return await p;
    } catch (err) {
      // Don't cache failures — let the next call retry.
      if (this.#map.get(key) === p) this.#map.delete(key);
      throw err;
    }
  }

  invalidate(key: K): void {
    this.#map.delete(key);
  }

  clear(): void {
    this.#map.clear();
  }
}
