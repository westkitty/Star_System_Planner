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

export function buildStationKit(tintHex = '#9fd8ff'): StationKit {
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

  return {
    group,
    update: (timeSec: number) => {
      // Double-blink aviation pattern.
      const phase = timeSec % 1.6;
      const lit = phase < 0.12 || (phase > 0.28 && phase < 0.4);
      beacon.visible = lit;
      group.rotation.y = timeSec * 0.05;
    },
  };
}
