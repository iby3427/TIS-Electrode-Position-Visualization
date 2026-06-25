(function extractAndDownloadAdvancedV3() {
    // 1. UI 표(Table)에서 전극 설정값 정밀 추출
    let setup = { 'E1+': '알수없음', 'E1-': '알수없음', 'E2+': '알수없음', 'E2-': '알수없음' };
    
    // 연구원님이 찾으신 'table.dataframe' 안의 내용물을 뒤집니다.
    const rows = document.querySelectorAll('table.dataframe tbody tr');
    
    rows.forEach(row => {
        const th = row.querySelector('th'); // E1, E2가 적힌 헤더
        const tds = row.querySelectorAll('td'); // F1, P1 등이 적힌 셀들
        
        if (th && tds.length >= 2) {
            const chName = th.innerText.trim();
            if (chName === 'E1') {
                setup['E1+'] = tds[0].innerText.trim();
                setup['E1-'] = tds[1].innerText.trim();
            } else if (chName === 'E2') {
                setup['E2+'] = tds[0].innerText.trim();
                setup['E2-'] = tds[1].innerText.trim();
            }
        }
    });

    // 팝업창에 추출된 결과를 띄워줍니다.
    const userConfirm = prompt(
        "데이터프레임(표)에서 추출한 전극 세팅입니다. 맞으면 [확인], 틀리면 수정해주세요.\n(입력 형식: E1+,E1-,E2+,E2-)", 
        `${setup['E1+']},${setup['E1-']},${setup['E2+']},${setup['E2-']}`
    );

    if(userConfirm) {
        const split = userConfirm.split(',');
        if(split.length === 4) {
            setup['E1+'] = split[0].trim();
            setup['E1-'] = split[1].trim();
            setup['E2+'] = split[2].trim();
            setup['E2-'] = split[3].trim();
        }
    } else {
        console.log("추출이 취소되었습니다.");
        return;
    }

    // 2. Plotly 데이터 추출 및 중심점 계산
    const nodes = document.querySelectorAll('*');
    const timestamp = new Date().toLocaleString('ko-KR');
    let results = `=== TIP-lite 정밀 좌표 추출 결과 (Method A 적용 준비완료) ===\n`;
    results += `추출 일시: ${timestamp}\n`;
    results += `======================================================\n`;
    results += `[적용된 전극 세팅]\n`;
    results += ` ▶ CH 1: E1+ (${setup['E1+']})  /  E1- (${setup['E1-']})\n`;
    results += ` ▶ CH 2: E2+ (${setup['E2+']})  /  E2- (${setup['E2-']})\n`;
    results += `======================================================\n\n`;
    
    let graphCount = 0;

    for(let i = 0; i < nodes.length; i++) {
        let data = nodes[i].data;
        if(data && Array.isArray(data) && data.length > 0) {
            graphCount++;
            results += `\n[그래프 #${graphCount} 발견] (내부 파츠 개수: ${data.length})\n`;
            results += `-------------------------------------------------\n`;

            data.forEach((trace, idx) => {
                let colorInfo = trace.color || (trace.marker && trace.marker.color) || '색상정보없음';
                
                let tag = "";
                if (data.length >= 6) {
                    if (idx === 2) tag = `⭐ E1+ 전극 (${setup['E1+']})`;
                    else if (idx === 3) tag = `⭐ E1- 전극 (${setup['E1-']})`;
                    else if (idx === 4) tag = `⭐ E2+ 전극 (${setup['E2+']})`;
                    else if (idx === 5) tag = `⭐ E2- 전극 (${setup['E2-']})`;
                    else if (idx === 6) tag = `🎯 타겟 영역 (Target Mask)`;
                    else if (idx === 1) tag = `🧠 뇌/두개골 메쉬 볼륨`;
                    else if (idx === 0) tag = `⚡ 간섭장(Interference Envelope) 핫스팟`;
                }

                results += `  ▶ 파츠 [${idx}] ${tag ? ' - ' + tag : ''}\n`;
                results += `     - 타입: ${trace.type}, 색상: ${colorInfo}\n`;

                if (trace.x && trace.y && trace.z && trace.x.length > 0) {
                    let xArr = Array.from(trace.x);
                    let yArr = Array.from(trace.y);
                    let zArr = Array.from(trace.z);

                    let cx = xArr.reduce((a, b) => a + b) / xArr.length;
                    let cy = yArr.reduce((a, b) => a + b) / yArr.length;
                    let cz = zArr.reduce((a, b) => a + b) / zArr.length;

                    results += `     - 점 개수: ${xArr.length} 개\n`;
                    results += `     - Voxel 중심 좌표: X = ${cx.toFixed(3)}, Y = ${cy.toFixed(3)}, Z = ${cz.toFixed(3)}\n\n`;
                } else {
                    results += `     - (좌표 데이터 없음)\n\n`;
                }
            });
        }
    }

    if(graphCount === 0) {
        alert("Plotly 데이터를 찾을 수 없습니다.");
        return;
    }

    // 3. 동적 이름으로 파일 자동 다운로드
    const fileName = `TIP_lite_Coords_[${setup['E1+']}_${setup['E1-']}_${setup['E2+']}_${setup['E2-']}].txt`;
    const blob = new Blob([results], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`✅ 성공! [${fileName}] 파일이 다운로드되었습니다.`);
})();