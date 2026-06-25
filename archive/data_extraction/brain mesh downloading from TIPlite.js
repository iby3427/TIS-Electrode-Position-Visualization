(function downloadBrainMesh() {
    const nodes = document.querySelectorAll('*');
    let brainTrace = null;
    
    // 수만 개의 점을 가진 mesh3d 데이터(뇌 메쉬)를 찾음
    for(let i=0; i<nodes.length; i++) {
        let data = nodes[i].data;
        if(data && Array.isArray(data)) {
            for(let t of data) {
                if(t.type === 'mesh3d' && t.x && t.x.length > 50000) {
                    brainTrace = t;
                    break;
                }
            }
            if(brainTrace) break;
        }
    }
    
    if(!brainTrace) return alert("뇌 메쉬 데이터를 찾을 수 없습니다.");

    // 파이썬에서 읽기 편하도록 구조화
    const meshData = {
        x: Array.from(brainTrace.x),
        y: Array.from(brainTrace.y),
        z: Array.from(brainTrace.z),
        i: Array.from(brainTrace.i),
        j: Array.from(brainTrace.j),
        k: Array.from(brainTrace.k)
    };

    const blob = new Blob([JSON.stringify(meshData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "brain_mesh.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log("✅ 뇌 메쉬 데이터(brain_mesh.json) 다운로드 완료!");
})();