/**
 * Signature Interaction: Grab & Throw.
 *
 * Select a body, drag it through the 3D scene, watch the velocity vector and
 * orbital prediction update continuously, then release to launch it into Newtonian physics.
 */

import * as THREE from 'three';
import { CelestialBody, Vector3D } from '../simulation/types';
import { SceneManager } from '../rendering/scene-manager';
import { ThrowVector, createThrowVector } from '../rendering/velocity-arrow';
import { PLANNER_CONFIG } from '../core/config';

export interface PointerSample {
  posKm: Vector3D;
  timestampMs: number;
}

export interface GrabThrowCallbacks {
  onVelocityChanged: (body: CelestialBody, newVelocityKmS: Vector3D) => void;
  onThrowReleased: (body: CelestialBody, finalVelocityKmS: Vector3D) => void;
}

export class GrabAndThrowController {
  private sceneManager: SceneManager;
  private callbacks: GrabThrowCallbacks;

  public activeBody: CelestialBody | null = null;
  private pointerSamples: PointerSample[] = [];
  private throwVector: ThrowVector | null = null;

  // Plane Y offset in display space
  private dragPlaneY: number = 0;

  constructor(sceneManager: SceneManager, callbacks: GrabThrowCallbacks) {
    this.sceneManager = sceneManager;
    this.callbacks = callbacks;
  }

  public isDragging(): boolean {
    return this.activeBody !== null;
  }

  public startGrab(body: CelestialBody): void {
    this.activeBody = body;
    this.pointerSamples = [];

    // Lock drag plane Y to body's current relative Y position
    const rel = this.sceneManager.floatingOrigin.toRelative(body.position);
    const disp = this.sceneManager.scaleTransform.getDisplayPosition(rel);
    this.dragPlaneY = disp.y;

    // Create gradient throw-vector visualization (ASSET08)
    if (!this.throwVector) {
      this.throwVector = createThrowVector();
      this.sceneManager.scene.add(this.throwVector.group);
    }
    this.throwVector.group.position.set(disp.x, disp.y, disp.z);
    this.throwVector.setVector(new THREE.Vector3(1, 0, 0), 10);
    this.throwVector.setVisible(false);

    // Record initial sample
    this.pointerSamples.push({
      posKm: { ...body.position },
      timestampMs: performance.now(),
    });
  }

  public updateDrag(normalizedX: number, normalizedY: number): void {
    if (!this.activeBody) return;

    // Raycast onto orbital plane at dragPlaneY
    const hitDisp = this.sceneManager.raycastOrbitalPlane(normalizedX, normalizedY, this.dragPlaneY);
    if (!hitDisp) return;

    // Convert display position to physical relative km
    const relKm = this.sceneManager.scaleTransform.displayToRelativeKm(hitDisp);
    const absKm = this.sceneManager.floatingOrigin.toAbsolute(relKm);

    // Update body position
    this.activeBody.position.x = absKm.x;
    this.activeBody.position.y = absKm.y;
    this.activeBody.position.z = absKm.z;

    const now = performance.now();
    this.pointerSamples.push({ posKm: { ...absKm }, timestampMs: now });

    // Keep only samples from last 150ms
    while (this.pointerSamples.length > 2 && now - this.pointerSamples[0].timestampMs > 150) {
      this.pointerSamples.shift();
    }

    // Compute filtered release velocity using weighted sample difference
    const computedVelocity = this.computeFilteredVelocity();
    this.activeBody.velocity = computedVelocity;

    // Update gradient throw-vector visualization
    if (this.throwVector) {
      this.throwVector.group.position.set(hitDisp.x, hitDisp.y, hitDisp.z);
      const speed = Math.hypot(computedVelocity.x, computedVelocity.y, computedVelocity.z);
      if (speed > 0.1) {
        const arrowLen = Math.min(60, Math.max(5, speed * 1.5));
        this.throwVector.setVector(
          new THREE.Vector3(computedVelocity.x, computedVelocity.y, computedVelocity.z),
          arrowLen
        );
        this.throwVector.setVisible(true);
      } else {
        this.throwVector.setVisible(false);
      }
    }

    this.callbacks.onVelocityChanged(this.activeBody, computedVelocity);
  }

  public releaseThrow(): void {
    if (!this.activeBody) return;

    const finalVelocity = this.computeFilteredVelocity();
    this.activeBody.velocity = finalVelocity;

    this.throwVector?.setVisible(false);

    const thrown = this.activeBody;
    this.activeBody = null;
    this.pointerSamples = [];

    this.callbacks.onThrowReleased(thrown, finalVelocity);
  }

  public cancelGrab(): void {
    this.activeBody = null;
    this.pointerSamples = [];
    this.throwVector?.setVisible(false);
  }

  private computeFilteredVelocity(): Vector3D {
    if (this.pointerSamples.length < 2) {
      return this.activeBody ? { ...this.activeBody.velocity } : { x: 0, y: 0, z: 0 };
    }

    const first = this.pointerSamples[0];
    const last = this.pointerSamples[this.pointerSamples.length - 1];
    const dtSec = (last.timestampMs - first.timestampMs) / 1000.0;

    if (dtSec <= 0.005) {
      return this.activeBody ? { ...this.activeBody.velocity } : { x: 0, y: 0, z: 0 };
    }

    const rawVx = (last.posKm.x - first.posKm.x) / dtSec;
    const rawVy = (last.posKm.y - first.posKm.y) / dtSec;
    const rawVz = (last.posKm.z - first.posKm.z) / dtSec;

    // Cap velocity to prevent runaway speeds from fast tablet sweeps
    const speed = Math.hypot(rawVx, rawVy, rawVz);
    const maxSpeedKmS = 150.0; // 150 km/s maximum throw speed
    if (speed > maxSpeedKmS) {
      const factor = maxSpeedKmS / speed;
      return { x: rawVx * factor, y: rawVy * factor, z: rawVz * factor };
    }

    return { x: rawVx, y: rawVy, z: rawVz };
  }

  public destroy(): void {
    if (this.throwVector) {
      this.sceneManager.scene.remove(this.throwVector.group);
      this.throwVector.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | undefined;
        if (material) material.dispose();
      });
      this.throwVector = null;
    }
  }
}

// Re-exported for tuning discoverability (BACK12 central config).
export const THROW_TUNING = {
  get smoothing() {
    return PLANNER_CONFIG.interaction.throwVelocitySmoothing;
  },
  get sampleWindow() {
    return PLANNER_CONFIG.interaction.throwSampleWindow;
  },
};
