/**
 * Celestial Shaders and Graphic Visual Materials.
 * 
 * Implements:
 * - Signature Starsilk Azure Barcode Ribbon Shader (#0CC6FF / #49E7FF / #B6F6FF)
 * - Luminous Star Shader with convective granulation and optional Starsilk bleed
 * - Event-Horizon Black Hole Shader (pure black silhouette with gravitational lensing rim)
 * - Drakken Blood Ring Material (vitrified crimson atrocity glass)
 * - Graphic celestial planetary shaders with cel-shaded terminators and atmospheric rims
 */

import * as THREE from 'three';

/**
 * Star Shader Material.
 * Procedural convection cells, limb darkening, and Starsilk core indexing when active.
 */
export function createStarMaterial(color: string = '#ffcc44', starsilkBleed: number = 0): THREE.ShaderMaterial {
  const baseColor = new THREE.Color(color);
  const azureColor = new THREE.Color('#0cc6ff');

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: baseColor },
      uAzureColor: { value: azureColor },
      uStarsilkBleed: { value: starsilkBleed },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uBaseColor;
      uniform vec3 uAzureColor;
      uniform float uStarsilkBleed;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      // Simple 3D noise approximation
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }

      void main() {
        // Convection turbulence
        float n1 = noise(vPosition * 0.08 + vec3(uTime * 0.2));
        float n2 = noise(vPosition * 0.16 - vec3(uTime * 0.3));
        float granulation = n1 * 0.7 + n2 * 0.3;

        // Limb darkening
        float fresnel = dot(vNormal, vec3(0.0, 0.0, 1.0));
        fresnel = clamp(fresnel, 0.0, 1.0);
        float limb = pow(fresnel, 0.6);

        vec3 starColor = mix(uBaseColor * 0.6, uBaseColor * 1.5, granulation) * limb;

        // Starsilk Extraction / Bleed overlay: ordered barcode filaments inside core
        if (uStarsilkBleed > 0.0) {
          float barcode = step(0.65, sin(vPosition.y * 1.2 + uTime * 3.0) * sin(vPosition.x * 0.8));
          vec3 bleedColor = mix(uAzureColor, vec3(1.0, 1.0, 1.0), barcode * 0.5);
          starColor = mix(starColor, bleedColor * 2.0, uStarsilkBleed * (1.0 - limb * 0.5));
        }

        gl_FragColor = vec4(starColor, 1.0);
      }
    `,
  });
}

/**
 * Event-Horizon Black Hole Material.
 * Absolute void center with subtle gravitational lensing edge distortion.
 */
export function createBlackHoleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;

      void main() {
        float fresnel = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
        // Sharp photon sphere ring at the extreme grazing angle
        float photonRing = smoothstep(0.92, 0.98, fresnel);
        vec3 rimColor = vec3(0.05, 0.4, 0.8) * photonRing * 1.8;

        // The core is pure absolute blackness
        gl_FragColor = vec4(rimColor, 1.0);
      }
    `,
  });
}

/**
 * Starsilk Azure Barcode Ribbon Shader.
 * Renders ordered parallel barcode filaments with luminous cyan edges and dark blue core.
 */
export function createStarsilkRibbonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: 100.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;

      void main() {
        // High frequency parallel barcode striations along u
        float barcode = sin(vUv.x * 120.0 - uTime * 4.0);
        float isStripe = step(0.2, barcode);

        // Edge glow across v
        float edge = abs(vUv.y - 0.5) * 2.0; // 0 in center, 1 at edges
        float edgeGlow = pow(edge, 1.8);

        // Palette:
        // Dark blue interior: vec3(0.04, 0.16, 0.27)
        // Luminous azure edge: vec3(0.05, 0.78, 1.0)
        // White core accent: vec3(0.71, 0.96, 1.0)
        vec3 coreColor = vec3(0.04, 0.16, 0.27);
        vec3 azureColor = vec3(0.05, 0.78, 1.0);
        vec3 brightWhite = vec3(0.71, 0.96, 1.0);

        vec3 color = mix(coreColor, azureColor, edgeGlow);
        if (isStripe > 0.5) {
          color = mix(color, brightWhite, 0.6);
        }

        float alpha = mix(0.4, 0.95, edgeGlow) * (0.6 + isStripe * 0.4);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

/**
 * Drakken Blood Ring Material.
 * Deep vitrified crimson glass scar with architectural density.
 */
export function createBloodRingMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4a0006'),
    emissive: new THREE.Color('#7a0010'),
    emissiveIntensity: 0.35,
    roughness: 0.15,
    metalness: 0.85,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
}

/**
 * Standard Planetary Ring Material.
 * Subtle concentric dust bands and Cassini division.
 */
export function createOrdinaryRingMaterial(color: string = '#c0b49c'): THREE.ShaderMaterial {
  const ringColor = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uColor: { value: ringColor },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec2 vUv;

      void main() {
        // vUv.x represents radius across the ring (0 = inner, 1 = outer)
        float r = vUv.x;

        // Cassini division gap around r = 0.65 to 0.70
        float gap = 1.0 - smoothstep(0.64, 0.66, r) * (1.0 - smoothstep(0.69, 0.71, r));

        // Concentric fine ringlets
        float ringlets = sin(r * 180.0) * 0.15 + 0.85;

        // Smooth inner and outer fade
        float edgeFade = smoothstep(0.0, 0.05, r) * (1.0 - smoothstep(0.95, 1.0, r));

        float alpha = gap * ringlets * edgeFade * 0.75;
        gl_FragColor = vec4(uColor * ringlets, alpha);
      }
    `,
  });
}

/**
 * High-Contrast Graphic Celestial Material for Planets and Moons.
 * Cel-shaded lighting with crisp terminator and atmospheric limb glow.
 */
export function createPlanetMaterial(
  colorHex: string,
  atmosphereColorHex?: string
): THREE.ShaderMaterial {
  const surfaceColor = new THREE.Color(colorHex);
  const atmoColor = new THREE.Color(atmosphereColorHex || '#49e7ff');
  const hasAtmo = Boolean(atmosphereColorHex);

  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: surfaceColor },
      uAtmoColor: { value: atmoColor },
      uHasAtmo: { value: hasAtmo ? 1.0 : 0.0 },
      uLightDir: { value: new THREE.Vector3(1, 0, 0) }, // Dynamic light direction toward primary
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vViewDir = normalize(- (modelViewMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uAtmoColor;
      uniform float uHasAtmo;
      uniform vec3 uLightDir;

      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;

      void main() {
        // N dot L with crisp cel-shaded threshold
        float NdotL = dot(vNormal, uLightDir);
        // Stylized 3-step cel bands
        float celLight = 0.05; // Night side ambient
        if (NdotL > 0.3) {
          celLight = 1.0;
        } else if (NdotL > 0.0) {
          celLight = 0.65;
        } else if (NdotL > -0.15) {
          celLight = 0.25;
        }

        vec3 litSurface = uColor * celLight;

        // Atmospheric rim if present
        if (uHasAtmo > 0.5) {
          float fresnel = 1.0 - max(0.0, dot(vNormal, vViewDir));
          float atmoRim = pow(fresnel, 2.5) * max(0.1, NdotL + 0.3);
          litSurface = mix(litSurface, uAtmoColor, atmoRim * 0.85);
        }

        gl_FragColor = vec4(litSurface, 1.0);
      }
    `,
  });
}
