import * as THREE from 'three';
import { frameDelta,wrapCurvePhase } from './frame-clock.js';
import { layoutVisibleLabels } from './label-layout.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { childNodes, nodeById } from './atlas-data.js';
import { makePlanetVisual, makeAtmosphere, makeSelectionReticle } from './visual-fidelity.js';

const V = (p) => new THREE.Vector3(p[0],p[1],p[2]);
const PALETTE = {azure:0x49dfff, gold:0xffd5a2, void:0x01040b};
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
function hash(t){let h=2166136261;for(const c of t){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6d2b79f5)>>>0;let x=Math.imul(s^(s>>>15),1|s);x^=x+Math.imul(x^(x>>>7),61|x);return ((x^(x>>>14))>>>0)/4294967296;};}
function makeGlow(color='#49dfff'){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,64);
  grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(.1,color);grad.addColorStop(.24,color+'99');grad.addColorStop(.56,color+'22');grad.addColorStop(1,color+'00');
  ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function lines(points,color,opacity=.6,dashed=false){
  const g=new THREE.BufferGeometry().setFromPoints(points);
  const m=dashed?new THREE.LineDashedMaterial({color,transparent:true,opacity,dashSize:3,gapSize:2}):new THREE.LineBasicMaterial({color,transparent:true,opacity});
  const o=new THREE.Line(g,m);if(dashed)o.computeLineDistances();return o;
}
function disposeTree(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(obj=>{
    if(obj.geometry?.dispose)geometries.add(obj.geometry);
    const mats=obj.material?Array.isArray(obj.material)?obj.material:[obj.material]:[];
    for(const mat of mats){
      if(!mat)continue;
      materials.add(mat);
      for(const key of ['map','alphaMap','emissiveMap'])if(mat[key]?.dispose)textures.add(mat[key]);
    }
  });
  for(const texture of textures)texture.dispose();
  for(const mat of materials)mat.dispose();
  for(const geometry of geometries)geometry.dispose();
  root.clear();
}
const sphere = (radius,color,emissive=0x000000) => new THREE.Mesh(new THREE.SphereGeometry(radius,24,16),new THREE.MeshStandardMaterial({color,emissive,roughness:.7,metalness:.12}));
export class AtlasEngine {
  constructor(canvas,labelsRoot,callbacks){
    this.canvas=canvas;this.labelsRoot=labelsRoot;this.callbacks=callbacks;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(PALETTE.void);
    this.camera=new THREE.PerspectiveCamera(48,1,.1,5000);
    this.camera.position.set(0,195,265);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.5;
    this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=true;this.controls.dampingFactor=.075;
    this.controls.minDistance=6;this.controls.maxDistance=950;this.controls.maxPolarAngle=Math.PI*.91;
    this.controls.screenSpacePanning=true;
    this.group=new THREE.Group();this.scene.add(this.group);
    this.bg=new THREE.Group();this.scene.add(this.bg);
    this.scene.add(new THREE.HemisphereLight(0x8ccfff,0x081124,.85));
    this.scene.add(new THREE.AmbientLight(0x8db9ec,.42));
    this.sunLight=new THREE.PointLight(0xffe3bb,36,500,2);this.scene.add(this.sunLight);
    this.pickables=[];this.labelItems=[];this.motionObjects=[];this.routeParticles=[];this.labelNodes=new Map();
    this.glowTextures=new Map();this.dynamicMaterials=[];this.routeParticlePositions=null;
    this.selectionReticle=makeSelectionReticle();this.scene.add(this.selectionReticle);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.view={kind:'all',id:null};this.state=null;this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.pointerStart=null;
    canvas.addEventListener('pointerdown',this._down=(ev)=>{this.pointerStart=[ev.clientX,ev.clientY];});
    canvas.addEventListener('pointerup',this._up=(ev)=>{if(!this.pointerStart||Math.hypot(ev.clientX-this.pointerStart[0],ev.clientY-this.pointerStart[1])>8)return;this.pick(ev);this.pointerStart=null;});
    canvas.addEventListener('dblclick',this._double=(ev)=>{this.pick(ev,true);});
    this.frame=0;this.last=performance.now();this.elapsed=0;this.paused=false;this.disposed=false;
    this.reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.initBackground();this.resize();
    this.camera.position.set(...this.cameraPreset(this.view));this.controls.update();
    this.renderer.setAnimationLoop(t=>this.tick(t));
  }
  initBackground(){
    const rnd=rng(1106),positions=[],colors=[],sizes=[];
    for(let i=0;i<3000;i++){
      const x=(rnd()-.5)*1250,y=(rnd()-.5)*650,z=(rnd()-.5)*900;
      if(z < -110)continue; // A genuinely starless Siege Wall exterior.
      positions.push(x,y,z);
      const temperature=rnd();
      const c=new THREE.Color(temperature<.13?'#c6c4ff':temperature>.92?'#ffe1bb':'#72bcf2');
      c.multiplyScalar(.46+rnd()*.58);
      colors.push(c.r,c.g,c.b);
      sizes.push(.85+Math.pow(rnd(),8)*2.0);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
    const material=new THREE.ShaderMaterial({
      uniforms:{pixelRatio:{value:this.dpr||1}},
      vertexShader: String.raw`
        attribute vec3 color;
        attribute float aSize;
        uniform float pixelRatio;
        varying vec3 vColor;
        void main(){
          vColor=color;
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(aSize*pixelRatio*310.0/max(120.0,-mv.z),
            1.0*pixelRatio,3.2*pixelRatio);
        }`,
      fragmentShader: String.raw`
        varying vec3 vColor;
        void main(){
          float r=length(gl_PointCoord-.5)*2.0;
          if(r>1.0)discard;
          float core=exp(-10.0*r*r);
          float alpha=(core*.68+pow(1.0-r,3.0)*.18);
          gl_FragColor=vec4(vColor,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,vertexColors:false,depthWrite:false,blending:THREE.AdditiveBlending
    });
    const pts=new THREE.Points(geometry,material);
    pts.name='round-deep-starfield';this.bg.add(pts);this.deepStars=material;
  }
  cameraPreset(view){
    const portrait=this.width/this.height<.72;
    if(portrait)return view.kind==='all'?[0,325,470]:view.kind==='galaxy'?[0,90,172]:[0,58,119];
    return view.kind==='all'?[0,195,265]:view.kind==='galaxy'?[0,55,110]:[0,38,82];
  }
  resize(){const el=this.canvas.parentElement;const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);
    const dimensionsChanged=this.width!==w||this.height!==h;this.width=w;this.height=h;
    if(!dimensionsChanged&&this.dpr===Math.min(window.devicePixelRatio||1,this.state?.quality==='cinematic'?2:this.state?.quality==='battery'?1:1.5))return;
    const dpr=Math.min(window.devicePixelRatio||1,this.state?.quality==='cinematic'?2:this.state?.quality==='battery'?1:1.5);
    if(this.dpr!==dpr){this.dpr=dpr;this.renderer.setPixelRatio(dpr);}
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;
    this.camera.fov=w/h<.72?56:48;
    if(this.deepStars)this.deepStars.uniforms.pixelRatio.value=dpr;
    this.camera.updateProjectionMatrix();
  }
  setState(state,view=this.view){this.state=state;this.view=view;this.resize();this.rebuild();this.camera.updateMatrixWorld();this.updateLabels();}
  setView(view){this.view=view;this.rebuild();
    const camera=this.cameraPreset(view);
    this.controls.target.set(0,0,0);this.camera.position.set(...camera);this.controls.update();
    this.camera.updateMatrixWorld();this.updateLabels();
    this.callbacks.onViewChanged?.(view);
  }
  rebuild(){if(!this.state)return;
    disposeTree(this.group);this.glowTextures.clear();this.dynamicMaterials=[];this.routeParticlePositions=null;
    this.selectionReticle.visible=false;
    this.pickables=[];this.labelItems=[];this.motionObjects=[];this.routeParticles=[];
    if(this.view.kind==='all')this.buildAll();
    if(this.view.kind==='galaxy')this.buildGalaxy();
    if(this.view.kind==='system')this.buildSystem();
  }
  hitTarget(node,obj){obj.userData.atlasId=node.id;this.pickables.push(obj);this.labelItems.push({node,obj});}
  addGlow(parent,size,color,opacity=.9){
    let texture=this.glowTextures.get(color);
    if(!texture){texture=makeGlow(color);this.glowTextures.set(color,texture);}
    const m=new THREE.SpriteMaterial({map:texture,color:0xffffff,blending:THREE.AdditiveBlending,transparent:true,opacity,depthWrite:false});
    const glow=new THREE.Sprite(m);glow.scale.set(size,size,1);parent.add(glow);return glow;
  }
  addRing(parent,radius,color,opacity=.35,tilt=.2){
    const g=new THREE.RingGeometry(radius,radius+.16,120);
    const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});
    const mesh=new THREE.Mesh(g,m);mesh.rotation.x=-Math.PI/2+tilt;parent.add(mesh);return mesh;
  }
  /**
   * Stylized volumetric galaxy: the cloudy spiral disc is a single transparent
   * mesh, and its luminous stars live in one GPU particle batch. This is
   * editorial cartography, never a real astrometric reconstruction.
   */
  galaxyDisk(parent,seed,rad,color){
    const mesh=new THREE.Mesh(
      new THREE.PlaneGeometry(rad*2.18,rad*2.18),
      new THREE.ShaderMaterial({
        uniforms:{
          tint:{value:new THREE.Color(color)},
          phase:{value:(hash(seed)%628)/100},
          time:{value:0},
        },
        vertexShader: String.raw`
          varying vec2 vUv;
          void main(){
            vUv=uv;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          }`,
        fragmentShader: String.raw`
          uniform vec3 tint;
          uniform float phase;
          uniform float time;
          varying vec2 vUv;
          float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float noise21(vec2 p){
            vec2 i=floor(p), f=fract(p);
            f=f*f*(3.0-2.0*f);
            return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),
              mix(hash21(i+vec2(0.0,1.0)),hash21(i+1.0),f.x),f.y);
          }
          float fbm(vec2 p){
            return noise21(p)*.54+noise21(p*2.07)*.29+noise21(p*4.13)*.17;
          }
          void main(){
            vec2 p=(vUv-.5)*2.0;
            float r=length(p);
            if(r>1.02) discard;
            float a=atan(p.y,p.x);
            float twist=4.0*a-16.0*r+phase+time*.012;
            float arm=pow(max(0.0,.5+.5*cos(twist)),3.8);
            float wisps=pow(max(0.0,.5+.5*cos(twist*2.0+.8)),6.0)*.20;
            float density=fbm(p*22.0+phase);
            float dust=fbm(p*61.0-phase*.6);
            float falloff=1.0-smoothstep(.38,1.01,r);
            float core=exp(-r*r*35.0);
            float filaments=(arm+wisps)*(.35+.9*density)*falloff;
            float lane=1.0-smoothstep(.18,.65,dust);
            float alpha=clamp((.045+filaments*.77+lane*filaments*.25)*falloff+core*.78,0.0,.87);
            alpha*=1.0-smoothstep(.94,1.015,r);
            vec3 cosmic=mix(tint*.35,tint*1.4,clamp(filaments+density*.20,0.0,1.0));
            cosmic+=vec3(.80,.54,.30)*core*.95;
            gl_FragColor=vec4(cosmic,alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent:true,blending:THREE.AdditiveBlending,
        depthWrite:false,side:THREE.DoubleSide
      })
    );
    mesh.rotation.x=-Math.PI/2;
    mesh.position.y=-.4;
    parent.add(mesh);this.dynamicMaterials.push(mesh.material);
  }
  starCloud(parent,seed,count,rad,flatten=.22,spiral=true){
    if(!this.state.layers.stars)return;
    const rnd=rng(hash(seed)),p=[],col=[],sizes=[],intensities=[],phases=[];
    for(let i=0;i<count;i++){
      const r=Math.pow(rnd(),.8)*rad;
      const arm=(i%4)*Math.PI/2;
      const a=spiral?arm+(r/rad)*Math.PI*2.25+(rnd()-.5)*.95:rnd()*Math.PI*2;
      const jitter=Math.max(.22,rad*.045);
      const x=Math.cos(a)*r+(rnd()-.5)*jitter;
      const z=Math.sin(a)*r+(rnd()-.5)*jitter;
      const y=(rnd()-.5)*rad*flatten*(1-r/rad*.75);
      p.push(x,y,z);
      const temperature=rnd();
      const warm=r/rad<.23||temperature>.90;
      const violet=!warm&&temperature<.09;
      const color=new THREE.Color(warm?'#ffd9a8':violet?'#c9b8ff':'#63cbfa');
      color.multiplyScalar(.75+rnd()*.5);
      col.push(color.r,color.g,color.b);
      sizes.push(.75+Math.pow(rnd(),4)*1.85);
      intensities.push((r/rad<.25?.78:.54)+rnd()*.32);
      phases.push(rnd()*Math.PI*2);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    g.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
    g.setAttribute('aLight',new THREE.Float32BufferAttribute(intensities,1));
    g.setAttribute('aPhase',new THREE.Float32BufferAttribute(phases,1));
    const m=new THREE.ShaderMaterial({
      uniforms:{pixelRatio:{value:this.dpr||1},time:{value:0}},
      vertexShader: String.raw`
        attribute float aSize;
        attribute float aLight;
        attribute float aPhase;
        attribute vec3 color;
        uniform float pixelRatio;
        uniform float time;
        varying float vPulse;
        varying vec3 vColor;
        varying float vLight;
        void main(){
          vColor=color;vLight=aLight;
          vPulse=.89+.11*sin(time*.31+aPhase);
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          float distanceScale=220.0/max(32.0,-mvPosition.z);
          gl_PointSize=clamp(aSize*distanceScale*pixelRatio,1.0,3.8*pixelRatio);
        }`,
      fragmentShader: String.raw`
        varying vec3 vColor;
        varying float vLight;
        varying float vPulse;
        void main(){
          float r=length(gl_PointCoord-.5)*2.0;
          if(r>1.0) discard;
          float core=exp(-20.0*r*r);
          float halo=pow(1.0-r,3.0);
          float alpha=(core*.78+halo*.22)*vLight*vPulse;
          gl_FragColor=vec4(vColor*1.1,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,blending:THREE.AdditiveBlending,
      depthWrite:false
    });
    const pts=new THREE.Points(g,m);
    pts.rotation.y=rnd()*Math.PI;
    parent.add(pts);this.dynamicMaterials.push(m);
    this.motionObjects.push({obj:pts,speed:.000006+rnd()*.000003});
  }
  buildAll(){const s=this.state;
    this.controls.minDistance=45;this.controls.maxDistance=900;
    if(s.layers.territories)this.makeTerritories();
    if(s.layers.grid)this.makeGrid(360,24);
    if(s.layers.wall&&s.epoch!=='war')this.makeWall();
    if(s.layers.galaxies){
      for(const n of childNodes(s,null,'galaxy')){
        const group=new THREE.Group();group.position.copy(V(n.position));this.group.add(group);
        const level=s.quality==='cinematic'?2000:s.quality==='battery'?420:1150;
        this.galaxyDisk(group,n.id,n.size*22,n.color);
        this.starCloud(group,n.id,Math.floor(level*n.size),n.size*20,.18,true);
        this.addGlow(group,37*n.size,n.color,.44);
        this.addGlow(group,7.5*n.size,'#fff0c9',.7);
        this.addRing(group,12*n.size,n.color,.20,.24);
        const pick=new THREE.Mesh(new THREE.SphereGeometry(13*n.size,12,10),new THREE.MeshBasicMaterial({visible:false}));group.add(pick);this.hitTarget(n,pick);
      }
    }
    if(s.layers.routes||s.layers.starsilk)this.makeRoutes();
    if(s.layers.worldsvault){
      for(const n of childNodes(s,null).filter(n=>n.kind==='landmark')){
        const group=new THREE.Group();group.position.copy(V(n.position));this.group.add(group);
        const crystal=new THREE.Mesh(new THREE.IcosahedronGeometry(4*n.size,1),new THREE.MeshStandardMaterial({color:n.color,wireframe:true,transparent:true,opacity:.75,emissive:n.color,emissiveIntensity:1.25}));group.add(crystal);
        this.addGlow(group,13,n.color,.6);this.addRing(group,7,n.color,.55);
        const pick=new THREE.Mesh(new THREE.SphereGeometry(7,10,8),new THREE.MeshBasicMaterial({visible:false}));group.add(pick);this.hitTarget(n,pick);
      }
    }
    if(s.layers.rings&&s.epoch!=='post')this.makeRemnantRings();
    if(s.layers.annotations)this.makeAnnotations(null);
  }
  makeGrid(size,step){
    // Shared GPU geometry, one draw instead of ~60 separate lines.
    const vertices=[],half=size/2;
    for(let x=-half;x<=half;x+=step)vertices.push(x,-19,-half,x,-19,half);
    for(let z=-half;z<=half;z+=step)vertices.push(-half,-19,z,half,-19,z);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const material=new THREE.LineBasicMaterial({color:0x34728d,transparent:true,opacity:.22,depthWrite:false});
    this.group.add(new THREE.LineSegments(geometry,material));
  }
  makeTerritories(){
    for(const n of childNodes(this.state,null,'galaxy')){
      const c=new THREE.Color(n.color);
      const group=new THREE.Group();group.position.copy(V(n.position));this.group.add(group);
      const g=new THREE.CircleGeometry(19*n.size,64);
      const material=new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide,transparent:true,opacity:.065,depthWrite:false});
      const sheet=new THREE.Mesh(g,material);sheet.rotation.x=-Math.PI/2;sheet.position.y=-15;group.add(sheet);
      const pts=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;const r=(19+2*Math.sin(a*5+hash(n.id)%5))*n.size;pts.push(new THREE.Vector3(Math.cos(a)*r,-14.5,Math.sin(a)*r));}
      group.add(lines(pts,c,.3,true));
    }
  }
  makeWall(){
    const pts=[];const coords=[[-215,-90],[-170,-94],[-138,-77],[-113,-75],[-85,-82],[-56,-70],[-25,-90],[16,-85],[55,-94],[82,-96],[112,-105],[155,-110],[225,-95]];
    for(const [x,z] of coords)pts.push(new THREE.Vector3(x,3+Math.sin(x*.06)*4,z));
    this.group.add(lines(pts,0xb0b9c6,.5));
    const shape=new THREE.Shape();shape.moveTo(-250,-220);shape.lineTo(250,-220);shape.lineTo(250,-95);
    for(let i=coords.length-1;i>=0;i--)shape.lineTo(coords[i][0],coords[i][1]);shape.lineTo(-250,-90);shape.closePath();
    const geom=new THREE.ShapeGeometry(shape);geom.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geom,new THREE.MeshBasicMaterial({color:0x000001,side:THREE.DoubleSide,depthWrite:true}));mesh.position.y=-10;this.group.add(mesh);
    const rnd=rng(606);const debris=[];
    for(let i=0;i<110;i++){
      const seg=rnd()*(coords.length-1);const k=Math.floor(seg);const a=coords[k],b=coords[Math.min(k+1,coords.length-1)],t=seg-k;
      const x=a[0]+(b[0]-a[0])*t, z=a[1]+(b[1]-a[1])*t;
      debris.push(x+(rnd()-.5)*10,(rnd()-.5)*12,z+(rnd()-.5)*9);
    }
    const p=new THREE.BufferGeometry();p.setAttribute('position',new THREE.Float32BufferAttribute(debris,3));
    this.group.add(new THREE.Points(p,new THREE.PointsMaterial({color:0xa9a9a9,size:.45,transparent:true,opacity:.6})));
    const wallLabel={id:'wall-concept',name:'THE SIEGE WALL',label:{show:true,size:19,color:'#d1d6de',family:'display'}};
    const o=new THREE.Object3D();o.position.set(35,10,-103);this.group.add(o);this.labelItems.push({node:wallLabel,obj:o,subtitle:'BLACK-HOLE LATTICE / ABSENCE'});
  }
  makeRoutes(parentId=null){
    for(const r of this.state.routes){
      if((r.kind==='starsilk'&&!this.state.layers.starsilk)||(r.kind==='hookshot'&&!this.state.layers.routes))continue;
      const a=nodeById(this.state,r.from),b=nodeById(this.state,r.to);if(!a||!b||a.parentId!==parentId||b.parentId!==parentId)continue;
      const p=V(a.position),q=V(b.position),m=p.clone().add(q).multiplyScalar(.5);m.y+=9;
      const c=new THREE.QuadraticBezierCurve3(p,m,q);
      const samples=c.getPoints(48);const azure=r.kind==='starsilk';
      this.group.add(lines(samples,azure?0x26dfff:0xb6c8d6,azure?.7:.26,!azure));
      if(azure){
        const halo=new THREE.Mesh(new THREE.TubeGeometry(c,54,.36,5,false),new THREE.MeshBasicMaterial({color:0x16bffd,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false}));this.group.add(halo);
        this.group.add(new THREE.Mesh(new THREE.TubeGeometry(c,54,.08,5,false),new THREE.MeshBasicMaterial({color:0x9afaff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false})));
        const particleCount=this.state.quality==='cinematic'?6:this.state.quality==='battery'?2:4;
        for(let i=0;i<particleCount;i++)
          this.routeParticles.push({curve:c,phase:i/particleCount,speed:.055,size:2.8});
      }
    }
    if(parentId===null&&this.state.layers.starsilk){
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-158,-11,65),new THREE.Vector3(-90,-9,77),new THREE.Vector3(-35,-15,87),new THREE.Vector3(30,-8,72),new THREE.Vector3(95,-10,80),new THREE.Vector3(152,-7,65)]);
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,128,1.35,7,false),new THREE.MeshBasicMaterial({color:0x12c4ff,transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false})));
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,128,.24,6,false),new THREE.MeshBasicMaterial({color:0x5ef4ff,transparent:true,opacity:.78,blending:THREE.AdditiveBlending,depthWrite:false})));
      this.group.add(lines(curve.getPoints(128),0xc3ffff,.9));
      const count=this.state.quality==='cinematic'?14:this.state.quality==='battery'?4:9;
      for(let i=0;i<count;i++)this.routeParticles.push({curve,phase:i/count,speed:.04,size:i%3?2.5:4});
    }
    this.prepareRouteSparks();
  }
  prepareRouteSparks(){
    if(!this.routeParticles.length)return;
    const positions=new Float32Array(this.routeParticles.length*3),sizes=[];
    for(const [i,spark] of this.routeParticles.entries()){
      const point=spark.curve.getPointAt(wrapCurvePhase(spark.phase));
      positions[i*3]=point.x;positions[i*3+1]=point.y;positions[i*3+2]=point.z;
      sizes.push(spark.size);
    }
    const geometry=new THREE.BufferGeometry();
    const attribute=new THREE.BufferAttribute(positions,3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',attribute);
    geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
    this.routeParticlePositions=attribute;
    const material=new THREE.ShaderMaterial({
      uniforms:{pixelRatio:{value:this.dpr||1}},
      vertexShader: String.raw`
        uniform float pixelRatio;
        attribute float aSize;
        void main(){
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(aSize*480.0/max(25.0,-mv.z)*pixelRatio,
            1.5*pixelRatio,12.0*pixelRatio);
        }`,
      fragmentShader: String.raw`
        void main(){
          float r=length(gl_PointCoord-.5)*2.0;
          if(r>1.0)discard;
          float light=exp(-16.0*r*r)*.75+pow(1.0-r,3.0)*.34;
          gl_FragColor=vec4(.31,.87,1.0,min(light,.89));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,blending:THREE.AdditiveBlending,depthWrite:false
    });
    const points=new THREE.Points(geometry,material);
    points.name='batched-starsilk-route-sparks';
    points.frustumCulled=false;
    this.group.add(points);
  }
  makeRemnantRings(){const pos=[[-70,-12,48],[63,5,49]];for(const [x,y,z] of pos){
    const g=new THREE.Group();g.position.set(x,y,z);this.group.add(g);
    const m=new THREE.Mesh(new THREE.TorusGeometry(5,.22,7,65),new THREE.MeshBasicMaterial({color:0x9e4834,transparent:true,opacity:.8}));m.rotation.x=.48;g.add(m);
  }}
  makeAnnotations(parentId){for(const n of childNodes(this.state,parentId,'annotation')){
    const g=new THREE.Group();g.position.copy(V(n.position));this.group.add(g);
    const o=new THREE.Mesh(new THREE.OctahedronGeometry(1.8),new THREE.MeshBasicMaterial({color:n.color,wireframe:true}));g.add(o);this.hitTarget(n,o);
  }}
  buildGalaxy(){const s=this.state,g=nodeById(s,this.view.id);if(!g)return;
    this.controls.minDistance=12;this.controls.maxDistance=350;
    this.galaxyDisk(this.group,g.id+'-interior',68,g.color);
    this.starCloud(this.group,g.id+'-interior',s.quality==='cinematic'?8500:s.quality==='battery'?1300:4100,70,.23,true);
    this.addGlow(this.group,37,'#fbe6cc',.38);
    this.addGlow(this.group,12,g.color,.7);
    if(s.layers.grid)this.makeGrid(190,12);
    for(const n of childNodes(s,g.id,'system')){
      const pg=new THREE.Group();pg.position.copy(V(n.position));this.group.add(pg);
      this.addGlow(pg,15,n.color,.8);
      const core=sphere(.9,0xffffff,0x4488ff);pg.add(core);
      const target=new THREE.Mesh(new THREE.SphereGeometry(3.5,12,10),new THREE.MeshBasicMaterial({visible:false}));pg.add(target);this.hitTarget(n,target);
      if(s.layers.routes){this.addRing(pg,3.8,n.color,.42);}
    }
    if(s.layers.routes||s.layers.starsilk)this.makeRoutes(g.id);
    if(s.layers.annotations)this.makeAnnotations(g.id);
  }
  buildSystem(){const s=this.state,sys=nodeById(s,this.view.id);if(!sys)return;
    this.controls.minDistance=5;this.controls.maxDistance=280;this.sunLight.position.set(0,0,0);
    const center=new THREE.Group();this.group.add(center);
    const sun=sphere(3.6,0xffeac3,0xffbd65);sun.material.emissiveIntensity=2;center.add(sun);
    if(s.quality!=='battery')center.add(makeAtmosphere(4.1,'#ffd19a',.65));
    this.addGlow(center,25,'#ffb866',.7);this.addGlow(center,12,'#fff0cc',.9);
    if(s.layers.grid)this.makeGrid(120,8);
    for(const [idx,n] of childNodes(s,sys.id,'planet').entries()){
      const r=Math.max(7,V(n.position).length());
      const orbit=[];for(let k=0;k<=120;k++){const angle=k/120*Math.PI*2;orbit.push(new THREE.Vector3(Math.cos(angle)*r,0,Math.sin(angle)*r));}
      if(s.layers.routes)this.group.add(lines(orbit,0x5e87b2,.24));
      const group=new THREE.Group();group.position.copy(V(n.position));this.group.add(group);
      const visual=makePlanetVisual(n,s.quality);group.add(visual.group);
      this.motionObjects.push({obj:visual.surface,spin:.000013+idx*.000004});
      if(visual.clouds)this.motionObjects.push({obj:visual.clouds,spin:.000022+idx*.000003});
      if(idx===1){const ring=new THREE.Mesh(new THREE.RingGeometry(2.45,3.55,50),new THREE.MeshBasicMaterial({color:0x87a8bd,side:THREE.DoubleSide,opacity:.4,transparent:true}));ring.rotation.x=-.25;group.add(ring);}
      const target=new THREE.Mesh(new THREE.SphereGeometry(3,12,8),new THREE.MeshBasicMaterial({visible:false}));group.add(target);this.hitTarget(n,target);
      this.motionObjects.push({obj:group,orbit:r,phase:Math.atan2(n.position[2],n.position[0]),speed:.00015/(idx+1)});
    }
    // Do not imply that every source-unknown stellar system canonically had a Blood Ring.
    if(s.layers.annotations)this.makeAnnotations(sys.id);
  }
  pick(ev,enter=false){const rect=this.canvas.getBoundingClientRect();this.pointer.set(((ev.clientX-rect.left)/rect.width)*2-1,1-((ev.clientY-rect.top)/rect.height)*2);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects(this.pickables,false);if(!hits.length)return;
    const id=hits[0].object.userData.atlasId;if(id)this.callbacks.onSelect?.(id,enter,ev);
  }
  focusOn(node){const obj=this.labelItems.find(p=>p.node.id===node.id)?.obj;if(!obj)return;
    const p=new THREE.Vector3();obj.getWorldPosition(p);const delta=p.clone().sub(this.controls.target);
    this.camera.position.add(delta);this.controls.target.copy(p);this.controls.update();
  }
  updateLabels(){
    const state=this.state;
    if(!state||!state.layers.labels){for(const node of this.labelNodes.values())node.remove();this.labelNodes.clear();return;}
    const candidates=[];const w=this.width,h=this.height;
    for(const item of this.labelItems){const n=item.node;if(n.label?.show===false)continue;
      const wp=new THREE.Vector3();item.obj.getWorldPosition(wp);const p=wp.project(this.camera);
      if(p.z< -1||p.z>1||Math.abs(p.x)>1.06||Math.abs(p.y)>1.06)continue;
      const x=(p.x*.5+.5)*w,y=(-p.y*.5+.5)*h;
      const font=clamp((n.label?.size||12)*state.typographyScale,9,42);
      candidates.push({n,x,y,item,d:wp.distanceTo(this.camera.position),font,
        wd:Math.min(240,n.name.length*font*.65+12),ht:font+18});
    }
    const live=new Set();
    for(const {n,x,y,item,font} of layoutVisibleLabels(candidates,state.selected,28)){
      live.add(n.id);
      let btn=this.labelNodes.get(n.id);
      if(!btn){
        btn=document.createElement('button');btn.className='world-label';btn.type='button';btn.dataset.atlasId=n.id;
        btn.addEventListener('click',event=>this.callbacks.onSelect?.(btn.dataset.atlasId,false,event));
        btn.addEventListener('dblclick',()=>this.callbacks.onSelect?.(btn.dataset.atlasId,true));
        this.labelsRoot.append(btn);this.labelNodes.set(n.id,btn);
      }
      btn.textContent=n.name;
      btn.classList.toggle('selected',state.selected===n.id);
      btn.style.left=x+'px';btn.style.top=y+'px';btn.style.fontSize=font+'px';
      btn.style.color=n.label?.color||'#dff5ff';
      btn.style.fontFamily=n.label?.family==='mono'?'var(--mono)':'var(--display)';
      btn.title=item.subtitle||n.name;
    }
    for(const [id,element] of this.labelNodes){if(!live.has(id)){element.remove();this.labelNodes.delete(id);}}
  }
  tick(now){if(this.disposed)return;const elapsed=frameDelta(now,this.last);if(Number.isFinite(now))this.last=now;
    this.elapsed+=elapsed;
    const motion=this.state?.motion&&!this.reducedMotion&&!this.paused;
    if(motion){
      for(const m of this.motionObjects){if(m.orbit){const a=m.phase+this.elapsed*m.speed;m.obj.position.set(Math.cos(a)*m.orbit,0,Math.sin(a)*m.orbit);}
        else m.obj.rotation.y+=elapsed*(m.spin||m.speed);}
      for(const [i,p] of this.routeParticles.entries()){
        if(p.failed)continue;
        try{
          const t=wrapCurvePhase(p.phase+this.elapsed/1000*p.speed),v=p.curve.getPointAt(t);
          if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z))
            this.routeParticlePositions?.setXYZ(i,v.x,v.y,v.z);
          else p.failed=true;
        }catch(error){p.failed=true;console.warn('Atlas route particle disabled:',error);}
      }
      if(this.routeParticlePositions)this.routeParticlePositions.needsUpdate=true;
    }
    if(motion)for(const material of this.dynamicMaterials)material.uniforms.time.value=this.elapsed/1000;
    this.controls.update();
    const selected=this.state?.selected;
    const target=selected?this.pickables.find(o=>o.userData.atlasId===selected):null;
    this.selectionReticle.visible=Boolean(target);
    if(target){
      target.getWorldPosition(this.selectionReticle.position);
      this.selectionReticle.quaternion.copy(this.camera.quaternion);
      const item=nodeById(this.state,selected);
      const radius=this.view.kind==='all'&&item?.kind==='galaxy'?11*(item.size||1):
        this.view.kind==='galaxy'?3.6:Math.max(2.5,1.2+(item?.size||1));
      this.selectionReticle.scale.setScalar(radius);
      this.selectionReticle.children[0].rotation.z=motion?this.elapsed*.000025:0;
    }
    this.renderer.render(this.scene,this.camera);
    if(++this.frame%5===0)this.updateLabels();
  }
  info(){return {drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures};}
  dispose(){this.disposed=true;this.renderer.setAnimationLoop(null);this.resizeObserver.disconnect();this.canvas.removeEventListener('pointerdown',this._down);this.canvas.removeEventListener('pointerup',this._up);this.canvas.removeEventListener('dblclick',this._double);this.controls.dispose();disposeTree(this.group);disposeTree(this.bg);disposeTree(this.selectionReticle);this.scene.remove(this.selectionReticle);this.glowTextures.clear();this.renderer.dispose();this.renderer.forceContextLoss();this.labelsRoot.replaceChildren();this.labelNodes.clear();}
}
