"""
쥐 전극 재배치(빠른 튜닝용). make_rat_assets.py 의 BREGMA_Y / ML_SIGN / AP_SIGN 등을
바꾼 뒤 이 스크립트만 실행하면 rat_electrodes.json 을 ~십수 초 만에 다시 만든다.
(전체 메쉬는 그대로 두고 전극만 갱신 → 브라우저 새로고침으로 확인)
"""
import os
import json
import numpy as np
import make_rat_assets as M

vol, scale, offset = M.read_nifti(M.NII)
elecs = M.build_electrodes(vol, scale, offset)
json.dump(elecs, open(os.path.join(M.DATA, "rat_electrodes.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
json.dump({"bregma_x": M.BREGMA_X, "bregma_y": M.BREGMA_Y, "ml_sign": M.ML_SIGN,
           "ap_sign": M.AP_SIGN, "surface_offset_mm": M.SURFACE_OFFSET_MM,
           "affine_scale": scale.tolist(), "affine_offset": offset.tolist()},
          open(os.path.join(M.DATA, "rat_bregma.json"), "w"), indent=1)

z = np.array([v["pos"][2] for v in elecs.values()])
print(f"전극 {len(elecs)}개 재생성 · BREGMA_Y={M.BREGMA_Y}  z {z.min():.1f}..{z.max():.1f} (mean {z.mean():.1f})")
