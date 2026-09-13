/**
 * Master Scene Manager and Three.js Render Pipeline.
 *
 * Orchestrates:
 * - High-DPR Three.js WebGLRenderer with tone mapping
 * - Dynamic mesh lifecycle for celestial bodies (stars, black holes, planets, rings, stations)
 * - Asteroid belts via InstancedMesh
 * - Trajectory prediction and sensitivity cloud
 * - Newtonian gravity potential grid
 * - Smooth camera navigation (orbit, pan, pinch zoom, focus transitions)
 * - Independent requestAnimationFrame render loop
 */

import * as THREE from 'three';
import { AsteroidBelt, CelestialBody, Vector3D } from '../simulation/types';
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
import { getPlanetTexture } from './planet-textures';
import { createAtmosphereShell, createCoronaSprite, createNebulaVeils } from './sprite-assets';
import { AccretionDisk, createAccretionDisk } from './accretion-disk';
import { SelectionIndicator, createSelectionIndicator } from './selection-indicator';
import { CollisionBurstPool } from './collision-bursts';
import { HabitableZoneRenderer } from './habitable-rings';
import { LagrangeMarkerGroup } from './lagrange-markers';
import { InstancedBeltRenderer } from './instanced-belts';
import { SeededRng } from '../core/seeded-rng';
import { spectralClassByLetter, spectralClassForMass, SpectralLetter } from './star-palette';

export type CameraViewMode = 'inertial' | 'focus_selected' | 'follow_selected' | 'top_down';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public floatingOrigin: FloatingOrigin;
  public scaleTransform: ScaleTransform;
  public trajectoryRenderer: TrajectoryRenderer;
  public gravityGrid: GravityGridRenderer;
  public habitableZones: HabitableZoneRenderer;
  public lagrangeMarkers: LagrangeMarkerGroup;
  public collisionBursts: CollisionBurstPool;

  // Visual mesh dictionary keyed by body ID
  private bodyMeshes: Map<string, THREE.Group> = new Map();
  private selectionIndicators: Map<string, SelectionIndicator> = new Map();
  private accretionDisks: Map<string, AccretionDisk> = new Map();
  private beltRenderers: Map<string, InstancedBeltRenderer> = new Map();
  private lastBodies: CelestialBody[] = [];
  private frameCounter = 0;
  private starfieldFullCount = 0;

  /** Honors reduced-motion preference across pulses and rotation. */
  public reducedMotion = false;

  // Camera state & damping
  public viewMode: CameraViewMode = 'inertial';
  public selectedBodyId: string | null = null;
  public cameraTarget = new THREE.Vector3(0, 0, 0);
  private desiredTarget = new THREE.Vector3(0, 0, 0);
  private cameraDistance = 250.0;
  private cameraSpherical = new THREE.Spherical(250, Math.PI / 3, Math.PI / 4);

  // Background starfield
  private starfield: THREE.Points | null = null;

  private clock = new THREE.Clock();

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

    // Trajectory renderer
    this.trajectoryRenderer = new TrajectoryRenderer(this.scaleTransform);
    this.scene.add(this.trajectoryRenderer.getGroup());

    // Gravity field
    this.gravityGrid = new GravityGridRenderer(this.scaleTransform);
    this.scene.add(this.gravityGrid.getMesh());

    // Background starfield
    this.initBackgroundStarfield();

    // Deep-field nebula veils (ASSET13)
    this.scene.add(createNebulaVeils());

    // Habitable-zone overlay (ASSET11, hidden until toggled)
    this.habitableZones = new HabitableZoneRenderer(this.scaleTransform);
    this.habitableZones.setVisible(false);
    this.scene.add(this.habitableZones.getGroup());

    // Lagrange markers for the selected pair (ASSET12)
    this.lagrangeMarkers = new LagrangeMarkerGroup(this.scaleTransform);
    this.scene.add(this.lagrangeMarkers.getGroup());

    // Collision-burst VFX pool (ASSET10)
    this.collisionBursts = new CollisionBurstPool();
    this.scene.add(this.collisionBursts.getGroup());
  }

  private initBackgroundStarfield(): void {
    const starCount = 3500;
    // BACK10: deterministic starfield — identical sky on every boot.
    const rng = new SeededRng(20260913);
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
      // Distribute on distant sphere
      const theta = rng.range(0, Math.PI * 2);
      const phi = Math.acos(rng.range(-1, 1));
      const r = rng.range(25000, 30000);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const c = rng.pick(colorPalette);
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
    this.starfieldFullCount = starCount;
    this.scene.add(this.starfield);
  }

  /**
   * Synchronize 3D meshes with current simulation bodies.
   */
  public syncBodies(bodies: CelestialBody[], belts?: AsteroidBelt[]): void {
    const activeIds = new Set(bodies.map(b => b.id));
    this.lastBodies = bodies;

    // Remove obsolete meshes (with GPU disposal — BACK08)
    for (const [id, group] of this.bodyMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(group);
        this.disposeGroup(group);
        this.bodyMeshes.delete(id);
        this.selectionIndicators.delete(id);
        this.accretionDisks.delete(id);
      }
    }

    // Update floating origin if following or focusing a body
    if (this.selectedBodyId && (this.viewMode === 'focus_selected' || this.viewMode === 'follow_selected')) {
      const selected = bodies.find(b => b.id === this.selectedBodyId);
      if (selected) {
        this.floatingOrigin.setOrigin(selected.position.x, selected.position.y, selected.position.z);
        this.desiredTarget.set(0, 0, 0);
      }
    } else {
      this.floatingOrigin.setOrigin(0, 0, 0);
    }

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
        }
      }

      // Rescale attached sprite assets to the live display radius.
      const corona = group.getObjectByName('corona') as THREE.Sprite | undefined;
      if (corona) {
        const size = dispRadius * 7;
        corona.scale.set(size, size, 1);
      }
      const atmosphere = group.getObjectByName('atmosphere') as THREE.Mesh | undefined;
      if (atmosphere) {
        atmosphere.scale.set(dispRadius, dispRadius, dispRadius);
      }
      const disk = this.accretionDisks.get(b.id);
      if (disk) {
        disk.group.scale.set(dispRadius, dispRadius, dispRadius);
      }
      const indicator = this.selectionIndicators.get(b.id);
      if (indicator) {
        indicator.group.scale.set(dispRadius, dispRadius, dispRadius);
      }

      // Update rings if attached
      if (b.rings && b.rings.length > 0) {
        this.updateBodyRings(b, group, dispRadius);
      }
    }

    // Prune rings whose structures were removed.
    for (const [id, group] of this.bodyMeshes) {
      const body = bodies.find(bb => bb.id === id);
      const liveRingIds = new Set((body?.rings ?? []).map(r => `ring-${r.id}`));
      for (const child of [...group.children]) {
        if (child.name.startsWith('ring-') && !liveRingIds.has(child.name)) {
          group.remove(child);
          this.disposeObject(child);
        }
      }
    }

    // Update gravity grid
    this.gravityGrid.update(bodies);

    // Sync asteroid belt instancing (ASSET13 environment dressing).
    this.syncBelts(belts ?? []);

    // Throttled overlay refresh (every 20 frames).
    this.frameCounter++;
    if (this.frameCounter % 20 === 0) {
      if (this.habitableZones.isVisible()) {
        this.habitableZones.update(bodies);
      }
      const selected = bodies.find(bb => bb.id === this.selectedBodyId) ?? null;
      this.lagrangeMarkers.update(selected, bodies);
    }
  }

  private syncBelts(belts: AsteroidBelt[]): void {
    const liveIds = new Set(belts.map(b => b.id));
    for (const [id, renderer] of [...this.beltRenderers]) {
      if (!liveIds.has(id)) {
        this.scene.remove(renderer.getMesh());
        renderer.dispose();
        this.beltRenderers.delete(id);
      }
    }
    for (const belt of belts) {
      if (!this.beltRenderers.has(belt.id)) {
        try {
          const renderer = new InstancedBeltRenderer(belt, this.scaleTransform);
          this.beltRenderers.set(belt.id, renderer);
          this.scene.add(renderer.getMesh());
        } catch {
          // Belt instancing is decorative; never break the frame loop.
        }
      }
    }
  }

  private createBodyMesh(b: CelestialBody): THREE.Group {
    const group = new THREE.Group();
    group.name = `body-${b.id}`;

    let coreMesh: THREE.Mesh;
    const sphereGeo = new THREE.SphereGeometry(1, 32, 24);

    if (b.type === 'black_hole') {
      const mat = createBlackHoleMaterial();
      coreMesh = new THREE.Mesh(sphereGeo, mat);
      // ASSET05: accretion disk + photon ring for singularities.
      const disk = createAccretionDisk(1);
      this.accretionDisks.set(b.id, disk);
      group.add(disk.group);
    } else if (b.type === 'star') {
      // ASSET01: spectral-class tint anchors the star color honestly.
      const spectral = this.spectralClassForBody(b);
      const mat = createStarMaterial(spectral.color, b.starsilkBleed);
      coreMesh = new THREE.Mesh(sphereGeo, mat);
      // ASSET04: pulsing corona flare.
      const corona = createCoronaSprite(spectral.color, spectral.coronaColor, 1);
      if (corona) group.add(corona);
    } else {
      // ASSET02: procedural classification texture on the globe.
      const texture = b.classification
        ? getPlanetTexture(b.classification, b.surfaceSeed ?? SeededRng.hashString(b.id))
        : null;
      const mat = createPlanetMaterial(b.color, b.atmosphereColor, texture);
      coreMesh = new THREE.Mesh(sphereGeo, mat);
      // ASSET03: atmospheric limb shell for enveloped worlds.
      if (b.atmosphereColor || (b.atmosphereDensity ?? 0) > 0) {
        const shell = createAtmosphereShell(b.atmosphereColor || '#49e7ff', 1);
        if (shell) group.add(shell);
      }
    }

    coreMesh.name = 'core';
    group.add(coreMesh);

    // ASSET07: animated selection lock-ring (hidden until selected).
    const indicator = createSelectionIndicator();
    indicator.group.visible = b.id === this.selectedBodyId;
    this.selectionIndicators.set(b.id, indicator);
    group.add(indicator.group);

    return group;
  }

  /** Resolve the spectral class recorded on the body, or infer from mass. */
  private spectralClassForBody(b: CelestialBody): { color: string; coronaColor: string } {
    const recorded = (b as unknown as { spectralClass?: string }).spectralClass;
    if (recorded && /^[OBAFGKM]$/.test(recorded)) {
      return spectralClassByLetter(recorded as SpectralLetter);
    }
    return spectralClassForMass(b.massKg);
  }

  private updateBodyRings(b: CelestialBody, group: THREE.Group, dispRadius: number): void {
    for (const ring of b.rings || []) {
      let ringMesh = group.getObjectByName(`ring-${ring.id}`) as THREE.Mesh;
      if (!ringMesh) {
        const innerR = 1.4;
        const outerR = 2.4;
        const geo = new THREE.RingGeometry(innerR, outerR, 64);
        const mat = ring.isBloodRing ? createBloodRingMaterial() : createOrdinaryRingMaterial(ring.color);
        ringMesh = new THREE.Mesh(geo, mat);
        ringMesh.name = `ring-${ring.id}`;
        ringMesh.rotation.x = Math.PI / 2;
        group.add(ringMesh);
      }
      ringMesh.scale.set(dispRadius, dispRadius, dispRadius);
    }
  }

  public setSelectedBody(id: string | null): void {
    this.selectedBodyId = id;
    for (const [bodyId, indicator] of this.selectionIndicators) {
      indicator.group.visible = bodyId === id;
    }
    // Refresh Lagrange markers immediately for the new pair.
    const selected = this.lastBodies.find(bb => bb.id === id) ?? null;
    this.lagrangeMarkers.update(selected, this.lastBodies);
  }

  /** Hover highlight for pointer proximity (ASSET07 companion). */
  public setHoverBody(id: string | null): void {
    for (const [bodyId, indicator] of this.selectionIndicators) {
      indicator.setHover(bodyId === id && bodyId !== this.selectedBodyId);
    }
  }

  /** Ignite a collision burst at a body's live display position (ASSET10). */
  public spawnCollisionBurstAtBody(bodyId: string, tintHex = '#ffb35c', energy = 1): void {
    const group = this.bodyMeshes.get(bodyId);
    if (!group) return;
    this.collisionBursts.spawn(group.position, tintHex, energy);
  }

  /** Manual pixel-ratio control for the auto-quality governor (BACK07). */
  public setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
  }

  /** Reduce starfield draw count under GPU pressure (BACK07). */
  public setStarfieldDensity(fraction: number): void {
    if (!this.starfield) return;
    const clamped = Math.max(0.1, Math.min(1, fraction));
    this.starfield.geometry.setDrawRange(0, Math.floor(this.starfieldFullCount * clamped));
  }

  // Camera navigation methods
  public orbitCamera(deltaTheta: number, deltaPhi: number): void {
    this.cameraSpherical.theta += deltaTheta;
    this.cameraSpherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.cameraSpherical.phi + deltaPhi));
    this.updateCameraPosition();
  }

  public zoomCamera(factor: number): void {
    this.cameraDistance = Math.max(10.0, Math.min(15000.0, this.cameraDistance * factor));
    this.cameraSpherical.radius = this.cameraDistance;
    this.updateCameraPosition();
  }

  public panCamera(deltaX: number, deltaY: number): void {
    // Pan in camera plane
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const panSpeed = this.cameraDistance * 0.0015;
    this.desiredTarget.addScaledVector(right, -deltaX * panSpeed);
    this.desiredTarget.addScaledVector(up, deltaY * panSpeed);
  }

  public setViewMode(mode: CameraViewMode): void {
    this.viewMode = mode;
    if (mode === 'top_down') {
      this.cameraSpherical.phi = 0.05; // Looking straight down
    } else {
      this.cameraSpherical.phi = Math.PI / 3;
    }
    this.updateCameraPosition();
  }

  private updateCameraPosition(): void {
    const offset = new THREE.Vector3().setFromSpherical(this.cameraSpherical);
    this.camera.position.copy(this.cameraTarget).add(offset);
    this.camera.lookAt(this.cameraTarget);
  }

  public update(deltaSec: number): void {
    // Smooth camera target lerp
    this.cameraTarget.lerp(this.desiredTarget, Math.min(1.0, deltaSec * 8.0));
    this.updateCameraPosition();

    // Smooth scale transform morph
    this.scaleTransform.update(deltaSec);

    const elapsed = this.clock.getElapsedTime();

    // Animate selection indicators.
    for (const indicator of this.selectionIndicators.values()) {
      if (indicator.group.visible) {
        indicator.update(elapsed, this.reducedMotion);
      }
    }

    // Drive time-based shader uniforms (blood shimmer, disks, ribbons).
    if (!this.reducedMotion) {
      for (const group of this.bodyMeshes.values()) {
        group.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          const material = mesh.material as THREE.ShaderMaterial | undefined;
          if (material && material.uniforms && material.uniforms.uTime && mesh.name !== 'core') {
            material.uniforms.uTime.value = elapsed;
          }
        });
      }
      for (const disk of this.accretionDisks.values()) {
        disk.update(elapsed);
      }
    }

    // Corona breathing pulse.
    if (!this.reducedMotion) {
      const breathe = 1 + Math.sin(elapsed * 1.4) * 0.04;
      for (const group of this.bodyMeshes.values()) {
        const corona = group.getObjectByName('corona') as THREE.Sprite | undefined;
        if (corona) {
          const prev = (corona.userData.breathe as number | undefined) ?? 1;
          const base = corona.scale.x / prev;
          corona.userData.breathe = breathe;
          corona.scale.set(base * breathe, base * breathe, 1);
        }
      }
    }

    // Belt orbital drift, trajectory pulses, and burst particles.
    for (const renderer of this.beltRenderers.values()) {
      renderer.update(this.reducedMotion ? 0 : deltaSec);
    }
    this.trajectoryRenderer.update(deltaSec, this.reducedMotion);
    this.collisionBursts.update(deltaSec);
  }

  public render(): void {
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
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), this.camera);

    const candidates: { id: string; mesh: THREE.Mesh }[] = [];
    for (const [id, group] of this.bodyMeshes) {
      const core = group.getObjectByName('core') as THREE.Mesh;
      if (core) {
        candidates.push({ id, mesh: core });
      }
    }

    const meshes = candidates.map(c => c.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const found = candidates.find(c => c.mesh === hit);
      return found ? found.id : null;
    }

    return null;
  }

  /**
   * Dispose a body group subtree, releasing GPU geometries/materials (BACK08).
   */
  private disposeObject(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        for (const m of material) m.dispose();
      } else if (material) {
        material.dispose();
      }
    });
  }

  private disposeGroup(group: THREE.Group): void {
    this.disposeObject(group);
  }

  /**
   * Full renderer teardown: geometries, materials, render targets (BACK08).
   */
  public dispose(): void {
    for (const group of this.bodyMeshes.values()) {
      this.disposeGroup(group);
    }
    this.bodyMeshes.clear();
    this.selectionIndicators.clear();
    this.accretionDisks.clear();
    for (const renderer of this.beltRenderers.values()) {
      renderer.dispose();
    }
    this.beltRenderers.clear();
    this.trajectoryRenderer.dispose();
    this.collisionBursts.dispose();
    this.habitableZones.dispose();
    this.lagrangeMarkers.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh | THREE.Points | THREE.Sprite;
      const geometry = (mesh as THREE.Mesh).geometry;
      if (geometry) geometry.dispose();
      const material = (mesh as THREE.Mesh).material as THREE.Material | undefined;
      if (material) material.dispose();
    });
    this.renderer.dispose();
  }

  /**
   * Raycast onto the orbital reference plane (y = 0 relative to target) to get 3D intersection.
   */
  public raycastOrbitalPlane(normalizedX: number, normalizedY: number, planeY: number = 0): Vector3D | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), this.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const intersection = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, intersection);

    if (hit) {
      return { x: hit.x, y: hit.y, z: hit.z };
    }
    return null;
  }
}
