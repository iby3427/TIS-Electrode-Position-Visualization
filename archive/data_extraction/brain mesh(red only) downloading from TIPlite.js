(function downloadTargetMesh() {
    const nodes = document.querySelectorAll('*');
    let targetTrace = null;
    
    // 화면의 모든 데이터를 뒤져서 빨간색(rgb(136,8,8)) 메쉬를 찾음
    for(let i=0; i<nodes.length; i++) {
        let data = nodes[i].data;
        if(data && Array.isArray(data)) {
            for(let t of data) {
                // 색상 정보가 있는 위치 탐색 (color, facecolor, marker.color 등)
                let colorInfo = t.color || (t.marker && t.marker.color) || t.facecolor || "";
                
                // 타입이 mesh3d이고, 색상이 rgb(136,8,8)인 타겟 영역 식별
                if(t.type === 'mesh3d' && typeof colorInfo === 'string' && colorInfo.replace(/\s/g, '').includes('rgb(136,8,8)')) {
                    targetTrace = t;
                    break;
                }
            }
            if(targetTrace) break;
        }
    }
    
    if(!targetTrace) return alert("빨간색 타겟 영역(Cerebrum) 데이터를 찾을 수 없습니다. UI에서 타겟이 선택되었는지 확인해주세요.");

    // 파이썬에서 읽기 편하도록 구조화
    const meshData = {
        x: Array.from(targetTrace.x),
        y: Array.from(targetTrace.y),
        z: Array.from(targetTrace.z),
        i: Array.from(targetTrace.i),
        j: Array.from(targetTrace.j),
        k: Array.from(targetTrace.k)
    };

    // 파일로 강제 다운로드
    const blob = new Blob([JSON.stringify(meshData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "cerebrum_target_mesh.json"; // 헷갈리지 않게 파일명 변경
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log("✅ 빨간색 타겟 영역(Cerebrum) 데이터 다운로드 완료!");
})();