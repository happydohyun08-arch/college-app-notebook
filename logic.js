// 화면과 상관없는 계산만 모은 파일. check.mjs가 이 파일을 검사한다.

const num = (v) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) || n <= 0 ? null : n;
};

/** 내 점수가 학교 합격자 중간 50% 구간의 어디에 있는지. 비교할 자료가 없으면 null. */
function testPosition(st, sc) {
  const pos = (mine, lo, hi) => (mine >= hi ? "above" : mine >= lo ? "mid" : "below");
  // SAT와 ACT를 둘 다 넣었으면 더 좋은 쪽을 쓴다 (학교들도 보통 높은 점수를 본다).
  const rank = { below: 0, mid: 1, above: 2 };
  const got = [];
  if (num(st.sat) && sc.sat25 && sc.sat75) got.push(pos(num(st.sat), sc.sat25, sc.sat75));
  if (num(st.act) && sc.act25 && sc.act75) got.push(pos(num(st.act), sc.act25, sc.act75));
  return got.length ? got.reduce((a, b) => (rank[b] > rank[a] ? b : a)) : null;
}

// 합격률 구간. 학교에 점수 자료가 없으면 같은 구간 학교들의 중앙값으로 추정한다.
const BINS = [0.15, 0.3, 0.5, 0.7, 0.85, 1.01];
const binOf = (r) => BINS.findIndex((b) => r < b);
// ponytail: 합격자 평균 GPA는 공개 자료가 거의 없어(IPEDS에 없음) 합격률 구간별 대략값을 쓴다.
// CDS 평균 GPA가 3곳 미만인 구간에서만 쓰는 대체값. CDS가 모이면 아래 addEstimates가 실제 중앙값을 쓴다.
const GPA_BY_BIN = [3.9, 3.85, 3.75, 3.65, 3.5, 3.4];

/** 점수 자료가 없는 학교에 추정값(est)을 붙인다. 같은 합격률 구간 학교들의 중앙값. 학교 목록을 불러온 뒤 한 번 부른다. */
export function addEstimates(schools) {
  const med = (a) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1] : null);
  const by = BINS.map((_, i) => schools.filter((s) => s.admit_rate != null && binOf(s.admit_rate) === i));
  const table = by.map((list, i) => ({
    sat25: med(list.filter((s) => s.sat25).map((s) => s.sat25)), sat75: med(list.filter((s) => s.sat75).map((s) => s.sat75)),
    act25: med(list.filter((s) => s.act25).map((s) => s.act25)), act75: med(list.filter((s) => s.act75).map((s) => s.act75)),
    // 같은 구간에 CDS로 확인한 평균 GPA(4.0 이하)가 3곳 이상이면 그 중앙값, 아니면 대략값.
    gpa_avg: ((g) => (g.length >= 3 ? med(g) : GPA_BY_BIN[i]))(list.filter((s) => s.gpa_avg).map((s) => s.gpa_avg)),
  }));
  for (const s of schools) if (s.admit_rate != null) s.est = table[binOf(s.admit_rate)];
  return schools;
}

/**
 * Reach / Target / Safety 분류. 참고용 단순 규칙이다.
 * ponytail: 성적과 합격률만 본다. 에세이·활동·전공·지원 시기(ED 등)는 반영하지 않는다.
 */
export function classify(st, sc) {
  // label과 reasons는 i18n.js의 키다. 화면에서 번역한다.
  if (sc.open_admission) return { label: "Safety", reasons: ["r_open"] };
  if (sc.admit_rate == null) return { label: "Unknown", reasons: ["r_no_rate"] };
  // 학교 자료가 없으면 추정값을 쓰고, 그렇게 했다고 이유에 적는다.
  const est = sc.est ?? {};
  let estimated = false;
  const ignoreTests = sc.test_policy === "not_considered";
  let test = ignoreTests ? null : testPosition(st, sc);
  if (!ignoreTests && test == null && (num(st.sat) || num(st.act))) { test = testPosition(st, est); estimated ||= test != null; }
  const gpa = num(st.gpa);
  const avg = sc.gpa_avg || (gpa ? est.gpa_avg : null);
  if (gpa && !sc.gpa_avg && avg) estimated = true;
  const g = gpa && avg ? (gpa >= avg ? "ok" : gpa >= avg - 0.15 ? "near" : "below") : null;
  if (test == null && g == null) return { label: "Unknown", reasons: [ignoreTests ? "r_need_gpa_test_blind" : "r_need_scores"] };

  const reasons = ignoreTests ? ["r_test_blind"] : [];
  if (test) reasons.push(`r_test_${test}`);
  if (g) reasons.push(`r_gpa_${g}`);
  if (estimated) reasons.push("r_estimated");

  if (sc.admit_rate < 0.15) return { label: "Reach", reasons: [...reasons, "r_selective"] };
  if (test === "below" || g === "below") return { label: "Reach", reasons };
  if (sc.admit_rate >= 0.5 && test !== "mid" && g !== "near") return { label: "Safety", reasons };
  return { label: "Target", reasons };
}

/** "2026-11-01" 같은 날짜까지 남은 날. 오늘이면 "D-day", 지났으면 "D+3". */
export function dday(dateStr, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr ?? "");
  if (!m) return "";
  const target = new Date(+m[1], +m[2] - 1, +m[3]);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = Math.round((target - t0) / 86400000);
  return d === 0 ? "D-day" : d > 0 ? `D-${d}` : `D+${-d}`;
}

export const words = (t) => (String(t ?? "").trim() ? String(t).trim().split(/\s+/).length : 0);

/**
 * 단어 수 제한 확인 (AI 없이 코드로). 질문에 "250 words" 같은 숫자가 있으면 그걸 쓰고,
 * 질문도 학교도 없으면 Common App Personal Statement 650단어로 본다.
 */
export function wordCheck({ text, prompt, college }) {
  const m = /(\d{2,4})\s*(?:-\s*)?words?/i.exec(prompt ?? "");
  const limit = m ? Number(m[1]) : !String(prompt ?? "").trim() && !String(college ?? "").trim() ? 650 : null;
  const n = words(text);
  return { n, limit, over: limit != null && n > limit, src: m ? "wc_prompt" : "wc_common" };
}

/** 약관을 바꾸면 날짜를 올린다. 예전 버전에 동의한 사람은 다시 동의해야 한다. */
export const TERMS_VERSION = "2026-11-10";
export const signedUp = (d) => d.ageOk === true && d.consent?.version === TERMS_VERSION;

const PROFILE_KEYS = ["major", "gpa", "sat", "act", "toefl", "ap", "otherTests", "legacy"];
export const MAX_ACTIVITIES = 10;
export const MAX_HONORS = 5;

/** 활동에 쓴 총 시간 추정 = 주당 시간 x 연간 주 수 x 참여 학년 수. */
export function totalHours(a) {
  const bounded = (v, max) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(Number(v), max)) : 0;
  const h = bounded(a?.hours, 168), w = bounded(a?.weeks, 52);
  const g = new Set((Array.isArray(a?.grades) ? a.grades : []).filter((v) => ["9", "10", "11", "12", "PG"].includes(v))).size;
  return Math.round(h * w * Math.max(g, 1));
}

/** 저장된 글이나 가져온 백업 파일을 정해진 모양으로만 받아들인다. 모양이 틀리면 throw. */
export function loadData(raw) {
  const empty = { ageOk: false, consent: null, lang: "", profile: {}, activities: [], honors: [], apps: [], essays: [] };
  if (!raw) return empty;
  const o = JSON.parse(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not a backup file");
  const s = (v, max = 20000) => String(v ?? "").slice(0, max);
  const id = (v) => s(v, 40) || crypto.randomUUID();
  const pick = (v, list) => (Array.isArray(v) ? v.filter((x) => list.includes(x)) : []);
  const profile = {};
  for (const k of PROFILE_KEYS) profile[k] = s(o.profile?.[k]);
  // 예전 버전의 '활동', '수상' 메모는 지우지 않고 '예전 메모'로 옮긴다.
  const old = [o.profile?.activities, o.profile?.awards].filter((x) => String(x ?? "").trim()).join("\n\n");
  if (old && !profile.legacy) profile.legacy = s(old);
  const arr = (a, n = 200) => (Array.isArray(a) ? a.slice(0, n) : []);
  return {
    ageOk: o.ageOk === true,
    consent: o.consent && typeof o.consent === "object" ? { version: s(o.consent.version, 20), at: s(o.consent.at, 40) } : null,
    lang: o.lang === "en" || o.lang === "ko" ? o.lang : "",
    profile,
    activities: arr(o.activities, MAX_ACTIVITIES).map((a) => ({
      id: id(a?.id), type: s(a?.type, 60), position: s(a?.position, 50), org: s(a?.org, 100), desc: s(a?.desc, 150),
      grades: pick(a?.grades, ["9", "10", "11", "12", "PG"]), timing: s(a?.timing, 10),
      hours: s(a?.hours, 4), weeks: s(a?.weeks, 3), college: a?.college === true,
    })),
    honors: arr(o.honors, MAX_HONORS).map((h) => ({
      id: id(h?.id), title: s(h?.title, 100), grades: pick(h?.grades, ["9", "10", "11", "12", "PG"]),
      levels: pick(h?.levels, ["School", "State/Regional", "National", "International"]),
    })),
    apps: arr(o.apps).map((a) => ({
      id: id(a?.id), school: s(a?.school, 200), round: s(a?.round, 20), deadline: s(a?.deadline, 10), status: s(a?.status, 20), note: s(a?.note, 2000),
    })),
    essays: arr(o.essays).map((e) => ({
      id: id(e?.id), title: s(e?.title, 200), college: s(e?.college, 200), prompt: s(e?.prompt, 2000), text: s(e?.text, 8000),
      lastEval: e?.lastEval && typeof e.lastEval === "object" ? e.lastEval : null,
    })),
  };
}

/** AI가 준 순서가 0..n-1을 한 번씩 쓴 올바른 순서인지. */
export const isPermutation = (order, n) =>
  Array.isArray(order) && order.length === n && new Set(order).size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);

// 학부 분야: 확인된 분야만 저장한다. 분야가 없다는 뜻이 아닌 미조사 상태는 별도로 보여 준다.
export const SCHOOL_FIELDS = ["art_design", "engineering", "music", "performing_arts", "film", "architecture", "computing", "science", "business", "humanities"];
export function matchesSchoolField(school, field) {
  if (!field) return true;
  if (field === "unreviewed") return !school.fields?.length;
  return SCHOOL_FIELDS.includes(field) && (school.fields ?? []).includes(field);
}
