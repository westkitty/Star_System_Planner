/**
 * Gradient throw-vector arrow asset (ASSET08).
 *
 * A purpose-built velocity arrow: emissive gradient shaft, cone head,
 * origin anchor ring, and magnitude tick rings every fixed display unit —
 * far more legible than the stock ArrowHelper when aiming slingshots.
 */

import * as THREE from 'three';

export interface ThrowVector {
  group: THREE.Group;
  setVector: (direction: THREE.Vector3, lengthDisplay: number) => void;
  setVisible: (visible: boolean) => void;
}

const TICK_INTERVAL = 8;

export function createThrowVector(): ThrowVector {
  const group = new THREE.Group();
  group.name = 'throwVector';
  group.visible = false;

  // Shaft: cylinder with vertex-color gradient (azure → white).
  const shaftGeo = new THREE.CylinderGeometry(0.32, 0.32, 1, 12, 8, true);
  shaftGeo.translate(0, 0.5, 0);
  const positions = shaftGeo.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const tail = new THREE.Color('#0cc6ff');
  const head = new THREE.Color('#ffffff');
  for (let i = 0; i < positions.count; i++) {
    const t = positions.getY(i); // 0..1 along shaft
    const c = tail.clone().lerp(head, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  shaftGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const shaftMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.name = 'shaft';
  group.add(shaft);

  // Head cone.
  const headMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.4, 16),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#eafcff'),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  headMesh.name = 'head';
  group.add(headMesh);

  // Origin anchor ring.
  const anchor = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.35, 32),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#0cc6ff'),
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  anchor.name = 'anchor';
  group.add(anchor);

  // Magnitude ticks (reused pool).
  const tickMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#49e7ff'),
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const tickPool: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const tick = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 8, 24), tickMat);
    tick.visible = false;
    group.add(tick);
    tickPool.push(tick);
  }

  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion();

  return {
    group,
    setVector: (direction: THREE.Vector3, lengthDisplay: number) => {
      const len = Math.max(2, lengthDisplay);
      quaternion.setFromUnitVectors(up, direction.clone().normalize());
      group.quaternion.copy(quaternion);
      shaft.scale.set(1, len, 1);
      shaft.position.set(0, 0, 0);
      headMesh.position.set(0, len + 1.2, 0);
      anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up.clone().applyQuaternion(quaternion).negate());
      anchor.position.set(0, 0, 0);
      // Ticks march along the shaft.
      const tickCount = Math.min(tickPool.length, Math.floor(len / TICK_INTERVAL));
      for (let i = 0; i < tickPool.length; i++) {
        const tick = tickPool[i];
        if (i < tickCount) {
          tick.visible = true;
          tick.position.set(0, (i + 1) * TICK_INTERVAL, 0);
        } else {
          tick.visible = false;
        }
      }
    },
    setVisible: (visible: boolean) => {
      group.visible = visible;
    },
  };
}
