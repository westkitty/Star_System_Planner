/**
 * Batched Trajectory and Sensitivity Cloud Line Renderer.
 *
 * Invariants:
 * - Uses batched line geometries with dynamic buffers instead of thousands of meshes.
 * - Primary trajectory gets prominent azure emphasis (#0CC6FF).
 * - Background trajectories are faint obsidian-azure (#0A2A44).
 * - Collision segments are highlighted in warning red (#FF3344).
 * - Sensitivity cloud renders as a fan of thirty translucent diverging futures.
 */

import * as THREE from 'three';
import { Vector3D } from '../simulation/types';
import { ScaleTransform } from './scale-transform';
import { FloatingOrigin } from './floating-origin';

export interface TrajectoryPoint {
  positionKm: Vector3D;
  timestampSec: number;
  isCollision?: boolean;
  isEscape?: boolean;
}

/**
 * Sensitivity-fan depth color (iteration 3, ASSET09).
 *
 * Early fans render azure, late fans violet — the cloud now reads as a
 * time-ordered plume instead of a monochrome puff.
 */
export function sensitivityFanColor(fanIndex: number, fanCount: number): string {
  const t = fanCount <= 1 ? 0 : Math.min(1, Math.max(0, fanIndex / (fanCount - 1)));
  const r = Math.round(0x49 + (0xa8 - 0x49) * t);
  const g = Math.round(0xe7 + (0x55 - 0xe7) * t);
  const b = Math.round(0xff + (0xf7 - 0xff) * t);
  const hex = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export interface BodyTrajectoryData {
  bodyId: string;
  points: TrajectoryPoint[];
  isSelected: boolean;
  colorHex?: string;
}

export class TrajectoryRenderer {
  private group: THREE.Group;
  private scaleTransform: ScaleTransform;
  private floatingOrigin: FloatingOrigin | null = null;

  // Max points per trajectory line
  private readonly maxPoints = 500;

  // Cache of line objects per body
  private lineMap: Map<string, { line: THREE.Line; positions: Float32Array; colors: Float32Array }> = new Map();

  // Flight Director ghost preview is independent from ordinary forecast lines.
  private planPreviewLine: THREE.Line | null = null;

  // Sensitivity cloud lines
  private sensitivityLines: THREE.LineSegments | null = null;
  private maxSensitivitySegments = 2000;

  // ASSET09: pooled impact-warning markers at forecast collision sites.
  private collisionMarkerGroup: THREE.Group;
  private collisionMarkerPool: THREE.Mesh[] = [];
  private markerPulseSec = 0;

  constructor(scaleTransform: ScaleTransform) {
    this.scaleTransform = scaleTransform;
    this.group = new THREE.Group();
    this.group.name = 'TrajectoryRendererGroup';
    this.initSensitivityMesh();
    this.collisionMarkerGroup = new THREE.Group();
    this.collisionMarkerGroup.name = 'ForecastCollisionMarkers';
    this.group.add(this.collisionMarkerGroup);
    const markerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff3344'),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 8; i++) {
      const marker = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 8, 4), markerMat);
      marker.visible = false;
      this.collisionMarkerGroup.add(marker);
      this.collisionMarkerPool.push(marker);
    }
  }

  /** Attach the scene floating origin so predicted paths align under focus camera. */
  public setFloatingOrigin(origin: FloatingOrigin): void {
    this.floatingOrigin = origin;
  }

  private toDisplay(absKm: Vector3D): Vector3D {
    const rel = this.floatingOrigin ? this.floatingOrigin.toRelative(absKm) : absKm;
    return this.scaleTransform.getDisplayPosition(rel);
  }

  /**
   * Prune trajectory lines for bodies that no longer exist (absorbed, deleted,
   * or removed by branch switch / preset import).
   */
  public pruneToAlive(aliveIds: Set<string>): void {
    const dead: string[] = [];
    for (const id of this.lineMap.keys()) {
      if (!aliveIds.has(id)) dead.push(id);
    }
    for (const id of dead) {
      this.clearBody(id);
    }
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  private initSensitivityMesh(): void {
    const geo = new THREE.BufferGeometry();
    const posBuffer = new Float32Array(this.maxSensitivitySegments * 6); // 2 vertices * 3 coords
    const colBuffer = new Float32Array(this.maxSensitivitySegments * 6);

    geo.setAttribute('position', new THREE.BufferAttribute(posBuffer, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colBuffer, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.sensitivityLines = new THREE.LineSegments(geo, mat);
    this.sensitivityLines.visible = false;
    this.group.add(this.sensitivityLines);
  }

  /**
   * Update or create trajectory line for a body.
   */
  public updateBodyTrajectory(data: BodyTrajectoryData): void {
    let entry = this.lineMap.get(data.bodyId);

    if (!entry) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(this.maxPoints * 3);
      const colors = new Float32Array(this.maxPoints * 3);

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: data.isSelected ? 0.95 : 0.4,
        linewidth: data.isSelected ? 2 : 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new THREE.Line(geo, mat);
      this.group.add(line);
      entry = { line, positions, colors };
      this.lineMap.set(data.bodyId, entry);
    }

    const { line, positions, colors } = entry;
    const ptCount = Math.min(data.points.length, this.maxPoints);

    const baseColor = new THREE.Color(data.isSelected ? '#0cc6ff' : (data.colorHex || '#1e3a5f'));
    const collisionColor = new THREE.Color('#ff3344');
    const escapeColor = new THREE.Color('#a855f7');

    for (let i = 0; i < ptCount; i++) {
      const pt = data.points[i];
      const disp = this.toDisplay(pt.positionKm);

      positions[i * 3] = disp.x;
      positions[i * 3 + 1] = disp.y;
      positions[i * 3 + 2] = disp.z;

      // Color fade along future trajectory (violet past escape, red at impacts)
      const alpha = 1.0 - (i / ptCount) * 0.75;
      const c = pt.isCollision ? collisionColor : pt.isEscape ? escapeColor : baseColor;

      colors[i * 3] = c.r * alpha;
      colors[i * 3 + 1] = c.g * alpha;
      colors[i * 3 + 2] = c.b * alpha;
    }

    line.geometry.setDrawRange(0, ptCount);
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.attributes.color.needsUpdate = true;

    // Update material opacity and emphasis
    (line.material as THREE.LineBasicMaterial).opacity = data.isSelected ? 0.95 : 0.35;
  }

  /** Render a distinct non-authoritative ghost path for the queued Flight Director plan. */
  public updatePlanPreview(points: TrajectoryPoint[]): void {
    this.clearPlanPreview();
    const usable = points.slice(0, this.maxPoints);
    if (usable.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(usable.map((point) => {
      const display = this.toDisplay(point.positionKm);
      return new THREE.Vector3(display.x, display.y, display.z);
    }));
    const material = new THREE.LineDashedMaterial({ color: '#ffd166', transparent: true, opacity: 0.95, dashSize: 3, gapSize: 2, depthWrite: false });
    const line = new THREE.Line(geometry, material);
    line.name = 'FlightDirectorGhostPreview';
    line.computeLineDistances();
    this.group.add(line);
    this.planPreviewLine = line;
  }

  public clearPlanPreview(): void {
    if (!this.planPreviewLine) return;
    this.group.remove(this.planPreviewLine);
    this.planPreviewLine.geometry.dispose();
    (this.planPreviewLine.material as THREE.Material).dispose();
    this.planPreviewLine = null;
  }

  /**
   * Update the sensitivity cloud (fan of perturbed trajectories).
   */
  public updateSensitivityCloud(fans: Vector3D[][]): void {
    if (!this.sensitivityLines) return;

    if (!fans || fans.length === 0) {
      this.sensitivityLines.visible = false;
      return;
    }

    this.sensitivityLines.visible = true;
    const geo = this.sensitivityLines.geometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colAttr = geo.attributes.color as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    let segIndex = 0;

    for (let f = 0; f < fans.length; f++) {
      const path = fans[f];
      const cloudColor = new THREE.Color(sensitivityFanColor(f, fans.length));
      for (let p = 0; p < path.length - 1; p++) {
        if (segIndex >= this.maxSensitivitySegments) break;

        const p1 = this.toDisplay(path[p]);
        const p2 = this.toDisplay(path[p + 1]);

        const idx = segIndex * 6;
        posArr[idx] = p1.x;
        posArr[idx + 1] = p1.y;
        posArr[idx + 2] = p1.z;
        posArr[idx + 3] = p2.x;
        posArr[idx + 4] = p2.y;
        posArr[idx + 5] = p2.z;

        const progress = p / path.length;
        const fade = (1.0 - progress) * 0.4;

        colArr[idx] = cloudColor.r * fade;
        colArr[idx + 1] = cloudColor.g * fade;
        colArr[idx + 2] = cloudColor.b * fade;
        colArr[idx + 3] = cloudColor.r * (fade * 0.8);
        colArr[idx + 4] = cloudColor.g * (fade * 0.8);
        colArr[idx + 5] = cloudColor.b * (fade * 0.8);

        segIndex++;
      }
    }

    geo.setDrawRange(0, segIndex * 2);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  /**
   * Place pulsing diamond impact markers at forecast collision sites.
   */
  public setCollisionMarkers(sitesKm: Vector3D[]): void {
    for (let i = 0; i < this.collisionMarkerPool.length; i++) {
      const marker = this.collisionMarkerPool[i];
      const site = sitesKm[i];
      if (site) {
        const disp = this.scaleTransform.getDisplayPosition(site);
        marker.position.set(disp.x, disp.y, disp.z);
        marker.visible = true;
      } else {
        marker.visible = false;
      }
    }
  }

  /** Animate marker pulse; call each frame. */
  public update(deltaSec: number, reducedMotion: boolean): void {
    this.markerPulseSec += deltaSec;
    for (const marker of this.collisionMarkerPool) {
      if (!marker.visible) continue;
      if (!reducedMotion) {
        marker.rotation.y = this.markerPulseSec * 1.8;
        const s = 1 + Math.sin(this.markerPulseSec * 5) * 0.18;
        marker.scale.set(s, s, s);
      }
    }
  }

  public clearBody(bodyId: string): void {
    const entry = this.lineMap.get(bodyId);
    if (entry) {
      this.group.remove(entry.line);
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
      this.lineMap.delete(bodyId);
    }
  }

  public clearAll(): void {
    for (const [id] of this.lineMap) {
      this.clearBody(id);
    }
    if (this.sensitivityLines) {
      this.sensitivityLines.visible = false;
    }
    this.clearPlanPreview();
    this.setCollisionMarkers([]);
  }

  public dispose(): void {
    this.clearAll();
    if (this.sensitivityLines) {
      this.sensitivityLines.geometry.dispose();
      (this.sensitivityLines.material as THREE.Material).dispose();
      this.sensitivityLines = null;
    }
    for (const marker of this.collisionMarkerPool) {
      marker.geometry.dispose();
    }
    if (this.collisionMarkerPool.length > 0) {
      (this.collisionMarkerPool[0].material as THREE.Material).dispose();
    }
    this.collisionMarkerPool = [];
  }
}
