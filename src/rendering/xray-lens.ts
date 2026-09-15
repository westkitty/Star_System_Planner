/**
 * PHYSICS X-RAY LENS — Analytic Orbital Architecture Overlay.
 *
 * For the currently selected body, renders the invisible mathematical skeleton
 * that governs its motion, computed analytically every frame (no integration):
 *
 *   - Exact osculating Keplerian ellipse (with periapsis / apoapsis markers)
 *   - Hill sphere of influence (wireframe bubble)
 *   - Roche-limit fragmentation shell around the dominant primary
 *   - Lagrange points L1–L5 with labeled tetrahedral markers
 *
 * The lens makes the planner's already-computed astrodynamics *visible*: this is
 * the difference between watching dots move and seeing the architecture.
 */

import * as THREE from 'three';
import { CelestialBody, Vector3D } from '../simulation/types';
import {
  calculateKeplerianFrame,
  calculateRocheLimitKm,
  calculateOsculatingElements,
  computeLagrangePoints,
  findDominantPrimary,
} from '../simulation/orbital-mechanics';
import { ScaleTransform } from './scale-transform';
import { FloatingOrigin } from './floating-origin';

const ELLIPSE_SEGMENTS = 160;

function smallLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '700 26px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(3, 8, 16, 0.6)';
  ctx.fillRect(0, 0, 96, 48);
  ctx.fillStyle = color;
  ctx.fillText(text, 48, 26);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.045, 0.0225, 1);
  return sprite;
}

export class XRayLens {
  private group: THREE.Group;
  private scaleTransform: ScaleTransform;
  private floatingOrigin: FloatingOrigin;

  private ellipseLine: THREE.Line;
  private ellipsePositions: Float32Array;
  private ellipseColors: Float32Array;

  private hillMesh: THREE.Mesh;
  private rocheMesh: THREE.Mesh;
  private periMarker: THREE.Mesh;
  private apoMarker: THREE.Mesh;
  private lagrangeGroup: THREE.Group;

  public enabled: boolean = false;

  constructor(scaleTransform: ScaleTransform, floatingOrigin: FloatingOrigin) {
    this.scaleTransform = scaleTransform;
    this.floatingOrigin = floatingOrigin;
    this.group = new THREE.Group();
    this.group.name = 'XRayLensGroup';

    // Osculating ellipse (pre-allocated dynamic polyline)
    this.ellipsePositions = new Float32Array((ELLIPSE_SEGMENTS + 1) * 3);
    this.ellipseColors = new Float32Array((ELLIPSE_SEGMENTS + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.ellipsePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.ellipseColors, 3));
    this.ellipseLine = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.ellipseLine.frustumCulled = false;
    this.group.add(this.ellipseLine);

    // Hill sphere: subtle azure wireframe bubble
    this.hillMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({
        color: '#49e7ff',
        wireframe: true,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      })
    );
    this.group.add(this.hillMesh);

    // Roche shell: crimson danger wireframe around the primary
    this.rocheMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({
        color: '#ff4d64',
        wireframe: true,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      })
    );
    this.group.add(this.rocheMesh);

    // Apsis markers (octahedral diamonds)
    const markerGeo = new THREE.OctahedronGeometry(1, 0);
    this.periMarker = new THREE.Mesh(
      markerGeo,
      new THREE.MeshBasicMaterial({ color: '#00ffcc', wireframe: true })
    );
    this.apoMarker = new THREE.Mesh(
      markerGeo,
      new THREE.MeshBasicMaterial({ color: '#ffaa00', wireframe: true })
    );
    this.group.add(this.periMarker);
    this.group.add(this.apoMarker);

    // Lagrange point markers
    this.lagrangeGroup = new THREE.Group();
    this.lagrangeGroup.name = 'LagrangeMarkers';
    this.group.add(this.lagrangeGroup);

    this.group.visible = false;
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  private toDisplay(absKm: Vector3D): Vector3D {
    return this.scaleTransform.getDisplayPosition(this.floatingOrigin.toRelative(absKm));
  }

  /** Recompute the entire lens for the selected body. Call once per frame. */
  public update(selected: CelestialBody | null, allBodies: CelestialBody[]): void {
    if (!this.enabled || !selected || selected.type === 'star' || selected.type === 'black_hole') {
      this.group.visible = false;
      return;
    }

    const primary = selected.primaryId
      ? allBodies.find(b => b.id === selected.primaryId) ?? findDominantPrimary(selected, allBodies)
      : findDominantPrimary(selected, allBodies);

    if (!primary || primary.id === selected.id) {
      this.group.visible = false;
      return;
    }

    const frame = calculateKeplerianFrame(selected, primary);
    const elements = calculateOsculatingElements(selected, primary);
    if (!frame) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;

    // --- 1. Osculating ellipse -------------------------------------------------
    if (frame.isBound) {
      const a = frame.semiMajorAxisKm;
      const e = frame.eccentricity;
      const ax = frame.apsisDir;
      const bx = frame.binormal;

      // Hot color near the body's current true anomaly, fading away from it
      for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
        const theta = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        const rKm = (a * (1 - e * e)) / (1 + e * Math.cos(theta));
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const abs: Vector3D = {
          x: frame.focus.x + (ax.x * cosT + bx.x * sinT) * rKm,
          y: frame.focus.y + (ax.y * cosT + bx.y * sinT) * rKm,
          z: frame.focus.z + (ax.z * cosT + bx.z * sinT) * rKm,
        };
        const disp = this.toDisplay(abs);
        this.ellipsePositions[i * 3] = disp.x;
        this.ellipsePositions[i * 3 + 1] = disp.y;
        this.ellipsePositions[i * 3 + 2] = disp.z;

        // Azure gradient: bright at periapsis, deep at apoapsis
        const t = (1 - Math.cos(theta)) / 2; // 0 at periapsis, 1 at apoapsis
        this.ellipseColors[i * 3] = 0.05 + t * 0.25;
        this.ellipseColors[i * 3 + 1] = 0.78 - t * 0.3;
        this.ellipseColors[i * 3 + 2] = 1.0 - t * 0.25;
      }
      this.ellipseLine.geometry.setDrawRange(0, ELLIPSE_SEGMENTS + 1);
      this.ellipseLine.geometry.attributes.position.needsUpdate = true;
      this.ellipseLine.geometry.attributes.color.needsUpdate = true;
      this.ellipseLine.visible = true;

      // --- Apsis markers ------------------------------------------------------
      const periAbs: Vector3D = {
        x: frame.focus.x + ax.x * elements.periapsisKm,
        y: frame.focus.y + ax.y * elements.periapsisKm,
        z: frame.focus.z + ax.z * elements.periapsisKm,
      };
      const periDisp = this.toDisplay(periAbs);
      this.periMarker.position.set(periDisp.x, periDisp.y, periDisp.z);
      this.periMarker.scale.setScalar(3);
      this.periMarker.visible = true;

      if (Number.isFinite(elements.apoapsisKm)) {
        const apoAbs: Vector3D = {
          x: frame.focus.x - ax.x * elements.apoapsisKm,
          y: frame.focus.y - ax.y * elements.apoapsisKm,
          z: frame.focus.z - ax.z * elements.apoapsisKm,
        };
        const apoDisp = this.toDisplay(apoAbs);
        this.apoMarker.position.set(apoDisp.x, apoDisp.y, apoDisp.z);
        this.apoMarker.scale.setScalar(3);
        this.apoMarker.visible = true;
      } else {
        this.apoMarker.visible = false;
      }
    } else {
      this.ellipseLine.visible = false;
      this.periMarker.visible = false;
      this.apoMarker.visible = false;
    }

    // --- 2. Hill sphere bubble -------------------------------------------------
    if (elements.hillRadiusKm && elements.hillRadiusKm > selected.radiusKm * 2) {
      const bodyDisp = this.toDisplay(selected.position);
      const hillEdgeDisp = this.toDisplay({
        x: selected.position.x + elements.hillRadiusKm,
        y: selected.position.y,
        z: selected.position.z,
      });
      const hillDispRadius = Math.max(
        1,
        Math.abs(hillEdgeDisp.x - bodyDisp.x)
      );
      this.hillMesh.position.set(bodyDisp.x, bodyDisp.y, bodyDisp.z);
      this.hillMesh.scale.setScalar(hillDispRadius);
      this.hillMesh.visible = true;
    } else {
      this.hillMesh.visible = false;
    }

    // --- 3. Roche fragmentation shell around the primary -----------------------
    const roche = calculateRocheLimitKm(primary, selected);
    if (roche && roche > primary.radiusKm) {
      const primDisp = this.toDisplay(primary.position);
      const rocheEdgeDisp = this.toDisplay({
        x: primary.position.x + roche,
        y: primary.position.y,
        z: primary.position.z,
      });
      const rocheDispRadius = Math.max(1, Math.abs(rocheEdgeDisp.x - primDisp.x));
      this.rocheMesh.position.set(primDisp.x, primDisp.y, primDisp.z);
      this.rocheMesh.scale.setScalar(rocheDispRadius);
      // Alert intensity when the body is inside / near the shell
      const distNow = Math.hypot(
        selected.position.x - primary.position.x,
        selected.position.y - primary.position.y,
        selected.position.z - primary.position.z
      );
      const proximity = Math.max(0, Math.min(1, 1.6 - distNow / roche));
      (this.rocheMesh.material as THREE.MeshBasicMaterial).opacity = 0.12 + proximity * 0.4;
      this.rocheMesh.visible = true;
    } else {
      this.rocheMesh.visible = false;
    }

    // --- 4. Lagrange points L1-L5 ---------------------------------------------
    const lagrange = computeLagrangePoints(primary, selected);
    this.syncLagrangeMarkers(lagrange);
  }

  private lagrangeSprites: THREE.Sprite[] = [];

  private syncLagrangeMarkers(points: { L1: Vector3D; L2: Vector3D; L3: Vector3D; L4: Vector3D; L5: Vector3D } | null): void {
    const labels = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;
    if (!points) {
      for (const s of this.lagrangeSprites) s.visible = false;
      return;
    }
    while (this.lagrangeSprites.length < labels.length) {
      const sprite = smallLabelSprite(labels[this.lagrangeSprites.length], '#b6f6ff');
      this.lagrangeSprites.push(sprite);
      this.lagrangeGroup.add(sprite);
    }
    labels.forEach((label, i) => {
      const sprite = this.lagrangeSprites[i];
      const disp = this.toDisplay(points[label]);
      sprite.position.set(disp.x, disp.y + 2.5, disp.z);
      sprite.visible = true;
    });
  }

  public dispose(): void {
    this.ellipseLine.geometry.dispose();
    (this.ellipseLine.material as THREE.Material).dispose();
    this.hillMesh.geometry.dispose();
    (this.hillMesh.material as THREE.Material).dispose();
    this.rocheMesh.geometry.dispose();
    (this.rocheMesh.material as THREE.Material).dispose();
    this.periMarker.geometry.dispose();
    (this.periMarker.material as THREE.Material).dispose();
    this.apoMarker.geometry.dispose();
    (this.apoMarker.material as THREE.Material).dispose();
    for (const s of this.lagrangeSprites) {
      s.material.map?.dispose();
      s.material.dispose();
    }
    this.lagrangeSprites = [];
  }
}
