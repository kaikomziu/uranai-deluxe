/* ============================================================
   占いDELUXE - main.js
   ============================================================ */

/* ---------------- 汎用ユーティリティ ---------------- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededRand(str) {
  const gen = xmur3(str);
  return mulberry32(gen());
}
function pick(arr, rand) {
  return arr[Math.floor((rand ? rand() : Math.random()) * arr.length)];
}
function pickInt(min, max, rand) {
  return Math.floor((rand ? rand() : Math.random()) * (max - min + 1)) + min;
}
function pickTier(rand) {
  const total = TIERS.reduce((s, t) => s + t.weight, 0);
  let r = rand() * total;
  for (const t of TIERS) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return TIERS[TIERS.length - 1];
}
function todayKey() {
  // JST基準の日付キー(UTC+9)
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}
function jstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
function todayDisplay() {
  const now = jstNow();
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${now.getUTCFullYear()}年${now.getUTCMonth() + 1}月${now.getUTCDate()}日(${days[now.getUTCDay()]})`;
}

/* ---------------- 日替わり運勢エンジン(おみくじ/星座/血液型/干支で共通利用) ---------------- */
function buildDailyFortune(seedBase) {
  const rand = seededRand(seedBase);
  const tier = pickTier(rand);
  const aspects = {};
  for (const a of ASPECTS) {
    aspects[a] = pick(TIER_TEXTS[tier.key][a], rand);
  }
  return {
    tier,
    aspects,
    color: pick(LUCKY_COLORS, rand),
    item: pick(LUCKY_ITEMS, rand),
    action: pick(LUCKY_ACTIONS, rand),
    spot: pick(LUCKY_SPOTS, rand),
    number: pickInt(0, 99, rand),
  };
}
function buildRanking(seedPrefix, entries) {
  // entries: [{key, ...}] -> スコアを日替わりで振って順位付け
  const scored = entries.map((e) => {
    const rand = seededRand(`${todayKey()}|${seedPrefix}|${e.key}`);
    return { ...e, score: rand() };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((e, i) => (e.rank = i + 1));
  return scored;
}

/* ---------------- localStorage ヘルパー ---------------- */
const LS = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  },
};

/* ---------------- タブ切り替え ---------------- */
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(target).classList.add("active");
    });
  });
  document.querySelectorAll(".subtab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.group;
      const target = btn.dataset.subtab;
      document.querySelectorAll(`.subtab-btn[data-group="${group}"]`).forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(`.subtab-panel[data-group="${group}"]`).forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(target).classList.add("active");
    });
  });
}

/* ---------------- トースト通知 & 紙吹雪 ---------------- */
function showToast(text, ms = 3200) {
  const box = document.getElementById("toast-box");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 400);
  }, ms);
}
function confettiBurst() {
  const layer = document.getElementById("confetti-layer");
  const colors = ["#ff7fa0", "#ffc857", "#8fd15b", "#5bc9c0", "#6f9be0", "#c99bff"];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = 1.6 + Math.random() * 1.4 + "s";
    p.style.animationDelay = Math.random() * 0.3 + "s";
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
    setTimeout(() => p.remove(), 3500);
  }
}

/* ---------------- サウンド(WebAudioで生成、外部ファイル不要) ---------------- */
function isSoundOn() { return LS.get("soundOn", true); }
function playTone(freqs, type = "sine", dur = 0.14) {
  if (!isSoundOn()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = window._uranaiAudioCtx || (window._uranaiAudioCtx = new Ctx());
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const t = t0 + i * dur;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  } catch (e) { /* サウンド非対応環境は無視 */ }
}
function initSoundToggle() {
  const btn = document.getElementById("sound-toggle-btn");
  if (!btn) return;
  function paint() { btn.textContent = isSoundOn() ? "🔊" : "🔇"; }
  paint();
  btn.addEventListener("click", () => {
    LS.set("soundOn", !isSoundOn());
    paint();
  });
}

/* ---------------- 汎用「運勢カード」レンダラー(運試しゲーム共通) ---------------- */
function renderTierResult(container, tier, opts = {}) {
  const text = opts.text || pick(TIER_TEXTS[tier.key]["総合運"]);
  container.innerHTML = `
    <div class="fortune-card compact tier-${tier.key}">
      <div class="fortune-tier">${opts.title || `${tier.emoji} ${tier.label}`}</div>
      ${opts.sub ? `<div class="type-flavor">${opts.sub}</div>` : ""}
      <div class="aspect-text">${text}</div>
      ${opts.extra || ""}
    </div>`;
  if (tier.score >= 7) confettiBurst();
}

/* ---------------- 隠し要素(イースターエッグ) ---------------- */
const EGGS = [
  { key: "sugoibiki", name: "神引きモード", hint: "ロゴを高速で7回連打すると…?" },
  { key: "konami", name: "都市伝説占い", hint: "懐かしのあの上下左右コマンド(PC:矢印キー/スマホ:スワイプ)を試してみて" },
  { key: "tarot_secret", name: "???のカード", hint: "ミニタロットを何度も引くと激レアカードが…(1%)" },
  { key: "triple_six", name: "ゾロ目の神", hint: "サイコロで奇跡の3連続を狙え" },
  { key: "janken_master", name: "じゃんけん神", hint: "じゃんけんで5連勝してみよう" },
  { key: "footer_star", name: "かくれ星", hint: "ページの片隅に星が隠れているかも…?" },
  { key: "midnight", name: "真夜中の占い師", hint: "深夜0時台にこのサイトを開いてみて" },
  { key: "slot_jackpot", name: "スロットの女神", hint: "スロットで7️⃣を3つ揃えると…?" },
];
// 発見済みの隠し要素はlocalStorageに記録するが、
// コンプリート状況を見せる一覧UIはあえて用意しない(サプライズ重視)。
function getFoundEggs() { return LS.get("uranaiDeluxeEggs", []); }
function unlockEgg(key) {
  const found = getFoundEggs();
  if (found.includes(key)) return false;
  found.push(key);
  LS.set("uranaiDeluxeEggs", found);
  const egg = EGGS.find((e) => e.key === key);
  showToast(`🎉 隠し要素発見!「${egg.name}」`, 4000);
  confettiBurst();
  return true;
}

/* ---- ① ロゴ連打 → 神引きモード ---- */
function initLogoEgg() {
  const logo = document.getElementById("site-logo");
  if (!logo) return;
  let count = 0, lastTime = 0;
  logo.addEventListener("click", () => {
    const now = Date.now();
    if (now - lastTime > 1200) count = 0;
    lastTime = now;
    count++;
    if (count >= 7) {
      count = 0;
      LS.set("forceNextOmikuji", true);
      unlockEgg("sugoibiki");
      showToast("✨神引きモード発動!次のおみくじは特別な結果に…", 4000);
    }
  });
}

/* ---- ② コナミコマンド → 都市伝説占い ---- */
const URBAN_LEGENDS = [
  "深夜2時に鏡を見ると、もう一人の自分と目が合うかも…?今日は早めに寝るが吉。",
  "エレベーターのボタンを連打すると幸運が逃げていく…そっと押すのが吉。",
  "口笛を吹くと運気の蛇が寄ってくる、というウワサ。今日は口笛日和。",
  "靴を左右逆に履くと一瞬だけ未来が視える…かもしれない都市伝説。",
  "自販機の売り切れボタンを押すと願いが叶う、という説がある。試してみて。",
  "夜中に爪を切ると親の死に目に…ではなく、今日は運気の整理整頓日。",
  "四つ葉のクローバーは実は探すより「見つかる」もの。肩の力を抜いて。",
  "コップの水を飲み干すと、その日一番の幸運が訪れるという言い伝え。",
];
const KONAMI_SEQ = ["up", "up", "down", "down", "left", "right", "left", "right"];
let konamiIdx = 0;
function feedKonamiSymbol(sym) {
  if (sym === KONAMI_SEQ[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === KONAMI_SEQ.length) {
      konamiIdx = 0;
      unlockEgg("konami");
      showLegendModal();
    }
  } else {
    konamiIdx = sym === KONAMI_SEQ[0] ? 1 : 0;
  }
}
function initKonamiEgg() {
  // PC: 矢印キー
  const keyMap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  window.addEventListener("keydown", (e) => {
    if (keyMap[e.key]) feedKonamiSymbol(keyMap[e.key]);
  });
  // スマホ: スワイプ
  let touchStartX = 0, touchStartY = 0;
  window.addEventListener("touchstart", (e) => {
    if (!e.touches[0]) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (!e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (Math.max(absX, absY) < 40) return; // 小さすぎる動きは無視
    if (absX > absY) feedKonamiSymbol(dx > 0 ? "right" : "left");
    else feedKonamiSymbol(dy > 0 ? "down" : "up");
  }, { passive: true });
}
function showLegendModal() {
  const modal = document.getElementById("legend-modal");
  document.getElementById("legend-text").textContent = pick(URBAN_LEGENDS);
  modal.classList.add("open");
}

/* ---- ⑥ フッターのかくれ星 ---- */
function initFooterStarEgg() {
  const star = document.getElementById("hidden-star");
  if (!star) return;
  let c = 0;
  star.addEventListener("click", () => {
    c++;
    star.style.transform = `scale(${1 + c * 0.15})`;
    if (c >= 5) {
      c = 0;
      star.style.transform = "scale(1)";
      unlockEgg("footer_star");
    }
  });
}

/* ---- ⑦ 真夜中モード ---- */
function checkMidnightEgg() {
  const now = jstNow();
  const isMidnight = now.getUTCHours() === 0 && now.getUTCMinutes() < 5;
  document.body.classList.toggle("midnight-mode", isMidnight);
  const badge = document.getElementById("midnight-badge");
  if (badge) badge.style.display = isMidnight ? "inline-flex" : "none";
  if (isMidnight) unlockEgg("midnight");
}

/* ================= おみくじ ================= */
function renderOmikuji() {
  const key = todayKey();
  const stored = LS.get("omikujiToday", null);
  const box = document.getElementById("omikuji-result");
  const btn = document.getElementById("omikuji-draw-btn");

  function paint(result, forced) {
    box.innerHTML = `
      <div class="fortune-card tier-${result.tier.key}">
        <div class="fortune-tier">${result.tier.emoji} ${result.tier.label}</div>
        ${forced ? `<div class="forced-badge">✨神引きモード✨</div>` : ""}
        <div class="fortune-aspects">
          ${ASPECTS.map((a) => `<div class="aspect-row"><span class="aspect-label">${a}</span><span class="aspect-text">${result.aspects[a]}</span></div>`).join("")}
        </div>
        <div class="lucky-row">
          <span>🎨 ラッキーカラー: ${result.color}</span>
          <span>🎁 ラッキーアイテム: ${result.item}</span>
          <span>🔢 ラッキーナンバー: ${result.number}</span>
        </div>
        <div class="advice-row">📍 ${result.spot} / 💡 ${result.action}</div>
      </div>`;
  }

  if (stored && stored.date === key) {
    paint(stored.result, stored.forced);
    btn.textContent = "もう一度おみくじ箱を振る(結果は変わりません)";
  }

  btn.addEventListener("click", () => {
    box.classList.add("shaking");
    setTimeout(() => {
      box.classList.remove("shaking");
      const forceFlag = LS.get("forceNextOmikuji", false);
      let result;
      if (forceFlag) {
        const base = buildDailyFortune(`${key}|omikuji`);
        result = { ...base, tier: TIERS[0] }; // 超大吉に固定
        LS.set("forceNextOmikuji", false);
      } else {
        result = buildDailyFortune(`${key}|omikuji`);
      }
      LS.set("omikujiToday", { date: key, result, forced: !!forceFlag });
      paint(result, !!forceFlag);
      btn.textContent = "もう一度おみくじ箱を振る(結果は変わりません)";
      if (result.tier.key === "daikichi2") confettiBurst();
    }, 650);
  });
}

/* ================= 星座占い ================= */
function renderZodiac() {
  const select = document.getElementById("zodiac-select");
  ZODIAC_SIGNS.forEach((z) => {
    const opt = document.createElement("option");
    opt.value = z.key;
    opt.textContent = `${z.emoji} ${z.name}(${z.range})`;
    select.appendChild(opt);
  });
  const saved = LS.get("zodiacSelected", ZODIAC_SIGNS[0].key);
  select.value = saved;

  const rankBox = document.getElementById("zodiac-ranking");
  const ranking = buildRanking("zodiac-rank", ZODIAC_SIGNS);
  rankBox.innerHTML = `<h4>💫 今日の星座ランキング</h4><div class="rank-list">` +
    ranking.map((z) => `<div class="rank-item"><span class="rank-no">${z.rank}位</span>${z.emoji} ${z.name}</div>`).join("") +
    `</div>`;

  function paint() {
    const key = select.value;
    LS.set("zodiacSelected", key);
    const sign = ZODIAC_SIGNS.find((z) => z.key === key);
    const result = buildDailyFortune(`${todayKey()}|zodiac|${key}`);
    const rank = ranking.find((r) => r.key === key).rank;
    document.getElementById("zodiac-result").innerHTML = `
      <div class="fortune-card tier-${result.tier.key}">
        <div class="fortune-tier">${sign.emoji} ${sign.name} - ${result.tier.emoji} ${result.tier.label}(第${rank}位)</div>
        <div class="fortune-aspects">
          ${ASPECTS.map((a) => `<div class="aspect-row"><span class="aspect-label">${a}</span><span class="aspect-text">${result.aspects[a]}</span></div>`).join("")}
        </div>
        <div class="lucky-row">
          <span>🎨 ラッキーカラー: ${result.color}</span>
          <span>🎁 ラッキーアイテム: ${result.item}</span>
          <span>🔢 ラッキーナンバー: ${result.number}</span>
        </div>
        <div class="advice-row">📍 ${result.spot} / 💡 ${result.action}</div>
      </div>`;
  }
  select.addEventListener("change", paint);
  paint();
}

/* ================= 血液型占い ================= */
function renderBlood() {
  const select = document.getElementById("blood-select");
  BLOOD_TYPES.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.key;
    opt.textContent = `${b.emoji} ${b.name}`;
    select.appendChild(opt);
  });
  const saved = LS.get("bloodSelected", BLOOD_TYPES[0].key);
  select.value = saved;

  function paint() {
    const key = select.value;
    LS.set("bloodSelected", key);
    const type = BLOOD_TYPES.find((b) => b.key === key);
    const result = buildDailyFortune(`${todayKey()}|blood|${key}`);
    const rand = seededRand(`${todayKey()}|blood-compat|${key}`);
    const compat = pick(BLOOD_TYPES.filter((b) => b.key !== key), rand);
    document.getElementById("blood-result").innerHTML = `
      <div class="fortune-card tier-${result.tier.key}">
        <div class="fortune-tier">${type.emoji} ${type.name} - ${result.tier.emoji} ${result.tier.label}</div>
        <div class="type-flavor">${type.flavor}</div>
        <div class="fortune-aspects">
          ${ASPECTS.map((a) => `<div class="aspect-row"><span class="aspect-label">${a}</span><span class="aspect-text">${result.aspects[a]}</span></div>`).join("")}
        </div>
        <div class="lucky-row">
          <span>🎨 ラッキーカラー: ${result.color}</span>
          <span>🎁 ラッキーアイテム: ${result.item}</span>
          <span>💞 今日の相性: ${compat.emoji} ${compat.name}</span>
        </div>
        <div class="advice-row">📍 ${result.spot} / 💡 ${result.action}</div>
      </div>`;
  }
  select.addEventListener("change", paint);
  paint();
}

/* ================= 干支占い ================= */
function renderEto() {
  const input = document.getElementById("eto-year-input");
  const saved = LS.get("etoYear", 2000);
  input.value = saved;

  const ranking = buildRanking("eto-rank", ETO_LIST.map((e, i) => ({ key: String(i), ...e })));

  function paint() {
    let year = parseInt(input.value, 10);
    if (!year || year < 1900 || year > 2100) year = 2000;
    LS.set("etoYear", year);
    const idx = ((year - 4) % 12 + 12) % 12;
    const animal = ETO_LIST[idx];
    const result = buildDailyFortune(`${todayKey()}|eto|${idx}`);
    const rank = ranking.find((r) => r.key === String(idx)).rank;
    document.getElementById("eto-result").innerHTML = `
      <div class="fortune-card tier-${result.tier.key}">
        <div class="fortune-tier">${animal.emoji} ${animal.name}年生まれ - ${result.tier.emoji} ${result.tier.label}(第${rank}位)</div>
        <div class="fortune-aspects">
          ${ASPECTS.map((a) => `<div class="aspect-row"><span class="aspect-label">${a}</span><span class="aspect-text">${result.aspects[a]}</span></div>`).join("")}
        </div>
        <div class="lucky-row">
          <span>🎨 ラッキーカラー: ${result.color}</span>
          <span>🎁 ラッキーアイテム: ${result.item}</span>
          <span>🔢 ラッキーナンバー: ${result.number}</span>
        </div>
        <div class="advice-row">📍 ${result.spot} / 💡 ${result.action}</div>
      </div>`;
    document.getElementById("eto-ranking").innerHTML = `<h4>💫 今日の干支ランキング</h4><div class="rank-list">` +
      ranking.map((e) => `<div class="rank-item"><span class="rank-no">${e.rank}位</span>${e.emoji} ${e.name}</div>`).join("") +
      `</div>`;
  }
  input.addEventListener("change", paint);
  document.getElementById("eto-check-btn").addEventListener("click", paint);
  paint();
}

/* ================= じゃんけん ================= */
function renderJanken() {
  const state = LS.get("jankenState", { win: 0, lose: 0, draw: 0, streak: 0, best: 0 });
  const statEl = document.getElementById("janken-stats");
  const resultEl = document.getElementById("janken-result");
  const handBtns = Array.from(document.querySelectorAll(".janken-hand-btn"));
  let busy = false;

  function paintStats() {
    statEl.textContent = `勝ち: ${state.win} / 負け: ${state.lose} / 分け: ${state.draw} ・ 現在の連勝: ${state.streak}(最高: ${state.best})`;
  }
  paintStats();

  function setBusy(v) {
    busy = v;
    handBtns.forEach((b) => (b.disabled = v));
  }

  handBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (busy) return;
      setBusy(true);
      const userHand = btn.dataset.hand;
      const userObj = JANKEN_HANDS.find((h) => h.key === userHand);

      resultEl.innerHTML = `
        <div class="janken-vs building">
          <span class="janken-side"><em>あなた</em>${userObj.emoji}</span>
          <span class="janken-caption" id="janken-caption">さいしょは グー…</span>
          <span class="janken-side"><em>コンピュータ</em><span id="cpu-shuffle">✊</span></span>
        </div>`;
      const shuffleEl = document.getElementById("cpu-shuffle");
      const captionEl = document.getElementById("janken-caption");

      let shuffleIdx = 0;
      const shuffleTimer = setInterval(() => {
        shuffleIdx = (shuffleIdx + 1) % JANKEN_HANDS.length;
        shuffleEl.textContent = JANKEN_HANDS[shuffleIdx].emoji;
      }, 80);
      playTone([392], "square", 0.1);

      setTimeout(() => { captionEl.textContent = "じゃんけん…"; playTone([440], "square", 0.1); }, 550);
      setTimeout(() => { captionEl.textContent = "ポン!"; playTone([523], "square", 0.12); }, 1000);

      setTimeout(() => {
        clearInterval(shuffleTimer);
        const cpuHand = pick(JANKEN_HANDS).key;
        const cpuObj = JANKEN_HANDS.find((h) => h.key === cpuHand);
        let outcome;
        if (userHand === cpuHand) { outcome = "draw"; state.draw++; }
        else if (
          (userHand === "gu" && cpuHand === "choki") ||
          (userHand === "choki" && cpuHand === "pa") ||
          (userHand === "pa" && cpuHand === "gu")
        ) {
          outcome = "win"; state.win++; state.streak++; state.best = Math.max(state.best, state.streak);
        } else {
          outcome = "lose"; state.lose++; state.streak = 0;
        }
        LS.set("jankenState", state);
        paintStats();

        const outcomeLabel = { win: "🎉 WIN!", lose: "😢 LOSE…", draw: "🤝 DRAW" }[outcome];
        resultEl.innerHTML = `
          <div class="janken-vs reveal ${outcome}">
            <span class="janken-side"><em>あなた</em>${userObj.emoji}</span>
            <span>VS</span>
            <span class="janken-side"><em>コンピュータ</em>${cpuObj.emoji}</span>
          </div>
          <div class="janken-outcome ${outcome} stamp">${outcomeLabel}</div>
          ${outcome === "win" && state.streak >= 2 ? `<div class="streak-line">🔥 ${state.streak}連勝中!</div>` : ""}`;

        if (outcome === "win") {
          playTone([523, 659, 784, 1047], "triangle", 0.11);
          confettiBurst();
        } else if (outcome === "lose") {
          playTone([300, 220], "sawtooth", 0.16);
        } else {
          playTone([440, 440], "sine", 0.11);
        }
        if (outcome === "win" && state.streak >= 5) unlockEgg("janken_master");
        setBusy(false);
      }, 1450);
    });
  });
}

/* ================= コイン & サイコロ ================= */
function renderCoinDice() {
  const coinBtn = document.getElementById("coin-flip-btn");
  const coinResult = document.getElementById("coin-result");
  coinBtn.addEventListener("click", () => {
    const side = Math.random() < 0.5 ? "omote" : "ura";
    const text = pick(COIN_TEXTS[side]);
    coinResult.innerHTML = `<div class="coin ${side}">${side === "omote" ? "表" : "裏"}</div><p>${text}</p>`;
  });

  const diceBtn = document.getElementById("dice-roll-btn");
  const diceResult = document.getElementById("dice-result");
  let diceStreak = LS.get("diceSixStreak", 0);
  diceBtn.addEventListener("click", () => {
    const n = pickInt(1, 6);
    const text = pick(DICE_TEXTS[n]);
    diceResult.innerHTML = `<div class="dice-face">🎲 ${n}</div><p>${text}</p>`;
    diceStreak = n === 6 ? diceStreak + 1 : 0;
    LS.set("diceSixStreak", diceStreak);
    if (diceStreak >= 3) { unlockEgg("triple_six"); diceStreak = 0; LS.set("diceSixStreak", 0); }
  });
}

/* ================= ルーレット ================= */
function renderRoulette() {
  const wheel = document.getElementById("roulette-wheel");
  const n = TIERS.length;
  const seg = 360 / n;
  wheel.style.background = `conic-gradient(${TIERS.map((t, i) => `${t.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(",")})`;
  wheel.innerHTML = TIERS.map((t, i) => {
    const angle = i * seg + seg / 2;
    return `<span class="wheel-label" style="transform: rotate(${angle}deg) translate(0,-92px) rotate(${-angle}deg)">${t.label}</span>`;
  }).join("");

  let currentRotation = 0;
  document.getElementById("roulette-spin-btn").addEventListener("click", () => {
    const idx = pickInt(0, n - 1);
    const targetAngle = idx * seg + seg / 2;
    const spins = 5 * 360;
    currentRotation += spins + (360 - targetAngle) - (currentRotation % 360);
    wheel.style.transform = `rotate(${currentRotation}deg)`;
    setTimeout(() => {
      const t = TIERS[idx];
      document.getElementById("roulette-result").innerHTML = `<div class="fortune-tier">${t.emoji} ${t.label} が出ました!</div>`;
      if (t.key === "daikichi2") confettiBurst();
    }, 3200);
  });
}

/* ================= ミニタロット ================= */
const HIDDEN_TAROT = { name: "???(すべてを見通す者)", upright: "この一枚を引けたのは、あなたが選ばれし挑戦者である証。今日はどんな願いも叶いやすい特別な一日。" };
function renderTarot() {
  const cardEl = document.getElementById("tarot-card");
  const btn = document.getElementById("tarot-draw-btn");
  btn.addEventListener("click", () => {
    cardEl.classList.remove("flipped");
    cardEl.classList.add("flipping");
    setTimeout(() => {
      cardEl.classList.remove("flipping");
      const isHidden = Math.random() < 0.01;
      let card, reversed;
      if (isHidden) {
        card = HIDDEN_TAROT; reversed = false;
        unlockEgg("tarot_secret");
      } else {
        card = pick(TAROT_CARDS);
        reversed = Math.random() < 0.5;
      }
      cardEl.innerHTML = `
        <div class="tarot-inner ${isHidden ? "secret" : ""}">
          <div class="tarot-name">${card.name}${reversed ? "(逆位置)" : isHidden ? "" : "(正位置)"}</div>
          <div class="tarot-mark">${isHidden ? "✨" : reversed ? "🔻" : "🔺"}</div>
          <div class="tarot-meaning">${reversed ? card.reversed : card.upright}</div>
        </div>`;
      cardEl.classList.add("flipped");
    }, 450);
  });
}

/* ================= ラッキーナンバー ================= */
function renderLuckyNumber() {
  const btn = document.getElementById("number-draw-btn");
  const result = document.getElementById("number-result");
  btn.addEventListener("click", () => {
    const n = pickInt(0, 99);
    const vibe = NUMBER_VIBE[n % 10];
    result.innerHTML = `<div class="lucky-number-big">${n}</div><p>${vibe}</p>`;
  });
}

/* ================= スロットマシーン ================= */
function weightedPickSymbol() {
  const total = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const s of SLOT_SYMBOLS) {
    if (r < s.weight) return s;
    r -= s.weight;
  }
  return SLOT_SYMBOLS[0];
}
function renderSlot() {
  const reels = [document.getElementById("slot-reel-1"), document.getElementById("slot-reel-2"), document.getElementById("slot-reel-3")];
  const btn = document.getElementById("slot-spin-btn");
  const resultEl = document.getElementById("slot-result");
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    btn.disabled = true;
    resultEl.innerHTML = "";
    const finals = [weightedPickSymbol(), weightedPickSymbol(), weightedPickSymbol()];
    const stopDelays = [700, 1000, 1300];
    reels.forEach((reel, i) => {
      const timer = setInterval(() => { reel.textContent = pick(SLOT_SYMBOLS).emoji; }, 70);
      setTimeout(() => { clearInterval(timer); reel.textContent = finals[i].emoji; playTone([392], "square", 0.08); }, stopDelays[i]);
    });
    setTimeout(() => {
      const [a, b, c] = finals;
      let tier, extraNote = "";
      if (a.key === b.key && b.key === c.key) {
        if (a.key === "seven") { tier = TIERS.find((t) => t.key === "daikichi2"); unlockEgg("slot_jackpot"); extraNote = "🎊 セブン揃い、大当たり!"; }
        else { tier = TIERS.find((t) => t.key === "daikichi"); extraNote = "✨ 絵柄が揃いました!"; }
        playTone([523, 659, 784, 1047, 1319], "triangle", 0.1);
        confettiBurst();
      } else if (a.key === b.key || b.key === c.key || a.key === c.key) {
        tier = pick([TIERS.find((t) => t.key === "chukichi"), TIERS.find((t) => t.key === "shokichi"), TIERS.find((t) => t.key === "kichi")]);
        playTone([523, 659], "triangle", 0.1);
      } else {
        tier = pick([TIERS.find((t) => t.key === "suekichi"), TIERS.find((t) => t.key === "kyo")]);
        playTone([330, 262], "sine", 0.12);
      }
      renderTierResult(resultEl, tier, { title: `${a.emoji} ${b.emoji} ${c.emoji} - ${tier.emoji} ${tier.label}`, sub: extraNote });
      btn.disabled = false;
    }, 1450);
  });
}

/* ================= あみだくじ ================= */
const AMIDA_COLS = 5, AMIDA_ROWS = 10, AMIDA_COL_SP = 52, AMIDA_ROW_H = 26;
function generateAmidaRungs() {
  const rungs = [];
  for (let r = 0; r < AMIDA_ROWS; r++) {
    const row = new Array(AMIDA_COLS - 1).fill(false);
    let prev = false;
    for (let i = 0; i < AMIDA_COLS - 1; i++) {
      const place = !prev && Math.random() < 0.38;
      row[i] = place;
      prev = place;
    }
    rungs.push(row);
  }
  return rungs;
}
function drawAmidaBase(svg, rungs) {
  const w = AMIDA_COL_SP * (AMIDA_COLS - 1) + 40;
  const h = AMIDA_ROW_H * AMIDA_ROWS + 30;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", "100%");
  svg.innerHTML = "";
  const xOf = (c) => 20 + c * AMIDA_COL_SP;
  for (let c = 0; c < AMIDA_COLS; c++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", xOf(c)); line.setAttribute("x2", xOf(c));
    line.setAttribute("y1", 15); line.setAttribute("y2", h - 15);
    line.setAttribute("class", "amida-base-line");
    svg.appendChild(line);
  }
  rungs.forEach((row, r) => {
    row.forEach((on, i) => {
      if (!on) return;
      const y = 15 + r * AMIDA_ROW_H;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", xOf(i)); line.setAttribute("x2", xOf(i + 1));
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      line.setAttribute("class", "amida-base-line");
      svg.appendChild(line);
    });
  });
  return { xOf, h };
}
function simulateAmida(rungs, startCol) {
  let col = startCol;
  const waypoints = [{ row: 0, col }];
  for (let r = 0; r < AMIDA_ROWS; r++) {
    const row = rungs[r];
    if (col > 0 && row[col - 1]) col -= 1;
    else if (col < AMIDA_COLS - 1 && row[col]) col += 1;
    waypoints.push({ row: r + 1, col });
  }
  return waypoints;
}
function renderAmida() {
  const svg = document.getElementById("amida-svg");
  const resultEl = document.getElementById("amida-result");
  const startBtns = Array.from(document.querySelectorAll(".amida-start-btn"));
  let rungs = generateAmidaRungs();
  const meta = drawAmidaBase(svg, rungs);

  function reset() {
    rungs = generateAmidaRungs();
    drawAmidaBase(svg, rungs);
    resultEl.innerHTML = "";
    startBtns.forEach((b) => (b.disabled = false));
  }

  startBtns.forEach((btn, startCol) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      startBtns.forEach((b) => (b.disabled = true));
      const waypoints = simulateAmida(rungs, startCol);
      const xOf = meta.xOf;
      let d = `M ${xOf(waypoints[0].col)} 15`;
      for (let i = 1; i < waypoints.length; i++) {
        const y = 15 + waypoints[i].row * AMIDA_ROW_H;
        d += ` L ${xOf(waypoints[i].col)} ${y}`;
      }
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "amida-path");
      svg.appendChild(path);
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(() => {
        path.style.transition = "stroke-dashoffset 1.1s ease";
        path.style.strokeDashoffset = "0";
      });
      playTone([440, 494, 554], "sine", 0.3);
      setTimeout(() => {
        const endCol = waypoints[waypoints.length - 1].col;
        const prize = AMIDA_PRIZES[endCol];
        const tier = TIERS.find((t) => t.key === prize.tierKey);
        renderTierResult(resultEl, tier, {
          title: `${prize.label} - ${tier.emoji} ${tier.label}`,
          extra: `<button class="primary-btn small amida-retry-btn">🪜 もう一度引く</button>`,
        });
        resultEl.querySelector(".amida-retry-btn").addEventListener("click", reset);
      }, 1250);
    });
  });
}

/* ================= ダーツ占い ================= */
function renderDart() {
  const board = document.getElementById("dart-board");
  const resultEl = document.getElementById("dart-result");
  board.addEventListener("pointerdown", (e) => {
    const rect = board.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const R = rect.width / 2;
    let ringIdx = Math.floor((dist / R) * DART_RINGS.length);
    if (ringIdx >= DART_RINGS.length) ringIdx = DART_RINGS.length - 1;
    const ring = DART_RINGS[ringIdx];
    const tier = TIERS.find((t) => t.key === ring.tierKey);

    const mark = document.createElement("div");
    mark.className = "dart-mark";
    mark.style.left = (e.clientX - rect.left) + "px";
    mark.style.top = (e.clientY - rect.top) + "px";
    board.appendChild(mark);
    setTimeout(() => mark.remove(), 2000);

    playTone(ringIdx === 0 ? [659, 880, 1108] : [392], "triangle", 0.1);
    renderTierResult(resultEl, tier, { title: `${ring.label} - ${tier.emoji} ${tier.label}` });
  });
}

/* ================= トランプ占い ================= */
function renderTrump() {
  const btn = document.getElementById("trump-draw-btn");
  const cardEl = document.getElementById("trump-card");
  const resultEl = document.getElementById("trump-result");
  btn.addEventListener("click", () => {
    cardEl.classList.remove("flipped");
    cardEl.classList.add("flipping");
    setTimeout(() => {
      cardEl.classList.remove("flipping");
      const suit = pick(TRUMP_SUITS);
      const rank = pick(TRUMP_RANKS);
      const isRed = suit.key === "heart" || suit.key === "diamond";
      cardEl.innerHTML = `<div class="trump-inner ${isRed ? "red" : "black"}"><div class="trump-rank">${rank}</div><div class="trump-mark">${suit.mark}</div></div>`;
      cardEl.classList.add("flipped");
      const tier = pickTier(Math.random);
      playTone([440, 554], "triangle", 0.12);
      renderTierResult(resultEl, tier, { title: `${suit.mark}${rank} - ${tier.emoji} ${tier.label}`, sub: suit.flavor });
    }, 420);
  });
}

/* ================= 福引ガチャ ================= */
function renderGacha() {
  const btn = document.getElementById("gacha-draw-btn");
  const capsule = document.getElementById("gacha-capsule");
  const resultEl = document.getElementById("gacha-result");
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    btn.disabled = true;
    capsule.textContent = "🎰";
    capsule.classList.add("shaking");
    playTone([349, 392, 440], "square", 0.12);
    setTimeout(() => {
      capsule.classList.remove("shaking");
      const total = GACHA_RARITIES.reduce((s, g) => s + g.weight, 0);
      let r = Math.random() * total, rarity = GACHA_RARITIES[0];
      for (const g of GACHA_RARITIES) { if (r < g.weight) { rarity = g; break; } r -= g.weight; }
      const tier = TIERS.find((t) => t.key === rarity.tierKey);
      capsule.textContent = "🎁";
      const stars = "★".repeat(rarity.stars) + "☆".repeat(5 - rarity.stars);
      if (rarity.stars >= 4) { playTone([659, 784, 988, 1319], "triangle", 0.1); confettiBurst(); }
      else playTone([523], "sine", 0.14);
      renderTierResult(resultEl, tier, { title: `${stars} ${rarity.label} - ${tier.emoji} ${tier.label}` });
      btn.disabled = false;
    }, 750);
  });
}

/* ================= 宝箱えらび ================= */
function renderChest() {
  const wrap = document.getElementById("chest-buttons");
  const resultEl = document.getElementById("chest-result");
  function build() {
    wrap.innerHTML = CHEST_EMOJIS.map((e, i) => `<button class="chest-btn" data-i="${i}">${e}</button>`).join("");
    wrap.querySelectorAll(".chest-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".chest-btn").forEach((b) => (b.disabled = true));
        btn.textContent = "✨";
        btn.classList.add("chest-open");
        const tier = pickTier(Math.random);
        playTone([440, 554, 659], "triangle", 0.12);
        setTimeout(() => {
          renderTierResult(resultEl, tier, {
            title: `${tier.emoji} ${tier.label}`,
            extra: `<button class="primary-btn small chest-retry-btn">📦 もう一度選ぶ</button>`,
          });
          resultEl.querySelector(".chest-retry-btn").addEventListener("click", () => { build(); resultEl.innerHTML = ""; });
        }, 500);
      });
    });
  }
  build();
}

/* ================= 更新履歴 ================= */
function renderChangelog() {
  const el = document.getElementById("changelog-list");
  el.innerHTML = CHANGELOG.map((c) => `
    <div class="changelog-entry">
      <div class="changelog-head"><span class="changelog-version">v${c.version}</span><span class="changelog-date">${c.date}</span></div>
      <ul>${c.notes.map((n) => `<li>${n}</li>`).join("")}</ul>
    </div>`).join("");
  document.getElementById("site-version").textContent = `v${SITE_VERSION}`;
}

/* ================= 初期化 ================= */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("today-display").textContent = todayDisplay();
  initTabs();
  renderOmikuji();
  renderZodiac();
  renderBlood();
  renderEto();
  renderJanken();
  renderCoinDice();
  renderRoulette();
  renderTarot();
  renderLuckyNumber();
  renderSlot();
  renderAmida();
  renderDart();
  renderTrump();
  renderGacha();
  renderChest();
  renderChangelog();
  initLogoEgg();
  initKonamiEgg();
  initFooterStarEgg();
  initSoundToggle();
  checkMidnightEgg();
  setInterval(checkMidnightEgg, 30000);

  document.getElementById("legend-close").addEventListener("click", () => {
    document.getElementById("legend-modal").classList.remove("open");
  });
});
