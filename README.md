# College App Manager

고등학생용 대학 지원 관리 사이트. 설치할 것 없는 순수 HTML/JS.

| 파일 | 하는 일 |
|---|---|
| `index.html` | 화면 전체 + 개인정보 고지 |
| `app.js` | 화면 동작, 브라우저 저장, 백업, AI 평가 요청 |
| `logic.js` | 계산만 (Reach/Target/Safety 분류, D-day, 백업 파일 검사) |
| `schools.json` | 학교 자료 (출처·연도 포함) |
| `worker/` | AI 평가 서버 (Cloudflare Worker), 채점 기준표 `rubric.md` |
| `check.mjs` | 자가 검사: `node check.mjs` |

## 내 컴퓨터에서 보기
```
cd college-app
python3 -m http.server 8000
```
브라우저에서 http://localhost:8000 열기. (파일을 더블클릭하면 안 열려요. 서버가 필요해요.)

## AI 평가 서버 올리기 (한 번만)
1. Anthropic 콘솔(console.anthropic.com) → Billing → **월 지출 한도**를 먼저 건다 (예: $20).
2. Cloudflare 대시보드 → Workers → **workers.dev 주소 이름(서브도메인) 등록**.
3. 터미널에서 (wrangler는 설치 없이 npx로 실행):
   ```
   cd college-app/worker
   npx wrangler login                      # Cloudflare에 로그인된 브라우저 창에서 허락
   npx wrangler kv namespace create LIMITS # 나온 id를 wrangler.toml의 PUT-KV-ID-HERE에 넣기
   npx wrangler secret put ANTHROPIC_API_KEY   # 키는 여기서 직접 입력 (채팅에 붙여 넣지 말 것)
   ```
4. `wrangler.toml`의 `ALLOWED_ORIGIN`을 내 GitHub Pages 주소로 바꾼다 (예: `https://내아이디.github.io`).
5. `npx wrangler deploy` → 나온 주소를 `app.js`의 `WORKER_URL`에 넣는다.

하루 제한: IP당 10회, 전체 300회 (`worker/index.js` 맨 위에서 바꿈). 에세이 1편 약 $0.02.

## GitHub Pages에 올리기
새 GitHub 저장소에 `college-app` 안의 파일을 올리고 → Settings → Pages → Branch `main` / root.
`worker/` 폴더는 올라가도 되지만 비밀키는 들어 있지 않다 (키는 Cloudflare에만 있음).

## 학교 자료 넣기
`schools.json`의 각 학교에 Common Data Set(CDS)에서 찾은 값을 넣는다.
- `admit_rate`: C1 (합격자 수 ÷ 지원자 수), 예: 0.054
- `sat25`/`sat75`: C9 SAT 총점(Composite) 25th / 75th percentile
- `act25`/`act75`: C9 ACT Composite 25th / 75th
- `gpa_avg`: C12 평균 고교 GPA
- `year`: 예 "CDS 2024-25", `source`: CDS 파일 주소
값을 넣으면 `source`와 `year`도 꼭 넣는다 (`node check.mjs`가 검사함).

## 처음 공개 전에 할 일
- 개인정보 문의처: dlehgus080310@gmail.com (`i18n.js`의 `contact_value`).

## 채점 보정 검사 (calibrate.mjs)
품질을 미리 아는 연습용 에세이 5편(직접 쓴 가짜 글)을 배포된 Worker로 보내 점수가 기대 범위에 드는지 확인합니다.
`worker/rubric.md`를 고치면: `cd worker && npx wrangler deploy` → `cd .. && node calibrate.mjs` (5회 호출, IP당 하루 10회 제한에 포함).
같은 글을 2번씩 보내 점수 흔들림을 보려면 `node calibrate.mjs 2` (10회 호출).

## CDS 조사 현황 (2026-11-11)

전체 2,370개 대학 중 CDS 자료를 반영한 행은 54개입니다. 전체 조사 완료를 뜻하지 않습니다.
이번에는 Columbia, Johns Hopkins, Princeton, Florida, Emory, Tufts, Boston College 7곳의 C1·C9를 갱신했습니다. 평균 GPA는 JHU·Princeton·Florida·Emory에서 확인했습니다. Columbia·Boston College의 C12는 공란이고, Tufts의 GPA는 PDF 폼 재확인 대기입니다.

- `research/cds-evidence-2026-11-11.json`: 변경 전 값, 원문 URL·연도·페이지, 검증한 값.
- `research/cds-followup.json`: 원문 접근/표 확인이 필요한 9개 대학. 접근 실패를 미공개로 판단하지 않습니다.
- `research/data-coverage.json`: 전체 대학의 조사 상태와 빈 항목. `node audit-data.mjs`로 다시 만듭니다.
- `node check.mjs`: 지원자·합격자·등록자 관계, 합격률 계산, 근거 기록 일치 검사.

`gpa_status`는 `reported`(확인), `not_reported`(원문 공란), `review_pending`(재확인 필요)을 구분합니다. 기존 행에 이 상태가 없으면 새 조사에서 확인한 것으로 간주하지 않습니다. GPA 공란은 0이 아니며, `logic.js`의 참고용 추정값은 학교가 발표한 값이 아닙니다. 시험 점수는 C9 총점의 25·75백분위입니다. 등록 학생 자료로, 합격선이 아닙니다.

### UC 입학 정책 및 프로필 보완

UC 9개 캠퍼스는 공식 정책에 따라 `test_policy=not_considered`를 기록하며, 분류 계산에서 실제·추정 SAT/ACT를 모두 제외합니다. 시험 점수만 입력하면 GPA 입력을 안내합니다. GPA 추정값을 사용하는 경우 기존 추정 안내는 유지합니다.

UCLA Fall 2025 및 Berkeley Fall 2026 입학처 프로필도 반영했습니다. Berkeley는 2026년 8월 잠정 집계입니다. 합격자 GPA 중간 50%를 등록자 평균 GPA로 대체하지 않았습니다. 이 두 행은 CDS 확인 수에 포함하지 않습니다. 근거는 `research/admissions-evidence-2026-11-11.json`에 있습니다.
