/**
 * Master Scene Manager and Three.js Render Pipeline.
 *
 * Orchestrates:
 * - High-DPR Three.js WebGLRenderer with tone mapping
 * - Dynamic mesh lifecycle for celestial bodies (stars, black holes, planets, rings, stations)
 * - Instanced asteroid belts (physically offset around their primary, sim-time driven)
 * - Collision / Roche debris cloud
 * - Motion trails (observed past) + worker trajectories (predicted future)
 * - Habitable-zone bands, body nameplates, Physics X-Ray lens
 * - Newtonian gravity potential grid
 * - Smooth camera navigation (inertia, orbit, pan, pinch, wheel, focus & follow)
 * - WebGL context-loss resilience and full GPU disposal
 */

import * as THREE from 'three';
import { CelestialBody, Vector3D, AsteroidBelt, RingStructure } from '../simulation/types';
import { CollisionDebrisParticle } from '../simulation/collisions';
import { FloatingOrigin } from './floating-origin';
import { ScaleTransform } from './scale-transform';
import {
  createStarMaterial,
  createBlackHoleMaterial,
  createPlanetMaterial,
  createBloodRingMaterial,
  createOrdinaryRingMaterial,
} from './celestial-shaders';
import { TrajectoryRenderer } from './trajectory-renderer';
import { GravityGridRenderer } from './gravity-grid';
import { DebrisRenderer } from './debris-renderer';
import { TrailRenderer } from './trail-renderer';
import { BodyLabelRenderer } from './body-labels';
import { XRayLens } from './xray-lens';
import { HabitableZoneRenderer } from './habitable-zone';
import { InstancedBeltRenderer } from './instanced-belts';
import { LABEL_MAX_DISTANCE_UNITS } from '../simulation/tuning';

export type CameraViewMode = 'inertial' | 'focus_selected' | 'follow_selected' | 'top_down';

export interface CameraSnapshot {
  target: Vector3D;
  distance: number;
  viewMode: CameraViewMode;
}

/** Outcome of a frame: anything the React layer needs to react to. */
export interface FrameSignals {
  impactStrength: number;
}

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public floatingOrigin: FloatingOrigin;
  public scaleTransform: ScaleTransform;
  public trajectoryRenderer: TrajectoryRenderer;
  public gravityGrid: GravityGridRenderer;
  public debrisRenderer: DebrisRenderer;
  public trailRenderer: TrailRenderer;
  public labelRenderer: BodyLabelRenderer;
  public xrayLens: XRayLens;
  public habitableZone: HabitableZoneRenderer;

  // Visual mesh dictionary keyed by body ID
  private bodyMeshes: Map<string, THREE.Group> = new Map();

  // Instanced asteroid belts keyed by belt ID
  private beltRenderers: Map<string, InstancedBeltRenderer> = new Map();

  // Camera state & damping
  public viewMode: CameraViewMode = 'inertial';
  public selectedBodyId: string | null = null;
  public cameraTarget = new THREE.Vector3(0, 0, 0);
  private desiredTarget = new THREE.Vector3(0, 0, 0);
  private cameraDistance = 250.0;
  private cameraSpherical = new THREE.Spherical(250, Math.PI / 3, Math.PI / 4);
  private orbitVelocity = new THREE.Vector2(0, 0); // inertia glide
  private shakeStrength = 0;
  private shakeOffset = new THREE.Vector3();
  public cameraSensitivity: number = 1.0;

  // Background starfield
  private starfield: THREE.Points | null = null;

  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private labelsMaxDistance = LABEL_MAX_DISTANCE_UNITS;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.floatingOrigin = new FloatingOrigin();
    this.scaleTransform = new ScaleTransform();

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#03050a');

    // Camera
    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50000);
    this.updateCameraPosition();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Lighting
    const ambient = new THREE.AmbientLight('#111827', 0.8);
    this.scene.add(ambient);

    // Trajectory renderer (origin-aware so forecasts stay aligned under focus camera)
    this.trajectoryRenderer = new TrajectoryRenderer(this.scaleTransform);
    this.trajectoryRenderer.setFloatingOrigin(this.floatingOrigin);
    this.scene.add(this.trajectoryRenderer.getGroup());

    // Gravity field (origin-aware)
    this.gravityGrid = new GravityGridRenderer(this.scaleTransform);
    this.gravityGrid.setFloatingOrigin(this.floatingOrigin);
    this.scene.add(this.gravityGrid.getMesh());

    // Debris cloud
    this.debrisRenderer = new DebrisRenderer(this.scaleTransform, this.floatingOrigin);
    this.scene.add(this.debrisRenderer.getObject());

    // Motion trails
    this.trailRenderer = new TrailRenderer(this.scaleTransform, this.floatingOrigin);
    this.scene.add(this.trailRenderer.getGroup());

    // Body nameplates
    this.labelRenderer = new BodyLabelRenderer(this.scaleTransform, this.floatingOrigin);
    this.scene.add(this.labelRenderer.getGroup());

    // Physics X-Ray lens
    this.xrayLens = new XRayLens(this.scaleTransform, this.floatingOrigin);
    this.scene.add(this.xrayLens.getGroup());

    // Habitable zone bands
    this.habitableZone = new HabitableZoneRenderer(this.scaleTransform, this.floatingOrigin);
    this.scene.add(this.habitableZone.getGroup());

    // Background starfield
    this.initBackgroundStarfield();
  }

  /** Hints the render quality tier (pixel-ratio trade-off). */
  public setRenderQuality(quality: 'auto' | 'high' | 'low'): void {
    const dpr = window.devicePixelRatio || 1;
    if (quality === 'low') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.0));
    } else if (quality === 'high') {
      this.renderer.setPixelRatio(Math.min(dpr, 2.0));
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2.0));
    }
  }

  private initBackgroundStarfield(): void {
    const starCount = 3500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const colorPalette = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#a0c8ff'),
      new THREE.Color('#b6f6ff'),
      new THREE.Color('#e0e4eb'),
    ];

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 25000 + Math.random() * 5000;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const c = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });

    this.starfield = new THREE.Points(geometry, material);
    this.scene.add(this.starfield);
  }

  /**
   * Synchronize 3D meshes with current simulation bodies.
   */
  public syncBodies(bodies: CelestialBody[]): void {
    const activeIds = new Set(bodies.map(b => b.id));

    // Remove obsolete meshes
    for (const [id, group] of this.bodyMeshes) {
      if (!activeIds.has(id)) {
        this.disposeBodyGroup(group);
        this.scene.remove(group);
        this.bodyMeshes.delete(id);
      }
    }

    // Update floating origin
    if (this.selectedBodyId && (this.viewMode === 'focus_selected' || this.viewMode === 'follow_selected')) {
      const selected = bodies.find(b => b.id === this.selectedBodyId);
      if (selected) {
        if (this.viewMode === 'follow_selected') {
          // Live tracking: origin re-pins to the body every frame
          this.floatingOrigin.setOrigin(selected.position.x, selected.position.y, selected.position.z);
        }
        this.desiredTarget.set(0, 0, 0);
      } else {
        // Selected body no longer exists: fall back to inertial
        this.viewMode = 'inertial';
        this.floatingOrigin.setOrigin(0, 0, 0);
      }
    } else {
      this.floatingOrigin.setOrigin(0, 0, 0);
    }

    // Dominant luminous star for planetary day/night orientation
    const lightStar = bodies.find(b => b.type === 'star' && (b.luminosityW ?? 0) > 0) || null;

    // Update or create meshes
    for (const b of bodies) {
      let group = this.bodyMeshes.get(b.id);

      if (!group) {
        group = this.createBodyMesh(b);
        this.bodyMeshes.set(b.id, group);
        this.scene.add(group);
      }

      // Calculate relative coordinate and display position
      const relPos = this.floatingOrigin.toRelative(b.position);
      const dispPos = this.scaleTransform.getDisplayPosition(relPos);
      group.position.set(dispPos.x, dispPos.y, dispPos.z);

      // Scale mesh
      const dispRadius = this.scaleTransform.getDisplayRadius(b.radiusKm, b.type);
      const coreMesh = group.getObjectByName('core') as THREE.Mesh;
      if (coreMesh) {
        coreMesh.scale.set(dispRadius, dispRadius, dispRadius);

        // Update shader uniforms if applicable
        if (coreMesh.material instanceof THREE.ShaderMaterial) {
          if (coreMesh.material.uniforms.uTime) {
            coreMesh.material.uniforms.uTime.value = this.clock.getElapsedTime();
          }
          if (coreMesh.material.uniforms.uStarsilkBleed) {
            coreMesh.material.uniforms.uStarsilkBleed.value = b.starsilkBleed || 0;
          }
          if (coreMesh.material.uniforms.uBaseColor && b.color) {
            // Live color editing support
            const uColor = coreMesh.material.uniforms.uBaseColor.value as THREE.Color;
            if (uColor && uColor.getHexString() !== new THREE.Color(b.color).getHexString()) {
              uColor.set(b.color);
            }
          }
          // Day-night terminator tracks the luminous star (real lighting direction)
          if (coreMesh.material.uniforms.uLightDir && lightStar && b.id !== lightStar.id) {
            const starRel = this.floatingOrigin.toRelative(lightStar.position);
            const starDisp = this.scaleTransform.getDisplayPosition(starRel);
            const dir = new THREE.Vector3(
              starDisp.x - dispPos.x,
              starDisp.y - dispPos.y,
              starDisp.z - dispPos.z
            );
            if (dir.lengthSq() > 0.0001) {
              dir.normalize();
              coreMesh.material.uniforms.uLightDir.value.copy(dir);
            }
          }
        }
      }

      // Synchronize rings to the *data* (proportion, removal, additions)
      this.syncBodyRings(b, group, dispRadius);
    }

    // Update gravity grid
    this.gravityGrid.update(bodies);
  }

  /** Sync belt renderers with engine belt data (creates/disposes/renderer per belt). */
  public syncBelts(belts: AsteroidBelt[], bodies: CelestialBody[], simDeltaSec: number): void {
    const aliveBeltIds = new Set(belts.map(b => b.id));
    for (const [id, renderer] of this.beltRenderers) {
      if (!aliveBeltIds.has(id)) {
        this.scene.remove(renderer.getMesh());
        renderer.dispose();
        this.beltRenderers.delete(id);
      }
    }

    for (const belt of belts) {
      const primary = bodies.find(b => b.id === belt.primaryId) || bodies[0];
      if (!primary) continue;

      let renderer = this.beltRenderers.get(belt.id);
      if (!renderer) {
        renderer = new InstancedBeltRenderer(belt, this.scaleTransform, this.floatingOrigin, primary.massKg);
        this.beltRenderers.set(belt.id, renderer);
        this.scene.add(renderer.getMesh());
      }
      renderer.update(simDeltaSec, primary.position);
    }
  }

  public syncDebris(debris: CollisionDebrisParticle[]): void {
    this.debrisRenderer.update(debris);
  }

  public syncTrails(bodies: CelestialBody[], simTimeSec: number): void {
    this.trailRenderer.update(bodies, simTimeSec);
  }

  public syncLabels(bodies: CelestialBody[]): void {
    this.labelRenderer.update(bodies, this.camera, this.labelsMaxDistance);
  }

  public syncHabitableZones(bodies: CelestialBody[]): void {
    this.habitableZone.update(bodies);
  }

  public syncXRay(selected: CelestialBody | null, bodies: CelestialBody[]): void {
    this.xrayLens.update(selected, bodies);
  }

  // Decorative orbit ghost circle (Create Body preview) -------------------------
  private ghostLine: THREE.Line | null = null;

  /** Show a dashed ghost circle of radius `radiusKm` around a primary (build aid). */
  public showOrbitGhost(primary: CelestialBody, radiusKm: number): void {
    if (!this.ghostLine) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({
        color: '#49e7ff',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.ghostLine = new THREE.Line(geo, mat);
      this.ghostLine.frustumCulled = false;
      this.scene.add(this.ghostLine);
    }

    const segments = 128;
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const rel = this.floatingOrigin.toRelative({
        x: primary.position.x + radiusKm * Math.cos(theta),
        y: primary.position.y,
        z: primary.position.z + radiusKm * Math.sin(theta),
      });
      const disp = this.scaleTransform.getDisplayPosition(rel);
      positions[i * 3] = disp.x;
      positions[i * 3 + 1] = disp.y + 0.3;
      positions[i * 3 + 2] = disp.z;
    }
    this.ghostLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.ghostLine.geometry.setDrawRange(0, segments + 1);
    this.ghostLine.visible = true;
  }

  public hideOrbitGhost(): void {
    if (this.ghostLine) {
      this.ghostLine.visible = false;
    }
  }

  /** Remove all renderer-held paths/trails (branch switch, preset load, import). */ 
  public purgeDynamicOverlays(): void {
    this.trajectoryRenderer.clearAll();
    this.trailRenderer.clearAll();
    this.debrisRenderer.update([]);
  }

  /** Dispose all belt renderers (preset load / import). */
  public purgeBelts(): void {
    for (const [, renderer] of this.beltRenderers) {
      this.scene.remove(renderer.getMesh());
      renderer.dispose();
    }
    this.beltRenderers.clear();
  }

  private disposeBodyGroup(group: THREE.Group): void {
    group.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mat = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat?.dispose();
      }
    });
  }

  private createBodyMesh(b: CelestialBody): THREE.Group {
    const group = new THREE.Group();
    group.name = `body-${b.id}`;

    let coreMesh: THREE.Mesh;
    const sphereGeo = new THREE.SphereGeometry(1, 32, 24);

    if (b.type === 'black_hole') {
      const mat = createBlackHoleMaterial();
      coreMesh = new THREE.Mesh(sphereGeo, mat);
    } else if (b.type === 'star') {
      const mat = createStarMaterial(b.color, b.starsilkBleed);
      coreMesh = new THREE.Mesh(sphereGeo, mat);
    } else {
      const mat = createPlanetMaterial(b.color, b.atmosphereColor);
      coreMesh = new THREE.Mesh(sphereGeo, mat);
    }

    coreMesh.name = 'core';
    group.add(coreMesh);

    // Selection halo (hidden by default)
    const haloGeo = new THREE.RingGeometry(1.2, 1.3, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#0cc6ff',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.name = 'selectionHalo';
    halo.rotation.x = Math.PI / 2;
    halo.visible = false;
    group.add(halo);

    return group;
  }

  /**
   * Ring synchronization driven by actual ring data (proportional radii),
   * including pruning of ring meshes removed from the data model.
   */
  private syncBodyRings(b: CelestialBody, group: THREE.Group, dispRadius: number): void {
    const rings: RingStructure[] = b.rings || [];
    const ringIds = new Set(rings.map(r => r.id));

    // Prune meshes whose ring data vanished
    const stale: THREE.Object3D[] = [];
    for (const child of group.children) {
      if (child.name.startsWith('ring-') && !ringIds.has(child.name.slice(5))) {
        stale.push(child);
      }
    }
    for (const mesh of stale) {
      group.remove(mesh);
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }

    for (const ring of rings) {
      const meshName = `ring-${ring.id}`;
      let ringMesh = group.getObjectByName(meshName) as THREE.Mesh;

      // Physical proportion relative to body radius, with readable minimums so
      // inner rings never sink inside the core mesh
      const innerRatio = Math.max(1.12, ring.innerRadiusKm / Math.max(1, b.radiusKm));
      const outerRatio = Math.max(innerRatio + 0.14, ring.outerRadiusKm / Math.max(1, b.radiusKm));
      const cappedInner = Math.min(innerRatio, 30);
      const cappedOuter = Math.min(outerRatio, 42);

      // Ring from the orbit loom hugs the orbital track in display space and
      // must be allowed to be wide: scale via normalized geometry instead.
      const geometryKey = `${cappedInner.toFixed(2)}-${cappedOuter.toFixed(2)}`;
      const morphT = this.scaleTransform.morphT;

      if (!ringMesh) {
        const geo = new THREE.RingGeometry(1, cappedOuter / cappedInner, 64);
        const mat = ring.isBloodRing ? createBloodRingMaterial() : createOrdinaryRingMaterial(ring.color);
        ringMesh = new THREE.Mesh(geo, mat);
        ringMesh.name = meshName;
        ringMesh.rotation.x = Math.PI / 2 - (ring.normal?.x ?? 0) * 0.35;
        ringMesh.userData.geometryKey = geometryKey;
        ringMesh.userData.builtMorphT = morphT;
        group.add(ringMesh);
      } else if (
        ringMesh.userData.geometryKey !== geometryKey ||
        Math.abs((ringMesh.userData.builtMorphT ?? 1) - morphT) > 0.25
      ) {
        ringMesh.geometry.dispose();
        const innerD = Math.max(1.12, cappedInner);
        ringMesh.geometry = new THREE.RingGeometry(1, cappedOuter / innerD, 64);
        ringMesh.userData.geometryKey = geometryKey;
        ringMesh.userData.builtMorphT = morphT;
      }

      // Unit inner radius scaled out: displayRadius * cappedInner maps correctly
      const innerDisplay = dispRadius * Math.max(1.12, cappedInner);
      ringMesh.scale.setScalar(innerDisplay);
    }
  }

  public setSelectedBody(id: string | null): void {
    this.selectedBodyId = id;
    for (const [bodyId, group] of this.bodyMeshes) {
      const halo = group.getObjectByName('selectionHalo');
      if (halo) {
        halo.visible = bodyId === id;
      }
    }
  }

  // ============================ CAMERA =====================================

  public orbitCamera(deltaTheta: number, deltaPhi: number): void {
    const sens = this.cameraSensitivity;
    this.cameraSpherical.theta += deltaTheta * sens;
    this.cameraSpherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.cameraSpherical.phi + deltaPhi * sens));
    // Feed velocity for inertia glide
    this.orbitVelocity.set(deltaTheta * sens, deltaPhi * sens);
    this.updateCameraPosition();
  }

  /** Inertial glide after pointer release (camera feel). */
  private applyCameraInertia(deltaSec: number): void {
    const speed = this.orbitVelocity.length();
    if (speed < 0.00001) return;
    const decay = Math.exp(-deltaSec * 3.2);
    this.orbitVelocity.multiplyScalar(decay);
    this.cameraSpherical.theta += this.orbitVelocity.x * deltaSec * 22;
    this.cameraSpherical.phi = Math.max(
      0.05,
      Math.min(Math.PI - 0.05, this.cameraSpherical.phi + this.orbitVelocity.y * deltaSec * 22)
    );
  }

  public zoomCamera(factor: number): void {
    this.cameraDistance = Math.max(6.0, Math.min(20000.0, this.cameraDistance * factor));
    this.cameraSpherical.radius = this.cameraDistance;
    this.updateCameraPosition();
  }

  /** Smooth exponential wheel zoom with per-notch clamping. */
  public wheelZoom(rawDeltaY: number): void {
    const clamped = Math.max(-480, Math.min(480, rawDeltaY));
    const factor = Math.pow(1.0015, clamped * this.cameraSensitivity);
    this.zoomCamera(factor);
  }

  public panCamera(deltaX: number, deltaY: number): void {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const panSpeed = this.cameraDistance * 0.0015 * this.cameraSensitivity;
    this.desiredTarget.addScaledVector(right, -deltaX * panSpeed);
    this.desiredTarget.addScaledVector(up, deltaY * panSpeed);
    // Keep pan anchored in display-space sanity
    this.desiredTarget.clampLength(0, 40000);
  }

  /**
   * True camera reset: clears BOTH the damped target and the desired target,
   * restores neutral spherical framing, returns to inertial space.
   */
  public resetCamera(bodies?: CelestialBody[]): void {
    this.viewMode = 'inertial';
    this.floatingOrigin.setOrigin(0, 0, 0);
    this.cameraTarget.set(0, 0, 0);
    this.desiredTarget.set(0, 0, 0);
    this.orbitVelocity.set(0, 0);
    this.cameraSpherical.phi = Math.PI / 3;
    this.cameraSpherical.theta = Math.PI / 4;
    if (bodies && bodies.length > 0) {
      this.frameAll(bodies);
    } else {
      this.zoomSet(250);
    }
  }

  private zoomSet(distance: number): void {
    this.cameraDistance = Math.max(6.0, Math.min(20000.0, distance));
    this.cameraSpherical.radius = this.cameraDistance;
    this.updateCameraPosition();
  }

  /** Fit the whole system in view (one-glance architecture). */
  public frameAll(bodies: CelestialBody[]): void {
    if (bodies.length === 0) {
      this.zoomSet(250);
      return;
    }
    let maxDisp = 200;
    for (const b of bodies) {
      const disp = this.scaleTransform.getDisplayPosition(this.floatingOrigin.toRelative(b.position));
      const r = Math.sqrt(disp.x * disp.x + disp.y * disp.y + disp.z * disp.z);
      if (r > maxDisp) maxDisp = r;
    }
    this.zoomSet(Math.max(220, maxDisp * 1.45));
  }

  /** Focus the camera on a body with an appropriate standoff distance. */
  public focusBody(body: CelestialBody, track: boolean): void {
    this.viewMode = track ? 'follow_selected' : 'focus_selected';
    this.floatingOrigin.setOrigin(body.position.x, body.position.y, body.position.z);
    const dispRadius = this.scaleTransform.getDisplayRadius(body.radiusKm, body.type);
    this.zoomSet(Math.max(18, dispRadius * 9));
  }

  /** Apply a camera shake impulse from impact feedback. */
  public impulse(strength: number): void {
    this.shakeStrength = Math.min(1, this.shakeStrength + strength * 0.9);
  }

  public setViewMode(mode: CameraViewMode): void {
    this.viewMode = mode;
    if (mode === 'top_down') {
      this.cameraSpherical.phi = 0.05; // Looking straight down
    } else if (mode === 'inertial') {
      this.floatingOrigin.setOrigin(0, 0, 0);
      this.cameraSpherical.phi = Math.PI / 3;
    }
    this.updateCameraPosition();
  }

  /** Export live camera state so persistence stores truth (not placeholders). */
  public captureCamera(): CameraSnapshot {
    return {
      target: { x: this.cameraTarget.x, y: this.cameraTarget.y, z: this.cameraTarget.z },
      distance: this.cameraDistance,
      viewMode: this.viewMode,
    };
  }

  /** Restore camera state from persistence. */
  public restoreCamera(snapshot: CameraSnapshot | { target: Vector3D; distance: number; viewMode: string } | undefined): void {
    if (!snapshot) return;
    this.desiredTarget.set(snapshot.target.x, snapshot.target.y, snapshot.target.z);
    this.cameraTarget.set(snapshot.target.x, snapshot.target.y, snapshot.target.z);
    this.zoomSet(snapshot.distance || 250);
    this.viewMode = (snapshot.viewMode as CameraViewMode) || 'inertial';
  }

  private updateCameraPosition(): void {
    const offset = new THREE.Vector3().setFromSpherical(this.cameraSpherical);
    this.camera.position.copy(this.cameraTarget).add(offset);
    this.camera.position.add(this.shakeOffset);
    this.camera.lookAt(this.cameraTarget);
  }

  public update(deltaSec: number): void {
    // Smooth camera target lerp
    this.cameraTarget.lerp(this.desiredTarget, Math.min(1.0, deltaSec * 8.0));

    // Inertial glide
    this.applyCameraInertia(deltaSec);

    // Impact shake decay
    if (this.shakeStrength > 0.001) {
      const t = this.clock.getElapsedTime();
      this.shakeOffset.set(
        Math.sin(t * 61) * this.shakeStrength * 1.1,
        Math.cos(t * 47) * this.shakeStrength * 0.8,
        Math.sin(t * 53) * this.shakeStrength * 0.9
      );
      this.shakeStrength *= Math.exp(-deltaSec * 5.5);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    this.updateCameraPosition();

    // Smooth scale transform morph
    this.scaleTransform.update(deltaSec);
  }

  public render(): void {
    if (this.destroyed) return;
    this.renderer.render(this.scene, this.camera);
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /**
   * Raycast from normalized screen coordinates (x, y in [-1, 1]) to intersect celestial bodies.
   */
  public raycastBody(normalizedX: number, normalizedY: number): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), this.camera);

    const candidates: { id: string; mesh: THREE.Mesh }[] = [];
    for (const [id, group] of this.bodyMeshes) {
      const core = group.getObjectByName('core') as THREE.Mesh;
      if (core) {
        candidates.push({ id, mesh: core });
      }
    }

    const meshes = candidates.map(c => c.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const found = candidates.find(c => c.mesh === hit);
      return found ? found.id : null;
    }

    return null;
  }

  /**
   * List all body ids whose cores fall inside a screen-space disc (selection
   * cycling at crowded geometries like moons over planets).
   */
  public raycastBodiesInRadius(normalizedX: number, normalizedY: number, pixelRadius: number, canvas: HTMLCanvasElement): string[] {
    const hits: { id: string; dist: number }[] = [];
    const rect = canvas.getBoundingClientRect();
    const px = (normalizedX * 0.5 + 0.5) * rect.width;
    const py = (1 - (normalizedY * 0.5 + 0.5)) * rect.height;

    for (const [id, group] of this.bodyMeshes) {
      const projected = group.position.clone().project(this.camera);
      const sx = (projected.x * 0.5 + 0.5) * rect.width;
      const sy = (1 - (projected.y * 0.5 + 0.5)) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d <= pixelRadius) {
        hits.push({ id, dist: d });
      }
    }
    return hits.sort((a, b) => a.dist - b.dist).map(h => h.id);
  }

  /**
   * Raycast onto the orbital reference plane (y = 0 relative to target) to get 3D intersection.
   */
  public raycastOrbitalPlane(normalizedX: number, normalizedY: number, planeY: number = 0): Vector3D | null {
    this.raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), this.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const intersection = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(plane, intersection);

    if (hit) {
      return { x: hit.x, y: hit.y, z: hit.z };
    }
    return null;
  }

  /** Full GPU + worker-side resource release (unmount; StrictMode-safe). */
  public dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const [, group] of this.bodyMeshes) {
      this.disposeBodyGroup(group);
    }
    this.bodyMeshes.clear();
    this.purgeBelts();
    this.trajectoryRenderer.clearAll();
    this.trailRenderer.dispose();
    this.debrisRenderer.dispose();
    this.labelRenderer.dispose();
    this.xrayLens.dispose();
    this.habitableZone.dispose();
    if (this.starfield) {
      this.starfield.geometry.dispose();
      (this.starfield.material as THREE.Material).dispose();
    }
    if (this.ghostLine) {
      this.ghostLine.geometry.dispose();
      (this.ghostLine.material as THREE.Material).dispose();
      this.ghostLine = null;
    }
    this.renderer.dispose();
  }
}
