/**
 * Signature Tablet Feature: ORBIT LOOM.
 * 
 * Translates rough S Pen strokes into physically consistent Keplerian conic orbits,
 * provides live smoothing and interactive orbital handles (periapsis, apoapsis, inclination),
 * and allows committing to a new body, an existing body, or an engineered orbital ring.
 */

import * as THREE from 'three';
import { CelestialBody, RingStructure, Vector3D } from '../simulation/types';
import { G_KM } from '../simulation/units';
import { SceneManager } from '../rendering/scene-manager';

export interface FittedOrbit {
  primaryId: string;
  semiMajorAxisKm: number;
  eccentricity: number;
  periapsisKm: number;
  apoapsisKm: number;
  inclinationDeg: number;
  periapsisAngleRad: number;
  planeNormal: Vector3D;
  periapsisPositionKm: Vector3D;
  periapsisVelocityKmS: Vector3D;
  periodSec: number;
  isBound: boolean;
}

export class OrbitLoom {
  private sceneManager: SceneManager;
  private primaryBody: CelestialBody | null = null;

  // Active stroke points in physical km
  private strokePointsKm: Vector3D[] = [];

  // Fitted orbit result
  public currentFittedOrbit: FittedOrbit | null = null;

  // 3D visual preview objects
  private previewGroup: THREE.Group;
  private strokeLine: THREE.Line;
  private ellipseLine: THREE.Line;
  private periHandleMesh: THREE.Mesh;
  private apoHandleMesh: THREE.Mesh;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'OrbitLoomPreviewGroup';

    // Raw stroke line (faint cyan)
    const strokeGeo = new THREE.BufferGeometry();
    const strokeMat = new THREE.LineBasicMaterial({
      color: 0x49e7ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.strokeLine = new THREE.Line(strokeGeo, strokeMat);
    this.previewGroup.add(this.strokeLine);

    // Fitted conic ellipse line (bright azure)
    const ellipseGeo = new THREE.BufferGeometry();
    const ellipseMat = new THREE.LineBasicMaterial({
      color: 0x0cc6ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.ellipseLine = new THREE.Line(ellipseGeo, ellipseMat);
    this.previewGroup.add(this.ellipseLine);

    // Periapsis handle (cyan diamond)
    const handleGeo = new THREE.OctahedronGeometry(1.5);
    const periMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
    this.periHandleMesh = new THREE.Mesh(handleGeo, periMat);
    this.previewGroup.add(this.periHandleMesh);

    // Apoapsis handle (amber diamond)
    const apoMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true });
    this.apoHandleMesh = new THREE.Mesh(handleGeo, apoMat);
    this.previewGroup.add(this.apoHandleMesh);

    this.previewGroup.visible = false;
    this.sceneManager.scene.add(this.previewGroup);
  }

  public setPrimary(primary: CelestialBody): void {
    this.primaryBody = primary;
  }

  public startStroke(): void {
    this.strokePointsKm = [];
    this.currentFittedOrbit = null;
    this.previewGroup.visible = true;
    this.strokeLine.geometry.setDrawRange(0, 0);
    this.ellipseLine.geometry.setDrawRange(0, 0);
    this.periHandleMesh.visible = false;
    this.apoHandleMesh.visible = false;
  }

  public addStrokePoint(normalizedX: number, normalizedY: number): void {
    if (!this.primaryBody) return;

    // Raycast onto primary's orbital plane
    const hitDisp = this.sceneManager.raycastOrbitalPlane(normalizedX, normalizedY, 0);
    if (!hitDisp) return;

    const relKm = this.sceneManager.scaleTransform.displayToRelativeKm(hitDisp);
    const absKm = this.sceneManager.floatingOrigin.toAbsolute(relKm);

    this.strokePointsKm.push(absKm);

    // Update real-time stroke line visual
    this.updateStrokeVisual();

    // If enough points have been gathered, fit conic
    if (this.strokePointsKm.length >= 8) {
      this.fitConicFromStroke();
    }
  }

  public endStroke(): FittedOrbit | null {
    if (this.strokePointsKm.length >= 6 && this.primaryBody) {
      this.fitConicFromStroke();
    }
    return this.currentFittedOrbit;
  }

  /**
   * Conic ellipse fitting algorithm.
   */
  public fitConicFromStroke(): FittedOrbit | null {
    if (!this.primaryBody || this.strokePointsKm.length < 5) return null;

    const primPos = this.primaryBody.position;
    const primMass = this.primaryBody.massKg;

    // Relative points from primary
    const relPts = this.strokePointsKm.map(p => ({
      x: p.x - primPos.x,
      y: p.y - primPos.y,
      z: p.z - primPos.z,
    }));

    // Find min and max distance from primary
    let rMin = Infinity;
    let rMax = 0;
    let minIdx = 0;

    for (let i = 0; i < relPts.length; i++) {
      const d = Math.hypot(relPts[i].x, relPts[i].z);
      if (d < rMin) {
        rMin = d;
        minIdx = i;
      }
      if (d > rMax) {
        rMax = d;
      }
    }

    if (rMin <= 0 || rMax <= 0) return null;

    // Prevent zero-width or retrograde collapsing
    rMin = Math.max(this.primaryBody.radiusKm * 1.5, rMin);
    rMax = Math.max(rMin * 1.05, rMax);

    const a = (rMin + rMax) / 2.0;
    const e = Math.min(0.95, Math.max(0.0, (rMax - rMin) / (rMax + rMin)));

    // Periapsis angle in X-Z plane
    const periPt = relPts[minIdx];
    const periAngle = Math.atan2(periPt.z, periPt.x);

    // Gravitational parameter mu = G * M
    const mu = G_KM * primMass;
    const isBound = e < 1.0;

    // Required orbital velocity at periapsis: v_p = sqrt(mu/a * (1+e)/(1-e))
    const speedPeri = Math.sqrt((mu / a) * ((1.0 + e) / (1.0 - e)));

    // Periapsis coordinate
    const periPosKm: Vector3D = {
      x: primPos.x + rMin * Math.cos(periAngle),
      y: primPos.y,
      z: primPos.z + rMin * Math.sin(periAngle),
    };

    // Velocity is tangent to the ellipse at periapsis (-sin, cos)
    const periVelKm: Vector3D = {
      x: -Math.sin(periAngle) * speedPeri,
      y: 0,
      z: Math.cos(periAngle) * speedPeri,
    };

    const periodSec = isBound ? 2.0 * Math.PI * Math.sqrt((a ** 3) / mu) : Infinity;

    this.currentFittedOrbit = {
      primaryId: this.primaryBody.id,
      semiMajorAxisKm: a,
      eccentricity: e,
      periapsisKm: rMin,
      apoapsisKm: rMax,
      inclinationDeg: 0,
      periapsisAngleRad: periAngle,
      planeNormal: { x: 0, y: 1, z: 0 },
      periapsisPositionKm: periPosKm,
      periapsisVelocityKmS: periVelKm,
      periodSec,
      isBound,
    };

    this.updateFittedVisual();
    return this.currentFittedOrbit;
  }

  /**
   * Adjust periapsis distance via handle scrubbing.
   */
  public setPeriapsis(newPeriKm: number): void {
    if (!this.currentFittedOrbit || !this.primaryBody) return;
    this.currentFittedOrbit.periapsisKm = Math.max(this.primaryBody.radiusKm * 1.1, newPeriKm);
    if (this.currentFittedOrbit.periapsisKm > this.currentFittedOrbit.apoapsisKm) {
      this.currentFittedOrbit.apoapsisKm = this.currentFittedOrbit.periapsisKm * 1.05;
    }
    this.recomputeParameters();
    this.updateFittedVisual();
  }

  /**
   * Adjust apoapsis distance via handle scrubbing.
   */
  public setApoapsis(newApoKm: number): void {
    if (!this.currentFittedOrbit || !this.primaryBody) return;
    this.currentFittedOrbit.apoapsisKm = Math.max(this.currentFittedOrbit.periapsisKm * 1.01, newApoKm);
    this.recomputeParameters();
    this.updateFittedVisual();
  }

  private recomputeParameters(): void {
    if (!this.currentFittedOrbit || !this.primaryBody) return;
    const rMin = this.currentFittedOrbit.periapsisKm;
    const rMax = this.currentFittedOrbit.apoapsisKm;
    const a = (rMin + rMax) / 2.0;
    const e = (rMax - rMin) / (rMax + rMin);
    const mu = G_KM * this.primaryBody.massKg;

    this.currentFittedOrbit.semiMajorAxisKm = a;
    this.currentFittedOrbit.eccentricity = e;
    this.currentFittedOrbit.periodSec = 2.0 * Math.PI * Math.sqrt((a ** 3) / mu);

    const speedPeri = Math.sqrt((mu / a) * ((1.0 + e) / (1.0 - e)));
    const angle = this.currentFittedOrbit.periapsisAngleRad;

    this.currentFittedOrbit.periapsisPositionKm = {
      x: this.primaryBody.position.x + rMin * Math.cos(angle),
      y: this.primaryBody.position.y,
      z: this.primaryBody.position.z + rMin * Math.sin(angle),
    };

    this.currentFittedOrbit.periapsisVelocityKmS = {
      x: -Math.sin(angle) * speedPeri,
      y: 0,
      z: Math.cos(angle) * speedPeri,
    };
  }

  private updateStrokeVisual(): void {
    const pts = this.strokePointsKm;
    const positions = new Float32Array(pts.length * 3);

    for (let i = 0; i < pts.length; i++) {
      const rel = this.sceneManager.floatingOrigin.toRelative(pts[i]);
      const disp = this.sceneManager.scaleTransform.getDisplayPosition(rel);
      positions[i * 3] = disp.x;
      positions[i * 3 + 1] = disp.y + 0.2; // Slight elevation
      positions[i * 3 + 2] = disp.z;
    }

    this.strokeLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.strokeLine.geometry.setDrawRange(0, pts.length);
    this.strokeLine.geometry.attributes.position.needsUpdate = true;
  }

  private updateFittedVisual(): void {
    if (!this.currentFittedOrbit || !this.primaryBody) return;

    const segments = 120;
    const positions = new Float32Array((segments + 1) * 3);

    const a = this.currentFittedOrbit.semiMajorAxisKm;
    const e = this.currentFittedOrbit.eccentricity;
    const rot = this.currentFittedOrbit.periapsisAngleRad;
    const primPos = this.primaryBody.position;

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      // Polar form of ellipse relative to focus (primary)
      const r = (a * (1.0 - e * e)) / (1.0 + e * Math.cos(theta));

      const xKm = primPos.x + r * Math.cos(theta + rot);
      const zKm = primPos.z + r * Math.sin(theta + rot);

      const rel = this.sceneManager.floatingOrigin.toRelative({ x: xKm, y: primPos.y, z: zKm });
      const disp = this.sceneManager.scaleTransform.getDisplayPosition(rel);

      positions[i * 3] = disp.x;
      positions[i * 3 + 1] = disp.y;
      positions[i * 3 + 2] = disp.z;
    }

    this.ellipseLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.ellipseLine.geometry.setDrawRange(0, segments + 1);
    this.ellipseLine.geometry.attributes.position.needsUpdate = true;

    // Position periapsis and apoapsis handles
    const periRel = this.sceneManager.floatingOrigin.toRelative(this.currentFittedOrbit.periapsisPositionKm);
    const periDisp = this.sceneManager.scaleTransform.getDisplayPosition(periRel);
    this.periHandleMesh.position.set(periDisp.x, periDisp.y, periDisp.z);
    this.periHandleMesh.visible = true;

    const apoAngle = rot + Math.PI;
    const apoPosKm: Vector3D = {
      x: primPos.x + this.currentFittedOrbit.apoapsisKm * Math.cos(apoAngle),
      y: primPos.y,
      z: primPos.z + this.currentFittedOrbit.apoapsisKm * Math.sin(apoAngle),
    };
    const apoRel = this.sceneManager.floatingOrigin.toRelative(apoPosKm);
    const apoDisp = this.sceneManager.scaleTransform.getDisplayPosition(apoRel);
    this.apoHandleMesh.position.set(apoDisp.x, apoDisp.y, apoDisp.z);
    this.apoHandleMesh.visible = true;
  }

  /**
   * Commit fitted orbit: create and return a RingStructure along this path.
   */
  public commitToRing(name: string = 'Engineered Orbital Ring', isBloodRing: boolean = false): RingStructure | null {
    if (!this.currentFittedOrbit) return null;
    const ring: RingStructure = {
      id: `ring-${Date.now()}`,
      name,
      innerRadiusKm: this.currentFittedOrbit.periapsisKm * 0.98,
      outerRadiusKm: this.currentFittedOrbit.apoapsisKm * 1.02,
      isBloodRing,
      normal: { ...this.currentFittedOrbit.planeNormal },
      color: isBloodRing ? '#880010' : '#0cc6ff',
      opacity: 0.85,
    };
    this.clear();
    return ring;
  }

  public clear(): void {
    this.strokePointsKm = [];
    this.currentFittedOrbit = null;
    this.previewGroup.visible = false;
    this.strokeLine.geometry.setDrawRange(0, 0);
    this.ellipseLine.geometry.setDrawRange(0, 0);
    this.periHandleMesh.visible = false;
    this.apoHandleMesh.visible = false;
  }
}
