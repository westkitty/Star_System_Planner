/**
 * Floating Origin Manager.
 * 
 * Prevents 32-bit floating point precision loss and geometry jitter by keeping
 * GPU coordinates relative to a dynamic scene origin (typically the camera focus or selected body).
 */

import { Vector3D } from '../simulation/types';

export class FloatingOrigin {
  public origin: Vector3D = { x: 0, y: 0, z: 0 };

  /**
   * Set the floating origin anchor point in absolute physical km.
   */
  public setOrigin(x: number, y: number, z: number): void {
    this.origin.x = x;
    this.origin.y = y;
    this.origin.z = z;
  }

  /**
   * Transform absolute physical coordinates into origin-relative coordinates.
   */
  public toRelative(pos: Vector3D): Vector3D {
    return {
      x: pos.x - this.origin.x,
      y: pos.y - this.origin.y,
      z: pos.z - this.origin.z,
    };
  }

  /**
   * Transform origin-relative coordinates back to absolute physical coordinates.
   */
  public toAbsolute(rel: Vector3D): Vector3D {
    return {
      x: rel.x + this.origin.x,
      y: rel.y + this.origin.y,
      z: rel.z + this.origin.z,
    };
  }
}
