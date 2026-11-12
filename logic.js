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
/** 에세이 종류: 저장된 값이 없으면 예전 규칙(질문과 학교가 모두 비면 Personal Statement). */
export const ESSAY_KINDS = ["ps", "supplement"];
export const essayKind = (e) =>
  ESSAY_KINDS.includes(e?.kind) ? e.kind : !String(e?.prompt ?? "").trim() && !String(e?.college ?? "").trim() ? "ps" : "supplement";

/** PS는 Common App 650단어 제한. Supplement는 질문에 'N words'가 있어도 제한하지 않고 단어 수만 센다. */
export function wordCheck(e) {
  const limit = essayKind(e) === "ps" ? 650 : null;
  const n = words(e?.text);
  return { n, limit, over: limit != null && n > limit, src: "wc_common" };
}

// 지원 서류 체크리스트. opt = 학교에 따라 필요 없을 수 있음(화면에 '선택'으로 표시).
export const CHECK_ITEMS = [
  { k: "form" }, { k: "fee" }, { k: "transcript" }, { k: "counselor" }, { k: "teacher1" }, { k: "teacher2" },
  { k: "tests", opt: true }, { k: "english" }, { k: "aid", opt: true },
];
export const CHECK_STATES = ["todo", "done", "na"]; // 할 일 / 완료 / 해당 없음
const freshChecks = (v = "todo") => Object.fromEntries(CHECK_ITEMS.map(({ k }) => [k, v]));
export const STATUSES = ["prep", "submitted", "waiting", "admitted", "denied", "waitlist"];
const OLD_STATUS = { "준비 중": "prep", "제출 완료": "submitted", "결과 대기": "waiting", 합격: "admitted", 불합격: "denied", 대기자: "waitlist" };
/**
 * 예전 저장본을 지금 모양으로. 한글 상태값 → 코드, 체크리스트가 없던 학교는 새로 만든다.
 * 이미 제출한(상태가 '준비 중'이 아닌) 학교는 서류를 다 낸 것으로 본다.
 */
export function migrateApp(a) {
  a.status = OLD_STATUS[a.status] ?? (STATUSES.includes(a.status) ? a.status : "prep");
  const c = a.checks && typeof a.checks === "object" && !Array.isArray(a.checks) ? a.checks : null;
  a.checks = c ? Object.fromEntries(CHECK_ITEMS.map(({ k }) => [k, CHECK_STATES.includes(c[k]) ? c[k] : "todo"])) : freshChecks(a.status === "prep" ? "todo" : "done");
  return a;
}

export const newApp = (school = "") => ({ id: crypto.randomUUID(), school, round: "RD", deadline: "", status: "prep", note: "", checks: freshChecks() });
export const schoolKey = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
/** 지원 목록에 학교가 없을 때만 추가한다 (대소문자·공백 무시). 추가했으면 true. */
export function addAppOnce(apps, school) {
  const key = schoolKey;
  const name = String(school ?? "").trim().replace(/\s+/g, " ");
  if (!name || apps.some((a) => key(a.school) === key(name))) return false;
  apps.push(newApp(name));
  return true;
}

/**
 * 학교 하나의 준비 현황. 보충 에세이는 따로 입력받지 않고 에세이 탭에서 학교 이름이 같은 Supplement를 센다.
 * 서류 중 '해당 없음'은 빼고, 보충 에세이는 '완료' 표시한 것만 끝난 것으로 본다.
 */
export function appProgress(app, essays) {
  const supps = (essays ?? []).filter((e) => essayKind(e) === "supplement" && schoolKey(e.college) && schoolKey(e.college) === schoolKey(app.school));
  const items = CHECK_ITEMS.filter(({ k }) => app.checks?.[k] !== "na").map(({ k }) => k);
  const missing = items.filter((k) => app.checks?.[k] !== "done");
  const suppLeft = supps.filter((e) => !e.done);
  const total = items.length + supps.length;
  const done = total - missing.length - suppLeft.length;
  return { done, total, missing, supps, suppLeft, ready: done === total };
}
/** 전체 요약: 서류와 보충 에세이가 모두 끝난 학교 수. */
export const readyCount = (apps, essays) => ({ ready: apps.filter((a) => appProgress(a, essays).ready).length, total: apps.length });

/** 약관을 바꾸면 날짜를 올린다. 예전 버전에 동의한 사람은 다시 동의해야 한다. */
export const TERMS_VERSION = "2026-11-11.2"; // 2026-11-11: AI는 Google 로그인, 계정 해시로 횟수 셈. .2: 카운슬러 공유
export const signedUp = (d) => d.ageOk === true && d.consent?.version === TERMS_VERSION;

// ---------- 역할 (학생 / 카운슬러) ----------
// 역할은 내 자료(data.role)에 저장돼 드라이브 동기화로 같이 옮겨진다. 값이 없거나 틀리면 학생이다.
export const ROLES = ["student", "counselor"];
// 'Google로 ○○ 로그인'을 눌렀을 때 거칠 단계. 동의는 아직 안 했을 때만, 이미 로그인했으면 Google 창은 건너뛴다.
export const signinSteps = ({ signedUp, signedIn }) => [...(signedUp ? [] : ["consent"]), ...(signedIn ? [] : ["google"]), "sync", "open"];
// 드라이브를 불러온 뒤 열 역할: 이번에 누른 역할. 안 눌렀으면(자동 로그인) 저장된 역할 그대로.
export const roleAfterSignin = (picked, d) => (ROLES.includes(picked) ? picked : roleOf(d));
export const roleOf = (d) => (d?.role === "counselor" ? "counselor" : "student");
const COUNSELOR_TABS = ["class", "about", "backup"]; // 카운슬러는 학생용 탭(내 정보·활동·학교·지원 목록·에세이)을 안 본다
export const tabVisible = (role, tab) => role !== "counselor" || COUNSELOR_TABS.includes(tab);
/** 가입 직후·역할을 바꾼 뒤 처음 여는 탭. */
export const homeTab = (role) => (role === "counselor" ? "class" : "profile");
// 로그아웃 창의 드라이브 상태: 올리다 실패 / 드라이브와 같음 / 이 기기에만 있음
export const outSaveState = ({ savedAt = "", syncedAt = "", err = "" }) => (err ? "failed" : savedAt && savedAt === syncedAt ? "saved" : "local");

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
  const empty = { ageOk: false, consent: null, lang: "", role: "student", savedAt: "", profile: {}, activities: [], honors: [], apps: [], essays: [] };
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
    role: roleOf(o),
    savedAt: s(o.savedAt, 40),
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
      ...(a?.checks && typeof a.checks === "object" && !Array.isArray(a.checks) ? { checks: Object.fromEntries(CHECK_ITEMS.map(({ k }) => [k, s(a.checks[k], 4)])) } : {}),
    })).map(migrateApp),
    essays: arr(o.essays).map((e) => ({
      id: id(e?.id), kind: ESSAY_KINDS.includes(e?.kind) ? e.kind : "", title: s(e?.title, 200), college: s(e?.college, 200), prompt: s(e?.prompt, 2000), text: s(e?.text, 8000), done: e?.done === true,
      lastEval: e?.lastEval && typeof e.lastEval === "object" && !Array.isArray(e.lastEval) ? { ...e.lastEval, tr: cleanTr(e.lastEval.tr) } : null,
    })),
  };
}

// ---------- 드라이브 동기화 결정 ----------
// 학생이 쓴 내용만 비교한다 (동의·언어·저장 시각은 빼고).
// 역할도 비교한다: 카운슬러는 학생 자료가 비어 있어도 역할만은 드라이브에 올라가야 다른 기기에서 이어진다.
const content = (d) => JSON.stringify([d.profile, d.activities, d.honors, d.apps, d.essays, roleOf(d)]);
export const isEmptyData = (d) =>
  roleOf(d) === "student" && !d.activities.length && !d.honors.length && !d.apps.length && !d.essays.length && !Object.values(d.profile).some((v) => String(v ?? "").trim());
/**
 * 로그인해서 드라이브에 연결됐을 때 무엇을 할지. 절대 묻지 않고 덮어쓰지 않는다.
 * local/drive = loadData 결과 (drive는 백업이 없으면 null)
 * localSub = 이 브라우저 자료를 마지막으로 맞춘 Google 계정, sub = 지금 로그인한 계정
 * syncedAt = 마지막으로 맞췄을 때의 savedAt (그 뒤로 이 기기에서 안 고쳤으면 local.savedAt과 같다)
 * 결과: "switch" 다른 계정 → 물어본다 | "none" 둘 다 빔 | "upload" | "load" | "same" | "ask" 둘 다 있고 다름 → 물어본다
 */
export function syncPlan({ local, drive, localSub = "", sub, syncedAt = "" }) {
  if (localSub && localSub !== sub && !isEmptyData(local)) return "switch";
  const mine = localSub === sub; // 이 계정과 맞춘 적이 있다
  if (!drive || isEmptyData(drive)) return isEmptyData(local) ? "none" : "upload";
  if (content(local) === content(drive)) return "same";
  if (isEmptyData({ ...local, role: "student" })) return "load"; // 역할만 고른 새 기기: 드라이브 자료를 덮어쓰지 않고 불러온다
  if (mine && syncedAt && local.savedAt === syncedAt) return "load"; // 이 기기는 그대로, 다른 기기에서 고쳤다
  if (mine && syncedAt && drive.savedAt === syncedAt) return "upload"; // 드라이브는 그대로, 이 기기에서 고쳤다
  return "ask";
}

// AI 결과의 두 언어 글(tr = {ko:{…}, en:{…}}). 모양이 틀린 쪽은 버린다. 예전(한 언어) 결과는 tr이 없다.
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
function cleanTr(tr) {
  const out = {};
  for (const l of ["ko", "en"]) if (obj(obj(tr)?.[l])) out[l] = tr[l];
  return Object.keys(out).length ? out : undefined;
}
const pickStr = (v, d) => (typeof v === "string" && v.trim() ? v : d);
const arrOf = (v) => (Array.isArray(v) ? v : []);
/** 에세이 평가를 화면 언어로. 그 언어 글이 없으면 저장된(요청 때 언어) 글을 그대로 쓴다. 인용은 바꾸지 않는다. */
export function localizeEval(ev, lang) {
  const x = obj(obj(ev?.tr)?.[lang]);
  if (!x) return ev;
  return {
    ...ev,
    summary: pickStr(x.summary, ev.summary),
    criteria: arrOf(ev.criteria).map((c, i) => ({ ...c, why: pickStr(arrOf(x.criteria)[i]?.why, c?.why), fix: pickStr(arrOf(x.criteria)[i]?.fix, c?.fix) })),
    prompt_parts: arrOf(ev.prompt_parts).map((p, i) => ({ ...p, part: pickStr(arrOf(x.prompt_parts)[i], p?.part) })),
    line_notes: arrOf(ev.line_notes).map((n, i) => ({ ...n, issue: pickStr(arrOf(x.line_notes)[i]?.issue, n?.issue), direction: pickStr(arrOf(x.line_notes)[i]?.direction, n?.direction) })),
  };
}
/** 순서 추천 결과를 화면 언어로. 순서(번호)는 그대로, 글만 바꾼다. */
export function localizeOrder(out, lang) {
  const x = obj(obj(out?.tr)?.[lang]);
  if (!x) return out;
  return { ...out, summary: pickStr(x.summary, out.summary), notes: arrOf(out.notes).map((n, i) => ({ ...n, why: pickStr(arrOf(x.notes)[i], n?.why) })) };
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

// ---------- 카운슬러와 공유하는 사본 ----------
// 학생 드라이브에 두고 카운슬러에게 읽기 전용으로 공유하는 파일의 내용. 동의 화면에 적은 것만 넣는다:
// 지원 학교 목록, 준비 체크리스트, 에세이(본문·완료 표시), AI 점수. 성적·활동·수상·AI 글 설명은 넣지 않는다.
export const SHARE_KIND = "college-app-share";
export function buildSnapshot(d, student, now = new Date()) {
  return {
    kind: SHARE_KIND, v: 1, student: String(student ?? ""), updatedAt: now.toISOString(),
    apps: d.apps.map((a) => {
      const p = appProgress(a, d.essays);
      return { school: a.school, round: a.round, deadline: a.deadline, status: a.status, checks: { ...a.checks }, done: p.done, total: p.total };
    }),
    essays: d.essays.map((e) => ({
      title: e.title, kind: essayKind(e), college: e.college, prompt: e.prompt, text: e.text, done: e.done === true, words: words(e.text),
      ai: e.lastEval && Number.isFinite(e.lastEval.total)
        ? { total: e.lastEval.total, criteria: arrOf(e.lastEval.criteria).map((c) => ({ name: String(c?.name ?? ""), score: Number(c?.score) || 0 })) }
        : null,
    })),
  };
}
/** 카운슬러 화면이 받은 사본을 정해진 모양으로만 받는다 (학생 드라이브의 파일이라 믿지 않는다). 틀리면 throw. */
export function parseSnapshot(raw) {
  const o = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (o?.kind !== SHARE_KIND) throw new Error("not a shared college-app file");
  const s = (v, max) => String(v ?? "").slice(0, max);
  const arr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  return {
    student: s(o.student, 254), updatedAt: s(o.updatedAt, 40),
    apps: arr(o.apps, 200).map((a) => {
      const total = Math.max(0, Math.min(Number(a?.total) || 0, 999));
      return {
        school: s(a?.school, 200), round: s(a?.round, 20), deadline: s(a?.deadline, 10), status: STATUSES.includes(a?.status) ? a.status : "prep",
        checks: Object.fromEntries(CHECK_ITEMS.map(({ k }) => [k, CHECK_STATES.includes(a?.checks?.[k]) ? a.checks[k] : "todo"])),
        total, done: Math.max(0, Math.min(Number(a?.done) || 0, total)),
      };
    }),
    essays: arr(o.essays, 200).map((e) => ({
      title: s(e?.title, 200), kind: ESSAY_KINDS.includes(e?.kind) ? e.kind : "supplement", college: s(e?.college, 200), prompt: s(e?.prompt, 2000),
      text: s(e?.text, 8000), done: e?.done === true, words: words(s(e?.text, 8000)),
      ai: obj(e?.ai) && Number.isFinite(e.ai.total)
        ? { total: Math.max(0, Math.min(Math.round(e.ai.total), 100)), criteria: arr(e.ai.criteria, 5).map((c) => ({ name: s(c?.name, 40), score: Math.max(0, Math.min(Number(c?.score) || 0, 20)) })) }
        : null,
    })),
  };
}
