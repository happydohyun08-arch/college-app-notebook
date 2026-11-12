import { buildSnapshot, parseSnapshot, localizeEval, localizeOrder, SCHOOL_FIELDS, matchesSchoolField, classify, addEstimates, dday, loadData, signedUp, syncPlan, TERMS_VERSION, roleOf, outSaveState, signinSteps, roleAfterSignin, tabVisible, homeTab, wordCheck, essayKind, ESSAY_KINDS, newApp, addAppOnce, STATUSES, CHECK_ITEMS, CHECK_STATES, appProgress, readyCount, totalHours, MAX_ACTIVITIES, MAX_HONORS } from "./logic.js";
import { STR, ACTIVITY_TYPES, GRADES, RECOGNITION } from "./i18n.js";

// Worker 주소. 바꾸면 worker/wrangler.toml의 ALLOWED_ORIGIN도 사이트 주소와 맞아야 한다.
const WORKER_URL = "https://college-essay-eval.personalcollegemanager.workers.dev";
const KEY = "college-app.v1";
const ROUNDS = ["ED", "ED2", "EA", "REA", "RD", "UC", "other"];
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
let lang = data.lang || (navigator.language?.startsWith("ko") ? "ko" : "en");
const t = (k) => STR[lang][k] ?? k;

// stamp=false: 드라이브에서 받은 자료를 그대로 적을 때 (저장 시각을 바꾸지 않고 다시 올리지 않는다)
function save(stamp = true) {
  try {
    if (stamp) data.savedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(data));
    $("#storeWarn").hidden = true;
    if (stamp) gdQueue();
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
  paintSignup();
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
let tab = roleOf(data) === "counselor" ? "class" : "about"; // 카운슬러는 바로 카운슬러 탭으로
function showTab(id) {
  const role = roleOf(data);
  if (!tabVisible(role, id)) id = homeTab(role); // 카운슬러는 학생용 탭을 열 수 없다
  tab = id;
  for (const b of document.querySelectorAll("#tabs button")) b.toggleAttribute("data-role-off", !tabVisible(role, b.dataset.tab));
  $("#clStudent").toggleAttribute("data-role-off", role === "counselor"); // 클래스 참여는 학생만
  $("#roleNow").textContent = t(`role_now_${role}`);
  $("#roleSwitch").textContent = t(role === "counselor" ? "role_to_student" : "role_to_counselor");
  for (const b of document.querySelectorAll("#tabs button")) b.setAttribute("aria-current", String(b.dataset.tab === id));
  for (const s of document.querySelectorAll("main > section")) s.hidden = s.id !== id;
  if (id === "schools") renderSchools();
  if (id === "apps") renderApps();
  if (id === "class") { gdScript(); renderClass(); }
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
  paintSignup();
}
// 로그인 전: 'Google로 학생/카운슬러 로그인' 두 개. 로그인 뒤: '내 노트 열기' 하나만. 역할은 설정(백업 탭)에서 바꾼다.
function paintSignup() {
  for (const b of document.querySelectorAll("[data-signup]")) {
    b.textContent = t(signedIn() && b.dataset.role === "student" ? "land_back" : b.dataset.t);
    b.toggleAttribute("data-role-off", signedIn() && b.dataset.role === "counselor");
  }
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
// 역할 고르기 = Google 로그인의 첫 단계: (동의) → Google 로그인 → 드라이브 맞추기 → 그 역할로 연다.
let pickedRole = null;
function pickRole(role) {
  pickedRole = role;
  const [step] = signinSteps({ signedUp: signedUp(data), signedIn: signedIn() });
  if (step === "consent") { $("#gateMsg").textContent = ""; return gate.showModal(); }
  askGoogle();
}
for (const b of document.querySelectorAll("[data-signup]")) b.addEventListener("click", () => {
  if (signedIn()) return setView(false), showTab(tab), scrollTo(0, 0); // '내 노트 열기'
  pickRole(b.dataset.role);
});
// GSI는 자기 버튼(또는 One Tap)으로만 로그인 창을 연다: 역할을 고르면 작은 창에 Google 버튼을 그린다.
function askGoogle() {
  if (signedIn()) return finishSignin(jwt(idToken).sub);
  $("#signAsH").textContent = t(`signas_${pickedRole}`);
  renderLogin($("#signAsBtn"));
  $("#signAs").showModal();
}
async function finishSignin(sub) {
  const role = roleAfterSignin(pickedRole, data);
  pickedRole = null;
  $("#signAs").close();
  if (sub && !(sub === gdSub && gdLive())) await driveConnect(sub); // 드라이브 자료를 먼저 불러온 뒤에
  openAs(role); // 누른 역할을 적용한다 (숨기기만, 지우지 않는다)
}
function openAs(role) {
  if (roleOf(data) !== role) { data.role = role; save(); }
  setView(false);
  showTab(homeTab(role));
  scrollTo(0, 0);
}
$("#signAsLater").addEventListener("click", () => { const r = pickedRole; pickedRole = null; $("#signAs").close(); openAs(roleAfterSignin(r, data)); });
$("#signAsCancel").addEventListener("click", () => $("#signAs").close());
$("#signAs").addEventListener("close", () => { if (!signedIn()) pickedRole = null; });
$("#gateCancel").addEventListener("click", () => { pickedRole = null; gate.close(); });
$("#gateOk").addEventListener("click", () => {
  data.ageOk = true;
  data.consent = { version: TERMS_VERSION, at: new Date().toISOString() };
  data.lang = lang;
  save();
  gate.close();
  askGoogle(); // 역할은 드라이브를 불러온 뒤에 적용한다
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
const tokenExp = (tok) => (jwt(tok).exp ?? 0) * 1000;
const signedIn = () => !!idToken && tokenExp(idToken) > Date.now() + 60000;
// 같은 로그인을 동의 창(#sendLogin)과 상단 바(#headLogin, compact) 두 곳에 그린다.
const showLogin = () => renderLogin($("#sendLogin"), false, t("ai_login"));
const headLogin = () => (paintSignup(), ($("#outBtn").hidden = !signedIn()), renderLogin($("#headLogin"), true));
// 새로고침해도 로그인 상태를 잇기 위해 '로그인했었다' 표시만 저장한다 (토큰은 저장하지 않는다).
const GSI_KEY = "college-app.gsi";
const wasIn = () => { try { return localStorage.getItem(GSI_KEY) === "1"; } catch { return false; } };
const jwt = (tok) => { try { return JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return {}; } };
function onCredential(r) {
  idToken = r.credential;
  aiLeft = null;
  try { localStorage.setItem(GSI_KEY, "1"); } catch {}
  const { sub, email } = jwt(idToken);
  gdHint = email;
  loadMine();
  if (pickedRole) finishSignin(sub); // 역할을 고르고 로그인했다
  else if (signedUp(data) && sub && !(sub === gdSub && gdLive())) driveConnect(sub); // 자동 로그인: 저장된 역할 그대로, 드라이브 연결까지 한 번에
  headLogin();
  if ($("#send").open) showLogin();
  sendState();
}
async function gsiReady() {
  await gdScript();
  if (gsiInit) return;
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential, auto_select: true });
  gsiInit = true;
  // ponytail: 페이지를 열 때 한 번만 조용히 다시 로그인한다. 1시간 뒤 토큰이 끝나면 버튼을 한 번 누른다.
  if (wasIn() && signedUp(data)) google.accounts.id.prompt();
}
// 상단 바의 작은 계정 버튼: 사진(있으면) + '계정'. 누르면 로그아웃 창을 연다.
function acctBtn() {
  const { email, picture } = jwt(idToken);
  return el("button", { className: "btn ghost acct", title: email || "", onclick: askSignOut },
    picture && el("img", { src: picture, alt: "", referrerPolicy: "no-referrer" }), t("acct"));
}
async function renderLogin(box, compact = false, note = "") {
  if (signedIn()) {
    const status = el(compact ? "span" : "p", { className: "muted", textContent: (aiLeft == null ? t("ai_daily") : t("ai_left").replace("{n}", aiLeft)) + (compact && gdSub && gdLive() ? ` · ${t("gd_on")}` : "") });
    if (!compact) return void box.replaceChildren(status);
    return void box.replaceChildren(...[status,
      needClick && el("button", { className: "btn ghost", textContent: t("gd_connect"), onclick: () => driveConnect(jwt(idToken).sub) }),
      acctBtn()].filter(Boolean));
  }
  if (compact) { // 상단 바: 로그인 전에는 역할 두 개 중 하나를 고르면 Google 로그인으로 간다
    box.replaceChildren(...["student", "counselor"].map((r) => el("button", { className: "btn ghost", textContent: t(`head_${r}`), onclick: () => pickRole(r) })));
    return void gsiReady().catch(() => {});
  }
  const btn = el("div");
  box.replaceChildren(...(note ? [el("p", { textContent: note })] : []), btn);
  try {
    await gsiReady();
    google.accounts.id.renderButton(btn, { theme: "outline", text: "signin_with", locale: lang });
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

// 유학생 장학금 (CDS G·H와 학교 공식 유학생 재정지원 페이지). 값이 없으면 줄을 빼고 '–'로 꾸미지 않는다.
function aidBox(a) {
  const usd = (v) => (v == null ? null : `$${v.toLocaleString("en-US")}`);
  const yn = (v) => (v == null ? null : t(v ? "aid_yes" : "aid_no"));
  const line = (k, v) => (v == null ? null : el("div", {}, el("b", { textContent: `${t(k)}: ` }), v));
  const people = (n, avg) => (n == null && avg == null ? null : [n != null && t("aid_people").replace("{n}", n.toLocaleString()), avg != null && `${t("aid_avg")} ${usd(avg)}`].filter(Boolean).join(" · "));
  return el("details", { className: "aid" }, el("summary", { textContent: t("aid_h") }),
    line("aid_cost", [usd(a.tuition_fees) && `${t("aid_tuition")} ${usd(a.tuition_fees)}`, usd(a.room_board) && `${t("aid_rb")} ${usd(a.room_board)}`].filter(Boolean).join(" · ") || null),
    line("aid_intl", [yn(a.intl_aid), people(a.intl_n, a.intl_avg)].filter(Boolean).join(" · ") || null),
    line("aid_policy", a.intl_policy && t(`aid_${a.intl_policy}`)),
    line("aid_full", yn(a.intl_full_need)),
    line("aid_merit", people(a.merit_n, a.merit_avg)),
    ...(a.merit_named ?? []).map((m) => line("aid_named", `${m.name} (${m.note})`)),
    a.aid_url ? el("a", { className: "mini", href: a.aid_url, target: "_blank", rel: "noopener", textContent: t("aid_page") }) : null,
    el("div", { className: "muted", textContent: t("aid_note").replace("{y}", a.cds_year) }));
}

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
      el("a", { className: "mini", href: `https://www.google.com/search?q=${encodeURIComponent(`${sc.name} ${sc.state ?? ""} site:usnews.com/best-colleges`)}`, target: "_blank", rel: "noopener", textContent: t("usnews") }),
      sc.aid ? aidBox(sc.aid) : null),
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
    const set = (k, rerender) => (e) => { a[k] = e.target.value; save(); rerender ? renderApps() : renderTracker(); };
    return el("tr", {},
      el("td", {}, el("input", { value: a.school, placeholder: t("school_ph"), oninput: set("school") })),
      el("td", {}, select(ROUNDS, a.round, set("round"), (o) => (o === "other" ? t("round_other") : o))),
      el("td", {}, el("input", { type: "date", value: a.deadline, onchange: set("deadline", true) })),
      el("td", {}, el("span", { className: "tag", textContent: a.status === "prep" ? dday(a.deadline) : "" })),
      el("td", {}, select(STATUSES, a.status, set("status", true), (o) => t(`st_${o}`))),
      el("td", {}, el("button", { className: "btn ghost mini", textContent: t("del"), onclick: () => { data.apps = data.apps.filter((x) => x !== a); save(); renderApps(); } })));
  }));
  renderTracker();
}

// 준비 현황: 학교마다 서류 체크리스트 + 그 학교 보충 에세이(에세이 탭과 같은 자료).
function renderTracker() {
  const sorted = [...data.apps].sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  const { ready, total } = readyCount(data.apps, data.essays);
  $("#trackTotal").textContent = t("tr_total").replace("{r}", ready).replace("{n}", total);
  const name = (e, n) => e.title || e.prompt.slice(0, n) || t("new_essay");
  $("#trackList").replaceChildren(...sorted.map((a) => {
    const p = appProgress(a, data.essays);
    const left = [...p.missing.map((k) => t(`ck_${k}`)), ...p.suppLeft.map((e) => `${t("tr_supp")}: ${name(e, 40)}`)];
    const checks = CHECK_ITEMS.map(({ k, opt }) => el("div", { className: "ckrow" },
      el("span", { textContent: t(`ck_${k}`) + (opt ? ` (${t("ck_opt")})` : "") }),
      select(CHECK_STATES, a.checks[k], (e) => { a.checks[k] = e.target.value; save(); renderTracker(); }, (o) => t(`cs_${o}`))));
    const supps = p.supps.map((e) => el("label", { className: "check" },
      el("input", { type: "checkbox", checked: e.done, onchange: (ev) => { e.done = ev.target.checked; save(); renderEssays(); renderTracker(); } }),
      el("span", { textContent: `${name(e, 60)} · ${t(e.done ? "es_done" : e.text.trim() ? "es_draft" : "es_planned")}` })));
    const addSupp = el("button", { className: "btn ghost mini", textContent: t("tr_add_supp"), disabled: !a.school.trim(), onclick: () => {
      data.essays.push({ id: crypto.randomUUID(), kind: "supplement", title: "", college: a.school.trim(), prompt: "", text: "", done: false, lastEval: null });
      save(); renderEssays(); renderTracker();
    } });
    return el("div", { className: "track" },
      el("div", { className: "row tr-head" },
        el("b", { textContent: a.school || t("school_ph") }),
        el("span", { className: "tag", textContent: a.status === "prep" ? dday(a.deadline) : t(`st_${a.status}`) }),
        el("span", { className: "num muted", textContent: `${p.done} / ${p.total}` })),
      el("div", { className: "meter" }, el("i", { style: `width:${p.total ? Math.round((p.done / p.total) * 100) : 100}%` })),
      el("div", { className: "muted", textContent: p.ready ? t("tr_ready") : `${t("tr_left")}: ${left.join(", ")}` }),
      el("details", {}, el("summary", { textContent: t("tr_edit") }),
        el("div", { className: "ckgrid" }, ...checks),
        el("p", { className: "muted", textContent: p.supps.length ? t("tr_supp_h") : t("tr_no_supp") }),
        ...supps, addSupp));
  }));
}

// ---------- 에세이 ----------
function renderEssays() {
  $("#essayList").replaceChildren(...data.essays.map(essayCard));
}
$("#addEssay").addEventListener("click", () => {
  data.essays.push({ id: crypto.randomUUID(), kind: "", title: "", college: "", prompt: "", text: "", done: false, lastEval: null });
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
    el("label", { className: "check" }, el("input", { type: "checkbox", checked: es.done === true, onchange: (e) => { es.done = e.target.checked; save(); } }), el("span", { textContent: t("e_done") })),
    el("label", { textContent: t("e_prompt") }), field("prompt", "textarea", { placeholder: t("e_prompt_ph"), style: "min-height:60px" }),
    el("label", { textContent: t("e_text") }), field("text", "textarea", { style: "min-height:220px", maxLength: 8000 }),
    el("div", { className: "row" }, evalBtn, count,
      el("button", { className: "btn ghost", textContent: t("del"), onclick: async () => { if (await ask(t("del_essay_q"), t("del"))) { data.essays = data.essays.filter((x) => x !== es); save(); renderEssays(); } } })),
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
    if (await applyBackup(await file.text())) $("#backupMsg").textContent = t("imported");
  } catch (err) {
    $("#backupMsg").textContent = `${t("import_fail")}: ${err.message}`;
  }
});
async function applyBackup(text) {
  const next = loadData(text);
  if (!(await ask(t("import_q"), t("import")))) return false;
  data = { ...next, ageOk: true, consent: data.consent, lang };
  lastOrder = null;
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
let gdToken = null, gdLoading = null, gdHint;
const gdLive = () => !!gdToken && gdToken.exp > Date.now();
const gdScript = () => (gdLoading ??= new Promise((ok, no) => {
  document.head.append(el("script", { src: "https://accounts.google.com/gsi/client", onload: ok, onerror: () => { gdLoading = null; no(new Error(t("gd_noscript"))); } }));
}));
const gdMsg = (m) => ($("#gdMsg").textContent = m);
// 무엇이 저장/로드됐는지 보이게: 활동·수상·지원 학교·에세이 개수
const gdCount = (d) => t("gd_n").replace("{a}", d.activities.length).replace("{h}", d.honors.length).replace("{p}", d.apps.length).replace("{e}", d.essays.length);
// wantFile = 카운슬러 공유용 drive.file 권한도 필요 (이 앱이 만든 파일만). 백업만 쓰는 사람에게는 묻지 않는다.
const FILE_SCOPE = `${GD_API}/auth/drive.file`;
async function gdAuth(wantFile = false) {
  if (gdLive() && (!wantFile || gdToken.file)) return gdToken.v;
  await gdScript();
  return new Promise((ok, no) => {
    google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: `${GD_API}/auth/drive.appdata${wantFile ? ` ${FILE_SCOPE}` : ""}`,
      ...(gdHint && { login_hint: gdHint }),
      callback: (r) => {
        if (r.error) return no(new Error(r.error));
        // 예전에 허락한 권한도 같이 온다 (include_granted_scopes). 공유 파일 권한이 있는지 기록한다.
        gdToken = { v: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000, file: google.accounts.oauth2.hasGrantedAllScopes(r, FILE_SCOPE) };
        if (wantFile && !gdToken.file) return no(new Error(t("cl_need_file")));
        $("#gdOut").hidden = false;
        ok(gdToken.v);
      },
      error_callback: (e) => no(new Error(e.type === "popup_closed" ? t("gd_cancel") : e.type === "popup_failed_to_open" ? t("gd_blocked") : e.message || e.type)),
    }).requestAccessToken({ prompt: "" }); // 처음 한 번만 동의 창, 그다음은 바로 닫힌다
  });
}
async function gdFetch(url, opt = {}) {
  const r = await fetch(GD_API + url, { ...opt, headers: { ...opt.headers, Authorization: `Bearer ${await gdAuth(opt.file)}` } });
  if (!r.ok) throw Object.assign(new Error(`Google ${r.status}`), { status: r.status });
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
// sub = 이 브라우저 자료를 마지막으로 맞춘 Google 계정 번호, savedAt = 그때 자료의 저장 시각
let sync = { auto: false, last: "", sub: "", savedAt: "" };
try { sync = { ...sync, ...JSON.parse(localStorage.getItem(SYNC_KEY)) }; } catch {}
const saveSync = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch {} };
$("#gdAuto").checked = sync.auto;

async function gdPush(auto) {
  gdMsg(t("gd_working"));
  if (!data.savedAt) { data.savedAt = new Date().toISOString(); save(false); }
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
  sync.savedAt = data.savedAt;
  saveSync();
  await pushShares();
  gdMsg(`${t(auto ? "gd_auto_saved" : "gd_saved")}: ${gdCount(data)} (${new Date().toLocaleString(lang)})`);
}
// ponytail: 4초 묶음 전송. 마지막 수정 후 4초 안에 탭을 닫으면 그 수정은 브라우저에만 남고 다음 저장 때 올라간다.
let gdTimer, gdBusy = false, gdPending = false;
function gdQueue() {
  if (!sync.auto) return;
  clearTimeout(gdTimer);
  gdPending = true;
  gdTimer = setTimeout(async () => {
    gdPending = false;
    if (connecting) return gdQueue(); // 연결하며 무엇을 남길지 정하는 중에는 올리지 않는다
    // 로그인은 클릭 없이 다시 할 수 없다 (팝업 차단). 토큰이 끝나면 멈추고 알린다.
    if (!gdLive()) return gdMsg(t("gd_auto_paused"));
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
  const ok = await applyBackup(text);
  if (ok) { sync.last = f.modifiedTime; sync.savedAt = data.savedAt; saveSync(); }
  gdMsg(ok ? `${t("imported").replace(/\.$/, "")}: ${gdCount(data)} (${t("gd_when")} ${new Date(f.modifiedTime).toLocaleString(lang)})` : t("gd_kept"));
}));
$("#gdOut").addEventListener("click", () => {
  if (gdToken) google.accounts.oauth2.revoke(gdToken.v, () => {});
  gdToken = null;
  gdSub = "";
  needClick = signedIn(); // 상단 바에 'Drive 연결' 버튼을 다시 보인다
  $("#gdOut").hidden = true;
  gdMsg(t("gd_outed"));
  headLogin();
});

// ---------- 로그인하면 드라이브와 맞추기 ----------
let gdSub = "", connecting = false, needClick = false;
const when = (iso) => (iso ? new Date(iso).toLocaleString(lang) : t("sync_unknown"));
// 두 버튼 중 하나를 고르게 한다. 0 / 1, 닫으면 null. h = 제목 ("" 이면 숨김)
function choose(q, lines, a, b, h = t("sync_h")) {
  const d = $("#syncAsk");
  $("#syncH").textContent = h;
  $("#syncQ").textContent = q;
  $("#syncWhat").replaceChildren(...lines.map((l) => el("li", { textContent: l })));
  $("#syncA").textContent = a;
  $("#syncB").textContent = b;
  return new Promise((ok) => {
    const pick = (v) => () => { d.onclose = null; d.close(); ok(v); };
    $("#syncA").onclick = pick(0);
    $("#syncB").onclick = pick(1);
    d.onclose = () => ok(null);
    d.showModal();
  });
}
// confirm() 대신: 같은 창으로 '확인 / 취소'를 묻는다
const ask = async (q, ok) => (await choose(q, [], ok, t("cancel"), "")) === 0;
function takeDrive(next) {
  const was = roleOf(data);
  data = { ...next, ageOk: true, consent: data.consent, lang };
  lastOrder = null;
  save(false);
  renderAll();
  if (roleOf(data) !== was) showTab(homeTab(roleOf(data))); // 다른 기기에서 고른 역할로 연다
}
async function driveConnect(sub) {
  if (connecting) return;
  connecting = true;
  needClick = false;
  headLogin();
  try {
    await gdAuth();
    gdMsg(t("gd_working"));
    // 드라이브 토큰이 로그인한 계정과 같은 계정인지 확인한다 (다른 계정의 드라이브에 섞이지 않게)
    const me = await gdFetch("/drive/v3/about?fields=user(emailAddress)").then((r) => r.json()).catch(() => ({}));
    if (gdHint && me.user?.emailAddress && me.user.emailAddress.toLowerCase() !== gdHint.toLowerCase()) throw new Error(t("gd_wrong_acct"));
    const f = await gdFind();
    const drive = f ? loadData(await (await gdFetch(`/drive/v3/files/${f.id}?alt=media`)).text()) : null;
    let plan = syncPlan({ local: data, drive, localSub: sync.sub, sub, syncedAt: sync.savedAt });
    const here = `${t("sync_here")}: ${gdCount(data)} · ${when(data.savedAt)}`;
    const there = drive && `${t("sync_drive")}: ${gdCount(drive)} · ${when(drive.savedAt || f.modifiedTime)}`;
    if (plan === "switch") {
      const c = await choose(t("sync_switch_q"), [here, there ?? `${t("sync_drive")}: ${t("gd_none")}`], t("sync_switch_load"), t("sync_switch_keep"));
      if (c !== 0) { gdToken = null; needClick = true; return gdMsg(t("sync_kept_sep")); }
      plan = drive ? "load" : "fresh";
    }
    if (plan === "ask") {
      const c = await choose(t("sync_ask_q"), [here, there], t("sync_keep_drive"), t("sync_keep_here"));
      if (c === null) { gdToken = null; needClick = true; return gdMsg(t("sync_later")); }
      plan = c === 0 ? "load" : "upload";
    }
    if (plan === "load" || plan === "same") { takeDrive(drive); sync.last = f.modifiedTime; sync.savedAt = data.savedAt; }
    if (plan === "fresh") { takeDrive(loadData(null)); sync.last = ""; sync.savedAt = ""; }
    sync.sub = gdSub = sub;
    sync.auto = $("#gdAuto").checked = true;
    saveSync();
    if (plan === "upload") await gdPush(false);
    gdMsg(`${t(plan === "upload" ? "gd_saved" : plan === "load" ? "sync_loaded" : "sync_on")}: ${gdCount(data)}`);
  } catch (err) {
    needClick = true; // 팝업이 막혔거나 실패: 한 번 눌러 다시 연결하는 버튼을 보인다
    gdMsg(`${t("gd_fail")}: ${err.message}`);
  } finally {
    connecting = false;
    headLogin();
  }
}
// ---------- 카운슬러 클래스 ----------
// Worker에는 멤버십(코드·이메일·드라이브 파일 id)만 있다. 학생 자료는 학생 드라이브의 공유 파일(클래스마다 하나)에만 있고,
// 학생 브라우저가 쓰고(drive.file), 카운슬러 브라우저가 Google에서 직접 읽는다. 운영자 서버를 거치지 않는다.
// drive.file 권한으로는 남이 공유한 파일을 바로 못 읽는다: 카운슬러가 Google Picker에서 한 번 골라(허락해) 줘야 한다.
const PICKER_API_KEY = "AIzaSyDj41LxNEBNvaBKXNuKgf4CPPTEDF25rGg"; // Google Cloud 콘솔 → API 키 (Picker API만, 사이트 주소로 제한). 공개 값이다. 비어 있으면 '허락' 단계가 안내만 한다.
const GOOGLE_PROJECT_NUMBER = GOOGLE_CLIENT_ID.split("-")[0]; // OAuth 클라이언트 ID 앞부분 = 프로젝트 번호
let myClasses = [], myInvites = [], coClasses = null;
const roster = {}; // fileId → 사본 | { error }
const clMsg = (m) => ($("#clMsg").textContent = m);
const coMsg = (m) => ($("#coMsg").textContent = m);
const CL_ERR = { not_found: "cl_not_found", too_many: "cl_too_many", email_required: "cl_email_req", forbidden: "cl_forbidden", login_required: "cl_login" };
async function classCall(body) {
  if (!signedIn()) throw new Error(t("cl_login"));
  const res = await fetch(WORKER_URL, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ kind: "class", lang, ...body }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(CL_ERR[out.code] ? t(CL_ERR[out.code]) : out.error || `${t("server_err")} (${res.status})`);
  return out;
}
async function loadMine() {
  try {
    [myClasses, myInvites] = await Promise.all([classCall({ op: "mine" }).then((r) => r.classes), classCall({ op: "invites" }).then((r) => r.invites)]);
  } catch { myClasses = []; myInvites = []; }
  renderClass();
}
const snapshot = () => JSON.stringify(buildSnapshot(data, jwt(idToken).email));
// 드라이브 동기화 때마다 공유 사본도 고친다. 공유 권한(drive.file)이 없는 토큰이면 건너뛴다 (창을 띄우지 않는다).
async function pushShares() {
  if (!myClasses.length || !gdToken?.file || !signedIn()) return;
  const body = snapshot();
  for (const c of myClasses) {
    try { await gdFetch(`/upload/drive/v3/files/${c.fileId}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body, file: true }); }
    catch (e) { clMsg(`${t("cl_push_fail")} (${c.name}): ${e.message}`); }
  }
}
function askJoin(c) {
  $("#clWho").textContent = t("cl_consent").replace("{e}", c.counselor).replace("{c}", c.name);
  $("#clOk").checked = false;
  $("#clGo").disabled = true;
  $("#clGo").onclick = () => { $("#joinAsk").close(); joinClass(c); };
  $("#joinAsk").showModal();
}
$("#clOk").addEventListener("change", (e) => ($("#clGo").disabled = !e.target.checked));
$("#clCancel").addEventListener("click", () => $("#joinAsk").close());
// 가입: 내 드라이브에 사본 파일을 만들고 → 카운슬러 이메일에 읽기 전용 공유 → Worker에 파일 id 등록. 중간에 실패하면 파일을 지운다.
async function joinClass(c) {
  let fileId;
  try {
    await gdAuth(true); // 클릭 바로 다음이라 Google 창이 막히지 않는다
    clMsg(t("gd_working"));
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name: `College App Manager - ${c.name} (${c.counselor}).json`, mimeType: "application/json", description: t("cl_file_desc") })], { type: "application/json" }));
    form.append("file", new Blob([snapshot()], { type: "application/json" }));
    fileId = (await (await gdFetch("/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", body: form, file: true })).json()).id;
    await gdFetch(`/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "user", emailAddress: c.counselor }), file: true });
    await classCall({ op: "join", code: c.code, fileId });
    myClasses = [...myClasses.filter((x) => x.code !== c.code), { ...c, fileId }];
    myInvites = myInvites.filter((x) => x.code !== c.code);
    clMsg(t("cl_joined").replace("{c}", c.name));
  } catch (e) {
    if (fileId) gdFetch(`/drive/v3/files/${fileId}`, { method: "DELETE", file: true }).catch(() => {});
    clMsg(`${t("gd_fail")}: ${e.message}`);
  }
  renderClass();
}
// 나가기: 파일을 먼저 지워 카운슬러의 접근을 바로 끊고, 그다음 멤버십을 지운다.
async function leaveClass(c) {
  if (!(await ask(t("cl_leave_q").replace("{c}", c.name), t("cl_leave")))) return;
  try {
    await gdAuth(true);
    clMsg(t("gd_working"));
    await gdFetch(`/drive/v3/files/${c.fileId}`, { method: "DELETE", file: true }).catch((e) => { if (e.status !== 404) throw e; });
    await classCall({ op: "leave", code: c.code });
    myClasses = myClasses.filter((x) => x.code !== c.code);
    clMsg(t("cl_left").replace("{c}", c.name));
  } catch (e) { clMsg(`${t("gd_fail")}: ${e.message}`); }
  renderClass();
}
$("#clFind").addEventListener("click", async () => {
  try {
    const c = await classCall({ op: "lookup", code: $("#clCode").value });
    if (myClasses.some((x) => x.code === c.code)) return clMsg(t("cl_already"));
    clMsg("");
    askJoin(c);
  } catch (e) { clMsg(e.message); }
});
$("#coCreate").addEventListener("click", async () => {
  const name = $("#coName").value.trim();
  if (!name) return coMsg(t("cl_name_req"));
  try {
    const c = await classCall({ op: "create", name });
    $("#coName").value = "";
    coMsg(t("cl_created").replace("{c}", c.name).replace("{k}", c.code));
    await loadCounselor();
  } catch (e) { coMsg(e.message); }
});
$("#coLoad").addEventListener("click", () => loadCounselor());
async function loadCounselor() {
  try { coClasses = (await classCall({ op: "classes" })).classes; } catch (e) { coMsg(e.message); }
  renderClass();
}
// 학생 사본 읽기. 아직 허락하지 않은 파일은 404/403으로 온다 → '접근 허락' 단계.
async function readStudents(c) {
  try {
    await gdAuth(true);
    coMsg(t("gd_working"));
    await Promise.all(c.members.map(async (m) => {
      try { roster[m.fileId] = parseSnapshot(await (await gdFetch(`/drive/v3/files/${m.fileId}?alt=media`, { file: true })).text()); }
      catch (e) { roster[m.fileId] = { error: e.status === 404 || e.status === 403 ? "grant" : e.message }; }
    }));
    coMsg("");
  } catch (e) { coMsg(`${t("gd_fail")}: ${e.message}`); }
  renderClass();
}
let pickerLoading = null;
const pickerScript = () => (pickerLoading ??= new Promise((ok, no) => {
  document.head.append(el("script", { src: "https://apis.google.com/js/api.js", onload: () => gapi.load("picker", { callback: ok, onerror: () => no(new Error(t("gd_noscript"))) }), onerror: () => { pickerLoading = null; no(new Error(t("gd_noscript"))); } }));
}));
// 한 번 클릭으로 공유받은 학생 파일들을 이 앱이 읽도록 허락한다 (Picker에 그 파일들만 미리 골라 보여 준다).
async function grantAccess(c) {
  if (!PICKER_API_KEY) return coMsg(t("cl_no_picker"));
  const ids = c.members.filter((m) => roster[m.fileId]?.error === "grant").map((m) => m.fileId);
  try {
    const token = await gdAuth(true);
    await pickerScript();
    const P = google.picker;
    new P.PickerBuilder()
      .addView(new P.DocsView(P.ViewId.DOCS).setFileIds(ids.join(",")).setMode(P.DocsViewMode.LIST))
      .enableFeature(P.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token).setDeveloperKey(PICKER_API_KEY).setAppId(GOOGLE_PROJECT_NUMBER).setLocale(lang).setTitle(t("cl_pick_title"))
      .setCallback((r) => { if (r[P.Response.ACTION] === P.Action.PICKED) readStudents(c); })
      .build().setVisible(true);
  } catch (e) { coMsg(`${t("gd_fail")}: ${e.message}`); }
}
const byDeadline = (a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999");
function studentView(m) {
  const s = roster[m.fileId];
  const head = el("h4", { textContent: m.email });
  if (!s) return el("div", { className: "card" }, head, el("p", { className: "muted", textContent: t("cl_not_loaded") }));
  if (s.error) return el("div", { className: "card" }, head, el("p", { className: "muted", textContent: s.error === "grant" ? t("cl_need_grant") : `${t("gd_fail")}: ${s.error}` }));
  const apps = el("div", { className: "scroll" }, el("table", {},
    el("thead", {}, el("tr", {}, ...["th_school", "th_round", "th_deadline", "th_dday", "th_status", "cl_th_checks"].map((k) => el("th", { textContent: t(k) })))),
    el("tbody", {}, ...[...s.apps].sort(byDeadline).map((a) => el("tr", {},
      el("td", { textContent: a.school }), el("td", { textContent: a.round }), el("td", { textContent: a.deadline }),
      el("td", { textContent: a.status === "prep" ? dday(a.deadline) : "" }), el("td", { textContent: t(`st_${a.status}`) }),
      el("td", {}, el("span", { className: "num", textContent: `${a.done} / ${a.total}` }),
        el("div", { className: "muted", textContent: CHECK_ITEMS.filter(({ k }) => a.checks[k] === "todo").map(({ k }) => t(`ck_${k}`)).join(", ") })))))));
  const essays = s.essays.map((e) => el("details", {},
    el("summary", { textContent: [e.title || e.college || t("new_essay"), t(e.done ? "es_done" : e.text.trim() ? "es_draft" : "es_planned"), `${e.words} ${t("cl_words")}`, e.ai ? `AI ${e.ai.total}/100` : t("cl_no_ai")].join(" · ") }),
    e.prompt && el("p", { className: "muted", textContent: e.prompt }),
    e.ai && el("p", { className: "muted", textContent: e.ai.criteria.map((c) => `${CRIT_KEY[c.name] ? t(CRIT_KEY[c.name]) : c.name} ${c.score}/20`).join(" · ") }),
    el("p", { style: "white-space:pre-wrap", textContent: e.text })));
  return el("div", { className: "card" }, head, el("p", { className: "muted", textContent: `${t("cl_updated")}: ${when(s.updatedAt)}` }), apps, ...essays);
}
function renderClass() {
  const on = signedIn();
  $("#clLogin").hidden = on;
  for (const b of document.querySelectorAll("#clFind, #coCreate, #coLoad")) b.disabled = !on;
  const row = (c, btn) => el("div", { className: "row" }, el("span", { textContent: `${c.name} · ${c.counselor}` }), btn);
  $("#clInv").replaceChildren(...(on ? myInvites : []).map((c) => row(c, el("button", { className: "btn mini", textContent: t("cl_join"), onclick: () => askJoin(c) }))));
  $("#clMine").replaceChildren(...(on ? myClasses : []).map((c) => row(c, el("button", { className: "btn ghost mini", textContent: t("cl_leave"), onclick: () => leaveClass(c) }))));
  $("#coList").replaceChildren(...(on && coClasses ? coClasses : []).map((c) => {
    const emails = el("input", { placeholder: t("cl_emails_ph") });
    const invite = el("button", { className: "btn ghost mini", textContent: t("cl_invite"), onclick: async () => {
      try { await classCall({ op: "invite", code: c.code, emails: emails.value.split(/[\s,;]+/).filter(Boolean) }); coMsg(t("cl_invited")); await loadCounselor(); } catch (e) { coMsg(e.message); }
    } });
    const needGrant = c.members.some((m) => roster[m.fileId]?.error === "grant");
    return el("div", { className: "track" },
      el("div", { className: "row tr-head" }, el("b", { textContent: c.name }), el("span", { className: "tag", textContent: `${t("cl_code")} ${c.code}` }), el("span", { className: "muted", textContent: t("cl_n").replace("{n}", c.members.length) })),
      el("div", { className: "row" }, emails, invite),
      c.invites.length > 0 && el("p", { className: "muted", textContent: `${t("cl_pending")}: ${c.invites.join(", ")}` }),
      el("div", { className: "row" },
        c.members.length > 0 && el("button", { className: "btn mini", textContent: t("cl_read"), onclick: () => readStudents(c) }),
        needGrant && el("button", { className: "btn mini", textContent: t("cl_grant"), onclick: () => grantAccess(c) })),
      ...c.members.map(studentView));
  }));
}

// 로그아웃 창: 계정과 역할을 보이고, 아직 안 올라간 수정을 먼저 드라이브에 올린 뒤 결과를 알린다.
// 돌려주는 값 = 실패 이유 ("" 이면 문제없음)
async function flushDrive() {
  while (gdBusy) await new Promise((r) => setTimeout(r, 200)); // 이미 올리는 중이면 끝나길 기다린다
  if (!(gdLive() && sync.auto && data.savedAt !== sync.savedAt)) return "";
  clearTimeout(gdTimer);
  gdPending = false;
  try { await gdPush(true); } catch (err) { return err.message; } // 자동 저장과 같이: 더 새 드라이브 백업은 덮어쓰지 않는다
  return data.savedAt === sync.savedAt ? "" : $("#gdMsg").textContent;
}
async function askSignOut() {
  const d = $("#outAsk"), st = $("#outSave"), btns = [$("#outKeep"), $("#outErase")];
  const { email, name, picture } = jwt(idToken);
  $("#outWho").replaceChildren(...[picture && el("img", { src: picture, alt: "", referrerPolicy: "no-referrer" }),
    el("div", {}, el("strong", { textContent: name || email || "" }), el("br"),
      el("span", { className: "muted", textContent: [name && email, t(`out_as_${roleOf(data)}`)].filter(Boolean).join(" · ") }))].filter(Boolean));
  st.className = "muted";
  st.textContent = t("out_checking");
  for (const b of btns) b.disabled = true;
  d.showModal();
  const err = await flushDrive();
  const s = outSaveState({ savedAt: data.savedAt, syncedAt: sync.savedAt, err });
  st.className = s === "saved" ? "muted" : "note";
  st.textContent = t(`out_${s}`).replace("{e}", err);
  for (const b of btns) b.disabled = false;
}
$("#outKeep").addEventListener("click", () => signOut(false));
$("#outErase").addEventListener("click", () => signOut(true));
$("#outCancel").addEventListener("click", () => $("#outAsk").close());
$("#outBtn").addEventListener("click", askSignOut);
// erase=true 일 때만 이 기기의 자료를 지운다. 드라이브 사본은 그대로 둔다.
function signOut(erase) {
  $("#outAsk").close();
  clearTimeout(gdTimer);
  gdPending = false;
  idToken = gdToken = null;
  gdSub = "";
  myClasses = [];
  renderClass();
  aiLeft = null;
  needClick = false;
  sync.auto = $("#gdAuto").checked = false;
  saveSync();
  $("#gdOut").hidden = true;
  try { localStorage.removeItem(GSI_KEY); } catch {}
  try { google.accounts.id.disableAutoSelect(); } catch {}
  if (erase) {
    try { for (const k of [KEY, SYNC_KEY, THEME_KEY]) localStorage.removeItem(k); } catch {}
    return location.reload();
  }
  gdMsg(t("signed_out"));
  headLogin();
  sendState();
  goHome(); // 학생/카운슬러 로그인 버튼이 있는 시작 페이지로
}

// 역할 바꾸기. 학생 자료는 지우지 않고 숨기기만 한다.
$("#roleSwitch").addEventListener("click", () => {
  data.role = roleOf(data) === "counselor" ? "student" : "counselor";
  save();
  showTab(homeTab(data.role));
});

$("#wipeBtn").addEventListener("click", async () => {
  if (!(await ask(t("wipe_q"), t("wipe")))) return;
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
if (signedUp(data) && wasIn()) gsiReady().catch(() => {}); // 돌아온 사람: 자동 로그인하면 고르지 않고 저장된 역할로 '내 노트 열기'
setView(true); // 가입한 사람도 항상 시작 페이지에서 연다. '내 노트 열기'로 들어간다.
