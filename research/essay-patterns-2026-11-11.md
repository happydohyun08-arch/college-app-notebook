# 대학 에세이 강점·약점 패턴 (2026-11-11 조사)

목적: 모델을 학습시킬 수 없으니, 공개된 합격 에세이와 입학처 해설에서 반복되는 패턴을 `worker/rubric.md`에 옮긴다.
규칙: 합격 에세이 원문은 루브릭·프롬프트·연습 에세이에 복사하지 않는다. 여기에는 패턴 요약과 출처만 적고, 인용은 한 문장 이하로 한다.

## 읽은 자료 (모두 대학·Common App 공식 페이지)

| 출처 | 내용 | 시기 | AI 이전? |
|---|---|---|---|
| Hamilton College, Essays that Worked 2003 / 2008 / 2014 / 2022 — https://www.hamilton.edu/admission/apply/college-essays-that-worked | 합격생 에세이 묶음 (약 21,000단어, 30편 안팎) | 2003–2022 | 2003·2008·2014는 확실히 이전 |
| Hamilton, Tips for a Good College Essay — https://www.hamilton.edu/admission/apply/college-essays-that-worked/tips-for-a-good-college-essay | 입학처 팁 | 현재 | – |
| Connecticut College, Essays that Worked — https://www.conncoll.edu/admission/apply/essays-that-worked/ (개별 9편) | Class of '25 2편(2020년 가을 지원), '28 7편(2023년 지원) | 2020–2023 | '25는 이전 |
| Tufts, Essays that Worked (Class of '19) — https://admissions.tufts.edu/blogs/inside-admissions/post/essays-that-worked/ | 합격 에세이 + 사정관 영상 | 2015 | 이전 |
| Tufts, Supplements Revisited (Class of '21·'22 5명) — 예: https://admissions.tufts.edu/blogs/inside-admissions/post/supplements-revisited-jheanelle-owens-21/ , …-hasan-khan-22/ , …-ainsley-ball-21/ , …-isabel-davis-22/ , …-john-mattson-22/ | 사정관이 "잘된 점 / 더 나을 수 있던 점"을 적은 해설 | 2017–2018 | 이전 |
| Tufts, Showing Instead of Telling — https://admissions.tufts.edu/blogs/inside-admissions/post/showing-instead-of-telling/ | 사정관이 한 에세이가 왜 통했는지 해설 | 2010년대 | 이전 |
| Tufts, Essay Advice from an English Major — https://admissions.tufts.edu/blogs/inside-admissions/post/essay-advice-from-an-english-major | 사정관 조언 | 2010년대 | 이전 |
| Johns Hopkins, Essays That Worked (Class of 2025 해설 6편, Wayback 2021-11 사본) — https://web.archive.org/web/20211101/https://apply.jhu.edu/college-planning-guide/essays-that-worked/ | 입학위원회가 각 에세이에 단 해설 | 2020 지원 | 이전 |
| Johns Hopkins 현재 목록 — https://apply.jhu.edu/hopkins-insider/application-section/essays-that-worked/ | 제목 목록 (본문은 403으로 직접 못 받음) | 현재 | – |
| MIT Admissions, Essays/activities/academics — https://mitadmissions.org/apply/firstyear/essays-activities-academics/ | 2026–27 질문(100–200단어, 40–50단어 짧은 답)과 원칙 | 2026 | – |
| Common App, 2026–2027 essay prompts 발표 — https://www.commonapp.org/blog/announcing-2026-2027-common-app-essay-prompts | 7개 질문 유지, 650단어 | 2026 | – |
| University of Cincinnati 입학 블로그 — https://www.uc.edu/blog/2026/05/n21407994.html | 같은 "Why us" 문단 재사용, 다른 학교 이름 남기기를 실수로 꼽음 (검색 요약으로만 확인, 본문은 열지 않음) | 2026 | – |

AI 이전(2022년 11월 이전) 자료가 대부분이다. 최근 자료와 패턴이 다르지 않았다(아래 "시기별 차이").

## 간단한 측정 (내가 계산, 원문은 저장소에 두지 않음)
같은 정규식으로 세었다. 1,000단어당 횟수.
- 성격 형용사·상투 문구("passionate", "hardworking", "dedicated", "make a difference", "ever since I was" 등): Hamilton 4개 연도 0.0–0.7, Conn 9편 0–5.1 (대부분 0–2.6), Tufts '19 0. 우리 `calibrate.mjs`의 약한 가짜 글은 96.8. → 합격 글은 성격을 형용사로 말하지 않는다.
- 숫자·수량 표현: Hamilton 7.6–8.8, Conn 5–24, Tufts 13. → 거의 모든 글이 시간·횟수·장소 같은 확인 가능한 사실을 둔다.
- 대화(따옴표 속 말): Hamilton 연도별 4.4–6.2, Conn은 9편 중 3편만. → 대화는 흔하지만 필수는 아니다.
- 평균 문장 길이 14–25단어. 짧은 문장과 긴 문장을 섞는다.

## 반복되는 강점 패턴
1. **작은 일상 소재로 큰 성격을 보여 준다.** JHU 해설: 학생들이 "stories from their everyday lives"로 성격과 가치관을 드러냈다. Conn: "life-changing, earth-shattering" 경험이 필요 없다. Hamilton: 가장 단순한 주제가 가장 좋은 글이 되기도 한다. (뜨개질, 미니골프, 보드게임, 요리 같은 소재가 반복.)
2. **장면으로 시작한다.** 읽은 글 다수가 특정 순간·행동·소리로 첫 문장을 연다. 요약문("나는 ~한 사람이다")으로 여는 글은 드물다. Hamilton 팁: 강한 첫 문장으로 주의를 끈다.
3. **보여 주기, 말하지 않기.** Tufts 해설: 그 학생은 자신이 재미있다고 말한 적이 없고 보여 줬다. JHU(Queen's Gambit): 호기심을 "showing more than telling"으로 전달.
4. **경험 묘사보다 배운 것에 비중.** JHU: 경기 전체를 시간순으로 재연하지 않고 배운 것에 집중한 점을 칭찬. Tufts: 개념 목록이 아니라 생각이 특정 경험을 거쳐 어떻게 바뀌었는지 보여 준 점을 칭찬.
5. **한 소재를 다른 삶의 영역으로 잇는다.** JHU 해설 6편 중 4편이 "취미/경험 → 다른 영역(학업·저널리즘·미래)으로 연결"을 강점으로 꼽음.
6. **중요한 타인을 쓰되 주인공은 학생.** JHU(Red Over Black): 할머니가 나와도 초점이 학생이 그 순간 무엇을 배웠는지에 있다.
7. **목소리.** Tufts 영어 전공 사정관: 좋은 글을 한 단어로 하면 "authentic", 주제와 상관없이 목소리가 들린다. Hamilton: 실질과 목소리가 완벽함보다 낫다. MIT: 글쓰기 시험이 아니다.
8. **하나의 요점.** Tufts: 15가지 생각을 넣지 않고 하나를 밀고 나갔다. 한두 가지 요점을 스스로 물어보라.
9. **결말의 회귀.** Hamilton 2014 글처럼 처음의 장치·이미지가 마지막에 바뀐 의미로 돌아오는 구조가 여러 편에서 반복된다.
10. **Why us는 하나의 구체적 디테일을 깊게.** Tufts 해설 3건: 여러 장점을 나열하지 않고 학생이 가장 연결된 한 가지에 집중해 구체적인 예를 들었다. 학교의 "vibe"를 보여 주는 단일 디테일을 고른 점을 칭찬.

## 반복되는 약점 패턴 (해설이 "더 나을 수 있던 점"으로 지적)
1. **Google로 찾을 수 있는 목록형 Why us.** Tufts: 개인 연결 없는 "Google-able list". UC 블로그: 같은 문단 재사용, 다른 학교 이름.
2. **늦게 본론에 들어감.** Tufts(Ainsley): 본론을 더 일찍 시작하고 배경 문단을 줄였어야 한다.
3. **깊이 부족.** Tufts(Jheanelle): 공동체 질문에서 그 환경이 학생의 가치관을 어떻게 바꿨는지 더 들어갔어야 한다; 보여 주기로 답했으면 더 완전한 그림이 됐을 것.
4. **리듬 단조로움.** Tufts(Ainsley): 짧고 힘 있는 문장 몇 개가 독자에게 멈출 틈을 줬을 것.
5. **사정관이 원하는 답 맞히기.** MIT: "look best"를 계산하면 잘못하는 것. Hamilton: 우리가 원한다고 생각하는 사람이 되려 하지 말라.
6. **사전 단어, 연구 논문 말투, 과한 편집.** Hamilton: 사전(thesaurus)을 쓰고 싶은 충동을 참고, 너무 고쳐서 연구 논문처럼 만들지 말라. 어른(부모) 목소리는 티가 난다.
7. **타인이 주인공.** JHU: 중요한 사람을 쓸 때의 위험은 글이 지원자 이야기가 아니게 되는 것.
8. **경기·사건 재연.** JHU: 시간순 재연(blow-by-blow)보다 배운 것.
9. **과한 공유·지나친 가벼움.** Hamilton: 개인적이어도 되지만 지나치게 가볍거나 과하게 공유하지 말 것.

## 유형별로 본 것
- personal: 위 1–9 강점이 그대로 적용.
- why_us: 단일 디테일 + 학생의 경험 연결(Tufts 3건), 목록·명성 칭찬은 약점(Tufts, UC).
- community: 공동체 설명보다 그 공동체가 학생의 가치관을 어떻게 바꿨는지, 캠퍼스에 무엇을 가져올지(Tufts Jheanelle 해설).
- activity / why_major: 특정 경험을 거쳐 관심이 어떻게 변했는지(Tufts 수학 에세이 해설), MIT 질문은 "무엇이 이 관심으로 이끌었는지 돌아보라".
- short_answer: MIT 40–50단어 / 100–200단어. 짧은 답도 구체적 하나 + 목소리. Tufts는 하이쿠처럼 형식을 쓴 짧은 답도 목소리로 칭찬.

## 시기별 차이
AI 이전(2003–2021)과 이후(2023–2024) 합격 글 모두 같은 패턴: 일상 소재, 장면 시작, 형용사 대신 행동. 측정치(성격 형용사 0–3/1,000단어, 숫자 5–24/1,000단어)도 겹친다. 시기가 판정 기준을 바꿀 근거는 없었다.

## 한계
- 공개된 글은 입학처가 고른 성공 사례다. 떨어진 글 자료는 공식적으로 공개되지 않아 약점 패턴은 해설과 팁에서만 왔다.
- JHU 개별 에세이 본문은 403으로 못 받았고, 2021년 Wayback 사본의 해설 요약만 읽었다.
- 측정은 단순 정규식이며 페이지 내비게이션 글자가 조금 섞였다. 방향 확인용이지 기준값이 아니다.
