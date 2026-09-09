/**
 * Physics Space to Display Space Scale Transformation.
 * 
 * Supports:
 * - TRUE SCALE: 1:1 astronomical proportion (reveals the shocking emptiness of space).
 * - READABLE SCALE: Exaggerates planetary radii and spreads close orbits so celestial bodies
 *   can be easily inspected and touched on a tablet screen.
 * - Smooth morphing between the two modes.
 */

import { BodyType, Vector3D } from '../simulation/types';
import { KM_PER_AU } from '../simulation/units';

export type ScaleMode = 'true' | 'readable';

export class ScaleTransform {
  // Conversion constant: 1 AU = 1000 Three.js units in true scale
  public static readonly SCENE_UNITS_PER_KM = 1000.0 / KM_PER_AU; // ~ 6.6846e-6

  // Current smooth interpolation parameter (0 = True Scale, 1 = Readable Scale)
  public morphT: number = 1.0; // Defaults to Readable Scale on first load
  public targetMode: ScaleMode = 'readable';

  public setMode(mode: ScaleMode): void {
    this.targetMode = mode;
  }

  public update(deltaSec: number): void {
    const targetT = this.targetMode === 'readable' ? 1.0 : 0.0;
    const speed = 4.0; // Lerp speed
    this.morphT += (targetT - this.morphT) * Math.min(1.0, deltaSec * speed);
  }

  /**
   * Compute display radius in Three.js units for a given body type and physical radius.
   */
  public getDisplayRadius(radiusKm: number, type: BodyType): number {
    // 1. True physical radius in scene units
    const trueRadius = Math.max(0.005, radiusKm * ScaleTransform.SCENE_UNITS_PER_KM);

    // 2. Readable exaggerated radius
    let readableRadius = 1.0;
    switch (type) {
      case 'star':
      case 'black_hole':
        readableRadius = Math.max(8.0, Math.min(30.0, 10.0 + Math.log10(Math.max(1000, radiusKm)) * 2.5));
        break;
      case 'planet':
      case 'dwarf_planet':
        // Earth (6371km) -> ~3.2 units, Jupiter (69911km) -> ~6.0 units
        readableRadius = Math.max(1.5, Math.min(10.0, 1.2 * Math.log10(Math.max(500, radiusKm))));
        break;
      case 'moon':
        readableRadius = Math.max(0.8, Math.min(2.5, 0.8 * Math.log10(Math.max(100, radiusKm))));
        break;
      case 'station':
      case 'ship':
      case 'hookshot_node':
      case 'megastructure':
        readableRadius = 1.0;
        break;
      default:
        readableRadius = 1.5;
    }

    // Smooth lerp between true scale and readable scale
    return trueRadius * (1.0 - this.morphT) + readableRadius * this.morphT;
  }

  /**
   * Compute display position in Three.js units for a relative position in km.
   */
  public getDisplayPosition(relativeKm: Vector3D): Vector3D {
    // True distance in scene units
    const trueX = relativeKm.x * ScaleTransform.SCENE_UNITS_PER_KM;
    const trueY = relativeKm.y * ScaleTransform.SCENE_UNITS_PER_KM;
    const trueZ = relativeKm.z * ScaleTransform.SCENE_UNITS_PER_KM;

    if (this.morphT <= 0.001) {
      return { x: trueX, y: trueY, z: trueZ };
    }

    const distTrue = Math.sqrt(trueX * trueX + trueY * trueY + trueZ * trueZ);
    if (distTrue <= 0.0001) {
      return { x: 0, y: 0, z: 0 };
    }

    // In readable scale, we apply a gentle sub-linear power to distance so moons are not
    // buried inside planetary meshes while outer planets remain visible in the viewport.
    const readableDist = Math.pow(distTrue, 0.92) * 1.5;

    const scaleFactor = readableDist / distTrue;
    const readableX = trueX * scaleFactor;
    const readableY = trueY * scaleFactor;
    const readableZ = trueZ * scaleFactor;

    return {
      x: trueX * (1.0 - this.morphT) + readableX * this.morphT,
      y: trueY * (1.0 - this.morphT) + readableY * this.morphT,
      z: trueZ * (1.0 - this.morphT) + readableZ * this.morphT,
    };
  }

  /**
   * Convert display position back to relative km (using current morph factor).
   */
  public displayToRelativeKm(disp: Vector3D): Vector3D {
    const dispDist = Math.sqrt(disp.x * disp.x + disp.y * disp.y + disp.z * disp.z);
    if (dispDist <= 0.0001) {
      return { x: 0, y: 0, z: 0 };
    }

    // Approximate inversion
    let trueDist = dispDist;
    if (this.morphT > 0.001) {
      // Invert dispDist = lerp(d, d^0.92 * 1.5, morphT)
      const approxFactor = (1.0 - this.morphT) + this.morphT * Math.pow(dispDist, -0.08) * 1.5;
      trueDist = dispDist / Math.max(0.1, approxFactor);
    }

    const invScale = 1.0 / ScaleTransform.SCENE_UNITS_PER_KM;
    const dirX = disp.x / dispDist;
    const dirY = disp.y / dispDist;
    const dirZ = disp.z / dispDist;

    return {
      x: dirX * trueDist * invScale,
      y: dirY * trueDist * invScale,
      z: dirZ * trueDist * invScale,
    };
  }
}
