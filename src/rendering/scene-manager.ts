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
import { OrbitLineRenderer } from './orbit-lines';
import { BodyLabelRenderer } from './body-labels';
import { AuRulerRenderer } from './au-ruler';
import { CometTailRenderer, COMET_ACTIVE_RADIUS_KM, COMET_MIN_ECCENTRICITY } from './comet-tails';
import { EclipseConeRenderer } from './eclipse-cones';
import { buildStationKit, StationKit } from './station-kit';
import { getRingTexture } from './ring-textures';
import { disposalRegistry } from './disposal';
import { calculateOsculatingElements, findDominantPrimary } from '../simulation/orbital-mechanics';
import { KM_PER_AU } from '../simulation/units';
import { CollisionDebrisParticle } from '../simulation/collisions';
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

  // Iteration-2 overlay renderers.
  public orbitLines: OrbitLineRenderer;
  public bodyLabels: BodyLabelRenderer;
  public auRuler: AuRulerRenderer;
  private cometTails: CometTailRenderer;
  private eclipseCones: EclipseConeRenderer;
  private velocityArrows: Map<string, THREE.ArrowHelper> = new Map();
  private stationKits: Map<string, StationKit> = new Map();
  private velocityVectorsVisible = false;
  private debrisPoints: THREE.Points | null = null;
  private debrisCap = 512;
  private shockwaves: Array<{ mesh: THREE.Mesh; ageSec: number }> = [];
  private flareUntil = new Map<string, number>();
  private flareNext = new Map<string, number>();
  private flareRng = new SeededRng(777);

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

    // Iteration-2 overlays: orbit map, labels, ruler, comets, eclipse cones.
    this.orbitLines = new OrbitLineRenderer();
    this.scene.add(this.orbitLines.group);
    this.bodyLabels = new BodyLabelRenderer();
    this.scene.add(this.bodyLabels.group);
    this.auRuler = new AuRulerRenderer();
    this.scene.add(this.auRuler.group);
    this.cometTails = new CometTailRenderer();
    this.scene.add(this.cometTails.group);
    this.eclipseCones = new EclipseConeRenderer();
    this.scene.add(this.eclipseCones.group);
  }

  /** Map simulation-km to scene units through the floating origin + scale. */
  private toSceneVec(simKm: Vector3D, out = new THREE.Vector3()): THREE.Vector3 {
    const rel = this.floatingOrigin.toRelative(simKm);
    const disp = this.scaleTransform.getDisplayPosition(rel);
    return out.set(disp.x, disp.y, disp.z);
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
        const arrow = this.velocityArrows.get(id);
        if (arrow) {
          group.remove(arrow);
          disposalRegistry.release(arrow.line.geometry);
          disposalRegistry.release((arrow.line.material as THREE.Material));
          disposalRegistry.release(arrow.cone.geometry);
          disposalRegistry.release((arrow.cone.material as THREE.Material));
          this.velocityArrows.delete(id);
        }
        this.stationKits.delete(id);
        this.flareUntil.delete(id);
        this.flareNext.delete(id);
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
      // Relativistic jet shafts track the horizon scale (ASSET04).
      const jetUp = group.getObjectByName('jet-up');
      if (jetUp) jetUp.scale.set(dispRadius * 0.22, dispRadius * 5, dispRadius * 0.22);
      const jetDown = group.getObjectByName('jet-down');
      if (jetDown) jetDown.scale.set(dispRadius * 0.22, dispRadius * 5, dispRadius * 0.22);

      // Persistent velocity vectors for in-flight bodies (ASSET01).
      this.syncVelocityArrow(b, group);

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
      if (this.orbitLines.isVisible()) this.refreshOrbitLines(bodies);
      if (this.auRuler.isVisible()) this.refreshAuRuler(bodies);
      this.refreshComets(bodies);
    }
  }

  /** Per-body velocity arrow lifecycle (ASSET01). */
  private syncVelocityArrow(b: CelestialBody, group: THREE.Group): void {
    const speed = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
    const want = this.velocityVectorsVisible && !b.fixed && speed > 1e-6 && b.type !== 'star';
    let arrow = this.velocityArrows.get(b.id);
    if (!want) {
      if (arrow) arrow.visible = false;
      return;
    }
    if (!arrow) {
      arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(),
        10,
        b.id === this.selectedBodyId ? 0xffd166 : 0x0cc6ff,
        3,
        1.6
      );
      arrow.line.material = (arrow.line.material as THREE.Material).clone();
      arrow.cone.material = (arrow.cone.material as THREE.Material).clone();
      disposalRegistry.track(arrow.line.geometry, 'velocity-arrow');
      disposalRegistry.track(arrow.line.material as THREE.Material, 'velocity-arrow');
      disposalRegistry.track(arrow.cone.geometry, 'velocity-arrow');
      disposalRegistry.track(arrow.cone.material as THREE.Material, 'velocity-arrow');
      this.velocityArrows.set(b.id, arrow);
      group.add(arrow);
    }
    arrow.visible = true;
    (arrow.line.material as THREE.LineBasicMaterial).color.set(
      b.id === this.selectedBodyId ? '#ffd166' : '#0cc6ff'
    );
    (arrow.cone.material as THREE.MeshBasicMaterial).color.set(
      b.id === this.selectedBodyId ? '#ffd166' : '#0cc6ff'
    );
    const dispVel = this.scaleTransform.getDisplayPosition({
      x: b.velocity.x,
      y: b.velocity.y,
      z: b.velocity.z,
    });
    const dir = new THREE.Vector3(dispVel.x, dispVel.y, dispVel.z);
    if (dir.lengthSq() < 1e-12) {
      arrow.visible = false;
      return;
    }
    dir.normalize();
    arrow.setDirection(dir);
    // Log-length so 0.1 km/s and 100 km/s both stay legible.
    const len = 6 + Math.log10(1 + speed) * 9;
    arrow.setLength(len, len * 0.28, len * 0.14);
  }

  /** Rebuild Keplerian orbit loops for bound orbiters (ASSET09). */
  private refreshOrbitLines(bodies: CelestialBody[]): void {
    const entries: Array<{
      body: CelestialBody;
      primary: CelestialBody;
      elements: import('../simulation/types').OsculatingElements;
    }> = [];
    for (const b of bodies) {
      if (b.type === 'star' || b.type === 'black_hole' || b.fixed) continue;
      const primary = b.primaryId
        ? (bodies.find((x) => x.id === b.primaryId) ?? findDominantPrimary(b, bodies))
        : findDominantPrimary(b, bodies);
      if (!primary) continue;
      const elements = calculateOsculatingElements(b, primary);
      if (elements && elements.isBound) entries.push({ body: b, primary, elements });
    }
    this.orbitLines.rebuild(entries, (p) => this.toSceneVec(p), this.selectedBodyId);
  }

  /** Re-center AU ruler rings on the dominant star (ASSET12). */
  private refreshAuRuler(bodies: CelestialBody[]): void {
    const star = bodies.find((b) => b.type === 'star') ?? bodies[0] ?? null;
    if (!star) return;
    const center = this.toSceneVec(star.position);
    const unitsPerKm =
      (ScaleTransform.SCENE_UNITS_PER_KM as number | undefined) ?? 1000.0 / 149597870.7;
    this.auRuler.update(center, unitsPerKm);
  }

  /** Detect active comets and refresh their tails (ASSET14). */
  private refreshComets(bodies: CelestialBody[]): void {
    const stars = bodies.filter((b) => b.type === 'star');
    if (stars.length === 0) {
      this.cometTails.update([]);
      return;
    }
    const actives: Array<{ id: string; headScene: THREE.Vector3; awayScene: THREE.Vector3; intensity01: number }> = [];
    for (const b of bodies) {
      if (b.type === 'star' || b.type === 'black_hole' || b.fixed) continue;
      let nearest: CelestialBody | null = null;
      let nearestDist = Number.POSITIVE_INFINITY;
      for (const s of stars) {
        const d = Math.hypot(
          b.position.x - s.position.x,
          b.position.y - s.position.y,
          b.position.z - s.position.z
        );
        if (d < nearestDist) {
          nearestDist = d;
          nearest = s;
        }
      }
      if (!nearest || nearestDist > COMET_ACTIVE_RADIUS_KM) continue;
      const el = calculateOsculatingElements(b, nearest);
      if (!el || el.eccentricity < COMET_MIN_ECCENTRICITY) continue;
      const head = this.toSceneVec(b.position);
      const starScene = this.toSceneVec(nearest.position);
      const away = head.clone().sub(starScene).normalize();
      const rAu = nearestDist / KM_PER_AU;
      const intensity01 = Math.max(0, Math.min(1, 1.2 - rAu / 3.5));
      const tailLen = 4 + (26 / Math.max(0.2, rAu * rAu)) * intensity01;
      actives.push({
        id: b.id,
        headScene: head,
        awayScene: head.clone().addScaledVector(away, tailLen),
        intensity01,
      });
    }
    this.cometTails.update(actives);
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
      // ASSET04: twin relativistic jet shafts along the disk normal.
      for (const [name, sign] of [['jet-up', 1], ['jet-down', -1]] as Array<[string, number]>) {
        const jetGeo = new THREE.CylinderGeometry(0.08, 0.3, 1, 10, 1, true);
        disposalRegistry.track(jetGeo, 'jet-geometry');
        const jetMat = new THREE.MeshBasicMaterial({
          color: '#9fdcff',
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        disposalRegistry.track(jetMat, 'jet-material');
        const jet = new THREE.Mesh(jetGeo, jetMat);
        jet.name = name;
        jet.position.y = sign * 2.6;
        jet.renderOrder = 4;
        group.add(jet);
      }
    } else if (b.type === 'station' || b.type === 'ship' || b.type === 'megastructure') {
      // ASSET15: built station kit instead of a placeholder globe.
      const kit = buildStationKit(b.color || '#9fd8ff');
      this.stationKits.set(b.id, kit);
      group.add(kit.group);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      disposalRegistry.track(mat, 'station-proxy-material');
      coreMesh = new THREE.Mesh(sphereGeo, mat);
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
    // Station kits ride the same display-radius scaling as globes.
    const kit = this.stationKits.get(b.id);
    if (kit) {
      const dispRadius = this.scaleTransform.getDisplayRadius(b.radiusKm, b.type);
      kit.group.scale.set(dispRadius, dispRadius, dispRadius);
    }

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
        const geo = new THREE.RingGeometry(innerR, outerR, 96, 1);
        // ASSET02: remap planar UVs to true (radial, angular) coordinates
        // so the ring shaders' band math works as documented.
        const pos = geo.attributes.position;
        const uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const r = Math.min(1, Math.max(0, (Math.hypot(x, y) - innerR) / (outerR - innerR)));
          const a = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2);
          uv.setXY(i, r, a);
        }
        uv.needsUpdate = true;
        const seed = SeededRng.hashString(`${b.id}|${ring.id}`);
        const mat = ring.isBloodRing
          ? createBloodRingMaterial()
          : createOrdinaryRingMaterial(
              ring.color,
              getRingTexture(seed, ring.color || '#c0b49c'),
              (seed % 1000) / 1000
            );
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

  /** Maneuver burn flash: azure burst + expanding shockwave ring (ASSET05). */
  public spawnBurnFlash(bodyId: string): void {
    const group = this.bodyMeshes.get(bodyId);
    if (!group) return;
    this.collisionBursts.spawn(group.position, '#7df9ff', 0.7);
    if (this.reducedMotion || this.shockwaves.length >= 8) return;
    const core = group.getObjectByName('core') as THREE.Mesh | undefined;
    const base = core ? core.scale.x : 4;
    const geo = new THREE.RingGeometry(0.92, 1, 48);
    disposalRegistry.track(geo, 'shockwave-geometry');
    const mat = new THREE.MeshBasicMaterial({
      color: '#7df9ff',
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    disposalRegistry.track(mat, 'shockwave-material');
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(group.position);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(base, base, base);
    ring.renderOrder = 6;
    this.scene.add(ring);
    this.shockwaves.push({ mesh: ring, ageSec: 0 });
  }

  /** Render a shadow shaft for a fresh eclipse (ASSET10). */
  public spawnEclipseCone(viewerId: string, occluderId: string): void {
    const viewer = this.bodyMeshes.get(viewerId);
    const occluder = this.bodyMeshes.get(occluderId);
    if (!viewer || !occluder) return;
    const core = occluder.getObjectByName('core') as THREE.Mesh | undefined;
    this.eclipseCones.spawn(occluder.position, viewer.position, core ? core.scale.x : 3);
  }

  /** Sync engine ejecta debris into a fading point cloud (ASSET13). */
  public syncDebris(debris: CollisionDebrisParticle[]): void {
    if (debris.length === 0) {
      if (this.debrisPoints) this.debrisPoints.visible = false;
      return;
    }
    if (!this.debrisPoints) {
      const geo = new THREE.BufferGeometry();
      disposalRegistry.track(geo, 'debris-geometry');
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.debrisCap * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.debrisCap * 3), 3));
      const mat = new THREE.PointsMaterial({
        size: 2.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      disposalRegistry.track(mat, 'debris-material');
      this.debrisPoints = new THREE.Points(geo, mat);
      this.debrisPoints.name = 'ejecta-debris';
      this.debrisPoints.frustumCulled = false;
      this.scene.add(this.debrisPoints);
    }
    const shown = debris.slice(0, this.debrisCap);
    const posAttr = this.debrisPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.debrisPoints.geometry.getAttribute('color') as THREE.BufferAttribute;
    const scratch = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < shown.length; i++) {
      const d = shown[i];
      this.toSceneVec(d.position, scratch);
      posAttr.setXYZ(i, scratch.x, scratch.y, scratch.z);
      const fade = Math.max(0.15, d.lifetimeRemainingSec / Math.max(0.001, d.initialLifetimeSec));
      color.set(d.color || '#ff8844').multiplyScalar(fade);
      colAttr.setXYZ(i, color.r, color.g, color.b);
    }
    this.debrisPoints.geometry.setDrawRange(0, shown.length);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.debrisPoints.visible = true;
  }

  /** Capture the live canvas as a PNG data URL (UI15 PRESENT mode). */
  public captureScreenshot(): string | null {
    try {
      this.render();
      return this.renderer.domElement.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  public setVelocityVectorsVisible(visible: boolean): void {
    this.velocityVectorsVisible = visible;
    if (!visible) {
      for (const arrow of this.velocityArrows.values()) arrow.visible = false;
    }
  }

  public setOrbitLinesVisible(visible: boolean): void {
    this.orbitLines.setVisible(visible);
  }

  public setLabelsVisible(visible: boolean): void {
    this.bodyLabels.setVisible(visible);
  }

  public setAuRulerVisible(visible: boolean): void {
    this.auRuler.setVisible(visible);
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
    this.eclipseCones.update(this.reducedMotion ? 0 : deltaSec);

    // Floating nameplates track bodies every frame (ASSET11).
    this.bodyLabels.update(
      this.lastBodies,
      (p, out) => this.toSceneVec(p, out),
      this.camera,
      this.selectedBodyId
    );

    // Maneuver shockwaves expand and fade (ASSET05).
    if (!this.reducedMotion) {
      for (const wave of [...this.shockwaves]) {
        wave.ageSec += deltaSec;
        const t = wave.ageSec / 1.1;
        if (t >= 1) {
          this.scene.remove(wave.mesh);
          disposalRegistry.release(wave.mesh.geometry);
          disposalRegistry.release(wave.mesh.material as THREE.Material);
          this.shockwaves.splice(this.shockwaves.indexOf(wave), 1);
          continue;
        }
        const s = 1 + t * 3.2;
        wave.mesh.scale.set(s, s, s);
        (wave.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
      }
    }

    // Station beacons blink; jets shimmer; M-dwarfs flare (ASSET15/04/03).
    if (!this.reducedMotion) {
      for (const kit of this.stationKits.values()) kit.update(elapsed);
      for (const group of this.bodyMeshes.values()) {
        for (const jetName of ['jet-up', 'jet-down']) {
          const jet = group.getObjectByName(jetName) as THREE.Mesh | undefined;
          if (jet) {
            (jet.material as THREE.MeshBasicMaterial).opacity =
              0.28 + 0.12 * Math.sin(elapsed * 7 + group.position.x);
          }
        }
      }
      this.updateStellarFlares(elapsed);
    }
  }

  /**
   * M-dwarf flare flashes (ASSET03): red dwarfs randomly surge to ~2×
   * corona brightness for a few seconds — temperamental hosts that make
   * habitability around them a genuine gamble.
   */
  private updateStellarFlares(elapsed: number): void {
    for (const b of this.lastBodies) {
      if (b.type !== 'star') continue;
      const spectral = this.spectralClassForBody(b);
      void spectral;
      const cls = spectralClassForMass(b.massKg).class;
      if (cls !== 'M') continue;
      const group = this.bodyMeshes.get(b.id);
      const corona = group?.getObjectByName('corona') as THREE.Sprite | undefined;
      if (!corona) continue;
      const next = this.flareNext.get(b.id) ?? elapsed + this.flareRng.range(20, 90);
      if (elapsed >= next) {
        this.flareUntil.set(b.id, elapsed + this.flareRng.range(2, 5));
        this.flareNext.set(b.id, elapsed + this.flareRng.range(45, 160));
      }
      const until = this.flareUntil.get(b.id) ?? 0;
      if (elapsed < until) {
        const envelope = 1 + 0.9 * Math.sin(((until - elapsed) / 5) * Math.PI);
        corona.scale.multiplyScalar(envelope / ((corona.userData.flare as number | undefined) ?? 1));
        corona.userData.flare = envelope;
      } else if (corona.userData.flare) {
        corona.scale.multiplyScalar(1 / (corona.userData.flare as number));
        corona.userData.flare = 0;
      }
    }
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
    this.orbitLines.dispose();
    this.bodyLabels.dispose();
    this.auRuler.dispose();
    this.cometTails.dispose();
    this.eclipseCones.dispose();
    for (const wave of this.shockwaves) {
      this.scene.remove(wave.mesh);
      disposalRegistry.release(wave.mesh.geometry);
      disposalRegistry.release(wave.mesh.material as THREE.Material);
    }
    this.shockwaves = [];
    this.velocityArrows.clear();
    this.stationKits.clear();
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
