"""
Allen CCFv3 피질(688.obj) → TIP-lite 피질 자동 정합 스크립트
=============================================================
기존 Min-Max(bbox) 스케일링은 축마다 다른 배율로 늘려 "noodle effect"를 일으켰음.
여기서는 형태를 보존하는 '유사변환(similarity transform: 등방 스케일 + 회전 + 이동, 7 DOF)'
만 허용하고, 후각구(olfactory bulb) 유무 같은 형태 불일치는 trimmed-ICP(대응점 일부 제거)로 흡수한다.

출력: allen_to_tip_transform.json
  - 원본 Allen 정점(AP, DV, ML µm)을 TIP-lite voxel 좌표(x=DV, y=ML, z=AP)로 보내는 4x4 행렬.
  - Three.js / Python 어디서든 동일하게 적용 가능.
"""

import json
import os
import urllib.request
import numpy as np
from scipy.spatial import cKDTree

# 경로는 스크립트 위치(mouse/) 기준 — 데이터=mouse/data, 영역 .obj=mouse/regions
BASE = os.path.dirname(os.path.abspath(__file__))

# 정합 기준 소스 = Isocortex(315). Allen 688(CTX)은 후각영역(OLF)·해마를 포함해
# TIP-lite 피질 마스크(후각구 없음)와 형태가 어긋나므로, OLF를 제외한 315로 맞춘다.
ALLEN_FILE = os.path.join(BASE, "regions", "315.obj")
TIP_CORTEX_FILE = os.path.join(BASE, "data", "(Targets_combined)Cerebral_Cortex_target_mesh.json")
OUTPUT_FILE = os.path.join(BASE, "data", "allen_to_tip_transform.json")
ALLEN_URL = "http://download.alleninstitute.org/informatics-archive/current-release/mouse_ccf/annotation/ccf_2017/structure_meshes/315.obj"

# 등방 정합 뒤 축별 '끝단(extent) 보정'을 추가로 적용할지.
# Allen isocortex는 TIP 마스크보다 AP 길이가 살짝 짧아 통통해 보이므로, 각 축 길이를
# TIP에 맞춰 가볍게 늘리고/줄인다. ANISO_PCT = 양끝 잘라낼 퍼센타일(이상치 정점 무시).
APPLY_ANISO = True
ANISO_PCT = 1.0


def load_allen_vertices(path):
    """688.obj의 정점만 (N,3) 배열로 로드. 열 순서 = (X=AP, Y=DV, Z=ML), 단위 µm."""
    if not os.path.exists(path):
        print(f"[download] {path} 다운로드 중...")
        urllib.request.urlretrieve(ALLEN_URL, path)
    verts = []
    with open(path, "r") as f:
        for line in f:
            if line.startswith("v "):
                p = line.split()
                verts.append((float(p[1]), float(p[2]), float(p[3])))
    return np.asarray(verts, dtype=np.float64)


def load_tip_cortex(path):
    """TIP-lite 피질 마스크 정점을 (N,3) 배열로 로드. 열 = (x=DV, y=ML, z=AP), 단위 voxel."""
    with open(path, "r") as f:
        d = json.load(f)
    return np.column_stack([d["x"], d["y"], d["z"]]).astype(np.float64)


def umeyama_similarity(src, dst):
    """
    대응하는 점쌍 src→dst 를 가장 잘 맞추는 유사변환(s,R,t) 추정 (Umeyama 1991).
    반환: s(스칼라), R(3x3), t(3,)  →  dst ≈ s * R @ src + t
    등방 스케일이므로 비등방 늘어남(noodle)이 원천적으로 불가능.
    """
    mu_s = src.mean(axis=0)
    mu_d = dst.mean(axis=0)
    src_c = src - mu_s
    dst_c = dst - mu_d

    cov = (dst_c.T @ src_c) / src.shape[0]
    U, D, Vt = np.linalg.svd(cov)

    # 반사(reflection) 방지: det(R) > 0 보장
    S = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        S[2, 2] = -1.0

    R = U @ S @ Vt
    var_src = (src_c ** 2).sum() / src.shape[0]
    s = np.trace(np.diag(D) @ S) / var_src
    t = mu_d - s * R @ mu_s
    return s, R, t


def coarse_init(allen_xyz, tip_xyz):
    """
    축 규약(§4)에 따라 Allen(AP,DV,ML)을 TIP 프레임(DV,ML,AP)으로 재배치(부호 반전 포함)한 뒤,
    중심/등방 스케일로 거친 초기 정렬. ICP가 잘 수렴하도록 출발점만 만들어 준다.

    TIP축 정의:  x=DV = -allen_DV,  y=ML = -allen_ML,  z=AP = -allen_AP
    → 순열/부호 행렬 P 로 표현.  A0 = (P @ allen_raw.T).T
    """
    P = np.array([
        [0.0, -1.0,  0.0],   # TIP x(DV) <- -allen Y(DV)
        [0.0,  0.0, -1.0],   # TIP y(ML) <- -allen Z(ML)
        [-1.0, 0.0,  0.0],   # TIP z(AP) <- -allen X(AP)
    ])
    A0 = allen_xyz @ P.T

    mu_a, mu_t = A0.mean(axis=0), tip_xyz.mean(axis=0)
    # RMS 반경 비율로 등방 스케일 추정(min-max보다 이상치/형태차이에 강함)
    rms_a = np.sqrt(((A0 - mu_a) ** 2).sum(axis=1).mean())
    rms_t = np.sqrt(((tip_xyz - mu_t) ** 2).sum(axis=1).mean())
    s0 = rms_t / rms_a

    src0 = mu_t + s0 * (A0 - mu_a)
    return src0, P


def trimmed_icp(src, dst, trim_ratio=0.2, max_iter=80, tol=1e-6):
    """
    Trimmed ICP: 매 반복마다 src 각 점의 최근접 dst 점을 찾고, 잔차가 큰 상위 trim_ratio 비율을
    버린 나머지로 유사변환을 추정. 형태가 겹치지 않는 부분(후각구 등)이 정합을 끌고 가지 못하게 한다.
    반환: 누적 변환을 src에 적용한 결과, 누적(s,R,t).
    """
    tree = cKDTree(dst)
    s_acc, R_acc, t_acc = 1.0, np.eye(3), np.zeros(3)
    cur = src.copy()
    prev_err = np.inf
    keep = int(round((1.0 - trim_ratio) * cur.shape[0]))

    for it in range(max_iter):
        dist, idx = tree.query(cur, k=1)
        order = np.argsort(dist)[:keep]          # 잔차 작은 점만 사용
        s_i, R_i, t_i = umeyama_similarity(cur[order], dst[idx[order]])
        cur = (s_i * (R_i @ cur.T)).T + t_i

        # 누적 변환 갱신:  new = s_i R_i (old) + t_i
        s_acc = s_i * s_acc
        R_acc = R_i @ R_acc
        t_acc = s_i * (R_i @ t_acc) + t_i

        err = dist[order].mean()
        if abs(prev_err - err) < tol:
            print(f"   ICP 수렴 (iter {it}, trimmed mean dist={err:.4f})")
            break
        prev_err = err
    return cur, (s_acc, R_acc, t_acc)


def main():
    print("=== Allen → TIP 자동 정합 시작 ===")
    allen = load_allen_vertices(ALLEN_FILE)
    tip = load_tip_cortex(TIP_CORTEX_FILE)
    print(f"Allen 피질 정점: {len(allen):,} | TIP 피질 정점: {len(tip):,}")

    # 1) 거친 초기 정렬 (축 재배치 P 포함)
    src0, P = coarse_init(allen, tip)

    # 2) Trimmed-ICP 정밀 정합
    _, (s, R, t) = trimmed_icp(src0, tip, trim_ratio=0.2)

    # 3) coarse_init(중심/스케일) + ICP 를 합쳐 'allen_raw → TIP' 4x4 행렬로 합성.
    #    coarse: src0 = mu_t + s0*(A0 - mu_a),  A0 = allen @ P.T
    #          = s0*(allen @ P.T) + (mu_t - s0*mu_a)
    #    즉 src0 = allen @ (s0 * P.T) + b0,  b0 = mu_t - s0*mu_a
    #    ICP:    final = s*R @ src0 + t
    #    합성:   final = (s*R) @ (s0 * P @ allen_col) + (s*R @ b0 + t)
    mu_a = (allen @ P.T).mean(axis=0)
    mu_t = tip.mean(axis=0)
    rms_a = np.sqrt(((allen @ P.T - mu_a) ** 2).sum(axis=1).mean())
    rms_t = np.sqrt(((tip - mu_t) ** 2).sum(axis=1).mean())
    s0 = rms_t / rms_a
    b0 = mu_t - s0 * mu_a

    M_lin = (s * R) @ (s0 * P)          # 3x3 선형부 (allen_raw 열벡터 기준)
    M_t = (s * R) @ b0 + t              # 3, 평행이동

    M = np.eye(4)
    M[:3, :3] = M_lin
    M[:3, 3] = M_t

    # 3.5) 비등방 끝단 보정: 등방 정합은 Allen 본래 종횡비를 유지하므로 축별 길이가 어긋난다.
    #      각 축 extent(양끝 ANISO_PCT% 제외)를 TIP에 맞춰, 끝단이 일치하도록 스케일+이동.
    if APPLY_ANISO:
        at = (M @ np.column_stack([allen, np.ones(len(allen))]).T).T[:, :3]
        C = np.eye(4)
        print("\n--- 비등방 끝단 보정 (축별 스케일) ---")
        for i, axname in enumerate(["x(DV)", "y(ML)", "z(AP)"]):
            a_lo, a_hi = np.percentile(at[:, i], [ANISO_PCT, 100 - ANISO_PCT])
            t_lo, t_hi = np.percentile(tip[:, i], [ANISO_PCT, 100 - ANISO_PCT])
            s_i = (t_hi - t_lo) / (a_hi - a_lo)
            C[i, i] = s_i
            C[i, 3] = (t_lo + t_hi) / 2 - s_i * (a_lo + a_hi) / 2  # 양끝 중심도 정렬
            print(f"  {axname}: x{s_i:.4f}")
        M = C @ M

    # 4) 정합 품질 검증: 변환된 Allen → TIP 최근접거리 통계
    allen_h = np.column_stack([allen, np.ones(len(allen))])
    allen_tip = (M @ allen_h.T).T[:, :3]
    tree = cKDTree(tip)
    dist, _ = tree.query(allen_tip, k=1)
    cortex_size = np.linalg.norm(tip.max(axis=0) - tip.min(axis=0))

    print("\n--- 정합 품질 ---")
    print(f"최종 등방 스케일: {s * s0:.6f}")
    print(f"평균 최근접거리 : {dist.mean():.3f} voxel")
    print(f"중앙값          : {np.median(dist):.3f} voxel")
    print(f"90퍼센타일      : {np.percentile(dist, 90):.3f} voxel")
    print(f"피질 대각선 크기: {cortex_size:.1f} voxel  (오차/크기 = {dist.mean()/cortex_size*100:.2f}%)")

    out = {
        "description": "Allen CCFv3 raw vertex (AP,DV,ML µm) -> TIP-lite voxel (x=DV, y=ML, z=AP). row-major 4x4, p_tip = M @ [p_allen, 1].",
        "matrix": M.tolist(),
        "quality": {
            "isotropic_scale": float(s * s0),
            "mean_nn_dist_voxel": float(dist.mean()),
            "median_nn_dist_voxel": float(np.median(dist)),
            "p90_nn_dist_voxel": float(np.percentile(dist, 90)),
            "cortex_diag_voxel": float(cortex_size),
        },
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"\n[OK] 변환 행렬 저장: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
