/**
 * Animated selection + hover indicator asset (ASSET07).
 *
 * Replaces the static halo with a rotating dashed lock-ring, a soft pulse,
 * and a distinct hover ring so architects always know what the pointer is
 * about to grab — critical for S Pen precision work.
 */

import * as THREE from 'three';

export interface SelectionIndicator {
  group: THREE.Group;
  setHover: (hovered: boolean) => void;
  update: (elapsedSec: number, reducedMotion: boolean) => void;
}

export function createSelectionIndicator(): SelectionIndicator {
  const group = new THREE.Group();
  group.name = 'selectionIndicator';

  // Dashed lock ring (rotates slowly).
  const ringGeo = new THREE.RingGeometry(1.35, 1.45, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#0cc6ff'),
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const lockRing = new THREE.Mesh(ringGeo, ringMat);
  lockRing.rotation.x = Math.PI / 2;
  lockRing.name = 'lockRing';
  group.add(lockRing);

  // Tick marks: 4 cardinal brackets suggesting a targeting reticle.
  const tickMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#b6f6ff'),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const ticks = new THREE.Group();
  ticks.name = 'ticks';
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.07), tickMat);
    const angle = (i / 4) * Math.PI * 2;
    tick.position.set(Math.cos(angle) * 1.7, 0, Math.sin(angle) * 1.7);
    tick.rotation.y = -angle;
    ticks.add(tick);
  }
  group.add(ticks);

  // Hover ring (faint, shown on pointer proximity).
  const hoverMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#49e7ff'),
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.62, 48), hoverMat);
  hoverRing.rotation.x = Math.PI / 2;
  hoverRing.name = 'hoverRing';
  group.add(hoverRing);

  let hovered = false;

  return {
    group,
    setHover: (value: boolean) => {
      hovered = value;
      hoverMat.opacity = value ? 0.55 : 0.0;
    },
    update: (elapsedSec: number, reducedMotion: boolean) => {
      if (!reducedMotion) {
        lockRing.rotation.z = elapsedSec * 0.35;
        ticks.rotation.y = -elapsedSec * 0.22;
        const pulse = 1 + Math.sin(elapsedSec * 2.4) * 0.025;
        group.scale.set(pulse, pulse, pulse);
      }
      if (hovered && !reducedMotion) {
        hoverMat.opacity = 0.4 + Math.sin(elapsedSec * 5) * 0.15;
      }
    },
  };
}
