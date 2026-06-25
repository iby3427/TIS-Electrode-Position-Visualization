import urllib.request
import json
import os

print("Allen Brain Atlas 해부학적 계층도(Ontology) 다운로드 중...")
# Allen Institute의 성체 마우스 뇌(ontology_id=1) 전체 구조물 데이터 API
url = "http://api.brain-map.org/api/v2/data/query.json?criteria=model::Structure,rma::criteria,[ontology_id$eq1],rma::options[num_rows$eqall]"

response = urllib.request.urlopen(url)
data = json.loads(response.read())

# 파이썬에서 사용하기 쉽게 {ID: {이름, 약어, 색상}} 형태의 딕셔너리로 변환
ontology_dict = {}
for item in data['msg']:
    ontology_dict[str(item['id'])] = {
        'acronym': item['acronym'],
        'name': item['safe_name'],
        'color': f"#{item['color_hex_triplet']}", # Plotly에서 사용할 수 있게 # 추가
        'parent_id': str(item['parent_structure_id'])
    }

# 로컬에 JSON 파일로 저장
with open('allen_ontology.json', 'w', encoding='utf-8') as f:
    json.dump(ontology_dict, f, ensure_ascii=False, indent=4)

print(f"✅ 총 {len(ontology_dict)}개의 뇌 영역 정보가 'allen_ontology.json'에 저장되었습니다!")