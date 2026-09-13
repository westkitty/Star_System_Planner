/**
 * Uniform spatial hash grid (BACK01).
 *
 * Broadphase neighbor queries for monitor pair-checks (conjunctions,
 * assists, syzygies) so detection stays O(n) instead of O(n²) as the
 * body census grows in long sandbox sessions.
 */

import { Vector3D } from './types';

export class SpatialHash {
  private cells = new Map<string, string[]>();
  private positions = new Map<string, Vector3D>();

  constructor(public readonly cellSizeKm: number) {}

  public clear(): void {
    this.cells.clear();
    this.positions.clear();
  }

  private keyFor(x: number, y: number, z: number): string {
    const c = this.cellSizeKm;
    return `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`;
  }

  public insert(id: string, pos: Vector3D): void {
    this.positions.set(id, pos);
    const key = this.keyFor(pos.x, pos.y, pos.z);
    const cell = this.cells.get(key);
    if (cell) cell.push(id);
    else this.cells.set(key, [id]);
  }

  /** All inserted ids within `radiusKm` of `pos` (excluding `excludeId`). */
  public queryRadius(pos: Vector3D, radiusKm: number, excludeId?: string): string[] {
    const c = this.cellSizeKm;
    const minX = Math.floor((pos.x - radiusKm) / c);
    const maxX = Math.floor((pos.x + radiusKm) / c);
    const minY = Math.floor((pos.y - radiusKm) / c);
    const maxY = Math.floor((pos.y + radiusKm) / c);
    const minZ = Math.floor((pos.z - radiusKm) / c);
    const maxZ = Math.floor((pos.z + radiusKm) / c);
    const out: string[] = [];
    const r2 = radiusKm * radiusKm;
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const cell = this.cells.get(`${ix},${iy},${iz}`);
          if (!cell) continue;
          for (const id of cell) {
            if (id === excludeId) continue;
            const p = this.positions.get(id);
            if (!p) continue;
            const dx = p.x - pos.x;
            const dy = p.y - pos.y;
            const dz = p.z - pos.z;
            if (dx * dx + dy * dy + dz * dz <= r2) out.push(id);
          }
        }
      }
    }
    return out;
  }

  public get size(): number {
    return this.positions.size;
  }
}
