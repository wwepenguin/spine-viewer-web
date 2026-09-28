/** Reference-counted asynchronous resources. Each acquire owns exactly one release. */
export class ResourcePool<K, T> {
  private entries = new Map<K, { refs: number; value?: T; pending: Promise<T> }>();
  constructor(private destroy: (value: T) => void) {}
  async acquire(key: K, create: () => Promise<T>, valid: (value: T) => boolean = () => true) {
    let entry = this.entries.get(key);
    if (entry?.value && !valid(entry.value)) entry = undefined;
    if (!entry) {
      const next: { refs: number; value?: T; pending: Promise<T> } = {
        refs: 0,
        pending: Promise.resolve().then(create),
      };
      next.pending = next.pending.then(
        (value) => {
          next.value = value;
          return value;
        },
        (error) => {
          if (this.entries.get(key) === next) this.entries.delete(key);
          throw error;
        },
      );
      entry = next;
      this.entries.set(key, next);
    }
    entry.refs++;
    const held = entry;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (--held.refs === 0) {
        if (this.entries.get(key) === held) this.entries.delete(key);
        if (held.value) this.destroy(held.value);
      }
    };
    try {
      return { value: await held.pending, release };
    } catch (error) {
      release();
      throw error;
    }
  }
}
