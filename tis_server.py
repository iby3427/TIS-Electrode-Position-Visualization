"""
TIS 3D Navigator - 얇은 데이터 서버
====================================
무거운 메쉬 계산은 전부 브라우저(Three.js)가 담당한다. 이 서버는 데이터 전달만 한다.
  1) /                : web/index.html (Three.js 뷰어)
  2) /web/<file>      : 프론트엔드 정적 파일 (main.js 등)
  3) /data/<name>     : 마우스 로컬 데이터 (mouse/data/)
  4) /obj/<id>        : Allen 마우스 영역 메쉬. 없으면 Allen 서버에서 받아 mouse/regions/ 에 캐싱
  5) /data/rat/<name> : 쥐 로컬 데이터 (rat/data/)
  6) /robj/<idx>      : 쥐 영역 메쉬 (rat/regions/, 전처리로 미리 생성)

폴더 구조:  mouse/{data,regions}  rat/{data,regions,source}  web/
실행:  python tis_server.py  →  http://127.0.0.1:8050
"""

import os
import re
import urllib.request
from flask import Flask, send_from_directory, send_file, abort, Response

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")
MOUSE_DATA_DIR = os.path.join(ROOT, "mouse", "data")
MOUSE_OBJ_DIR = os.path.join(ROOT, "mouse", "regions")   # Allen .obj 캐시
RAT_DATA_DIR = os.path.join(ROOT, "rat", "data")
RAT_OBJ_DIR = os.path.join(ROOT, "rat", "regions")       # 전처리 생성 .obj
ALLEN_OBJ_URL = ("http://download.alleninstitute.org/informatics-archive/current-release/"
                 "mouse_ccf/annotation/ccf_2017/structure_meshes/{}.obj")

# 화이트리스트 (경로 조작 방지)
DATA_FILES = {
    "brain_mesh.json",
    "(Targets_combined)Cerebral_Cortex_target_mesh.json",
    "allen_ontology.json",
    "allen_to_tip_transform.json",
}
RAT_DATA_FILES = {
    "rat_brain_mesh.json",
    "rat_cortex_mesh.json",
    "rat_ontology.json",
    "rat_electrodes.json",
    "rat_bregma.json",
    "rat_slices.json",
}
RAT_SLICE_DIR = os.path.join(RAT_DATA_DIR, "slices")  # 2D MRI 슬라이스 PNG (전처리 생성, 로컬 전용)
RAT_SLICE_AXES = {"sag", "cor", "axi"}
SLICE_NAME_RE = re.compile(r"^\d+_(mri|lbl)\.png$")

app = Flask(__name__)


@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.route("/web/<path:filename>")
def web_assets(filename):
    return send_from_directory(WEB_DIR, filename)


@app.route("/data/rat/<name>")
def rat_data_file(name):
    if name not in RAT_DATA_FILES:
        abort(404)
    path = os.path.join(RAT_DATA_DIR, name)
    if not os.path.exists(path):
        abort(404)   # rat_slices.json 등 미생성 시 깔끔히 404 (뷰어는 우아하게 비활성)
    return send_file(path)


@app.route("/data/rat/slices/<axis>/<name>")
def rat_slice_file(axis, name):
    # 2D MRI 슬라이스 PNG: 전처리(make_rat_slices.py)로 생성된 파일만 제공
    if axis not in RAT_SLICE_AXES or not SLICE_NAME_RE.match(name):
        abort(404)
    path = os.path.join(RAT_SLICE_DIR, axis, name)
    if not os.path.exists(path):
        abort(404)
    return send_file(path)


@app.route("/data/<path:name>")
def data_file(name):
    if name not in DATA_FILES:
        abort(404)
    # 마우스 뇌 표면(brain_mesh / cortex)은 TIP.lite(IT'IS) 자산이라 공개본에 미포함.
    # 없으면 500이 아니라 404로 깔끔히 처리 → Mouse 모드는 전극만 표시(graceful).
    path = os.path.join(MOUSE_DATA_DIR, name)
    if not os.path.exists(path):
        abort(404)
    return send_file(path)


@app.route("/robj/<idx>")
def rat_obj_file(idx):
    # 쥐 영역 메쉬: 전처리로 미리 생성된 파일만 제공 (서버는 계산하지 않음)
    if not idx.isdigit():
        abort(400)
    path = os.path.join(RAT_OBJ_DIR, f"{idx}.obj")
    if not os.path.exists(path):
        abort(404)
    with open(path, "r") as f:
        return Response(f.read(), mimetype="text/plain")


@app.route("/obj/<struct_id>")
def obj_file(struct_id):
    # 경로 조작 방지: 정수 ID만 허용
    if not struct_id.isdigit():
        abort(400)
    path = os.path.join(MOUSE_OBJ_DIR, f"{struct_id}.obj")
    if not os.path.exists(path):
        url = ALLEN_OBJ_URL.format(struct_id)
        try:
            print(f"[download] {struct_id}.obj <- Allen")
            urllib.request.urlretrieve(url, path)
        except Exception as e:
            print(f"[error] {struct_id}.obj 다운로드 실패: {e}")
            abort(502)
    with open(path, "r") as f:
        return Response(f.read(), mimetype="text/plain")


if __name__ == "__main__":
    print("TIS 3D Navigator: http://127.0.0.1:8050")
    app.run(host="127.0.0.1", port=8050, debug=False)
