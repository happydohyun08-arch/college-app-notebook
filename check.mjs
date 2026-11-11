// 자가 검사: node check.mjs  (설치할 것 없음)
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { classify, dday, loadData, wordCheck, totalHours, isPermutation } from "./logic.js";
import { STR } from "./i18n.js";

// Worker는 rubric.md를 글자로 불러온다. Node에서도 같게 흉내 낸다.
registerHooks({
  load(url, ctx, next) {
    if (!url.endsWith(".md")) return next(url, ctx);
    return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(fs.readFileSync(new URL(url), "utf8"))};` };
  },
});
const { parseEval, parseOrder, buildOrderUser, CRITERIA, ESSAY_TYPES, RED_FLAGS, essaySystem, orderSystem, buildUser } = await import("./worker/index.js");
const SYSTEM = essaySystem("ko");

// 분류
const sc = { admit_rate: 0.6, sat25: 1200, sat75: 1400, act25: 26, act75: 32, gpa_avg: 3.7 };
assert.equal(classify({ sat: "1450", gpa: "3.9" }, sc).label, "Safety");
assert.equal(classify({ sat: "1300", gpa: "3.9" }, sc).label, "Target");
assert.equal(classify({ sat: "1100", gpa: "3.9" }, sc).label, "Reach");
assert.equal(classify({ act: "33" }, sc).label, "Safety", "ACT only works");
assert.equal(classify({ sat: "1600", gpa: "4.0" }, { ...sc, admit_rate: 0.05 }).label, "Reach", "very selective is always Reach");
assert.equal(classify({}, sc).label, "Unknown");
assert.equal(classify({}, { open_admission: true, admit_rate: null }).label, "Safety", "open admission");
assert.equal(classify({ sat: "1500" }, { ...sc, admit_rate: null }).label, "Unknown");
for (const k of [...classify({ sat: "1600", gpa: "4.0" }, { ...sc, admit_rate: 0.05 }).reasons, "Unknown", "Reach", "Target", "Safety"]) assert.ok(STR.ko[k] && STR.en[k], `i18n key ${k}`);
assert.equal(classify({ sat: "1500", gpa: "3.6" }, sc).label, "Target", "GPA slightly under avg is not Safety");

// D-day
const today = new Date(2026, 10, 10);
assert.equal(dday("2026-11-10", today), "D-day");
assert.equal(dday("2026-11-15", today), "D-5");
assert.equal(dday("2026-11-01", today), "D+9");
assert.equal(dday("", today), "");

// 가져오기 파일 검사
assert.throws(() => loadData("[1,2]"));
const d = loadData(JSON.stringify({ ageOk: true, profile: { sat: 1500, evil: "x" }, essays: [{ text: "a".repeat(9000) }] }));
assert.equal(d.profile.sat, "1500");
assert.ok(!("evil" in d.profile));
assert.equal(d.essays[0].text.length, 8000);

// AI 응답 검증
const essay = "On a rainy Tuesday I rebuilt the broken radio for the third time. It finally worked.";
const good = {
  summary: "좋아요.",
  injection_flags: [],
  criteria: CRITERIA.map((name) => ({ name, score: 15, quote: "rebuilt the broken radio", why: "구체적", fix: "결말을 넓혀 보세요." })),
};
const r = parseEval("noise " + JSON.stringify(good) + " noise", essay);
assert.equal(r.total, 75);
assert.ok(r.criteria.every((c) => c.quote_found));
const fake = { ...good, criteria: good.criteria.map((c, i) => (i ? c : { ...c, quote: "I won a Nobel prize" })) };
assert.equal(parseEval(JSON.stringify(fake), essay).criteria[0].quote_found, false, "made-up quote is flagged");
assert.throws(() => parseEval(JSON.stringify({ ...good, criteria: good.criteria.slice(1) }), essay), /missing/);
const bad = { ...good, criteria: good.criteria.map((c, i) => (i ? c : { ...c, score: 21 })) };
assert.throws(() => parseEval(JSON.stringify(bad), essay), /0-20/);
const rewrite = { ...good, criteria: good.criteria.map((c, i) => (i ? c : { ...c, fix: "x".repeat(401) })) };
assert.throws(() => parseEval(JSON.stringify(rewrite), essay), /too long/);

// 질문에 답하지 않은 부분이 있으면 질문 적합성은 최대 10점
const unanswered = { ...good, prompt_parts: [{ part: "왜 이 학교?", answered: true }, { part: "무엇을 공부?", answered: false }] };
const u = parseEval(JSON.stringify(unanswered), essay);
assert.equal(u.criteria[0].score, 10);
assert.equal(u.total, 70);
assert.equal(u.prompt_parts.length, 2);
assert.equal(parseEval(JSON.stringify({ ...good, prompt_parts: [{ part: "a", answered: true }] }), essay).criteria[0].score, 15);

// 유형과 경고 신호: 인용이 본문에 있어야 받고, swap_fail/resume_list는 점수 상한
const flagged = parseEval(JSON.stringify({ ...good, essay_type: "why_us", red_flags: [{ code: "swap_fail", quote: "It finally worked." }, { code: "resume_list", quote: "not in essay" }, { code: "made_up", quote: "It finally worked." }] }), essay);
assert.equal(flagged.essay_type, "why_us");
assert.deepEqual(flagged.red_flags.map((f) => f.code), ["swap_fail"], "only real codes with real quotes");
assert.equal(flagged.criteria[0].score, 10);
assert.equal(flagged.criteria[2].score, 15, "resume_list ignored without real quote");
assert.equal(parseEval(JSON.stringify({ ...good, essay_type: "poem" }), essay).essay_type, "other");
for (const k of [...ESSAY_TYPES.map((x) => `et_${x}`), ...RED_FLAGS.map((x) => `rf_${x}`)]) assert.ok(STR.ko[k] && STR.en[k], k);
assert.match(SYSTEM, /에세이 유형별 기준/);

// 단어 수 제한 (코드로 계산)
assert.deepEqual(
  [wordCheck({ text: "a b c", prompt: "Answer in 250 words or fewer.", college: "Yale" }).limit, wordCheck({ text: "a", prompt: "", college: "" }).limit, wordCheck({ text: "a", prompt: "Why us?", college: "Duke" }).limit],
  [250, 650, null],
);
assert.equal(wordCheck({ text: "a b c", prompt: "max 2 words", college: "" }).limit, null, "1-digit numbers are not limits");
assert.equal(wordCheck({ text: "a b c d", prompt: "(150-word limit)", college: "" }).limit, 150);
assert.equal(wordCheck({ text: Array(700).fill("w").join(" "), prompt: "", college: "" }).over, true);

// 프롬프트
assert.match(buildUser({ essay: "one two three", prompt: "", college: "" }), /Word count .*: 3/);
assert.match(SYSTEM, /## 채점 절차/, "scoring procedure is in the system prompt");
assert.match(SYSTEM, /## 질문 적합성/, "rubric is in the system prompt");
assert.match(SYSTEM, /NO GHOSTWRITING/);
assert.ok(buildUser({ essay: "E", prompt: "", college: "" }).includes("<untrusted_essay>\nE\n</untrusted_essay>"));

// 학교 자료 모양
const schools = JSON.parse(fs.readFileSync(new URL("./schools.json", import.meta.url), "utf8"));
assert.ok(schools.length > 2000, "all-US list loaded");
assert.ok(schools.filter((s) => s.kind === "liberal_arts").length > 200, "liberal arts colleges tagged");
assert.equal(schools.find((s) => s.name === "Williams College").kind, "liberal_arts");
for (const s of schools) {
  assert.ok(s.source && s.year, `${s.name} needs source and year`);
  assert.ok(s.open_admission ? s.admit_rate == null : s.admit_rate > 0 && s.admit_rate <= 1, `${s.name} admit rate`);
  assert.ok(STR.en[`k_${s.kind}`], `${s.name} kind`);
  if (s.sat25) assert.ok(s.sat25 >= 400 && s.sat75 <= 1600 && s.sat25 <= s.sat75, `${s.name} SAT range`);
  if (s.act25) assert.ok(s.act25 >= 1 && s.act75 <= 36 && s.act25 <= s.act75, `${s.name} ACT range`);
}
assert.equal(new Set(schools.map((s) => s.id)).size, schools.length, "no duplicate schools");
assert.equal(schools.filter((s) => s.year.startsWith("CDS")).length, 47, "CDS-verified rows kept");

// 사전: 두 언어의 키가 같아야 한다
assert.deepEqual(Object.keys(STR.ko).sort(), Object.keys(STR.en).sort());
assert.match(essaySystem("en"), /in English/);
assert.match(orderSystem("ko"), /in Korean/);

// 예전 데이터 이전: 활동/수상 메모는 '예전 메모'로 옮겨 지우지 않는다
const old = loadData(JSON.stringify({ profile: { activities: "Robotics captain", awards: "AIME" } }));
assert.match(old.profile.legacy, /Robotics captain[\s\S]*AIME/);
const many = loadData(JSON.stringify({ activities: Array(12).fill({ position: "x".repeat(80), grades: ["9", "13"] }), honors: Array(7).fill({ levels: ["National", "Galactic"] }) }));
assert.equal(many.activities.length, 10);
assert.equal(many.activities[0].position.length, 50);
assert.deepEqual(many.activities[0].grades, ["9"]);
assert.equal(many.honors.length, 5);
assert.deepEqual(many.honors[0].levels, ["National"]);

// 활동 시간 (코드 계산) 과 순서 추천 검사
assert.equal(totalHours({ hours: "10", weeks: "40", grades: ["10", "11", "12"] }), 1200);
assert.equal(totalHours({ hours: "", weeks: "", grades: [] }), 0);
assert.ok(isPermutation([2, 0, 1], 3) && !isPermutation([0, 0, 1], 3) && !isPermutation([0, 1], 3));
const o = buildOrderUser({ major: "CS", activities: [{ hours: 500, weeks: 99, grades: ["9", "x"] }, {}], honors: [{ levels: ["International", "Moon"] }] });
assert.equal(o.acts[0].hours_per_week, 168, "hours are capped");
assert.equal(o.acts[0].total_hours, 168 * 52);
assert.deepEqual(o.hons[0].levels, ["International"]);
assert.match(o.text, /<untrusted_activities>/);
const goodOrder = { summary: "ok", activity_order: [1, 0], honor_order: [0], notes: [{ kind: "activity", i: 1, why: "major" }, { kind: "bad", i: 0, why: "x" }] };
assert.equal(parseOrder(JSON.stringify(goodOrder), 2, 1).notes.length, 1);
assert.throws(() => parseOrder(JSON.stringify({ ...goodOrder, activity_order: [0, 0] }), 2, 1), /full ordering/);
assert.throws(() => parseOrder(JSON.stringify({ ...goodOrder, activity_order: [0] }), 2, 1), /full ordering/);
assert.match(orderSystem("en"), /NO GHOSTWRITING/);

console.log("check passed");

// 가입(약관 동의): 현재 버전에 동의해야 가입한 것으로 본다
{
  const { signedUp, TERMS_VERSION } = await import("./logic.js");
  assert.equal(signedUp(loadData(JSON.stringify({ ageOk: true }))), false, "old users must agree to the terms");
  assert.equal(signedUp(loadData(JSON.stringify({ ageOk: true, consent: { version: TERMS_VERSION, at: "x" } }))), true);
  assert.equal(signedUp(loadData(JSON.stringify({ ageOk: false, consent: { version: TERMS_VERSION } }))), false);
  console.log("signup check passed");
}

// SAT와 ACT 둘 다 있으면 더 좋은 쪽으로 분류
assert.equal(classify({ sat: "1100", act: "33" }, { admit_rate: 0.6, sat25: 1200, sat75: 1400, act25: 26, act75: 32 }).label, "Safety", "best of SAT/ACT");
assert.equal(classify({ sat: "1100", act: "20" }, { admit_rate: 0.6, sat25: 1200, sat75: 1400, act25: 26, act75: 32 }).label, "Reach");
for (const k of ["spec_hint", "spec_hint_on", "sort_fit"]) assert.ok(STR.ko[k] && STR.en[k], k);
console.log("fit check passed");

// GPA만, 또는 시험 점수만 넣어도 자료 없는 학교까지 분류된다 (추정 표시)
{
  const { addEstimates } = await import("./logic.js");
  const list = addEstimates(JSON.parse(fs.readFileSync(new URL("./schools.json", import.meta.url), "utf8")));
  const unknown = (p) => list.filter((s) => classify(p, s).label === "Unknown").length;
  assert.equal(unknown({ gpa: "3.8" }), 0, "GPA only classifies every school");
  assert.equal(unknown({ sat: "1450" }), 0, "SAT only classifies every school");
  assert.equal(unknown({ act: "30" }), 0, "ACT only classifies every school");
  const noTest = list.find((s) => s.admit_rate > 0.5 && !s.sat25 && !s.act25);
  assert.ok(classify({ sat: "1450" }, noTest).reasons.includes("r_estimated"));
  assert.ok(!classify({ sat: "1450" }, list.find((s) => s.name === "Swarthmore College")).reasons.includes("r_estimated"));
  assert.equal(classify({ gpa: "3.2" }, noTest).label, "Reach", "low GPA vs estimate");
  assert.ok(STR.ko.r_estimated && STR.en.r_estimated);
  console.log("estimate check passed");
}

// 화면과 서버 모두 비정상 시간과 중복 학년을 같은 방식으로 처리한다.
for (const [activity, expected] of [
  [{ hours: -10, weeks: 40, grades: ["10"] }, 0],
  [{ hours: 10, weeks: -40, grades: ["10"] }, 0],
  [{ hours: "Infinity", weeks: 40, grades: ["10"] }, 0],
  [{ hours: 10, weeks: "NaN", grades: ["10"] }, 0],
  [{ hours: 500, weeks: 99, grades: ["9", "9", "x"] }, 168 * 52],
  [{ hours: 10, weeks: 40, grades: ["10", "10", "11"] }, 800],
]) {
  assert.equal(totalHours(activity), expected);
  const result = buildOrderUser({ activities: [activity] }).acts[0];
  assert.equal(result.total_hours, expected);
  assert.ok(Number.isFinite(result.total_hours));
}
console.log("activity hours regression check passed");
