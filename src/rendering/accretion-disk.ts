/**
 * Black-hole accretion disk + photon ring asset (ASSET05).
 *
 * A tilted, differentially-rotating emissive disk with inner-edge photon
 * ring and Doppler-inspired brightness asymmetry, giving collapsed
 * singularities the most dramatic silhouette in the planner.
 */

import * as THREE from 'three';

export interface AccretionDisk {
  group: THREE.Group;
  diskMaterial: THREE.ShaderMaterial;
  update: (elapsedSec: number) => void;
}

export function createAccretionDisk(displayRadius: number): AccretionDisk {
  const group = new THREE.Group();
  group.name = 'accretionDisk';

  const diskMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uInnerColor: { value: new THREE.Color('#bfe9ff') },
      uMidColor: { value: new THREE.Color('#0cc6ff') },
      uOuterColor: { value: new THREE.Color('#ff7a3c') },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uInnerColor;
      uniform vec3 uMidColor;
      uniform vec3 uOuterColor;
      varying vec2 vUv;
      varying vec3 vPos;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        // Radial coordinate from ring UVs: inner edge 0 → outer edge 1.
        float r = length(vUv - 0.5) * 2.0;
        float angle = atan(vUv.y - 0.5, vUv.x - 0.5);

        // Differential rotation: inner material orbits faster.
        float swirl = angle * 3.0 + uTime * (2.2 - r * 1.6);
        float streaks = 0.6 + 0.4 * sin(swirl + sin(swirl * 2.7) * 1.2);
        float grain = mix(0.75, 1.0, hash(floor(vUv * 220.0)));

        vec3 color = mix(uInnerColor, uMidColor, smoothstep(0.05, 0.55, r));
        color = mix(color, uOuterColor, smoothstep(0.55, 0.95, r));

        // Doppler beaming: one limb brighter than the other.
        float beam = 0.75 + 0.45 * cos(angle - 0.6);
        float alpha = smoothstep(0.0, 0.12, r) * (1.0 - smoothstep(0.75, 1.0, r));
        alpha *= streaks * grain * beam;

        gl_FragColor = vec4(color * (0.8 + beam * 0.6), alpha * 0.9);
      }
    `,
  });

  const disk = new THREE.Mesh(new THREE.RingGeometry(1.35, 3.4, 96, 8), diskMaterial);
  disk.rotation.x = -Math.PI / 2 + 0.28;
  disk.name = 'diskPlane';
  group.add(disk);

  // Photon ring: thin, brilliant, edge-on stable.
  const photonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#eafcff'),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const photonRing = new THREE.Mesh(new THREE.RingGeometry(1.28, 1.4, 96), photonMat);
  photonRing.rotation.x = -Math.PI / 2 + 0.28;
  photonRing.name = 'photonRing';
  group.add(photonRing);

  group.scale.set(displayRadius, displayRadius, displayRadius);

  return {
    group,
    diskMaterial,
    update: (elapsedSec: number) => {
      diskMaterial.uniforms.uTime.value = elapsedSec;
    },
  };
}
