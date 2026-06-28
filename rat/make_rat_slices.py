"""
WHS SD Rat Atlas v4 → 2D MRI 슬라이스 에셋 생성 (전처리, 한 번 실행)
===================================================================
원본 T2* MRI(그레이스케일)와 라벨 볼륨(해부 영역)을 같은 격자에서 슬라이스로 잘라,
브라우저 2D 단면 뷰어가 그대로 띄울 PNG로 저장한다. 서버는 계산하지 않고 정적 제공만 한다.

산출물 (rat/data/slices/, 로컬 전용 — 용량이 커 GitHub 비포함):
  <axis>/<idx>_mri.png   8-bit 그레이스케일 MRI 단면
  <axis>/<idx>_lbl.png   RGBA 영역 색칠 오버레이 (라벨 0 = 투명)
  rat/data/rat_slices.json  매니페스트(축별 개수·mm 매핑)

축:  sag=시상(고정 x=ML)  cor=관상(고정 y=AP)  axi=수평(고정 z=DV)

의존성은 numpy + Pillow 뿐(이 환경의 skimage/scipy ABI 문제 회피용으로 NIfTI 리더/라벨
파서를 자체 포함). T2*는 약 900MB → 디컴프레스 시 ~1GB RAM 사용.
재실행:  python rat/make_rat_slices.py
"""

import os
import re
import gzip
import json
import struct
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.join(ROOT, "source", "WHS_SD_rat_atlas_v4_pack")
LABEL_NII = os.path.join(PACK, "WHS_SD_rat_atlas_v4.nii.gz")
T2_NII = os.path.join(PACK, "WHS_SD_rat_T2star_v1.01.nii.gz")
LABEL_TXT = os.path.join(PACK, "WHS_SD_rat_atlas_v4.label")
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "slices")

REDUCE = 2          # 다운샘플 배수 (512→256, 1024→512). 용량/장수 억제.
AXES = [            # (key, 고정 배열축, label) — 배열은 vol[x=ML, y=AP, z=DV]
    ("sag", 0, "Sagittal (ML)"),
    ("cor", 1, "Coronal (AP)"),
    ("axi", 2, "Axial (DV)"),
]


# ── NIfTI 미니 리더 (make_rat_assets.read_nifti와 동일, 자체 포함) ──────────────
def read_nifti(path):
    raw = gzip.open(path, "rb").read()
    dim = struct.unpack_from("<8h", raw, 40)
    datatype = struct.unpack_from("<h", raw, 70)[0]
    pixdim = struct.unpack_from("<8f", raw, 76)
    vox_offset = int(struct.unpack_from("<f", raw, 108)[0])
    qoffset = struct.unpack_from("<3f", raw, 268)
    nx, ny, nz = dim[1], dim[2], dim[3]
    dtype = {2: "<u1", 4: "<i2", 8: "<i4", 16: "<f4", 512: "<u2"}[datatype]
    vol = np.frombuffer(raw, dtype=dtype, count=nx * ny * nz, offset=vox_offset)
    vol = vol.reshape((nx, ny, nz), order="F")
    scale = np.array(pixdim[1:4], dtype=np.float64)
    offset = np.array(qoffset, dtype=np.float64)
    print(f"  NIfTI: dim=({nx},{ny},{nz}) dtype={dtype} vox={scale[0]:.6f}mm")
    return vol, scale, offset


def parse_label():
    """ITK-SnAP .label → {idx:'#RRGGBB'} (idx 0 제외)."""
    pal = {}
    pat = re.compile(r'^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+[\d.]+\s+\d+\s+\d+\s+"(.+)"')
    with open(LABEL_TXT, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.lstrip().startswith("#"):
                continue
            m = pat.match(line)
            if not m:
                continue
            idx, r, g, b, _ = m.groups()
            if int(idx) == 0:
                continue
            pal[int(idx)] = (int(r), int(g), int(b))
    return pal


def downsample(vol, r, how):
    """순수 numpy 블록 다운샘플 (mean=MRI, max=라벨). 차원은 r의 배수여야 함."""
    if r <= 1:
        return vol
    nx, ny, nz = (s - s % r for s in vol.shape)
    v = vol[:nx, :ny, :nz].reshape(nx // r, r, ny // r, r, nz // r, r)
    return v.mean(axis=(1, 3, 5)) if how == "mean" else v.max(axis=(1, 3, 5))


def to_uint8(mri):
    """MRI float 볼륨 → 0..255 (1~99 퍼센타일 윈도잉)."""
    pos = mri[mri > 0]
    lo, hi = np.percentile(pos, (1, 99)) if pos.size else (0.0, 1.0)
    g = np.clip((mri - lo) / max(hi - lo, 1e-6), 0, 1)
    return (g * 255).astype(np.uint8)


def build_palette(pal):
    """{idx:(r,g,b)} → (maxid+1, 3) lookup."""
    maxid = max(pal) + 1
    arr = np.zeros((maxid, 3), dtype=np.uint8)
    for k, rgb in pal.items():
        arr[k] = rgb
    return arr


def main():
    print("=== Rat 2D 슬라이스 생성 시작 ===")
    print("[1/3] 라벨 볼륨 로드")
    lbl, scale, offset = read_nifti(LABEL_NII)
    print("[2/3] T2* MRI 로드 (~900MB, 시간이 걸립니다)")
    mri, _, _ = read_nifti(T2_NII)
    mri = mri.astype(np.float32)

    lbl = downsample(lbl, REDUCE, "max").astype(np.int32)
    mri = downsample(mri, REDUCE, "mean")
    mri8 = to_uint8(mri)

    pal = build_palette(parse_label())
    rgb = pal[np.clip(lbl, 0, len(pal) - 1)]              # (X,Y,Z,3)
    alpha = np.where(lbl > 0, 200, 0).astype(np.uint8)    # 라벨 0 = 투명

    vox = float(scale[0]) * REDUCE
    nx, ny, nz = lbl.shape
    print(f"[3/3] 슬라이스 저장  shape=({nx},{ny},{nz})  vox={vox:.4f}mm")

    manifest = {"voxel_mm": round(vox, 5), "reduce": REDUCE, "default_axis": "cor", "axes": {}}
    for key, ax, label in AXES:
        d = os.path.join(OUT, key)
        os.makedirs(d, exist_ok=True)
        count = lbl.shape[ax]
        for i in range(count):
            sl = [slice(None)] * 3
            sl[ax] = i
            g = np.flipud(mri8[tuple(sl)].T)                              # 행=위(dorsal/anterior)
            cr = np.flipud(rgb[tuple(sl)].transpose(1, 0, 2))
            al = np.flipud(alpha[tuple(sl)].T)
            Image.fromarray(g, "L").save(os.path.join(d, f"{i}_mri.png"), optimize=True)
            rgba = np.dstack([cr, al]).astype(np.uint8)
            Image.fromarray(rgba, "RGBA").save(os.path.join(d, f"{i}_lbl.png"), optimize=True)
        manifest["axes"][key] = {
            "label": label, "count": int(count),
            "mm0": round(float(offset[ax]), 4), "dmm": round(vox, 5),
        }
        print(f"  {key}: {count}장 저장")

    with open(os.path.join(DATA, "rat_slices.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
    print("=== 완료 ===  rat/data/rat_slices.json + slices/ 생성")


if __name__ == "__main__":
    main()
