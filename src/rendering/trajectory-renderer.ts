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

export interface TrajectoryPoint {
  positionKm: Vector3D;
  timestampSec: number;
  isCollision?: boolean;
  isEscape?: boolean;
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

  // Max points per trajectory line
  private readonly maxPoints = 500;

  // Cache of line objects per body
  private lineMap: Map<string, { line: THREE.Line; positions: Float32Array; colors: Float32Array }> = new Map();

  // Sensitivity cloud lines
  private sensitivityLines: THREE.LineSegments | null = null;
  private maxSensitivitySegments = 1500;

  constructor(scaleTransform: ScaleTransform) {
    this.scaleTransform = scaleTransform;
    this.group = new THREE.Group();
    this.group.name = 'TrajectoryRendererGroup';
    this.initSensitivityMesh();
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

    for (let i = 0; i < ptCount; i++) {
      const pt = data.points[i];
      const disp = this.scaleTransform.getDisplayPosition(pt.positionKm);

      positions[i * 3] = disp.x;
      positions[i * 3 + 1] = disp.y;
      positions[i * 3 + 2] = disp.z;

      // Color fade along future trajectory
      const alpha = 1.0 - (i / ptCount) * 0.75;
      const c = pt.isCollision ? collisionColor : baseColor;

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
    const cloudColor = new THREE.Color('#49e7ff');

    for (let f = 0; f < fans.length; f++) {
      const path = fans[f];
      for (let p = 0; p < path.length - 1; p++) {
        if (segIndex >= this.maxSensitivitySegments) break;

        const p1 = this.scaleTransform.getDisplayPosition(path[p]);
        const p2 = this.scaleTransform.getDisplayPosition(path[p + 1]);

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
  }
}
