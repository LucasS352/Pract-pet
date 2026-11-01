/** Agrupa polling simultâneo; chave deve incluir tenant. Nunca usado para validar escritas. */
export class ShortReadCache {
  private readonly entries = new Map<string, { until: number; promise: Promise<any> }>();
  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const current = this.entries.get(key);
    if (current && current.until > Date.now()) return current.promise;
    if (this.entries.size >= 32) this.entries.delete(this.entries.keys().next().value!);
    const entry = { until: Infinity, promise: Promise.resolve().then(load) };
    this.entries.set(key, entry);
    entry.promise = entry.promise.then(value => { entry.until = Date.now() + 500; return value; }, error => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    return entry.promise;
  }
  clear() { this.entries.clear(); }
}
