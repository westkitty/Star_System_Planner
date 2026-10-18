import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAtmosphere, makeSelectionReticle} from '../visual-fidelity.js';

test('atmospheric rim is a real Three.js mesh rather than an image billboard',()=>{
  const mesh=makeAtmosphere(2.5,'#4bcfff',.56);
  assert.equal(mesh.isMesh,true);
  assert.equal(mesh.geometry.type,'SphereGeometry');
  assert.equal(mesh.material.isShaderMaterial,true);
  assert.equal(mesh.material.uniforms.strength.value,.56);
  assert.equal(mesh.material.depthWrite,false);
  assert.equal(mesh.material.transparent,true);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test('selection reticle is noninteractive scene geometry with bounded resource footprint',()=>{
  const reticle=makeSelectionReticle();
  assert.equal(reticle.visible,false);
  assert.equal(reticle.children.length,3);
  assert.equal(reticle.children[2].isLineSegments,true);
  assert.ok(reticle.children.every(child=>child.geometry&&child.material));
  for(const child of reticle.children){child.geometry.dispose();child.material.dispose();}
});
