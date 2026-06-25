"""
WHS SD Rat Atlas v4 → 쥐 뇌 시각화 에셋 생성 (전처리, 한 번 실행)
===================================================================
NIfTI 라벨 볼륨에서 전체 뇌/피질/영역 메쉬, 온톨로지, 36개 EEG 전극(3D)을 만들어
브라우저 Three.js 뷰어(종 토글의 Rat 모드)가 그대로 소비할 정적 파일로 저장한다.

산출물 (프로젝트 루트):
  rat_brain_mesh.json   전체 뇌 표면 (indexed mesh {x,y,z,i,j,k}, WHS mm)
  rat_cortex_mesh.json  피질 기준 표면 (red 레퍼런스)
  rat_ontology.json     {idx:{acronym,name,color}}  (.label 기반)
  rat_electrodes.json   {NAME:{pos:[x,y,z], ap, ml, lr}}  (WHS mm + 정위 mm)
  rat_bregma.json       전극 앵커/affine 기록 (재현·튜닝)
  rat_obj/<idx>.obj     223개 영역 메쉬 (WHS mm, 변환행렬 불필요)

nibabel 미설치 → 헤더를 직접 파싱하는 미니 NIfTI 리더 사용.
"""

import os
import re
import gzip
import json
import struct
import numpy as np
from scipy import ndimage
from scipy.spatial import ConvexHull, cKDTree
from skimage.measure import marching_cubes, block_reduce

# 경로는 스크립트 위치(rat/) 기준 — 원본=rat/source, 출력 데이터=rat/data, 영역 .obj=rat/regions
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "source")
DATA = os.path.join(ROOT, "data")
PACK = os.path.join(SRC, "WHS_SD_rat_atlas_v4_pack")
NII = os.path.join(PACK, "WHS_SD_rat_atlas_v4.nii.gz")
LABEL = os.path.join(PACK, "WHS_SD_rat_atlas_v4.label")
XLSX = os.path.join(SRC, "New RAT EEG.xlsx")
OBJ_DIR = os.path.join(ROOT, "regions")

# ── 전극 앵커 파라미터 (시각 튜닝 대상) ──────────────────────────────────────
# 정위(bregma 기준) mm → WHS mm.  x=중앙선 고정, y만 bregma_y로 이동.
# DV는 표면 투영으로 결정하므로 bregma_z는 배치에 영향 없음.
BREGMA_X = 0.0        # 중앙선(고정, 확정)
BREGMA_Y = -0.4       # AC→bregma AP 오프셋(mm). 피질 중심 정렬값(=-0.43)에서 출발, 시각 튜닝.
ML_SIGN = 1.0         # +ML(mm)이 WHS +x(우측)에 대응하는지 부호 (검증 후 조정)
AP_SIGN = 1.0         # +AP(mm, 전방)이 WHS +y(전방)에 대응하는지 부호
SURFACE_OFFSET_MM = 0.25   # 전극을 표면 살짝 위로 띄움

# ── 메쉬 해상도 ──────────────────────────────────────────────────────────────
BRAIN_REDUCE = 4      # 전체 뇌 마스크 block_reduce 배수 (정점 수 억제)
CORTEX_REDUCE = 3     # 피질은 조금 더 디테일

# 피질(신피질) 라벨 ID — 전극이 얹히는 대뇌 외피. (.label에서 큐레이션, 편집 가능)
CORTEX_IDS = [
    10, 411,                      # Cingulate area 1/2
    77, 407,                      # Frontal association
    400, 401, 402, 403, 404,      # Orbital areas
    405, 413,                     # Prelimbic / Infralimbic
    406, 408,                     # Motor (secondary/primary)
    409, 410, 414, 416, 424,      # Insular cortices
    417, 418, 420, 422, 423, 425, 429,  # Somatosensory
    427, 430,                     # Retrosplenial
    432, 433, 436,                # Parietal association
    442, 443, 448,                # Visual
    444,                          # Temporal association
    108, 112, 113, 114, 115,      # Postrhinal / Perirhinal / Entorhinal
]


# ── NIfTI 미니 리더 ──────────────────────────────────────────────────────────
def read_nifti(path):
    """nii.gz 라벨 볼륨을 (vol[i,j,k], affine_scale[3], affine_offset[3])로 반환."""
    raw = gzip.open(path, "rb").read()
    dim = struct.unpack_from("<8h", raw, 40)
    datatype = struct.unpack_from("<h", raw, 70)[0]
    pixdim = struct.unpack_from("<8f", raw, 76)
    vox_offset = int(struct.unpack_from("<f", raw, 108)[0])
    qoffset = struct.unpack_from("<3f", raw, 268)  # qoffset_x,y,z (bytes 268..280)

    nx, ny, nz = dim[1], dim[2], dim[3]
    dtype = {2: "<u1", 4: "<i2", 8: "<i4", 16: "<f4", 512: "<u2"}[datatype]
    vol = np.frombuffer(raw, dtype=dtype, count=nx * ny * nz, offset=vox_offset)
    vol = vol.reshape((nx, ny, nz), order="F")  # NIfTI는 column-major

    scale = np.array(pixdim[1:4], dtype=np.float64)        # mm/voxel (등방)
    offset = np.array(qoffset, dtype=np.float64)           # qform identity → 대각 affine
    print(f"  NIfTI: dim=({nx},{ny},{nz}) dtype={dtype} vox={scale[0]:.6f}mm "
          f"offset={tuple(round(v,3) for v in offset)}")
    return vol, scale, offset


def idx_to_mm(verts_ijk, scale, offset):
    """marching_cubes 정점(인덱스 좌표) → WHS 물리 mm."""
    return verts_ijk * scale + offset


def mask_to_mesh(mask, scale, offset, reduce_factor=1, step=1):
    """이진 마스크 → (verts_mm (N,3), faces (M,3)).  reduce_factor로 다운샘플."""
    pad = np.pad(mask, 1)  # 경계 닫힘
    if reduce_factor > 1:
        red = block_reduce(pad, (reduce_factor,) * 3, np.max).astype(np.uint8)
        verts, faces, _, _ = marching_cubes(red, level=0.5, step_size=step)
        # 다운샘플 좌표 → 원본 인덱스 (block 중심), pad(1) 보정
        full = verts * reduce_factor + (reduce_factor - 1) / 2.0 - 1.0
    else:
        verts, faces, _, _ = marching_cubes(pad.astype(np.uint8), level=0.5, step_size=step)
        full = verts - 1.0
    return idx_to_mm(full, scale, offset), faces


def write_indexed_json(verts, faces, path):
    obj = {
        "x": verts[:, 0].round(3).tolist(), "y": verts[:, 1].round(3).tolist(),
        "z": verts[:, 2].round(3).tolist(),
        "i": faces[:, 0].astype(int).tolist(), "j": faces[:, 1].astype(int).tolist(),
        "k": faces[:, 2].astype(int).tolist(),
    }
    with open(path, "w") as f:
        json.dump(obj, f)
    print(f"  saved {os.path.basename(path)}  verts={len(verts):,} faces={len(faces):,}")


def write_obj(verts, faces, path):
    lines = [f"v {x:.3f} {y:.3f} {z:.3f}" for x, y, z in verts]
    lines += [f"f {a+1} {b+1} {c+1}" for a, b, c in faces.astype(int)]
    with open(path, "w") as f:
        f.write("\n".join(lines))


# ── .label 파싱 ──────────────────────────────────────────────────────────────
def parse_label():
    """ITK-SnAP .label → {idx:{acronym,name,color}} (idx 0 제외)."""
    onto = {}
    pat = re.compile(r'^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+[\d.]+\s+\d+\s+\d+\s+"(.+)"')
    with open(LABEL, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.lstrip().startswith("#"):
                continue
            m = pat.match(line)
            if not m:
                continue
            idx, r, g, b, name = m.groups()
            if int(idx) == 0:
                continue
            color = "#{:02X}{:02X}{:02X}".format(int(r), int(g), int(b))
            name = name.strip()
            onto[idx] = {"acronym": name, "name": name, "color": color}
    return onto


# ── 전극 ─────────────────────────────────────────────────────────────────────
def load_electrodes_xlsx():
    """New RAT EEG.xlsx → [(name, ap_mm, ml_mm, lr), ...] (헤더 자동 탐색)."""
    import openpyxl
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]

    def find(*keys):
        for i, h in enumerate(header):
            if any(k in h for k in keys):
                return i
        return None

    c_name = find("name", "position")
    c_ml = find("ml", "/ x")
    c_ap = find("ap", "/ y")
    c_lr = find("l / r", "l/r", "lr", "hemis")
    out = []
    for row in rows[1:]:
        if row[c_name] is None:
            continue
        name = str(row[c_name]).strip()
        ml = float(row[c_ml]); ap = float(row[c_ap])
        lr = str(row[c_lr]).strip() if c_lr is not None and row[c_lr] is not None else ""
        out.append((name, ap, ml, lr))
    print(f"  전극 {len(out)}개 로드 (헤더: name={c_name}, ml={c_ml}, ap={c_ap}, lr={c_lr})")
    return out


def build_dorsal_cap(mask, scale, offset, sub=4):
    """
    뇌 등쪽(dorsal) 표면 점구름의 볼록껍질 → '두개골 캡' 높이함수.
    10-20 전극은 뇌보다 넓은 두개골에 붙으므로, 뇌 마스크 직접 투영 대신 볼록껍질
    윗면에 얹어 가장자리(전방·측면)에서도 매끄럽게 뇌 위를 덮고 복측 함몰을 회피한다.
    반환: (cap_z(x,y) 함수, 등쪽 점구름 (N,2) xy, z) — xy 밖이면 최근접 폴백용.
    """
    foot = mask.any(axis=2)
    ii, jj = np.where(foot)
    ii, jj = ii[::sub], jj[::sub]
    cols = mask[ii, jj, :]
    ktop = (cols.shape[1] - 1) - np.argmax(cols[:, ::-1], axis=1)  # 컬럼별 최상단 voxel
    px = scale[0] * ii + offset[0]
    py = scale[1] * jj + offset[1]
    pz = scale[2] * ktop + offset[2]
    pts = np.column_stack([px, py, pz])
    hull = ConvexHull(pts)
    a, b, c, d = (hull.equations[:, 0], hull.equations[:, 1],
                  hull.equations[:, 2], hull.equations[:, 3])
    up = c > 1e-9
    au, bu, cu, du = a[up], b[up], c[up], d[up]
    tree = cKDTree(np.column_stack([px, py]))
    pxy, pz_arr = np.column_stack([px, py]), pz

    def cap_z(x, y):
        # 볼록껍질 윗면: c>0 facet들의 상한 z 중 최소값 = 껍질 꼭대기
        z_top = ((-(au * x + bu * y + du)) / cu).min()
        # 점구름 xy 범위 밖이면 최근접 등쪽점 높이로 보정(과도 외삽 방지)
        z_near = pz_arr[tree.query([x, y])[1]]
        return min(z_top, z_near + 1.0) if z_top > z_near + 1.0 else z_top

    return cap_z


def build_electrodes(vol, scale, offset):
    mask = vol > 0
    cap_z = build_dorsal_cap(mask, scale, offset)
    elist = load_electrodes_xlsx()
    out = {}
    for name, ap, ml, lr in elist:
        x_whs = ML_SIGN * ml + BREGMA_X
        y_whs = AP_SIGN * ap + BREGMA_Y
        z_whs = cap_z(x_whs, y_whs) + SURFACE_OFFSET_MM
        out[name] = {"pos": [round(x_whs, 3), round(y_whs, 3), round(float(z_whs), 3)],
                     "ap": round(ap, 2), "ml": round(ml, 2), "lr": lr}
    return out


# ── 메인 ─────────────────────────────────────────────────────────────────────
def main():
    print("=== WHS Rat 에셋 생성 시작 ===")
    print("[1/5] NIfTI 로드")
    vol, scale, offset = read_nifti(NII)

    print("[2/5] 전체 뇌 메쉬")
    brain_mask = vol > 0
    bv, bf = mask_to_mesh(brain_mask, scale, offset, reduce_factor=BRAIN_REDUCE)
    write_indexed_json(bv, bf, os.path.join(DATA, "rat_brain_mesh.json"))

    print("[3/5] 피질 기준 메쉬")
    cortex_mask = np.isin(vol, CORTEX_IDS)
    cv, cf = mask_to_mesh(cortex_mask, scale, offset, reduce_factor=CORTEX_REDUCE)
    write_indexed_json(cv, cf, os.path.join(DATA, "rat_cortex_mesh.json"))

    print("[4/5] 온톨로지 + 223개 영역 메쉬")
    onto = parse_label()
    with open(os.path.join(DATA, "rat_ontology.json"), "w", encoding="utf-8") as f:
        json.dump(onto, f, ensure_ascii=False, indent=1)
    print(f"  온톨로지 {len(onto)}개 영역 저장")

    os.makedirs(OBJ_DIR, exist_ok=True)
    objs = ndimage.find_objects(vol)   # 라벨별 bbox (1..max)
    made = skipped = 0
    for idx_str in onto:
        idx = int(idx_str)
        if idx > len(objs) or objs[idx - 1] is None:
            skipped += 1
            continue
        slc = objs[idx - 1]
        sub = vol[slc]
        m = sub == idx
        nv = int(m.sum())
        if nv < 8:
            skipped += 1
            continue
        # 큰 영역(소뇌·피질 등)은 step_size를 키워 파일/정점 수를 억제
        step = 1 if nv < 150_000 else (2 if nv < 1_500_000 else 3)
        try:
            verts, faces, _, _ = marching_cubes(np.pad(m, 1).astype(np.uint8),
                                                level=0.5, step_size=step)
        except (ValueError, RuntimeError):
            skipped += 1
            continue
        start = np.array([s.start for s in slc], dtype=np.float64)
        full = verts - 1.0 + start
        vmm = idx_to_mm(full, scale, offset)
        write_obj(vmm, faces, os.path.join(OBJ_DIR, f"{idx}.obj"))
        made += 1
    print(f"  영역 메쉬: 생성 {made}, 건너뜀 {skipped}")

    print("[5/5] 전극 3D 배치")
    elecs = build_electrodes(vol, scale, offset)
    with open(os.path.join(DATA, "rat_electrodes.json"), "w", encoding="utf-8") as f:
        json.dump(elecs, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, "rat_bregma.json"), "w", encoding="utf-8") as f:
        json.dump({"bregma_x": BREGMA_X, "bregma_y": BREGMA_Y, "ml_sign": ML_SIGN,
                   "ap_sign": AP_SIGN, "surface_offset_mm": SURFACE_OFFSET_MM,
                   "affine_scale": scale.tolist(), "affine_offset": offset.tolist()}, f, indent=1)
    print(f"  전극 {len(elecs)}개 저장")
    print("=== 완료 ===")


if __name__ == "__main__":
    main()
