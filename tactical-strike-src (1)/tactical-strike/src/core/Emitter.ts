/** Tiny typed event emitter used to decouple the simulation from rendering, audio and UI. */
export class Emitter<E extends object> {
  private map = new Map<string, Set<(p: never) => void>>();

  on<K extends keyof E & string>(key: K, fn: (p: E[K]) => void): () => void {
    let set = this.map.get(key);
    if (!set) this.map.set(key, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => set!.delete(fn as (p: never) => void);
  }

  emit<K extends keyof E & string>(key: K, payload: E[K]) {
    const set = this.map.get(key);
    if (!set) return;
    for (const fn of set) (fn as (p: E[K]) => void)(payload);
  }

  clear() {
    this.map.clear();
  }
}
