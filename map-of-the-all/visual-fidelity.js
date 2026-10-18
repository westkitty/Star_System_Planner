import * as THREE from 'three';

/** Deterministic editorial surfaces. Nothing here asserts planetary canon. */
function hashText(text) {
  let h = 2166136261;
  for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function generator(text) {
  let state = hashText(text);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function paintSurface(node, gaseous, resolution) {
  const canvas = document.createElement('canvas');
  canvas.width = resolution; canvas.height = resolution / 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rand = generator(node.id + ':surface');
  const color = new THREE.Color(node.color || '#67bce8');
  const w = canvas.width, h = canvas.height;
  for (let y = 0; y < h; y++) {
    const latitude = y / h;
    const band = Math.sin(latitude * (gaseous ? 75 : 19) + Math.sin(latitude * 25) * 2);
    const polar = Math.pow(Math.abs(latitude * 2 - 1), 5);
    const variation = gaseous ? band * .16 + Math.sin(latitude * 34) * .08 : band * .045 - polar * .12;
    ctx.fillStyle = color.clone().offsetHSL(0, gaseous ? -.06 : .04, variation).getStyle();
    ctx.fillRect(0, y, w, 1);
  }
  const details = gaseous ? 36 : 350;
  for (let i = 0; i < details; i++) {
    const x = rand() * w, y = rand() * h;
    const radius = gaseous ? 4 + rand() * 16 : 1 + Math.pow(rand(), 3) * 17;
    const lighter = rand() > .44;
    ctx.globalAlpha = gaseous ? .12 + rand() * .15 : .055 + rand() * .14;
    ctx.fillStyle = color.clone().offsetHSL(0, lighter ? -.12 : .09, lighter ? .32 : -.30).getStyle();
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (gaseous ? 2.9 : 1.5), radius * (gaseous ? .12 : .58), rand() * .16, 0, Math.PI * 2);
    ctx.fill();
    if (x < radius * 3 || x > w - radius * 3) {
      ctx.beginPath();
      ctx.ellipse(x + (x < w / 2 ? w : -w), y, radius * (gaseous ? 2.9 : 1.5), radius * (gaseous ? .12 : .58), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 2;
  return texture;
}
function paintClouds(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rand = generator(seed + ':clouds');
  for (let i = 0; i < 28; i++) {
    const y = rand() * 128, x = rand() * 256, width = 25 + rand() * 85;
    ctx.fillStyle = 'rgba(223,243,255,' + (.055 + rand() * .18).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(x,y,width,1.5 + rand() * 5,rand() * .3,0,Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + (x < 128 ? 256 : -256),y,width,2.3,0,0,Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
export function makeAtmosphere(radius, color, opacity = .52) {
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: {value: new THREE.Color(color)}, strength: {value: opacity} },
    vertexShader: String.raw`
      varying vec3 vNormal;
      varying vec3 vEye;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vEye = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: String.raw`
      uniform vec3 tint;
      uniform float strength;
      varying vec3 vNormal;
      varying vec3 vEye;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vEye))), 3.2);
        float alpha = clamp(rim * strength, 0.0, 0.65);
        gl_FragColor = vec4(tint * 1.2, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false,
    side:THREE.FrontSide
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.085, 32, 20), material);
  mesh.name = 'cartographic-atmosphere';
  return mesh;
}
export function makePlanetVisual(node, quality = 'balanced') {
  const radius = 1.2 + node.size;
  const gaseous = (hashText(node.id) % 5) <= 1;
  const texture = paintSurface(node, gaseous, quality === 'cinematic' ? 512 : 256);
  const material = new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : node.color,
    map: texture, roughness: gaseous ? .94 : .88, metalness: .035
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, quality === 'battery' ? 24 : 40, quality === 'battery' ? 16 : 28), material);
  sphere.name = 'cartographic-world-surface';
  const group = new THREE.Group();
  group.add(sphere);
  let clouds = null;
  if (quality !== 'battery' && !gaseous) {
    const cloudMap = paintClouds(node.id);
    if (cloudMap) {
      clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.024, 32, 20),
        new THREE.MeshBasicMaterial({map:cloudMap,transparent:true,opacity:.67,depthWrite:false}));
      clouds.name = 'cartographic-world-clouds';
      group.add(clouds);
    }
  }
  if (quality !== 'battery') group.add(makeAtmosphere(radius,node.color,.56));
  return {group, surface:sphere, clouds, radius};
}
export function makeSelectionReticle() {
  const group = new THREE.Group();
  const ring = (inner,outer,opacity) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner,outer,72),
      new THREE.MeshBasicMaterial({color:0x88eaff,transparent:true,opacity,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
    mesh.renderOrder = 30;
    group.add(mesh);
  };
  ring(.97,1.005,.56);
  ring(1.23,1.245,.22);
  const ticks = [];
  for (let i=0;i<4;i++) {
    const angle = i * Math.PI / 2;
    for (const r of [1.08,1.15]) ticks.push(Math.cos(angle)*r,Math.sin(angle)*r,0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(ticks,3));
  const guides = new THREE.LineSegments(geometry,
    new THREE.LineBasicMaterial({color:0xe2faff,transparent:true,opacity:.75,depthTest:false,depthWrite:false}));
  guides.renderOrder = 31;
  group.add(guides);
  group.visible = false;
  group.name = 'noninteractive-selection-reticle';
  return group;
}
