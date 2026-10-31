/** A FIFO of 32-bit integers in a ring buffer that doubles when full, so pushes never fail. */
export class IntQueue {
  private data: Int32Array;
  private head = 0;
  private count = 0;

  constructor(capacity = 1024) {
    this.data = new Int32Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  push(v: number): void {
    if (this.count === this.data.length) this.grow();
    this.data[(this.head + this.count) % this.data.length] = v;
    this.count++;
  }

  shift(): number {
    if (this.count === 0) throw new Error('IntQueue is empty');
    const v = this.data[this.head]!;
    this.head = (this.head + 1) % this.data.length;
    this.count--;
    return v;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  private grow(): void {
    const next = new Int32Array(this.data.length * 2);
    for (let i = 0; i < this.count; i++) next[i] = this.data[(this.head + i) % this.data.length]!;
    this.data = next;
    this.head = 0;
  }
}
