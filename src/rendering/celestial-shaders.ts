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
/**
 * Drakken Blood Ring Material (ASSET06).
 * Animated vitrified-crimson shader: crawling fracture veins, slow shimmer
 * sweep, and pulsing inner glow — the atrocity-structure reads as alive.
 */
export function createBloodRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#2a0004') },
      uBlood: { value: new THREE.Color('#a80018') },
      uGlint: { value: new THREE.Color('#ff6a7a') },
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
      uniform vec3 uDeep;
      uniform vec3 uBlood;
      uniform vec3 uGlint;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        float r = vUv.x;
        float angle = vUv.y * 6.28318;

        // Crawling fracture veins rotating differentially by radius.
        float veins = sin(angle * 9.0 + uTime * (1.4 - r) + sin(r * 40.0 + uTime * 0.7) * 2.0);
        veins = smoothstep(0.75, 1.0, veins);

        // Slow shimmer sweep orbiting the ring.
        float sweep = pow(0.5 + 0.5 * sin(angle * 2.0 - uTime * 0.9), 6.0);

        // Vitrified grain.
        float grain = mix(0.8, 1.0, hash(floor(vUv * vec2(160.0, 40.0))));

        vec3 color = mix(uDeep, uBlood, 0.35 + 0.45 * r);
        color = mix(color, uGlint, veins * 0.75);
        color += uGlint * sweep * 0.35 * (1.0 - r * 0.5);
        color *= grain;

        float edgeFade = smoothstep(0.0, 0.06, r) * (1.0 - smoothstep(0.92, 1.0, r));
        float pulse = 0.82 + 0.10 * sin(uTime * 1.6);
        gl_FragColor = vec4(color, edgeFade * pulse);
      }
    `,
  });
}

/**
 * Standard Planetary Ring Material.
 * Subtle concentric dust bands and Cassini division.
 */
export function createOrdinaryRingMaterial(
  color: string = '#c0b49c',
  bandMap?: THREE.Texture | null,
  seed01 = 0.5
): THREE.ShaderMaterial {
  const ringColor = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uColor: { value: ringColor },
      uBandMap: { value: bandMap ?? null },
      uHasMap: { value: bandMap ? 1.0 : 0.0 },
      uSeed: { value: seed01 },
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
      uniform sampler2D uBandMap;
      uniform float uHasMap;
      uniform float uSeed;
      varying vec2 vUv;

      void main() {
        // vUv.x represents radius across the ring (0 = inner, 1 = outer)
        float r = vUv.x;
        float angle = vUv.y * 6.28318;

        // Seeded Cassini-style division: each ring splits at its own radius.
        float splitAt = 0.45 + uSeed * 0.3;
        float gap = 1.0 - smoothstep(splitAt - 0.02, splitAt, r) * (1.0 - smoothstep(splitAt + 0.02, splitAt + 0.04, r));

        // Concentric fine ringlets with slow differential shimmer.
        float ringlets = sin(r * (150.0 + uSeed * 90.0) + angle * 2.0) * 0.15 + 0.85;

        // Procedural band texture modulates density (ASSET02).
        float band = 1.0;
        vec3 bandTint = vec3(1.0);
        if (uHasMap > 0.5) {
          vec4 texel = texture2D(uBandMap, vec2(r, 0.5));
          band = 0.35 + texel.a * 0.85;
          bandTint = mix(vec3(1.0), texel.rgb * 2.0, 0.35);
        }

        // Smooth inner and outer fade
        float edgeFade = smoothstep(0.0, 0.05, r) * (1.0 - smoothstep(0.95, 1.0, r));

        float alpha = gap * ringlets * band * edgeFade * 0.8;
        gl_FragColor = vec4(uColor * ringlets * bandTint, alpha);
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
  atmosphereColorHex?: string,
  surfaceMap?: THREE.Texture | null
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
      uSurfaceMap: { value: surfaceMap ?? null },
      uHasMap: { value: surfaceMap ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;
      varying vec2 vUv;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
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
      uniform sampler2D uSurfaceMap;
      uniform float uHasMap;

      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;
      varying vec2 vUv;

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

        // ASSET02: procedural albedo texture modulates the base tint.
        vec3 albedo = uColor;
        if (uHasMap > 0.5) {
          vec3 texel = texture2D(uSurfaceMap, vUv).rgb;
          albedo = mix(uColor, texel, 0.82);
        }

        vec3 litSurface = albedo * celLight;

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
