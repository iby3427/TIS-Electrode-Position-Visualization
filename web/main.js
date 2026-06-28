import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';

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
    up: 1,                       // 라벨 오프셋 = 데이터 y축
    dorsalAxis: 0,               // DV 축(=x) — 커스텀 전극 쉘 높이 보간용
    orient: [0, 0, 0],           // 콘텐츠 회전 없음 (기준 시점)
    camDir: [0.9, -0.6, 0.9],
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
    up: 2,                       // 라벨 오프셋 = 데이터 z축(dorsal)
    dorsalAxis: 2,               // DV 축(=z) — 커스텀 전극 쉘 높이 보간용
    orient: [-Math.PI / 2, 0, 0],// 데이터 +z(dorsal)→월드 +y(up): 마우스와 동일한 회전감
    camDir: [0.55, 0.6, -0.95],  // dorsal+anterior+우측 3/4 시점
    bregmaUrl: '/data/rat/rat_bregma.json',
    slicesUrl: '/data/rat/rat_slices.json',
  },
};
const DEFAULTS = { ch1p: 'FC6', ch1n: 'CP2', ch2p: 'FC2', ch2n: 'C3' };
const CHANNELS = 8;   // 전극 채널 수 (각 채널 +/− 2전극 → 최대 16전극)
// 채널별 페어 연결선/범례 색 (전극 +빨강/−파랑과 구분되는 색상)
const CH_COLORS = ['#FFD400', '#5DE08A', '#FF6FD0', '#FFA033', '#B98BFF', '#46D0E0', '#FFFFFF', '#A0E020'];
const pairSelectIds = () => { const a = []; for (let k = 1; k <= CHANNELS; k++) a.push('ch' + k + 'p', 'ch' + k + 'n'); return a; };

const statusEl = document.getElementById('status');
const setStatus = (m) => { statusEl.textContent = m; };

// ── Three.js 기본 셋업 (1회) ────────────────────────────────────────────────
const viewEl = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewEl.clientWidth, viewEl.clientHeight);
renderer.autoClear = false;      // ViewHelper.render의 내부 render가 색버퍼를 지우지 않도록(수동 clear)
viewEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, viewEl.clientWidth / viewEl.clientHeight, 0.01, 100000);
camera.up.set(0, 1, 0);          // 양 종 공통 up축 → 동일한 OrbitControls 회전감
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// 방향 표시/전환 기즈모 (우측 하단). center를 controls.target과 공유해 뇌 중심으로 스냅.
const viewHelper = new ViewHelper(camera, renderer.domElement);
viewHelper.center = controls.target;
const clock = new THREE.Clock();

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const d1 = new THREE.DirectionalLight(0xffffff, 0.7); d1.position.set(1, 1, 1); scene.add(d1);
const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-1, -1, -1); scene.add(d2);

// ── 상태 ────────────────────────────────────────────────────────────────────
let species = SPECIES.mouse;
let electrodes = {};             // name -> { pos:[x,y,z], ap?, ml?, lr?, custom? }
let electrodeNames = [];
let customElectrodes = {};       // name -> { pos, ap, ml, lr } (세션 한정, 사용자 추가)
let ontology = null;
let ratBregma = null;            // rat_bregma.json (역변환용)
let brainMesh = null, cortexMesh = null;
let regionMatrix = new THREE.Matrix4();
let sceneScale = 100;            // 뇌 bbox 대각선 — UI 크기 자동 스케일 기준
// 모든 종 콘텐츠(뇌/피질/전극/영역)는 root 아래에 두고 종별로 root를 회전시켜
// 데이터의 dorsal축을 월드 +y로 맞춘다 → 마우스/쥐 회전 경험 통일. (조명은 scene 직속)
const root = new THREE.Group(); scene.add(root);
const electrodeGroup = new THREE.Group(); root.add(electrodeGroup);
const sliceGroup = new THREE.Group(); root.add(sliceGroup); sliceGroup.visible = false;  // 2D MRI 단면 평면(MPR)
const regionMeshes = new Map();  // id -> { mesh, info }
const worldToData = (p) => root.worldToLocal(p.clone());  // 클릭 월드좌표 → 데이터좌표

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
  g.computeBoundingBox();
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
  const sel = {};                          // 전극명 → 'red'(+) / 'blue'(−). +가 우선.
  for (let k = 1; k <= CHANNELS; k++) {
    const p = val('ch' + k + 'p'), n = val('ch' + k + 'n');
    if (p) sel[p] = 'red';
    if (n && !sel[n]) sel[n] = 'blue';
  }
  const showAllLabels = document.getElementById('tgAllLabels').checked;
  const rOn = sceneScale * 0.014, rOff = sceneScale * 0.007;
  const lblH = sceneScale * 0.03, lblOff = sceneScale * 0.025;

  for (const name of electrodeNames) {
    const pos = electrodes[name].pos;
    const isCustom = !!electrodes[name].custom;
    const active = sel[name];
    const color = active === 'red' ? 0xff3b3b : active === 'blue' ? 0x3b7bff
      : isCustom ? 0x2bd1c4 : 0x555a66;       // 사용자 전극 = 청록
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(active || isCustom ? rOn : rOff, 16, 12),
      new THREE.MeshPhongMaterial({ color, emissive: active ? color : (isCustom ? 0x115c55 : 0x000000), emissiveIntensity: active ? 0.4 : (isCustom ? 0.5 : 0) })
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.userData = { electrode: name };
    electrodeGroup.add(m);

    if (active || showAllLabels || isCustom) {
      const lbl = makeLabelSprite(name, active ? '#ffffff' : (isCustom ? '#7ff3e6' : '#9aa'), lblH);
      const lp = pos.slice(); lp[species.up] += lblOff;
      lbl.position.set(lp[0], lp[1], lp[2]);
      electrodeGroup.add(lbl);
    }
  }
  for (let k = 1; k <= CHANNELS; k++) addChannelLine(val('ch' + k + 'p'), val('ch' + k + 'n'), CH_COLORS[k - 1]);
}

function addChannelLine(a, b, color) {
  if (!a || !b || !electrodes[a] || !electrodes[b]) return;
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...electrodes[a].pos), new THREE.Vector3(...electrodes[b].pos),
  ]);
  const line = new THREE.Line(g, new THREE.LineDashedMaterial({
    color: new THREE.Color(color || '#ffffff'), dashSize: sceneScale * 0.02, gapSize: sceneScale * 0.015, transparent: true, opacity: 0.9 }));
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
    root.add(mesh);
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
  root.remove(r.mesh);
  r.mesh.geometry.dispose(); r.mesh.material.dispose();
  regionMeshes.delete(id);
  renderChips();
}

function clearRegions() {
  for (const { mesh } of regionMeshes.values()) {
    root.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
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
  let html = null, cursor = 'default';
  const eHit = raycaster.intersectObjects(electrodeGroup.children, false)
    .find((h) => h.object.userData && h.object.userData.electrode);
  if (eHit) { html = tooltipHTML(eHit.object.userData.electrode); cursor = 'pointer'; }
  else if (sliceGroup.visible) {                  // 단면 평면 위 영역명 (색→이름 + 색 스와치)
    const sHit = raycaster.intersectObjects(sliceGroup.children, false).find((h) => h.object.visible && h.uv);
    if (sHit) {
      const r = regionAtUV(sHit.object.userData.slicePlane, sHit.uv);
      if (r) {
        const sw = `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;` +
          `background:${r.hex};border:1px solid #0006;margin-right:6px;vertical-align:-1px"></span>`;
        html = `<div class="t-name">${sw}${r.name}</div>` +
          `<div class="t-row" style="color:#889">${r.hex} · MRI 단면 영역</div>`;
        cursor = 'crosshair';
      }
    }
  }
  if (html) {
    tooltipEl.innerHTML = html;
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = (ev.clientX - rect.left + 14) + 'px';
    tooltipEl.style.top = (ev.clientY - rect.top + 14) + 'px';
    renderer.domElement.style.cursor = cursor;
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
  customElectrodes = {};
  electrodeGroup.clear();
  for (const m of [brainMesh, cortexMesh]) {
    if (m) { root.remove(m); m.geometry.dispose(); m.material.dispose(); }
  }
  brainMesh = cortexMesh = null;

  // 데이터 fetch
  const jsonOrNull = (url) => url ? fetch(url).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
  const reqs = [
    fetch(species.brain).then(r => r.json()),
    fetch(species.cortex).then(r => r.json()),
    fetch(species.ontology).then(r => r.json()),
    species.transform ? fetch(species.transform).then(r => r.json()) : Promise.resolve(null),
    jsonOrNull(species.electrodesUrl),
    jsonOrNull(species.bregmaUrl),
    jsonOrNull(species.slicesUrl),
  ];
  const [brain, cortex, onto, transform, ratElecs, bregma, sliceMan] = await Promise.all(reqs);
  ontology = onto;
  ratBregma = bregma;

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

  // 메쉬 생성 (root 아래 — 종별 회전 적용 대상)
  brainMesh = meshFromIndexedArrays(brain, 0xb0b4be, 0.08); root.add(brainMesh);
  cortexMesh = meshFromIndexedArrays(cortex, 0xff4040, 0.22); root.add(cortexMesh);
  brainMesh.visible = document.getElementById('tgBrain').checked;
  cortexMesh.visible = document.getElementById('tgCortex').checked;

  // 종별 콘텐츠 회전: 데이터 dorsal축을 월드 +y로 정렬 (회전감 통일)
  root.quaternion.setFromEuler(new THREE.Euler(...species.orient));
  root.updateMatrixWorld(true);

  // 전극 셀렉트 채우기 (기본값으로)
  refillPairSelects(true);
  renderCustomChips();

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

  // 카메라 프레이밍 + 스케일 산출 (root 회전 반영된 월드 bbox 기준)
  const box = new THREE.Box3().setFromObject(brainMesh);
  const center = box.getCenter(new THREE.Vector3());
  sceneScale = box.getSize(new THREE.Vector3()).length();
  controls.target.copy(center);
  camera.position.set(center.x + species.camDir[0] * sceneScale,
                      center.y + species.camDir[1] * sceneScale,
                      center.z + species.camDir[2] * sceneScale);
  camera.near = sceneScale / 1000; camera.far = sceneScale * 20; camera.updateProjectionMatrix();

  setupSlices(sliceMan);
  rebuildElectrodes();
  setStatus(`${species.name} 준비 완료 · 전극 ${electrodeNames.length}개 · 영역 ${Object.keys(ontology).length}개`);
}

// ── 전극 페어 셀렉트 채우기 (기본/현재값 유지) ───────────────────────────────
function refillPairSelects(useDefaults) {
  for (const sid of pairSelectIds()) {
    const s = document.getElementById(sid);
    const prev = s.value;
    s.innerHTML = '';
    s.add(new Option('(없음)', ''));
    for (const n of electrodeNames) s.add(new Option(n, n));
    if (useDefaults) s.value = (DEFAULTS[sid] && DEFAULTS[sid] in electrodes) ? DEFAULTS[sid] : '';
    else if (prev === '' || electrodeNames.includes(prev)) s.value = prev;
    else s.value = '';
    s.onchange = () => { rebuildElectrodes(); renderCustomChips(); };
  }
}

// ── 사용자(커스텀) 전극 ──────────────────────────────────────────────────────
// 데이터 좌표 → 정위(AP/ML/LR). 마우스는 voxel, 쥐는 WHS mm 역변환.
function computeStereotaxic(pos) {
  if (species.key === 'mouse') {
    const { ap, ml } = calcBregmaMouse(pos[1], pos[2]);
    return { ap: +ap.toFixed(2), ml: +ml.toFixed(2), lr: ml >= 0 ? 'R' : 'L' };
  }
  const bx = ratBregma ? ratBregma.bregma_x : 0.0;
  const by = ratBregma ? ratBregma.bregma_y : -0.4;
  const ms = ratBregma ? ratBregma.ml_sign : 1.0;
  const as = ratBregma ? ratBregma.ap_sign : 1.0;
  const ml = (pos[0] - bx) / ms;
  const ap = (pos[1] - by) / as;
  return { ap: +ap.toFixed(2), ml: +ml.toFixed(2), lr: ml >= 0 ? 'R' : 'L' };
}

function uniqueName(base) {
  let n = base, k = 1;
  while (n in electrodes) n = `${base}_${k++}`;
  return n;
}

function addCustomElectrode(rawName, pos) {
  if (!brainMesh) return;
  const st = computeStereotaxic(pos);
  const name = uniqueName((rawName && rawName.trim()) || 'U');
  electrodes[name] = { pos: [+pos[0].toFixed(3), +pos[1].toFixed(3), +pos[2].toFixed(3)],
                       ap: st.ap, ml: st.ml, lr: st.lr, custom: true };
  customElectrodes[name] = electrodes[name];
  electrodeNames.push(name);
  refillPairSelects(false);
  renderCustomChips();
  rebuildElectrodes();
  setStatus(`사용자 전극 [${name}] 추가 · AP ${st.ap} / ML ${st.ml} mm`);
}

function removeCustomElectrode(name) {
  if (!electrodes[name]) return;
  delete electrodes[name];
  delete customElectrodes[name];
  electrodeNames = electrodeNames.filter((n) => n !== name);
  refillPairSelects(false);
  renderCustomChips();
  rebuildElectrodes();
}

function renderCustomChips() {
  const box = document.getElementById('customChips');
  if (!box) return;
  box.innerHTML = '';
  let opts = '<option value="">채널 지정…</option>';
  for (let k = 1; k <= CHANNELS; k++) opts += `<option value="ch${k}p">CH${k} +</option><option value="ch${k}n">CH${k} −</option>`;
  for (const name of Object.keys(customElectrodes)) {
    const e = customElectrodes[name];
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span class="dot" style="background:#2bd1c4"></span>` +
      `<span class="name" title="AP ${e.ap} / ML ${e.ml} mm (${e.lr})">${name}</span>` +
      `<select class="ceassign" title="채널 극에 지정">${opts}</select><span class="x">✕</span>`;
    const asg = chip.querySelector('.ceassign');
    asg.onchange = () => { if (asg.value) { document.getElementById(asg.value).value = name; rebuildElectrodes(); renderCustomChips(); } };
    chip.querySelector('.x').onclick = () => removeCustomElectrode(name);
    box.appendChild(chip);
  }
}

// 표면 좌표에 DV를 보충: dorsal 축(up)을 따라 위→아래로 brain 표면에 레이캐스트.
function projectToSurface(dataPos) {
  if (!brainMesh) return dataPos.slice();
  const up = species.up;                       // 쥐: 2(=DV)
  const bb = brainMesh.geometry.boundingBox;
  const hi = dataPos.slice(); hi[up] = (bb ? bb.max.getComponent(up) : dataPos[up]) + sceneScale * 0.5;
  const lo = dataPos.slice(); lo[up] = (bb ? bb.min.getComponent(up) : dataPos[up]) - sceneScale * 0.5;
  const oWorld = root.localToWorld(new THREE.Vector3(...hi));
  const dWorld = root.localToWorld(new THREE.Vector3(...lo)).sub(oWorld).normalize();
  const hit = new THREE.Raycaster(oWorld, dWorld).intersectObject(brainMesh, false)[0];
  return hit ? worldToData(hit.point).toArray() : dataPos.slice();
}

// 표준 전극이 만드는 '전극 쉘'에 맞춰 DV(높이)를 보간 — 표면에 붙지 않고 인접 전극과
// 비슷한 높이(곡률 따라)에서 떠 있게 한다. dorsal축 외 2개로 가까운 K개 표준전극을 IDW.
function shellPosition(dataPos) {
  const d = species.dorsalAxis;
  const std = electrodeNames.filter((n) => !electrodes[n].custom);
  if (!std.length) return projectToSurface(dataPos);
  const h = [0, 1, 2].filter((a) => a !== d);
  const ranked = std.map((n) => {
    const p = electrodes[n].pos;
    return { dh: Math.hypot(p[h[0]] - dataPos[h[0]], p[h[1]] - dataPos[h[1]]), z: p[d] };
  }).sort((a, b) => a.dh - b.dh);
  let wsum = 0, vsum = 0;
  for (let i = 0; i < Math.min(4, ranked.length); i++) {
    const w = 1 / (ranked[i].dh + 1e-3);
    wsum += w; vsum += w * ranked[i].z;
  }
  const out = dataPos.slice();
  out[d] = +(vsum / wsum).toFixed(3);
  return out;
}

// ── 2D MRI 단면 평면 (3D MPR — 반투명 뇌에 3종 단면을 겹쳐 표시) ───────────────
// 데이터축: x=ML, y=AP, z=DV. sag=YZ(x고정), cor=XZ(y고정), axi=XY(z고정).
let sliceManifest = null;
let colorToName = new Map();              // '#RRGGBB' → 영역명 (단면 호버용)
const AXIS_KEYS = ['sag', 'cor', 'axi'];
const CAP = { sag: 'Sag', cor: 'Cor', axi: 'Axi' };
const slicePlanes = {};                   // key → {mesh, canvas, ctx, lblCanvas, lblCtx, tex, curMri, curLbl, def, idx, enabled}
const axisExtent = (m, key) => { const a = m.axes[key]; return [a.mm0, a.mm0 + a.count * a.dmm]; };

function setupSlices(manifest) {
  for (const k of AXIS_KEYS) {            // 기존 평면 정리
    const sp = slicePlanes[k];
    if (sp) { sliceGroup.remove(sp.mesh); sp.mesh.geometry.dispose(); sp.tex.dispose(); sp.mesh.material.dispose(); delete slicePlanes[k]; }
  }
  sliceManifest = (species.key === 'rat') ? manifest : null;
  colorToName = ontology ? new Map(Object.values(ontology).map(v => [v.color.toUpperCase(), v.name])) : new Map();
  const openBtn = document.getElementById('openSlices');
  if (openBtn) openBtn.style.display = sliceManifest ? 'block' : 'none';
  document.getElementById('slicePanel').style.display = 'none';
  sliceGroup.visible = false;
  if (!sliceManifest) return;

  const X = axisExtent(sliceManifest, 'sag'), Y = axisExtent(sliceManifest, 'cor'), Z = axisExtent(sliceManifest, 'axi');
  const mid = (e) => (e[0] + e[1]) / 2, len = (e) => e[1] - e[0];
  const defs = {  // basis = local(x,y,z)축이 향할 데이터 방향; fixed = 고정 데이터축; center = 비고정축 중심
    sag: { basis: [[0, 1, 0], [0, 0, 1], [1, 0, 0]], w: len(Y), h: len(Z), fixed: 0, center: [0, mid(Y), mid(Z)] },
    cor: { basis: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], w: len(X), h: len(Z), fixed: 1, center: [mid(X), 0, mid(Z)] },
    axi: { basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], w: len(X), h: len(Y), fixed: 2, center: [mid(X), mid(Y), 0] },
  };
  for (const key of AXIS_KEYS) {
    const d = defs[key];
    const canvas = document.createElement('canvas');
    const lblCanvas = document.createElement('canvas');
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;          // 슬라이스에 밉맵 불필요 + NPOT 초기 캔버스로 인한 미표시 방지
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...d.basis[0]), new THREE.Vector3(...d.basis[1]), new THREE.Vector3(...d.basis[2])));
    mesh.userData = { slicePlane: key };
    mesh.visible = (key === 'cor');
    sliceGroup.add(mesh);
    slicePlanes[key] = { mesh, canvas, ctx: canvas.getContext('2d'), lblCanvas,
      lblCtx: lblCanvas.getContext('2d', { willReadFrequently: true }), tex, def: d,
      idx: Math.floor(sliceManifest.axes[key].count / 2), enabled: (key === 'cor'),
      curMri: null, curLbl: null };
    positionPlane(key);
  }
}

function positionPlane(key) {
  const sp = slicePlanes[key], ax = sliceManifest.axes[key];
  const pos = sp.def.center.slice();
  pos[sp.def.fixed] = ax.mm0 + sp.idx * ax.dmm;
  sp.mesh.position.set(pos[0], pos[1], pos[2]);
}

// 매 로드마다 새 Image 사용(재사용으로 인한 abort/카운터 경합 제거). 이미지가 도착하는
// 즉시 redrawSlice로 합성하므로 MRI가 오버레이와 독립적으로 표시된다.
function loadSlice(key) {
  const sp = slicePlanes[key];
  const base = `/data/rat/slices/${key}/${sp.idx}`;
  const mri = new Image(), lbl = new Image();
  sp.curMri = mri; sp.curLbl = lbl;
  mri.onload = () => { if (sp.curMri === mri) redrawSlice(key); };
  lbl.onload = () => { if (sp.curLbl === lbl) redrawSlice(key); };
  mri.src = `${base}_mri.png`;
  lbl.src = `${base}_lbl.png`;
}

function redrawSlice(key) {
  const sp = slicePlanes[key];
  const mri = sp.curMri, lbl = sp.curLbl;
  const w = (mri && mri.naturalWidth) || (lbl && lbl.naturalWidth) || 0;
  const h = (mri && mri.naturalHeight) || (lbl && lbl.naturalHeight) || 0;
  if (!w || !h) return;
  sp.canvas.width = sp.lblCanvas.width = w;
  sp.canvas.height = sp.lblCanvas.height = h;
  const ctx = sp.ctx;
  ctx.clearRect(0, 0, w, h);
  if (mri && mri.naturalWidth) ctx.drawImage(mri, 0, 0);
  if (lbl && lbl.naturalWidth) {
    sp.lblCtx.clearRect(0, 0, w, h);
    sp.lblCtx.drawImage(lbl, 0, 0);                                  // 호버 색→영역 조회용
    if (document.getElementById('sliceOverlayChk').checked) {
      ctx.globalAlpha = (+document.getElementById('sliceOpacity').value) / 100;
      ctx.drawImage(lbl, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  // 캔버스 리사이즈 뒤 GPU 텍스처가 갱신되지 않는 문제 회피: 텍스처를 새로 만들어 교체.
  sp.tex.dispose();
  sp.tex = makeSliceTexture(sp.canvas);
  sp.mesh.material.map = sp.tex;
  sp.mesh.material.needsUpdate = true;
}

function makeSliceTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function regionAtUV(key, uv) {
  const sp = slicePlanes[key];
  const w = sp.lblCanvas.width, h = sp.lblCanvas.height;
  if (!w || !h) return null;
  const px = Math.min(w - 1, Math.max(0, Math.floor(uv.x * w)));
  const py = Math.min(h - 1, Math.max(0, Math.floor((1 - uv.y) * h)));  // 텍스처 flipY 보정
  const c = sp.lblCtx.getImageData(px, py, 1, 1).data;
  if (c[3] === 0) return null;
  const hex = '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
  const name = colorToName.get(hex);
  return name ? { name, hex } : null;
}

function updateSliceInfo(key) {
  const ax = sliceManifest.axes[key], sp = slicePlanes[key];
  const el = document.getElementById('info' + CAP[key]);
  if (el) el.textContent = (ax.mm0 + sp.idx * ax.dmm).toFixed(1) + ' mm';
}

// ── 클릭 vs 드래그 구분 + 기즈모/표면배치 처리 ───────────────────────────────
let downXY = null, placementMode = false;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (viewHelper.handleClick(e)) { downXY = null; return; }   // 기즈모 클릭 우선
  const moved = downXY ? Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) : 99;
  downXY = null;
  if (!placementMode || moved > 5 || !brainMesh) return;       // 드래그면 무시
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const targets = [brainMesh, cortexMesh].filter(Boolean);
  const hit = raycaster.intersectObjects(targets, false)[0];
  // 클릭 지점의 수평 위치만 취하고 DV는 전극 쉘 높이로 올린다(표면에 붙지 않게).
  if (hit) addCustomElectrode(document.getElementById('ceName').value, shellPosition(worldToData(hit.point).toArray()));
  else setStatus('표면을 클릭하세요 (뇌/피질 위).');
});

// 채널 페어 UI(8채널) 동적 생성 + 범례
function buildChannelUI() {
  const box = document.getElementById('channelRows');
  box.innerHTML = '';
  for (let k = 1; k <= CHANNELS; k++) {
    const row = document.createElement('div');
    row.className = 'chrow';
    row.innerHTML = `<span class="chdot" style="background:${CH_COLORS[k - 1]}"></span>` +
      `<span class="chlbl">CH${k}</span>` +
      `<select id="ch${k}p" class="chsel" title="CH${k} + (red)"></select>` +
      `<select id="ch${k}n" class="chsel" title="CH${k} − (blue)"></select>`;
    box.appendChild(row);
  }
}
function renderLegend() {
  let dots = '';
  for (let k = 1; k <= CHANNELS; k++)
    dots += `<span class="lgdot" style="background:${CH_COLORS[k - 1]}"></span>CH${k}${k % 2 === 0 ? '<br/>' : '&nbsp;&nbsp;'}`;
  document.getElementById('legend').innerHTML =
    `<div style="margin-bottom:5px">전극 <b style="color:#ff6b6b">+빨강</b> · <b style="color:#6b9bff">−파랑</b> · 점선=채널</div>${dots}`;
}
buildChannelUI();
renderLegend();

// ── 부트스트랩 ──────────────────────────────────────────────────────────────
document.getElementById('species').onchange = (e) => loadSpecies(e.target.value);
document.getElementById('tgBrain').onchange = (e) => { if (brainMesh) brainMesh.visible = e.target.checked; };
document.getElementById('tgCortex').onchange = (e) => { if (cortexMesh) cortexMesh.visible = e.target.checked; };
document.getElementById('tgAllLabels').onchange = rebuildElectrodes;

// 사용자 전극: 표면 클릭 모드 토글
const placeBtn = document.getElementById('tgPlacement');
placeBtn.onclick = () => {
  placementMode = !placementMode;
  placeBtn.classList.toggle('on', placementMode);
  placeBtn.textContent = placementMode ? '표면 클릭 배치: 켜짐 (뇌를 클릭)' : '표면 클릭으로 추가';
  renderer.domElement.style.cursor = placementMode ? 'crosshair' : 'default';
};
// 사용자 전극: AP/ML 좌표로 추가 (쥐 전용; 표면에 DV 투영). 마우스는 표면 클릭 권장.
document.getElementById('ceAddCoord').onclick = () => {
  if (species.key !== 'rat') { setStatus('AP/ML 좌표 추가는 Rat 전용입니다. 마우스는 표면 클릭을 사용하세요.'); return; }
  const ap = parseFloat(document.getElementById('ceAP').value);
  const ml = parseFloat(document.getElementById('ceML').value);
  if (Number.isNaN(ap) || Number.isNaN(ml)) { setStatus('AP/ML 값을 입력하세요.'); return; }
  const bx = ratBregma ? ratBregma.bregma_x : 0.0, by = ratBregma ? ratBregma.bregma_y : -0.4;
  const ms = ratBregma ? ratBregma.ml_sign : 1.0, as = ratBregma ? ratBregma.ap_sign : 1.0;
  const dataPos = [ms * ml + bx, as * ap + by, 0];           // z(DV)는 전극 쉘 높이로 보충
  addCustomElectrode(document.getElementById('ceName').value, shellPosition(dataPos));
};
// 사용자 전극: JSON 내보내기 / 가져오기
document.getElementById('ceExport').onclick = () => {
  const blob = new Blob([JSON.stringify({ species: species.key, electrodes: customElectrodes }, null, 1)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `custom_electrodes_${species.key}.json`;
  a.click(); URL.revokeObjectURL(a.href);
};
document.getElementById('ceImport').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      const src = obj.electrodes || obj;
      for (const [n, v] of Object.entries(src)) {
        if (v && v.pos) addCustomElectrode(n, v.pos.slice());
      }
    } catch (err) { setStatus('JSON 파싱 실패: ' + err.message); }
    e.target.value = '';
  };
  r.readAsText(f);
};

// 2D MRI 단면(3D MPR) 컨트롤
function openSlicePanel(open) {
  const p = document.getElementById('slicePanel');
  p.style.display = open ? 'flex' : 'none';
  sliceGroup.visible = open;
  if (!open || !sliceManifest) return;
  for (const key of AXIS_KEYS) {
    const sp = slicePlanes[key], ax = sliceManifest.axes[key];
    const sl = document.getElementById('sld' + CAP[key]);
    sl.min = 0; sl.max = ax.count - 1; sl.value = sp.idx;
    document.getElementById('chk' + CAP[key]).checked = sp.enabled;
    sp.mesh.visible = sp.enabled;
    loadSlice(key); updateSliceInfo(key);
  }
}
document.getElementById('openSlices').onclick = () =>
  openSlicePanel(document.getElementById('slicePanel').style.display !== 'flex');
document.getElementById('sliceClose').onclick = () => openSlicePanel(false);
for (const key of AXIS_KEYS) {
  document.getElementById('chk' + CAP[key]).onchange = (e) => {
    const sp = slicePlanes[key]; if (!sp) return;
    sp.enabled = e.target.checked; sp.mesh.visible = e.target.checked && sliceGroup.visible;
  };
  document.getElementById('sld' + CAP[key]).oninput = (e) => {
    const sp = slicePlanes[key]; if (!sp) return;
    sp.idx = +e.target.value; positionPlane(key); loadSlice(key); updateSliceInfo(key);
  };
}
document.getElementById('sliceOpacity').oninput = () => { for (const k of AXIS_KEYS) if (slicePlanes[k]) redrawSlice(k); };
document.getElementById('sliceOverlayChk').onchange = () => { for (const k of AXIS_KEYS) if (slicePlanes[k]) redrawSlice(k); };

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (viewHelper.animating) viewHelper.update(delta);
  controls.update();
  renderer.clear();                 // autoClear=false 이므로 매 프레임 수동 클리어
  renderer.render(scene, camera);
  viewHelper.render(renderer);      // 코너에 기즈모(자체 clearDepth, 색버퍼는 유지)
}

window.addEventListener('resize', () => {
  camera.aspect = viewEl.clientWidth / viewEl.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewEl.clientWidth, viewEl.clientHeight);
});

loadSpecies('mouse').then(animate).catch((e) => setStatus('초기화 오류: ' + e.message));
