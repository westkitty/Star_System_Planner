/**
 * Signature Tablet Feature: ORBIT LOOM.
 * 
 * Translates rough S Pen strokes into physically consistent Keplerian conic orbits,
 * provides live smoothing and interactive orbital handles (periapsis, apoapsis, inclination),
 * and allows committing to a new body, an existing body, or an engineered orbital ring.
 */

import * as THREE from 'three';
import { AsteroidBelt, CelestialBody, RingStructure, Vector3D } from '../simulation/types';
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
    rMax = Math.max(rMin, rMax);

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
      this.currentFittedOrbit.apoapsisKm = this.currentFittedOrbit.periapsisKm;
    }
    this.recomputeParameters();
    this.updateFittedVisual();
  }

  /**
   * Adjust apoapsis distance via handle scrubbing.
   */
  public setApoapsis(newApoKm: number): void {
    if (!this.currentFittedOrbit || !this.primaryBody) return;
    this.currentFittedOrbit.apoapsisKm = Math.max(this.currentFittedOrbit.periapsisKm, newApoKm);
    this.recomputeParameters();
    this.updateFittedVisual();
  }

  /**
   * Adjust orbital inclination in degrees. The conic is tilted around the
   * periapsis line, preserving apsis distances while rotating the plane.
   */
  public setInclination(deg: number): void {
    if (!this.currentFittedOrbit || !this.primaryBody) return;
    this.currentFittedOrbit.inclinationDeg = Math.max(-90, Math.min(90, deg));
    this.recomputeParameters();
    this.updateFittedVisual();
  }

  /** Unit basis vectors of the (possibly inclined) orbital plane. */
  private planeBasis(orbit: FittedOrbit): { u: Vector3D; v: Vector3D; n: Vector3D } {
    const a = orbit.periapsisAngleRad;
    const u: Vector3D = { x: Math.cos(a), y: 0, z: Math.sin(a) }; // toward periapsis
    const baseV: Vector3D = { x: -Math.sin(a), y: 0, z: Math.cos(a) }; // ecliptic tangent
    const incl = (orbit.inclinationDeg * Math.PI) / 180;
    const cosI = Math.cos(incl);
    const sinI = Math.sin(incl);
    // Rodrigues rotation of the tangent about the apsis line u
    // u x baseV = (0, -1, 0) for any azimuth a
    const v: Vector3D = {
      x: baseV.x * cosI,
      y: -sinI,
      z: baseV.z * cosI,
    };
    const n: Vector3D = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    return { u, v, n };
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
    const basis = this.planeBasis(this.currentFittedOrbit);

    this.currentFittedOrbit.periapsisPositionKm = {
      x: this.primaryBody.position.x + rMin * basis.u.x,
      y: this.primaryBody.position.y + rMin * basis.u.y,
      z: this.primaryBody.position.z + rMin * basis.u.z,
    };

    this.currentFittedOrbit.periapsisVelocityKmS = {
      x: basis.v.x * speedPeri,
      y: basis.v.y * speedPeri,
      z: basis.v.z * speedPeri,
    };

    this.currentFittedOrbit.planeNormal = basis.n;
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
    const primPos = this.primaryBody.position;
    const basis = this.planeBasis(this.currentFittedOrbit);

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      // Polar form of ellipse relative to focus (primary), in the fitted plane
      const r = (a * (1.0 - e * e)) / (1.0 + e * Math.cos(theta));
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const absKm: Vector3D = {
        x: primPos.x + (basis.u.x * cosT + basis.v.x * sinT) * r,
        y: primPos.y + (basis.u.y * cosT + basis.v.y * sinT) * r,
        z: primPos.z + (basis.u.z * cosT + basis.v.z * sinT) * r,
      };

      const rel = this.sceneManager.floatingOrigin.toRelative(absKm);
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

    const apoPosKm: Vector3D = {
      x: primPos.x - this.currentFittedOrbit.apoapsisKm * basis.u.x,
      y: primPos.y - this.currentFittedOrbit.apoapsisKm * basis.u.y,
      z: primPos.z - this.currentFittedOrbit.apoapsisKm * basis.u.z,
    };
    const apoRel = this.sceneManager.floatingOrigin.toRelative(apoPosKm);
    const apoDisp = this.sceneManager.scaleTransform.getDisplayPosition(apoRel);
    this.apoHandleMesh.position.set(apoDisp.x, apoDisp.y, apoDisp.z);
    this.apoHandleMesh.visible = true;
  }

  public getPrimary(): CelestialBody | null {
    return this.primaryBody;
  }

  /**
   * Commit fitted orbit to a selected celestial body.
   * Moves body to periapsis, assigns coherent orbital velocity + primary's inertial velocity,
   * updates primaryId, and clears preview.
   */
  public applyToBody(body: CelestialBody): boolean {
    if (!this.currentFittedOrbit || !this.primaryBody) return false;
    if (body.id === this.primaryBody.id) return false;

    const orbit = this.currentFittedOrbit;
    const primVel = this.primaryBody.velocity;

    // Move onto fitted orbit periapsis
    body.position = { ...orbit.periapsisPositionKm };

    // Coherent inertial velocity: v_inertial = v_primary + v_orbital
    body.velocity = {
      x: primVel.x + orbit.periapsisVelocityKmS.x,
      y: primVel.y + orbit.periapsisVelocityKmS.y,
      z: primVel.z + orbit.periapsisVelocityKmS.z,
    };

    body.primaryId = this.primaryBody.id;
    this.clear();
    return true;
  }

  /**
   * Commit fitted orbit as a debris asteroid belt descriptor (InstancedMesh
   * particles on Keplerian ellipses around the primary).
   */
  public commitToBelt(name: string, particleCount: number, color: string = '#8b8e96'): AsteroidBelt | null {
    if (!this.currentFittedOrbit || !this.primaryBody) return null;
    const belt: AsteroidBelt = {
      id: `belt-${Date.now()}`,
      name: name.trim() || 'Loomed Debris Belt',
      primaryId: this.primaryBody.id,
      innerRadiusKm: this.currentFittedOrbit.periapsisKm * 0.985,
      outerRadiusKm: this.currentFittedOrbit.apoapsisKm * 1.015,
      particleCount: Math.max(60, Math.min(3000, Math.round(particleCount))),
      color,
      seed: (Date.now() ^ Math.round(this.currentFittedOrbit.semiMajorAxisKm)) >>> 0,
    };
    this.clear();
    return belt;
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
