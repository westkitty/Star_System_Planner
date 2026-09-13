/**
 * Station structure kit (ASSET15).
 *
 * Replaces the placeholder station globe with a built structure: truss
 * spine, twin photovoltaic wings, docking core, and a blinking beacon.
 * Unit-radius group; the scene scales it to display size.
 */

import * as THREE from 'three';
import { disposalRegistry } from './disposal';

export interface StationKit {
  group: THREE.Group;
  update: (timeSec: number) => void;
}

export type StationVariant = 'station' | 'ship' | 'megastructure';

export function buildStationKit(tintHex = '#9fd8ff', variant: StationVariant = 'station'): StationKit {
  const group = new THREE.Group();
  group.name = 'station-kit';

  const hullMat = new THREE.MeshStandardMaterial({ color: '#8b98a8', roughness: 0.45, metalness: 0.8 });
  disposalRegistry.track(hullMat, 'station-material');
  const darkMat = new THREE.MeshStandardMaterial({ color: '#2a3340', roughness: 0.6, metalness: 0.7 });
  disposalRegistry.track(darkMat, 'station-material');
  const panelMat = new THREE.MeshStandardMaterial({
    color: '#12395e',
    roughness: 0.25,
    metalness: 0.9,
    emissive: '#0a2540',
    emissiveIntensity: 0.7,
  });
  disposalRegistry.track(panelMat, 'station-material');

  const trussGeo = new THREE.BoxGeometry(2.2, 0.12, 0.12);
  disposalRegistry.track(trussGeo, 'station-geometry');
  group.add(new THREE.Mesh(trussGeo, hullMat));

  const coreGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.7, 12);
  disposalRegistry.track(coreGeo, 'station-geometry');
  const core = new THREE.Mesh(coreGeo, darkMat);
  core.rotation.z = Math.PI / 2;
  group.add(core);

  const panelGeo = new THREE.BoxGeometry(0.9, 0.03, 0.55);
  disposalRegistry.track(panelGeo, 'station-geometry');
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(panelGeo, panelMat);
    wing.position.set(side * 0.85, 0, 0);
    group.add(wing);
  }

  const mastGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6);
  disposalRegistry.track(mastGeo, 'station-geometry');
  const mast = new THREE.Mesh(mastGeo, hullMat);
  mast.position.y = 0.45;
  group.add(mast);

  const beaconMat = new THREE.MeshBasicMaterial({ color: tintHex });
  disposalRegistry.track(beaconMat, 'station-material');
  const beaconGeo = new THREE.SphereGeometry(0.09, 10, 8);
  disposalRegistry.track(beaconGeo, 'station-geometry');
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.y = 0.78;
  group.add(beacon);

  // Iteration 3 ASSET15: distinct silhouettes per hull class so ships,
  // stations, and megastructures read instantly at a distance.
  let spinner: THREE.Object3D | null = null;
  let engineGlow: THREE.Mesh | null = null;
  if (variant === 'ship') {
    const dartGeo = new THREE.ConeGeometry(0.32, 1.6, 8);
    disposalRegistry.track(dartGeo, 'station-geometry');
    const dart = new THREE.Mesh(dartGeo, hullMat);
    dart.rotation.x = Math.PI / 2;
    dart.position.z = 0.4;
    group.add(dart);
    const glowMat = new THREE.MeshBasicMaterial({ color: tintHex, transparent: true, opacity: 0.9 });
    disposalRegistry.track(glowMat, 'station-material');
    const glowGeo = new THREE.SphereGeometry(0.16, 10, 8);
    disposalRegistry.track(glowGeo, 'station-geometry');
    engineGlow = new THREE.Mesh(glowGeo, glowMat);
    engineGlow.position.z = -0.6;
    group.add(engineGlow);
  } else if (variant === 'megastructure') {
    const ringGeo = new THREE.TorusGeometry(1.5, 0.09, 8, 40);
    disposalRegistry.track(ringGeo, 'station-geometry');
    const ring = new THREE.Mesh(ringGeo, hullMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    spinner = ring;
    const spokeGeo = new THREE.BoxGeometry(2.9, 0.06, 0.06);
    disposalRegistry.track(spokeGeo, 'station-geometry');
    for (let i = 0; i < 2; i++) {
      const spoke = new THREE.Mesh(spokeGeo, darkMat);
      spoke.rotation.y = (i / 2) * Math.PI;
      group.add(spoke);
    }
  }

  return {
    group,
    update: (timeSec: number) => {
      // Double-blink aviation pattern.
      const phase = timeSec % 1.6;
      const lit = phase < 0.12 || (phase > 0.28 && phase < 0.4);
      beacon.visible = lit;
      if (spinner) {
        spinner.rotation.z = timeSec * 0.25;
      } else {
        group.rotation.y = timeSec * (variant === 'ship' ? 0.02 : 0.05);
      }
      if (engineGlow) {
        const flicker = 1 + Math.sin(timeSec * 23) * 0.12;
        engineGlow.scale.set(flicker, flicker, flicker);
      }
    },
  };
}
