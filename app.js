import { localizeEval, localizeOrder, SCHOOL_FIELDS, matchesSchoolField, classify, addEstimates, dday, loadData, signedUp, TERMS_VERSION, wordCheck, essayKind, ESSAY_KINDS, newApp, addAppOnce, totalHours, MAX_ACTIVITIES, MAX_HONORS } from "./logic.js";
import { STR, ACTIVITY_TYPES, GRADES, RECOGNITION } from "./i18n.js";

// Worker 주소. 바꾸면 worker/wrangler.toml의 ALLOWED_ORIGIN도 사이트 주소와 맞아야 한다.
const WORKER_URL = "https://college-essay-eval.personalcollegemanager.workers.dev";
const KEY = "college-app.v1";
const ROUNDS = ["ED", "ED2", "EA", "REA", "RD", "UC", "other"];
const STATUSES = ["prep", "submitted", "waiting", "admitted", "denied", "waitlist"];
const OLD_STATUS = { "준비 중": "prep", "제출 완료": "submitted", "결과 대기": "waiting", 합격: "admitted", 불합격: "denied", 대기자: "waitlist" };
const CRIT_KEY = { "질문 적합성": "c_fit", 구체성: "c_specific", "자기 성찰": "c_reflect", 구성: "c_structure", "문장·목소리": "c_voice" };

const $ = (s) => document.querySelector(s);
// 학생이 쓴 글은 모두 textContent/value로만 넣는다 (innerHTML 금지: 가져온 파일의 스크립트 실행 방지).
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k.startsWith("on") ? e.addEventListener(k.slice(2), v) : (e[k] = v);
  e.append(...kids.filter((k) => k != null && k !== false));
  return e;
}

let data;
try {
  data = loadData(localStorage.getItem(KEY));
} catch {
  data = loadData(null);
}
for (const a of data.apps) a.status = OLD_STATUS[a.status] ?? (STATUSES.includes(a.status) ? a.status : "prep");
let lang = data.lang || (navigator.language?.startsWith("ko") ? "ko" : "en");
const t = (k) => STR[lang][k] ?? k;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    $("#storeWarn").hidden = true;
    gdQueue();
  } catch {
    $("#storeWarn").hidden = false;
  }
}

// ---------- 언어 ----------
function applyLang() {
  document.documentElement.lang = lang;
  document.title = t("title");
  for (const n of document.querySelectorAll("[data-t]")) {
    const k = n.dataset.t;
    k.endsWith("_html") ? (n.innerHTML = t(k)) : (n.textContent = t(k)); // _html은 운영자가 쓴 i18n.js 글뿐이다
  }
  if (signedUp(data)) for (const b of document.querySelectorAll("[data-signup]")) b.textContent = t("land_back");
  paintThemeBtn();
  renderAll();
  if (!document.body.classList.contains("out")) headLogin(); // 버튼 언어도 바꾼다
}
function toggleLang() {
  lang = lang === "ko" ? "en" : "ko";
  data.lang = lang;
  if (data.ageOk) save(); // 나이 확인 전에는 아무것도 저장하지 않는다
  applyLang();
}
$("#langBtn").addEventListener("click", toggleLang);

// ---------- 화면 모드 (밝게/어둡게) ----------
// 저장은 가입한 뒤에만 한다 (동의 전에는 아무것도 저장하지 않는다).
const THEME_KEY = "college-app.theme";
try { const th = localStorage.getItem(THEME_KEY); if (th === "dark" || th === "light") document.documentElement.dataset.theme = th; } catch {}
const isDark = () => (document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
function paintThemeBtn() {
  $("#themeBtn").textContent = isDark() ? "☀" : "☾";
  $("#themeBtn").ariaLabel = $("#themeBtn").title = t(isDark() ? "theme_light" : "theme_dark");
}
$("#themeBtn").addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  if (signedUp(data)) try { localStorage.setItem(THEME_KEY, next); } catch {}
  paintThemeBtn();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeBtn);

// ---------- 탭 ----------
let tab = "about";
function showTab(id) {
  tab = id;
  for (const b of document.querySelectorAll("#tabs button")) b.setAttribute("aria-current", String(b.dataset.tab === id));
  for (const s of document.querySelectorAll("main > section")) s.hidden = s.id !== id;
  if (id === "schools") renderSchools();
  if (id === "apps") renderApps();
  if (id === "backup") gdScript(); // 버튼을 누를 때 팝업이 막히지 않도록 미리 불러 둔다
}
$("#tabs").addEventListener("click", (e) => e.target.dataset.tab && showTab(e.target.dataset.tab));

// ---------- 시작 페이지와 가입 (약관 동의) ----------
// 가입 = 서버 계정이 아니라 이 브라우저에 내 노트를 만드는 것. 동의 전에는 아무것도 저장하지 않는다.
const gate = $("#gate");
// 시작 페이지를 보여 준다. 가입한 사람에게는 시작 버튼이 '내 노트로 가기'가 된다.
function setView(landing = !signedUp(data)) {
  document.body.classList.toggle("out", landing);
  if (!landing) headLogin(); // 첫 화면(가입 전)에서는 Google 스크립트를 불러오지 않는다
  for (const b of document.querySelectorAll("[data-signup]")) b.textContent = t(signedUp(data) ? "land_back" : b.dataset.t);
}
const goHome = () => { setView(true); scrollTo(0, 0); };
$("#brand").addEventListener("click", goHome);
$("#brand").addEventListener("keydown", (e) => e.key === "Enter" && goHome());
const gc = [...document.querySelectorAll("#gate .gc")];
const gateCheck = () => {
  $("#gateAll").checked = gc.every((c) => c.checked);
  $("#gateOk").disabled = !gc.every((c) => c.checked);
};
for (const c of gc) c.addEventListener("change", gateCheck);
$("#gateAll").addEventListener("change", (e) => { for (const c of gc) c.checked = e.target.checked; $("#gateMsg").textContent = ""; gateCheck(); });
for (const b of document.querySelectorAll("[data-signup]")) b.addEventListener("click", () => {
  if (signedUp(data)) return setView(false), showTab(tab), scrollTo(0, 0);
  $("#gateMsg").textContent = "";
  gate.showModal();
});
$("#gateCancel").addEventListener("click", () => gate.close());
$("#gateOk").addEventListener("click", () => {
  data.ageOk = true;
  data.consent = { version: TERMS_VERSION, at: new Date().toISOString() };
  data.lang = lang;
  save();
  gate.close();
  setView();
  showTab("profile");
  scrollTo(0, 0);
});
$("#gateNo").addEventListener("click", () => {
  $("#gateMsg").textContent = t("gate_under");
  for (const c of [...gc, $("#gateAll")]) c.checked = false;
  gateCheck();
});

// ---------- 내 정보 ----------
const profileForm = $("#profileForm");
function fillProfile() {
  for (const f of profileForm.querySelectorAll("[name]")) f.value = data.profile[f.name] ?? "";
  $("#legacy").hidden = !data.profile.legacy;
}
profileForm.addEventListener("input", (e) => {
  if (!e.target.name) return;
  data.profile[e.target.name] = e.target.value;
  save();
});

// ---------- 공통 입력 부품 ----------
function select(options, value, onchange, label = (o) => o) {
  const s = el("select", { onchange }, ...options.map((o) => el("option", { value: o, textContent: label(o) })));
  s.value = value;
  return s;
}
function textField(obj, k, max, labelKey, onchange) {
  const counter = el("span", { className: "counter muted", textContent: `${obj[k].length}/${max}` });
  const input = el("input", {
    value: obj[k], maxLength: max,
    oninput: (e) => { obj[k] = e.target.value; counter.textContent = `${obj[k].length}/${max}`; save(); onchange?.(); },
  });
  return el("div", {}, el("label", {}, t(labelKey), counter), input);
}
function chips(obj, k, options) {
  return el("div", { className: "chips" }, ...options.map((o) =>
    el("label", {}, el("input", { type: "checkbox", checked: obj[k].includes(o), onchange: (e) => {
      obj[k] = e.target.checked ? [...obj[k], o].filter((x, i, a) => a.indexOf(x) === i) : obj[k].filter((x) => x !== o);
      obj[k].sort((a, b) => options.indexOf(a) - options.indexOf(b));
      save();
    } }), o)));
}
function move(list, i, d, rerender) {
  const j = i + d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  save();
  rerender();
}
function itemHead(i, title, list, rerender) {
  return el("div", { className: "item-head" },
    el("span", { className: "num-badge", textContent: String(i + 1) }),
    el("b", { textContent: title || t("empty") }),
    el("button", { className: "btn ghost mini", textContent: "↑", title: t("up"), disabled: i === 0, onclick: () => move(list, i, -1, rerender) }),
    el("button", { className: "btn ghost mini", textContent: "↓", title: t("down"), disabled: i === list.length - 1, onclick: () => move(list, i, 1, rerender) }),
    el("button", { className: "btn ghost mini", textContent: t("del"), onclick: () => { list.splice(i, 1); save(); rerender(); } }));
}

// ---------- 활동 (Common App 10개) ----------
function renderActivities() {
  $("#actList").replaceChildren(...data.activities.map((a, i) => {
    const head = itemHead(i, [a.position, a.org].filter(Boolean).join(" · "), data.activities, renderActivities);
    const retitle = () => (head.querySelector("b").textContent = [a.position, a.org].filter(Boolean).join(" · ") || t("empty"));
    const num = (k, max) => el("input", { type: "number", min: 0, max, value: a[k], oninput: (e) => { a[k] = e.target.value; save(); } });
    return el("div", { className: "card item" }, head,
      el("div", { className: "grid" },
        el("div", {}, el("label", { textContent: t("a_type") }), select(["", ...ACTIVITY_TYPES], a.type, (e) => { a.type = e.target.value; save(); })),
        textField(a, "position", 50, "a_position", retitle),
        textField(a, "org", 100, "a_org", retitle)),
      textField(a, "desc", 150, "a_desc"),
      el("label", { textContent: t("a_grades") }), chips(a, "grades", GRADES),
      el("div", { className: "grid" },
        el("div", {}, el("label", { textContent: t("a_timing") }),
          select(["", "school", "break", "all"], a.timing, (e) => { a.timing = e.target.value; save(); }, (o) => (o ? t(`timing_${o}`) : "–"))),
        el("div", {}, el("label", { textContent: t("a_hours") }), num("hours", 168)),
        el("div", {}, el("label", { textContent: t("a_weeks") }), num("weeks", 52))),
      el("label", { className: "check" }, el("input", { type: "checkbox", checked: a.college, onchange: (e) => { a.college = e.target.checked; save(); } }), t("a_college")));
  }));
  $("#actCount").textContent = `${data.activities.length} / ${MAX_ACTIVITIES}`;
  $("#addAct").disabled = data.activities.length >= MAX_ACTIVITIES;
}
$("#addAct").addEventListener("click", () => {
  if (data.activities.length >= MAX_ACTIVITIES) return;
  data.activities.push({ id: crypto.randomUUID(), type: "", position: "", org: "", desc: "", grades: [], timing: "", hours: "", weeks: "", college: false });
  save();
  renderActivities();
});

// ---------- 수상 (Common App 5개) ----------
function renderHonors() {
  $("#honList").replaceChildren(...data.honors.map((h, i) => {
    const head = itemHead(i, h.title, data.honors, renderHonors);
    return el("div", { className: "card item" }, head,
      textField(h, "title", 100, "h_title", () => (head.querySelector("b").textContent = h.title || t("empty"))),
      el("label", { textContent: t("h_grades") }), chips(h, "grades", GRADES),
      el("label", { textContent: t("h_level") }), chips(h, "levels", RECOGNITION));
  }));
  $("#honCount").textContent = `${data.honors.length} / ${MAX_HONORS}`;
  $("#addHon").disabled = data.honors.length >= MAX_HONORS;
}
$("#addHon").addEventListener("click", () => {
  if (data.honors.length >= MAX_HONORS) return;
  data.honors.push({ id: crypto.randomUUID(), title: "", grades: [], levels: [] });
  save();
  renderHonors();
});

// ---------- AI로 보내기 (동의 창 공용) ----------
let pending = null;
function askConsent(lines, go) {
  $("#sendWhat").replaceChildren(...lines.map((l) => el("li", { textContent: l })));
  $("#sendOk").checked = false;
  $("#sendGo").disabled = true;
  pending = go;
  showLogin();
  $("#send").showModal();
}
// 보내기는 동의 체크 + Google 로그인 둘 다 있어야 켜진다.
const sendState = () => ($("#sendGo").disabled = !($("#sendOk").checked && signedIn()));
$("#sendOk").addEventListener("change", sendState);
$("#sendCancel").addEventListener("click", () => { pending = null; $("#send").close(); });
$("#sendGo").addEventListener("click", () => {
  const go = pending;
  pending = null;
  $("#send").close();
  go?.();
});
// ---------- AI용 Google 로그인 ----------
// Drive 백업용 access token과 별개로 'Sign in with Google' ID 토큰을 받아 Worker에 보낸다. 메모리에만 둔다.
// Worker는 서명을 확인하고 계정 번호(sub)의 해시로만 하루 횟수를 센다.
let idToken = null, aiLeft = null, gsiInit = false;
const tokenExp = (tok) => { try { return JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch { return 0; } };
const signedIn = () => !!idToken && tokenExp(idToken) > Date.now() + 60000;
// 같은 로그인을 동의 창(#sendLogin)과 상단 바(#headLogin, compact) 두 곳에 그린다.
const showLogin = () => renderLogin($("#sendLogin"));
const headLogin = () => renderLogin($("#headLogin"), true);
async function renderLogin(box, compact = false) {
  if (signedIn()) return void box.replaceChildren(el(compact ? "span" : "p", { className: "muted", textContent: aiLeft == null ? t("ai_daily") : t("ai_left").replace("{n}", aiLeft) }));
  const btn = el("div");
  box.replaceChildren(...(compact ? [] : [el("p", { textContent: t("ai_login") })]), btn);
  try {
    await gdScript();
    if (!gsiInit) {
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => { idToken = r.credential; aiLeft = null; headLogin(); if ($("#send").open) showLogin(); sendState(); } });
      gsiInit = true;
    }
    google.accounts.id.renderButton(btn, { theme: "outline", text: "signin_with", locale: lang, ...(compact && { size: "small" }) });
  } catch (e) {
    box.append(el("p", { className: "muted", textContent: e.message }));
  }
}
async function callWorker(body) {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ ...body, lang, consent: true }),
  });
  const { remaining, ...out } = await res.json().catch(() => ({ error: `${t("server_err")} (${res.status})` }));
  if (typeof remaining === "number") aiLeft = remaining;
  if (out.code === "login_required") idToken = null; // 다음에 누르면 로그인 버튼이 다시 나온다
  headLogin(); // 상단 바의 남은 횟수를 갱신한다
  if (!res.ok || out.error) throw new Error(out.error ?? `${t("server_err")} (${res.status})`);
  return out;
}

// ---------- 활동 순서 추천 ----------
$("#orderBtn").addEventListener("click", () => {
  const box = $("#orderResult");
  lastOrder = null;
  if (!WORKER_URL) return void (box.textContent = t("no_server"));
  if (!data.profile.major?.trim()) return void (box.textContent = t("order_need_major"));
  if (!data.activities.length && !data.honors.length) return void (box.textContent = t("order_need_items"));
  askConsent([`${t("s_major")}: ${data.profile.major}`, `${t("s_acts")}: ${data.activities.length}`, `${t("s_hons")}: ${data.honors.length}`], async () => {
    const actIds = data.activities.map((a) => a.id), honIds = data.honors.map((h) => h.id); // 보낸 순간의 순서를 기억한다
    const btn = $("#orderBtn");
    btn.disabled = true;
    box.textContent = t("ordering");
    try {
      const out = await callWorker({ kind: "order", major: data.profile.major, activities: data.activities, honors: data.honors });
      lastOrder = { box, out, actIds, honIds };
      showOrder(box, out, actIds, honIds);
    } catch (e) {
      box.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });
});
// 예전(한 언어) 결과면 다른 언어 화면에서 그대로 보여 주고 그렇다고 알린다.
const oneLang = (raw) => (raw?.tr?.[lang] ? null : el("p", { className: "muted", textContent: t("ai_one_lang") }));
// 마지막 추천 결과는 메모리에만 둔다. 언어를 바꾸면 renderAll이 다시 그린다 (서버를 다시 부르지 않는다).
let lastOrder = null;
function showOrder(box, raw, actIds, honIds) {
  const out = localizeOrder(raw, lang);
  const note = (kind, i) => out.notes.find((n) => n.kind === kind && n.i === i)?.why ?? "";
  const byId = (list, id) => list.find((x) => x.id === id);
  const line = (n, title, sub, why) => el("div", { className: "crit" }, el("b", { textContent: `${n}. ${title}` }), sub ? el("span", { className: "muted", textContent: `  ${sub}` }) : null, el("div", { className: "muted", textContent: why }));
  box.replaceChildren(el("div", { className: "card" },
    el("p", { textContent: String(out.summary ?? "") }),
    oneLang(raw),
    out.injection_flags?.length ? el("div", { className: "note", textContent: t("injection") }) : null,
    out.activity_order.length ? el("h3", { textContent: `${t("act_sec")} · ${t("order_now")}` }) : null,
    ...out.activity_order.map((i, n) => {
      const a = byId(data.activities, actIds[i]);
      return line(n + 1, a ? [a.position, a.org].filter(Boolean).join(" · ") || t("empty") : "?", a ? `${totalHours(a)} ${t("order_hours_unit")} (${t("order_hours")})` : "", note("activity", i));
    }),
    out.honor_order.length ? el("h3", { textContent: `${t("hon_sec")} · ${t("order_now")}` }) : null,
    ...out.honor_order.map((i, n) => {
      const h = byId(data.honors, honIds[i]);
      return line(n + 1, h ? h.title || t("empty") : "?", h ? h.levels.join(", ") : "", note("honor", i));
    }),
    el("div", { className: "row" }, el("button", { className: "btn", textContent: t("order_apply"), onclick: () => {
      // 보낸 뒤에 추가된 항목은 맨 뒤에 그대로 둔다. 지워진 항목은 건너뛴다.
      const reorder = (list, ids, order) => {
        const picked = order.map((i) => byId(list, ids[i])).filter(Boolean);
        return [...picked, ...list.filter((x) => !picked.includes(x))];
      };
      data.activities = reorder(data.activities, actIds, out.activity_order);
      data.honors = reorder(data.honors, honIds, out.honor_order);
      save();
      renderActivities();
      renderHonors();
      lastOrder = null;
      box.replaceChildren(el("div", { className: "note", textContent: t("order_applied") }));
    } })),
    el("p", { className: "muted", textContent: t("ai_caution") })));
}

// ---------- 학교 분류 ----------
let schools = null;
let schoolLimit = 50; // ponytail: 2,370행을 한 번에 그리면 느려서 50개씩. 더 커지면 가상 스크롤로.
const sv = { q: "", state: "", kind: "", field: "", fit: "", sort: "name" };
const KINDS = ["liberal_arts", "research", "doctoral", "masters", "baccalaureate", "special_arts", "special_tech", "special_business", "special_health", "special_faith", "special_tribal", "special_other", "other"];
function schoolControls() {
  $("#schoolQ").placeholder = t("search_ph");
  const states = [...new Set((schools ?? []).map((s) => s.state))].sort();
  const fill = (sel, opts, key) => {
    sel.replaceChildren(...opts.map(([v, label]) => el("option", { value: v, textContent: label })));
    sel.value = sv[key];
    sel.onchange = (e) => { sv[key] = e.target.value; schoolLimit = 50; renderSchools(); };
  };
  fill($("#schoolState"), [["", t("all_states")], ...states.map((x) => [x, x])], "state");
  fill($("#schoolKind"), [["", t("all_kinds")], ["hbcu", t("hbcu")], ...KINDS.map((x) => [x, t(`k_${x}`)])], "kind");
  fill($("#schoolField"), [["", t("all_fields")], ...SCHOOL_FIELDS.map((x) => [x, t(`field_${x}`)]), ["unreviewed", t("field_unreviewed")]], "field");
  $("#schoolField").setAttribute("aria-label", t("all_fields"));
  fill($("#schoolFit"), [["", t("all_fits")], ...["Reach", "Target", "Safety", "Unknown"].map((x) => [x, t(x)])], "fit");
  fill($("#schoolSort"), [["name", t("sort_name")], ["fit", t("sort_fit")], ["rate_asc", t("sort_rate_asc")], ["rate_desc", t("sort_rate_desc")]], "sort");
}
// 학교 탭에서 바로 내 스펙을 넣으면 '내 정보'와 같이 저장되고 분류가 바로 바뀐다.
$("#mySpec").addEventListener("input", (e) => {
  if (!e.target.name) return;
  data.profile[e.target.name] = e.target.value;
  save();
  fillProfile();
  renderSchools();
});
$("#schoolQ").addEventListener("input", (e) => { sv.q = e.target.value.trim().toLowerCase(); schoolLimit = 50; renderSchools(); });
$("#schoolMore").addEventListener("click", () => { schoolLimit += 100; renderSchools(); });

async function renderSchools() {
  const body = $("#schoolRows");
  if (!schools) {
    try {
      schools = addEstimates(await (await fetch("schools.json")).json());
    } catch {
      body.replaceChildren(el("tr", {}, el("td", { colSpan: 8, textContent: t("load_fail") })));
      return;
    }
  }
  schoolControls();
  for (const f of $("#mySpec").querySelectorAll("[name]")) if (document.activeElement !== f) f.value = data.profile[f.name] ?? "";
  const hasSpec = ["gpa", "sat", "act"].some((k) => Number(data.profile[k]) > 0);
  $("#specHint").textContent = t(hasSpec ? "spec_hint_on" : "spec_hint");
  const pct = (v) => (v == null ? "–" : `${Math.round(v * 1000) / 10}%`);
  const range = (a, b, approx) => (a && b ? `${approx ? "≈ " : ""}${a}–${b}` : "–");
  // 내 스펙으로 볼 때는 누구나 붙는 학교(합격률 100%·전원 입학)는 뺀다. 분류 의미가 없어서.
  const all = schools.filter((sc) => !hasSpec || !(sc.open_admission || sc.admit_rate >= 1)).map((sc) => ({ sc, r: classify(data.profile, sc) }));
  if (hasSpec) $("#specHint").textContent += " " + t("spec_excl").replace("{n}", (schools.length - all.length).toLocaleString());
  // 내 분류 요약: 누르면 그 분류만 보여 준다 (아래 '모든 분류' 선택과 같은 값).
  const count = (l) => all.filter((x) => x.r.label === l).length;
  $("#fitSum").replaceChildren(...(hasSpec ? ["Reach", "Target", "Safety", "Unknown"] : []).map((l) =>
    el("button", { ariaPressed: String(sv.fit === l), onclick: () => { sv.fit = sv.fit === l ? "" : l; schoolLimit = 50; renderSchools(); } },
      el("b", { className: `tag ${l}`, textContent: t(l) }), count(l).toLocaleString())));
  let list = all
    .filter(({ sc, r }) => (!sv.state || sc.state === sv.state) && (!sv.kind || (sv.kind === "hbcu" ? sc.hbcu : sc.kind === sv.kind)) && (!sv.fit || r.label === sv.fit) && matchesSchoolField(sc, sv.field) &&
      (!sv.q || sc.name.toLowerCase().includes(sv.q) || (sc.city ?? "").toLowerCase().includes(sv.q)));
  const FIT = { Safety: 0, Target: 1, Reach: 2, Unknown: 3 };
  if (sv.sort === "fit") list.sort((x, y) => FIT[x.r.label] - FIT[y.r.label] || (y.sc.admit_rate ?? 1) - (x.sc.admit_rate ?? 1));
  else if (sv.sort !== "name") list.sort((x, y) => (sv.sort === "rate_asc" ? 1 : -1) * ((x.sc.admit_rate ?? 1) - (y.sc.admit_rate ?? 1)));
  $("#fieldCoverage").textContent = t("field_coverage").replace("{n}", schools.filter((s) => s.fields?.length).length.toLocaleString()).replace("{total}", schools.length.toLocaleString());
  $("#schoolCount").textContent = t("school_count").replace("{n}", list.length.toLocaleString()).replace("{m}", Math.min(schoolLimit, list.length).toLocaleString());
  $("#schoolMore").hidden = list.length <= schoolLimit;
  body.replaceChildren(...list.slice(0, schoolLimit).map(({ sc, r }) => el("tr", {},
    el("td", {}, sc.web ? el("a", { href: sc.web, target: "_blank", rel: "noopener", textContent: sc.name }) : sc.name,
      el("div", { className: "muted", textContent: [sc.city && `${sc.city}, ${sc.state}`, sc.control && t(sc.control), sc.kind && t(`k_${sc.kind}`), sc.hbcu && t("hbcu"), sc.note].filter(Boolean).join(" · ") }),
      el("div", { className: "muted", textContent: sc.fields?.length ? sc.fields.map((f) => t(`field_${f}`)).join(" · ") : t("field_unreviewed") }),
      ...(sc.fields_sources ?? []).map((url, i) => el("a", { className: "mini", href: url, target: "_blank", rel: "noopener", textContent: `${t("field_source")} ${i + 1} ↗ ` })),
      // 순위는 US News 상품이라 싣지 않고 링크만 건다 (구글 검색: US News 내부 주소 형식이 바뀌어도 동작)
      el("a", { className: "mini", href: `https://www.google.com/search?q=${encodeURIComponent(`${sc.name} ${sc.state ?? ""} site:usnews.com/best-colleges`)}`, target: "_blank", rel: "noopener", textContent: t("usnews") })),
    el("td", { className: "num", textContent: sc.open_admission ? t("open_adm") : pct(sc.admit_rate) }),
    el("td", { className: "num", textContent: range(sc.sat25, sc.sat75, sc.sat_approx), title: sc.sat_approx ? t("sat_approx") : "" }),
    el("td", { className: "num", textContent: range(sc.act25, sc.act75) }),
    el("td", { className: "num", textContent: sc.gpa_avg ?? "–" }),
    el("td", {}, el("span", { className: `tag ${r.label}`, textContent: t(r.label) }), el("div", { className: "muted", textContent: r.reasons.map(t).join(" · ") })),
    el("td", {}, sc.source ? el("a", { href: sc.source, target: "_blank", rel: "noopener", textContent: sc.year ?? t("source") }) : el("span", { className: "muted", textContent: t("no_data") })),
    el("td", {}, el("button", { className: "btn ghost mini", textContent: t("add_to_list"), onclick: () => addApp(sc.name) })))));
}

// ---------- 지원 목록 ----------
function addApp(school = "") {
  data.apps.push(newApp(school));
  save();
  showTab("apps");
}
$("#addApp").addEventListener("click", () => addApp());

function renderApps() {
  const sorted = [...data.apps].sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  $("#appRows").replaceChildren(...sorted.map((a) => {
    const set = (k, rerender) => (e) => { a[k] = e.target.value; save(); if (rerender) renderApps(); };
    return el("tr", {},
      el("td", {}, el("input", { value: a.school, placeholder: t("school_ph"), oninput: set("school") })),
      el("td", {}, select(ROUNDS, a.round, set("round"), (o) => (o === "other" ? t("round_other") : o))),
      el("td", {}, el("input", { type: "date", value: a.deadline, onchange: set("deadline", true) })),
      el("td", {}, el("span", { className: "tag", textContent: a.status === "prep" ? dday(a.deadline) : "" })),
      el("td", {}, select(STATUSES, a.status, set("status", true), (o) => t(`st_${o}`))),
      el("td", {}, el("button", { className: "btn ghost mini", textContent: t("del"), onclick: () => { data.apps = data.apps.filter((x) => x !== a); save(); renderApps(); } })));
  }));
}

// ---------- 에세이 ----------
function renderEssays() {
  $("#essayList").replaceChildren(...data.essays.map(essayCard));
}
$("#addEssay").addEventListener("click", () => {
  data.essays.push({ id: crypto.randomUUID(), kind: "", title: "", college: "", prompt: "", text: "", lastEval: null });
  save();
  renderEssays();
});

function essayCard(es) {
  const count = el("span", { className: "muted" });
  const title = el("b", {});
  const refresh = () => {
    const w = wordCheck(es);
    count.textContent = w.limit
      ? `${w.n} / ${w.limit} ${t("words")} (${t(w.src)})${w.over ? ` · ${w.n - w.limit} ${t("wc_over")}` : ""}`
      : `${w.n} ${t("words")}`;
    count.style.color = w.over ? "var(--reach)" : "";
    title.textContent = es.title || es.college || t("new_essay");
  };
  refresh();
  const result = el("div");
  const field = (k, tag, props) => el(tag, { ...props, value: es[k], oninput: (e) => { es[k] = e.target.value; refresh(); save(); } });
  const added = el("span", { className: "muted" });
  // Supplement에 학교 이름이 있으면 지원 목록에 없을 때만 넣는다. 입력 중 글자마다가 아니라 입력을 마쳤을 때.
  const syncApp = () => {
    if (essayKind(es) !== "supplement" || !addAppOnce(data.apps, es.college)) return;
    save();
    added.textContent = t("e_app_added").replace("{s}", es.college.trim());
  };
  const college = field("college", "input", { onchange: syncApp });
  const kind = select(ESSAY_KINDS, essayKind(es), (e) => { es.kind = e.target.value; refresh(); save(); syncApp(); }, (o) => t(`ek_${o}`));
  if (es.lastEval) showEval(result, es.lastEval);
  const evalBtn = el("button", { className: "btn", textContent: t("eval_btn"), onclick: () => {
    if (!WORKER_URL) return void (result.textContent = t("no_server"));
    if (es.text.trim().length < 50) return void (result.textContent = t("need_essay"));
    askConsent([
      `${t("s_essay")} · ${t(`ek_${essayKind(es)}`)} (${wordCheck(es).n} ${t("words")})`,
      es.prompt.trim() ? t("s_prompt") : t("s_noprompt"),
      `${t("s_college")}: ${es.college.trim() || t("none")}`,
    ], async () => {
      evalBtn.disabled = true;
      result.textContent = t("evaluating");
      try {
        es.lastEval = { ...(await callWorker({ kind: "essay", essay_kind: essayKind(es), essay: es.text, prompt: es.prompt, college: es.college })), at: new Date().toISOString() };
        save();
        showEval(result, es.lastEval);
      } catch (e) {
        result.textContent = e.message;
      } finally {
        evalBtn.disabled = false;
      }
    });
  } });
  return el("div", { className: "card" },
    title,
    el("div", { className: "grid" },
      el("div", {}, el("label", { textContent: t("e_title") }), field("title", "input", { placeholder: t("e_title_ph") })),
      el("div", {}, el("label", { textContent: t("e_college") }), college)),
    el("label", { textContent: t("e_kind") }), kind, added,
    el("label", { textContent: t("e_prompt") }), field("prompt", "textarea", { placeholder: t("e_prompt_ph"), style: "min-height:60px" }),
    el("label", { textContent: t("e_text") }), field("text", "textarea", { style: "min-height:220px", maxLength: 8000 }),
    el("div", { className: "row" }, evalBtn, count,
      el("button", { className: "btn ghost", textContent: t("del"), onclick: () => { if (confirm(t("del_essay_q"))) { data.essays = data.essays.filter((x) => x !== es); save(); renderEssays(); } } })),
    result);
}

// 인용 + 몇 번째 문단인지(서버가 원문에서 찾은 위치) + 원문에 없으면 경고.
const quoteBox = (q) => [
  el("blockquote", { textContent: `${Number.isInteger(q.para) ? `[${t("para")} ${q.para}] ` : ""}"${String(q.quote ?? "")}"` }),
  q.quote_found === false ? el("div", { className: "muted", textContent: t("quote_missing") }) : null,
];
function showEval(box, raw) {
  const ev = localizeEval(raw, lang);
  const crit = Array.isArray(ev.criteria) ? ev.criteria : [];
  box.replaceChildren(
    el("div", { className: "crit" },
      el("div", { className: "score" },
        el("b", { textContent: `${Number(ev.total) || 0}` }),
        el("span", { className: "muted", textContent: `/ 100${ev.at ? `  ·  ${String(ev.at).slice(0, 10)} ${t("evaluated")}` : ""}` })),
      el("p", { textContent: String(ev.summary ?? ev.summary_ko ?? "") }),
      oneLang(raw)),
    Array.isArray(ev.prompt_parts) && ev.prompt_parts.length
      ? el("div", { className: "crit" }, el("b", { textContent: t("prompt_check") }),
          ...ev.prompt_parts.map((p) => el("div", { textContent: `${p.answered === true ? "✓" : t("not_answered")} ${String(p.part ?? "")}` })))
      : null,
    ev.essay_type ? el("p", { className: "muted", textContent: `${t("essay_type")}: ${t(`et_${ev.essay_type}`)}` }) : null,
    Array.isArray(ev.red_flags) && ev.red_flags.length
      ? el("div", { className: "crit" }, el("b", { textContent: t("red_flags") }),
          ...ev.red_flags.map((f) => el("div", {}, el("span", { textContent: `⚠ ${t(`rf_${f.code}`)}` }), el("blockquote", { textContent: `"${String(f.quote ?? "")}"` }))))
      : null,
    Array.isArray(ev.injection_flags) && ev.injection_flags.length ? el("div", { className: "note", textContent: t("injection") }) : null,
    ...crit.map((c) => el("div", { className: "crit" },
      el("b", { textContent: `${t(CRIT_KEY[c.name] ?? String(c.name))}  ${Number(c.score) || 0} / 20` }),
      el("div", { className: "meter" }, el("i", { style: `width:${Math.min(100, Math.max(0, (Number(c.score) || 0) * 5))}%` })),
      ...quoteBox(c),
      el("div", { textContent: `${t("why")}: ${String(c.why ?? "")}` }),
      el("div", { textContent: `${t("fix")}: ${String(c.fix ?? "")}` }))),
    Array.isArray(ev.line_notes) && ev.line_notes.length
      ? el("div", { className: "crit" }, el("b", { textContent: t("line_notes") }),
          ...ev.line_notes.map((n) => el("div", {}, ...quoteBox(n),
            el("div", { textContent: `${t("issue")}: ${String(n.issue ?? "")}` }),
            el("div", { textContent: `${t("direction")}: ${String(n.direction ?? "")}` }))))
      : null,
    el("p", { className: "muted", textContent: t("ai_caution") }));
}

// ---------- 백업 ----------
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `college-app-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});
$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    if (applyBackup(await file.text())) $("#backupMsg").textContent = t("imported");
  } catch (err) {
    $("#backupMsg").textContent = `${t("import_fail")}: ${err.message}`;
  }
});
function applyBackup(text) {
  const next = loadData(text);
  if (!confirm(t("import_q"))) return false;
  data = { ...next, ageOk: true, consent: data.consent, lang };
  lastOrder = null;
  for (const a of data.apps) a.status = OLD_STATUS[a.status] ?? (STATUSES.includes(a.status) ? a.status : "prep");
  save();
  renderAll();
  return true;
}

// ---------- 구글 드라이브 백업 ----------
// 학생 본인 드라이브의 앱 전용 숨김 폴더(appDataFolder)에만 쓴다. 운영자 서버를 거치지 않는다.
// 토큰은 메모리에만 둔다 (저장 안 함). 클라이언트 ID는 공개 값이다. 보안 비밀번호는 쓰지 않는다.
const GOOGLE_CLIENT_ID = "401240295166-diputek84ej3rfmap47n040jfmvoc6gn.apps.googleusercontent.com";
const GD_FILE = "college-app-backup.json";
const GD_API = "https://www.googleapis.com";
let gdToken = null, gdLoading = null;
const gdScript = () => (gdLoading ??= new Promise((ok, no) => {
  document.head.append(el("script", { src: "https://accounts.google.com/gsi/client", onload: ok, onerror: () => { gdLoading = null; no(new Error(t("gd_noscript"))); } }));
}));
const gdMsg = (m) => ($("#gdMsg").textContent = m);
// 무엇이 저장/로드됐는지 보이게: 활동·수상·지원 학교·에세이 개수
const gdCount = (d) => t("gd_n").replace("{a}", d.activities.length).replace("{h}", d.honors.length).replace("{p}", d.apps.length).replace("{e}", d.essays.length);
async function gdAuth() {
  if (gdToken && gdToken.exp > Date.now()) return gdToken.v;
  await gdScript();
  return new Promise((ok, no) => {
    google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: `${GD_API}/auth/drive.appdata`,
      callback: (r) => {
        if (r.error) return no(new Error(r.error));
        gdToken = { v: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 };
        $("#gdOut").hidden = false;
        ok(gdToken.v);
      },
      error_callback: (e) => no(new Error(e.type === "popup_closed" ? t("gd_cancel") : e.message || e.type)),
    }).requestAccessToken();
  });
}
async function gdFetch(url, opt = {}) {
  const r = await fetch(GD_API + url, { ...opt, headers: { ...opt.headers, Authorization: `Bearer ${await gdAuth()}` } });
  if (!r.ok) throw new Error(`Google ${r.status}`);
  return r;
}
const gdFind = async () =>
  (await (await gdFetch(`/drive/v3/files?spaces=appDataFolder&orderBy=modifiedTime desc&fields=files(id,modifiedTime)&q=${encodeURIComponent(`name='${GD_FILE}'`)}`)).json()).files[0];
async function gdRun(fn) {
  for (const b of document.querySelectorAll("#gdSave, #gdLoad")) b.disabled = true;
  try { await fn(); } catch (err) { gdMsg(`${t("gd_fail")}: ${err.message}`); }
  for (const b of document.querySelectorAll("#gdSave, #gdLoad")) b.disabled = false;
}
// 자동 동기화 설정과 마지막으로 맞춘 드라이브 파일 시각. 백업 파일에는 넣지 않는다.
const SYNC_KEY = "college-app.gdsync";
let sync = { auto: false, last: "" };
try { sync = { ...sync, ...JSON.parse(localStorage.getItem(SYNC_KEY)) }; } catch {}
const saveSync = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch {} };
$("#gdAuto").checked = sync.auto;

async function gdPush(auto) {
  gdMsg(t("gd_working"));
  const body = JSON.stringify(data);
  const f = await gdFind();
  // 다른 기기가 더 나중에 저장했으면 자동으로 덮어쓰지 않는다 (자료 손실 방지)
  if (auto && f && f.modifiedTime > sync.last) {
    sync.auto = $("#gdAuto").checked = false;
    saveSync();
    return gdMsg(t("gd_conflict"));
  }
  let r;
  if (f) r = await gdFetch(`/upload/drive/v3/files/${f.id}?uploadType=media&fields=modifiedTime`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
  else {
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name: GD_FILE, parents: ["appDataFolder"] })], { type: "application/json" }));
    form.append("file", new Blob([body], { type: "application/json" }));
    r = await gdFetch("/upload/drive/v3/files?uploadType=multipart&fields=modifiedTime", { method: "POST", body: form });
  }
  sync.last = (await r.json()).modifiedTime;
  saveSync();
  gdMsg(`${t(auto ? "gd_auto_saved" : "gd_saved")}: ${gdCount(data)} (${new Date().toLocaleString(lang)})`);
}
// ponytail: 4초 묶음 전송. 마지막 수정 후 4초 안에 탭을 닫으면 그 수정은 브라우저에만 남고 다음 저장 때 올라간다.
let gdTimer, gdBusy = false;
function gdQueue() {
  if (!sync.auto) return;
  clearTimeout(gdTimer);
  gdTimer = setTimeout(async () => {
    // 로그인은 클릭 없이 다시 할 수 없다 (팝업 차단). 토큰이 끝나면 멈추고 알린다.
    if (!(gdToken && gdToken.exp > Date.now())) return gdMsg(t("gd_auto_paused"));
    if (gdBusy) return gdQueue();
    gdBusy = true;
    try { await gdPush(true); } catch (err) { gdMsg(`${t("gd_fail")}: ${err.message}`); }
    gdBusy = false;
  }, 4000);
}
$("#gdSave").addEventListener("click", () => gdRun(() => gdPush(false)));
$("#gdAuto").addEventListener("change", (e) => {
  sync.auto = e.target.checked;
  saveSync();
  // 켤 때 바로 로그인하고 한 번 맞춘다 (클릭 안이라 로그인 창이 막히지 않는다)
  if (sync.auto) gdRun(() => gdPush(true));
});
$("#gdLoad").addEventListener("click", () => gdRun(async () => {
  gdMsg(t("gd_working"));
  const f = await gdFind();
  if (!f) return gdMsg(t("gd_none"));
  const text = await (await gdFetch(`/drive/v3/files/${f.id}?alt=media`)).text();
  const ok = applyBackup(text);
  if (ok) { sync.last = f.modifiedTime; saveSync(); }
  gdMsg(ok ? `${t("imported").replace(/\.$/, "")}: ${gdCount(data)} (${t("gd_when")} ${new Date(f.modifiedTime).toLocaleString(lang)})` : t("gd_kept"));
}));
$("#gdOut").addEventListener("click", () => {
  if (gdToken) google.accounts.oauth2.revoke(gdToken.v, () => {});
  gdToken = null;
  $("#gdOut").hidden = true;
  gdMsg(t("gd_outed"));
});

$("#wipeBtn").addEventListener("click", () => {
  if (!confirm(t("wipe_q"))) return;
  try { localStorage.removeItem(KEY); } catch {}
  location.reload();
});

function renderAll() {
  fillProfile();
  renderActivities();
  renderHonors();
  renderEssays();
  renderApps();
  if (lastOrder) showOrder(lastOrder.box, lastOrder.out, lastOrder.actIds, lastOrder.honIds);
  showTab(tab);
}
// ---------- 3D 모션 (시작 페이지) ----------
// 미리보기 카드는 스크롤하면 눕혀진 상태에서 일어서고, 카드들은 마우스 쪽으로 살짝 기운다.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const frame = $(".preview .frame");
  const lift = () => {
    const r = frame.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.85)));
    frame.style.setProperty("--rx", `${((1 - p) * 22).toFixed(2)}deg`);
  };
  addEventListener("scroll", lift, { passive: true });
  addEventListener("resize", lift);
  for (const card of [frame, ...document.querySelectorAll(".tile")]) {
    const max = card === frame ? 4 : 7;
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--ty", `${(((e.clientX - r.left) / r.width - 0.5) * 2 * max).toFixed(2)}deg`);
      card.style.setProperty("--tx", `${(-((e.clientY - r.top) / r.height - 0.5) * 2 * max).toFixed(2)}deg`);
    });
    card.addEventListener("pointerleave", () => { card.style.setProperty("--tx", "0deg"); card.style.setProperty("--ty", "0deg"); });
  }
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { const n = e.target; n.classList.add("in"); io.unobserve(n); setTimeout(() => (n.style.transitionDelay = ""), 1200); } }, { threshold: 0.15 });
  document.querySelectorAll("#landing .band > h2, #landing .band > p.sub, .tile, .steps > div, .closing h2").forEach((n, i) => {
    n.classList.add("reveal");
    n.style.transitionDelay = n.classList.contains("tile") || n.parentElement.classList.contains("steps") ? `${(i % 4) * 80}ms` : "";
    io.observe(n);
  });
  requestAnimationFrame(lift);
}

applyLang();
setView(true); // 가입한 사람도 항상 시작 페이지에서 연다. '내 노트 열기'로 들어간다.
