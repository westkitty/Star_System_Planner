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
import { CelestialBody, Vector3D } from '../simulation/types';
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

export type CameraViewMode = 'inertial' | 'focus_selected' | 'follow_selected' | 'top_down';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public floatingOrigin: FloatingOrigin;
  public scaleTransform: ScaleTransform;
  public trajectoryRenderer: TrajectoryRenderer;
  public gravityGrid: GravityGridRenderer;

  // Visual mesh dictionary keyed by body ID
  private bodyMeshes: Map<string, THREE.Group> = new Map();

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
      // Distribute on distant sphere
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
        this.scene.remove(group);
        this.bodyMeshes.delete(id);
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

      // Update rings if attached
      if (b.rings && b.rings.length > 0) {
        this.updateBodyRings(b, group, dispRadius);
      }
    }

    // Update gravity grid
    this.gravityGrid.update(bodies);
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
    for (const [bodyId, group] of this.bodyMeshes) {
      const halo = group.getObjectByName('selectionHalo');
      if (halo) {
        halo.visible = bodyId === id;
      }
    }
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
