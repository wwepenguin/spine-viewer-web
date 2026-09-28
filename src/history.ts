/** Bounded history. A failed asynchronous restore does not move the cursor. */
export class EditHistory<T> {
  private entries: { state: T; key: string }[] = [];
  private cursor = -1;
  busy = false;
  constructor(
    private key: (state: T) => string,
    private limit = 40,
  ) {}
  get canUndo() {
    return !this.busy && this.cursor > 0;
  }
  get canRedo() {
    return !this.busy && this.cursor < this.entries.length - 1;
  }
  record(state: T) {
    if (this.busy) return;
    const key = this.key(state);
    if (this.entries[this.cursor]?.key === key) return;
    this.entries.splice(this.cursor + 1);
    this.entries.push({ state, key });
    if (this.entries.length > this.limit) this.entries.shift();
    this.cursor = this.entries.length - 1;
  }
  async move(direction: -1 | 1, restore: (state: T) => Promise<void>) {
    if (direction < 0 ? !this.canUndo : !this.canRedo) return;
    this.busy = true;
    const next = this.cursor + direction;
    try {
      await restore(this.entries[next].state);
      this.cursor = next;
    } finally {
      this.busy = false;
    }
  }
}
