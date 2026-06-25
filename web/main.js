import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── 마우스 36개 10-20 전극 (TIP-lite voxel: x=DV, y=ML, z=AP) ────────────────
const ELECTRODES_MOUSE = {
  AF3:[115.323,72.609,204.137], AF4:[119.090,78.965,203.344], AF7:[120.782,108.137,203.935], AF8:[117.908,113.056,204.156],
  F1:[122.077,69.285,194.008],  F2:[127.630,79.206,194.567],  F5:[127.451,108.146,194.520],  F6:[124.926,114.639,194.660],
  FC1:[124.930,62.723,183.822], FC2:[133.000,76.653,185.025], FC5:[134.554,109.905,183.736], FC6:[125.377,124.689,184.742],
  C1:[129.836,59.908,174.200],  C2:[136.828,69.750,174.230],  C3:[141.168,79.250,173.552],   C4:[141.959,107.246,173.684],
  C5:[136.790,117.607,174.417], C6:[130.681,127.256,174.760],
  CP1:[134.492,58.385,164.381], CP2:[139.726,66.433,165.155], CP3:[143.855,77.285,164.430],  CP4:[144.855,110.256,164.996],
  CP5:[140.303,120.189,164.735],CP6:[134.958,129.415,165.038],
  P1:[137.283,55.567,154.752],  P2:[142.224,64.130,154.915],  P3:[147.223,76.748,154.926],   P4:[147.124,110.444,155.051],
  P5:[142.889,122.697,155.102], P6:[137.286,131.672,155.050],
  PO3:[144.933,67.367,145.246], PO4:[149.595,76.850,145.382], PO7:[150.157,110.754,145.165], PO8:[147.110,117.316,144.728],
  O1:[151.617,76.961,135.170],  O2:[151.504,109.807,135.403],
};

// Bregma 정위좌표 (마우스, Plotly v2와 동일): z=AP(Bregma 174.45), y=ML(Midline 93.5)
const calcBregmaMouse = (y, z) => ({ ap: (z - 174.45) * 0.10, ml: (y - 93.5) * 0.08 });

// ── 종(species) 설정 테이블 ─────────────────────────────────────────────────
const SPECIES = {
  mouse: {
    key: 'mouse', name: 'Mouse (Allen)',
    brain: '/data/brain_mesh.json',
    cortex: '/data/(Targets_combined)Cerebral_Cortex_target_mesh.json',
    ontology: '/data/allen_ontology.json',
    transform: '/data/allen_to_tip_transform.json',  // 영역 메쉬에 적용
    objUrl: (id) => `/obj/${id}`,
    regionsHaveTransform: true,
    up: 1,                       // 라벨 오프셋/카메라 up = y축
    cameraUp: [0, 1, 0], camDir: [0.9, -0.6, 0.9],
  },
  rat: {
    key: 'rat', name: 'Rat (WHS)',
    brain: '/data/rat/rat_brain_mesh.json',
    cortex: '/data/rat/rat_cortex_mesh.json',
    ontology: '/data/rat/rat_ontology.json',
    electrodesUrl: '/data/rat/rat_electrodes.json',
    transform: null,             // 쥐 영역은 이미 mm 프레임 → 변환 불필요
    objUrl: (id) => `/robj/${id}`,
    regionsHaveTransform: false,
    up: 2,                       // dorsal = z축
    cameraUp: [0, 0, 1], camDir: [0.2, -0.9, 0.6],
  },
};
const DEFAULTS = { ch1p: 'FC6', ch1n: 'CP2', ch2p: 'FC2', ch2n: 'C3' };

const statusEl = document.getElementById('status');
const setStatus = (m) => { statusEl.textContent = m; };

// ── Three.js 기본 셋업 (1회) ────────────────────────────────────────────────
const viewEl = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewEl.clientWidth, viewEl.clientHeight);
viewEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, viewEl.clientWidth / viewEl.clientHeight, 0.01, 100000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const d1 = new THREE.DirectionalLight(0xffffff, 0.7); d1.position.set(1, 1, 1); scene.add(d1);
const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-1, -1, -1); scene.add(d2);

// ── 상태 ────────────────────────────────────────────────────────────────────
let species = SPECIES.mouse;
let electrodes = {};             // name -> { pos:[x,y,z], ap?, ml?, lr? }
let electrodeNames = [];
let ontology = null;
let brainMesh = null, cortexMesh = null;
let regionMatrix = new THREE.Matrix4();
let sceneScale = 100;            // 뇌 bbox 대각선 — UI 크기 자동 스케일 기준
const electrodeGroup = new THREE.Group(); scene.add(electrodeGroup);
const regionMeshes = new Map();  // id -> { mesh, info }

// ── 유틸 ────────────────────────────────────────────────────────────────────
function meshFromIndexedArrays(data, color, opacity) {
  const n = data.x.length;
  const pos = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) { pos[p*3] = data.x[p]; pos[p*3+1] = data.y[p]; pos[p*3+2] = data.z[p]; }
  const idx = new Uint32Array(data.i.length * 3);
  for (let f = 0; f < data.i.length; f++) { idx[f*3] = data.i[f]; idx[f*3+1] = data.j[f]; idx[f*3+2] = data.k[f]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(g, mat);
}

function parseOBJ(text) {
  const verts = [], faces = [];
  for (const line of text.split('\n')) {
    if (line[0] === 'v' && line[1] === ' ') {
      const p = line.split(/\s+/);
      verts.push(+p[1], +p[2], +p[3]);
    } else if (line[0] === 'f' && line[1] === ' ') {
      const p = line.trim().split(/\s+/);
      faces.push((p[1].split('/')[0] | 0) - 1, (p[2].split('/')[0] | 0) - 1, (p[3].split('/')[0] | 0) - 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.setIndex(faces);
  return g;
}

function makeLabelSprite(text, color, worldHeight) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = 'bold 48px Arial';
  const w = ctx.measureText(text).width;
  c.width = w + 20; c.height = 64;
  ctx.font = 'bold 48px Arial';
  ctx.fillStyle = color; ctx.textBaseline = 'middle';
  ctx.fillText(text, 10, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(worldHeight * c.width / c.height, worldHeight, 1);
  return spr;
}

const val = (id) => document.getElementById(id).value;

// ── 전극 + 채널 라인 (선택/스케일 바뀔 때 재구성) ───────────────────────────
function rebuildElectrodes() {
  electrodeGroup.clear();
  const sel = {
    [val('ch1p')]: 'red', [val('ch2p')]: 'red',
    [val('ch1n')]: 'blue', [val('ch2n')]: 'blue',
  };
  const showAllLabels = document.getElementById('tgAllLabels').checked;
  const rOn = sceneScale * 0.014, rOff = sceneScale * 0.007;
  const lblH = sceneScale * 0.03, lblOff = sceneScale * 0.025;

  for (const name of electrodeNames) {
    const pos = electrodes[name].pos;
    const active = sel[name];
    const color = active === 'red' ? 0xff3b3b : active === 'blue' ? 0x3b7bff : 0x555a66;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(active ? rOn : rOff, 16, 12),
      new THREE.MeshPhongMaterial({ color, emissive: active ? color : 0x000000, emissiveIntensity: active ? 0.4 : 0 })
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.userData = { electrode: name };
    electrodeGroup.add(m);

    if (active || showAllLabels) {
      const lbl = makeLabelSprite(name, active ? '#ffffff' : '#9aa', lblH);
      const lp = pos.slice(); lp[species.up] += lblOff;
      lbl.position.set(lp[0], lp[1], lp[2]);
      electrodeGroup.add(lbl);
    }
  }
  addChannelLine(val('ch1p'), val('ch1n'));
  addChannelLine(val('ch2p'), val('ch2n'));
}

function addChannelLine(a, b) {
  if (!a || !b || !electrodes[a] || !electrodes[b]) return;
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...electrodes[a].pos), new THREE.Vector3(...electrodes[b].pos),
  ]);
  const line = new THREE.Line(g, new THREE.LineDashedMaterial({
    color: 0xffffff, dashSize: sceneScale * 0.02, gapSize: sceneScale * 0.015, transparent: true, opacity: 0.7 }));
  line.computeLineDistances();
  electrodeGroup.add(line);
}

// ── 영역 추가/제거 ──────────────────────────────────────────────────────────
async function addRegion(id) {
  if (regionMeshes.has(id) || !ontology[id]) return;
  const info = ontology[id];
  setStatus(`[${info.acronym}] 메쉬 불러오는 중...`);
  try {
    const res = await fetch(species.objUrl(id));
    if (!res.ok) throw new Error(res.status);
    const geom = parseOBJ(await res.text());
    if (species.regionsHaveTransform) geom.applyMatrix4(regionMatrix);
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, new THREE.MeshPhongMaterial({
      color: new THREE.Color(info.color), transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    }));
    scene.add(mesh);
    regionMeshes.set(id, { mesh, info });
    renderChips();
    setStatus(`[${info.acronym}] 추가됨 · 영역 ${regionMeshes.size}개`);
  } catch (e) {
    setStatus(`[${info.acronym}] 불러오기 실패 (${e.message})`);
  }
}

function removeRegion(id) {
  const r = regionMeshes.get(id);
  if (!r) return;
  scene.remove(r.mesh);
  r.mesh.geometry.dispose(); r.mesh.material.dispose();
  regionMeshes.delete(id);
  renderChips();
}

function clearRegions() {
  for (const { mesh } of regionMeshes.values()) {
    scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
  }
  regionMeshes.clear(); renderChips();
}

function renderChips() {
  const box = document.getElementById('regionChips');
  box.innerHTML = '';
  for (const [id, { info }] of regionMeshes) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span class="dot" style="background:${info.color}"></span>
      <span class="name" title="${info.name}">${info.acronym}</span><span class="x">✕</span>`;
    chip.querySelector('.x').onclick = () => removeRegion(id);
    box.appendChild(chip);
  }
}

// ── 전극 호버 툴팁 (레이캐스팅) ─────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltipEl = document.getElementById('tooltip');
const sgn = (v) => (v >= 0 ? '+' : '') + v.toFixed(2);

function tooltipHTML(name) {
  const e = electrodes[name];
  const [x, y, z] = e.pos;
  if (species.key === 'mouse') {
    const { ap, ml } = calcBregmaMouse(y, z);
    return `<div class="t-name">${name}</div>` +
      `<div class="t-row">Voxel (X,Y,Z): ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}</div>` +
      `<div class="t-row">Bregma <b>AP</b>: ${sgn(ap)} mm</div>` +
      `<div class="t-row">Bregma <b>ML</b>: ${sgn(ml)} mm</div>`;
  }
  return `<div class="t-name">${name} <span style="color:#8aa">(${e.lr})</span></div>` +
    `<div class="t-row">WHS mm: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}</div>` +
    `<div class="t-row">Bregma <b>AP</b>: ${sgn(e.ap)} mm</div>` +
    `<div class="t-row">Bregma <b>ML</b>: ${sgn(e.ml)} mm</div>` +
    `<div class="t-row" style="color:#778">DV: surface-projected</div>`;
}

renderer.domElement.addEventListener('mousemove', (ev) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(electrodeGroup.children, false)
    .find((h) => h.object.userData && h.object.userData.electrode);
  if (hit) {
    tooltipEl.innerHTML = tooltipHTML(hit.object.userData.electrode);
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = (ev.clientX - rect.left + 14) + 'px';
    tooltipEl.style.top = (ev.clientY - rect.top + 14) + 'px';
    renderer.domElement.style.cursor = 'pointer';
  } else {
    tooltipEl.style.display = 'none';
    renderer.domElement.style.cursor = 'default';
  }
});

// ── 종 로드/전환 ────────────────────────────────────────────────────────────
async function loadSpecies(key) {
  species = SPECIES[key];
  setStatus(`${species.name} 데이터 로딩 중...`);

  // 기존 씬 정리
  clearRegions();
  electrodeGroup.clear();
  for (const m of [brainMesh, cortexMesh]) {
    if (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  }
  brainMesh = cortexMesh = null;

  // 데이터 fetch
  const reqs = [
    fetch(species.brain).then(r => r.json()),
    fetch(species.cortex).then(r => r.json()),
    fetch(species.ontology).then(r => r.json()),
    species.transform ? fetch(species.transform).then(r => r.json()) : Promise.resolve(null),
    species.electrodesUrl ? fetch(species.electrodesUrl).then(r => r.json()) : Promise.resolve(null),
  ];
  const [brain, cortex, onto, transform, ratElecs] = await Promise.all(reqs);
  ontology = onto;

  // 전극 데이터 통일 표현
  if (key === 'mouse') {
    electrodes = Object.fromEntries(Object.entries(ELECTRODES_MOUSE).map(([n, p]) => [n, { pos: p }]));
  } else {
    electrodes = ratElecs;
  }
  electrodeNames = Object.keys(electrodes);

  // 영역 변환행렬
  if (transform) {
    const a = transform.matrix;
    regionMatrix.set(a[0][0],a[0][1],a[0][2],a[0][3], a[1][0],a[1][1],a[1][2],a[1][3],
                     a[2][0],a[2][1],a[2][2],a[2][3], a[3][0],a[3][1],a[3][2],a[3][3]);
  } else {
    regionMatrix.identity();
  }

  // 메쉬 생성
  brainMesh = meshFromIndexedArrays(brain, 0xb0b4be, 0.08); scene.add(brainMesh);
  cortexMesh = meshFromIndexedArrays(cortex, 0xff4040, 0.22); scene.add(cortexMesh);
  brainMesh.visible = document.getElementById('tgBrain').checked;
  cortexMesh.visible = document.getElementById('tgCortex').checked;

  // 전극 셀렉트 채우기
  for (const sid of ['ch1p', 'ch1n', 'ch2p', 'ch2n']) {
    const s = document.getElementById(sid);
    s.innerHTML = '';
    for (const n of electrodeNames) s.add(new Option(n, n));
    s.value = (DEFAULTS[sid] in electrodes) ? DEFAULTS[sid] : electrodeNames[0];
    s.onchange = rebuildElectrodes;
  }

  // 영역 검색 datalist
  const dl = document.getElementById('regionList');
  dl.innerHTML = '';
  const lookup = new Map();
  const opts = Object.entries(ontology)
    .map(([id, d]) => ({ id, label: d.acronym === d.name ? `${d.name} [${id}]` : `${d.acronym} — ${d.name} [${id}]` }))
    .sort((p, q) => p.label.localeCompare(q.label));
  for (const o of opts) { dl.appendChild(new Option(o.label)); lookup.set(o.label, o.id); }
  const doAdd = () => {
    const v = document.getElementById('regionSearch').value;
    const m = v.match(/\[(\d+)\]\s*$/);
    const id = m ? m[1] : lookup.get(v);
    if (id) { addRegion(id); document.getElementById('regionSearch').value = ''; }
    else setStatus('목록에서 항목을 선택해 주세요.');
  };
  document.getElementById('addRegion').onclick = doAdd;
  document.getElementById('regionSearch').onchange = doAdd;

  // 카메라 프레이밍 + 스케일 산출
  const box = new THREE.Box3().setFromObject(brainMesh);
  const center = box.getCenter(new THREE.Vector3());
  sceneScale = box.getSize(new THREE.Vector3()).length();
  camera.up.set(...species.cameraUp);
  controls.target.copy(center);
  camera.position.set(center.x + species.camDir[0] * sceneScale,
                      center.y + species.camDir[1] * sceneScale,
                      center.z + species.camDir[2] * sceneScale);
  camera.near = sceneScale / 1000; camera.far = sceneScale * 20; camera.updateProjectionMatrix();

  rebuildElectrodes();
  setStatus(`${species.name} 준비 완료 · 전극 ${electrodeNames.length}개 · 영역 ${Object.keys(ontology).length}개`);
}

// ── 부트스트랩 ──────────────────────────────────────────────────────────────
document.getElementById('species').onchange = (e) => loadSpecies(e.target.value);
document.getElementById('tgBrain').onchange = (e) => { if (brainMesh) brainMesh.visible = e.target.checked; };
document.getElementById('tgCortex').onchange = (e) => { if (cortexMesh) cortexMesh.visible = e.target.checked; };
document.getElementById('tgAllLabels').onchange = rebuildElectrodes;

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = viewEl.clientWidth / viewEl.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewEl.clientWidth, viewEl.clientHeight);
});

loadSpecies('mouse').then(animate).catch((e) => setStatus('초기화 오류: ' + e.message));
