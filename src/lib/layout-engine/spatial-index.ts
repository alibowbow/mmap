import { overlaps } from "./geometry";
import type { Rect } from "./types";

// Bounded uniform grid. Huge rectangles/queries fall back to the sparse set,
// never allocate millions of empty cells for a deep tree or distant detour.
export class SpatialIndex<T extends Rect> {
  private cells = new Map<string, Set<string>>();
  private entries = new Map<string, T>();
  private memberships = new Map<string, string[]>();
  private large = new Set<string>();
  constructor(private cellSize = 320) {}
  private keys(r: Rect): string[] | null {
    const x0 = Math.floor(r.x / this.cellSize),
      x1 = Math.floor((r.x + r.width) / this.cellSize);
    const y0 = Math.floor(r.y / this.cellSize),
      y1 = Math.floor((r.y + r.height) / this.cellSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 1024) return null;
    const keys: string[] = [];
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) keys.push(`${x}:${y}`);
    return keys;
  }
  set(id: string, r: T) {
    this.delete(id);
    this.entries.set(id, r);
    const keys = this.keys(r);
    if (!keys) {
      this.large.add(id);
      return;
    }
    this.memberships.set(id, keys);
    for (const k of keys) {
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = new Set()));
      c.add(id);
    }
  }
  delete(id: string) {
    for (const k of this.memberships.get(id) ?? []) {
      const c = this.cells.get(k)!;
      c.delete(id);
      if (!c.size) this.cells.delete(k);
    }
    this.memberships.delete(id);
    this.large.delete(id);
    this.entries.delete(id);
  }
  query(r: Rect): T[] {
    const keys = this.keys(r),
      ids = new Set(this.large);
    if (!keys)
      return [...this.entries.values()].filter((v) => overlaps(r, v, -0.001));
    for (const k of keys) for (const id of this.cells.get(k) ?? []) ids.add(id);
    return [...ids]
      .map((id) => this.entries.get(id)!)
      .filter((v) => overlaps(r, v, -0.001));
  }
}
