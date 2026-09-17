/* FELICIA — 공용 로직
   팀 데이터 · 결산 슬라이드 · 목소리 분석 · 지문 로고 작도 · 응원 메시지 저장소 */
(function (global) {
  "use strict";

  /* ======================================================================
     1. 팀 데이터 — 여기만 고치면 세 페이지에 전부 반영됩니다.
     ====================================================================== */
  const TEAM = {
    name: "FELICIA",
    founded: "2024-04-22",   // 결성
    trip: "2026-09-23",      // 이번 여행
    practice: 256,           // 총 연습 횟수
    phours: 2.5,             // 1회 연습 시간
    stages: 26,              // 무대에 선 횟수
    smin: 25,                // 1회 무대 길이(분)
    songs: 46,               // 함께 부른 곡
    events: 20,              // 함께 지원 간 총회 및 지파 행사
    members: [
      { id: "soyeon",  name: "김소연",     part: "Soprano" },
      { id: "jeongeun",name: "서정은",     part: "Soprano" },
      { id: "sumin",   name: "박수민",     part: "Alto" },
      { id: "euntae",  name: "박은태",     part: "Tenor",  role: "팀장" },
      { id: "jaebin",  name: "신재빈",     part: "Bass",   absent: true },
      { id: "dohyung", name: "이도형",     part: "Bass" },
      { id: "solchan", name: "강솔찬마루", part: "Bass" }
    ]
  };

  /* 응원 메시지 저장소 주소 (Google Apps Script 웹앱 URL).
     비워두면 이 기기 안에서만 저장됩니다 — 배포 후 반드시 채워주세요. */
  const ENDPOINT = "";

  /* 로고 이미지 안에서 원형 링이 차지하는 위치 (이미지 크기에 대한 비율).
     지문 링이 로고 원과 어긋나 보이면 이 세 값만 조정하면 됩니다. */
  const LOGO_GEOM = { cx: 0.505, cy: 0.372, r: 0.265 };
  const LOGO_BOX = { w: 0.66, top: 0.085 };   // 캔버스 대비 로고 배치

  /* ======================================================================
     2. 계산된 기록
     ====================================================================== */
  function stats() {
    const fd = new Date(TEAM.founded + "T00:00:00");
    const td = new Date(TEAM.trip + "T00:00:00");
    const days = Math.max(0, Math.round((td - fd) / 86400000));
    const practiceH = Math.round(TEAM.practice * TEAM.phours);
    const stageMin = Math.round(TEAM.stages * TEAM.smin);
    const ratio = practiceH > 0 ? (stageMin / 60) / practiceH * 100 : 0;
    const personH = practiceH * TEAM.members.length;
    return {
      days, practiceH, stageMin, ratio, personH,
      years: days / 365.25,
      practiceDays: practiceH / 24,
      attending: TEAM.members.filter(m => !m.absent).length,
      total: TEAM.members.length,
      foundedLabel: fd.getFullYear() + "년 " + (fd.getMonth() + 1) + "월 " + fd.getDate() + "일",
      tripLabel: (td.getMonth() + 1) + "월 " + td.getDate() + "일"
    };
  }

  /* ======================================================================
     3. 작은 도구들
     ====================================================================== */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nf = n => Number(n).toLocaleString("ko-KR");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const member = id => TEAM.members.find(m => m.id === id) || null;

  /* Float32(0..1) ↔ base64 — 분석 결과를 작게 실어 다른 기기가 같은 그림을 다시 그린다. */
  function encArr(arr) {
    let s = "";
    for (let i = 0; i < arr.length; i++) s += String.fromCharCode(Math.round(clamp(arr[i], 0, 1) * 255));
    return btoa(s);
  }
  function decArr(str) {
    const b = atob(str), a = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i) / 255;
    return a;
  }
  function inflate(p) {
    return {
      env: decArr(p.env), bands: decArr(p.bands),
      low: p.low, high: p.high, avg: p.avg, avgHz: p.avgHz,
      seconds: p.seconds, voiced: p.voiced
    };
  }

  /* ======================================================================
     4. 저장소 — Apps Script 웹앱이 있으면 거기에, 없으면 이 기기에
     ====================================================================== */
  const LS_CHEERS = "felicia.cheers";
  const LS_PRINTS = "felicia.prints";
  const lsRead = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const lsWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  const store = {
    remote: !!ENDPOINT,

    async getCheers() {
      if (!ENDPOINT) return lsRead(LS_CHEERS) || [];
      const r = await fetch(ENDPOINT + "?kind=cheers&t=" + Date.now());
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "read failed");
      return j.items || [];
    },

    async addCheer(item) {
      const rec = Object.assign({ id: "c" + Date.now() + Math.floor(Math.random() * 1000), at: new Date().toISOString() }, item);
      if (!ENDPOINT) {
        const all = lsRead(LS_CHEERS) || [];
        all.push(rec);
        if (!lsWrite(LS_CHEERS, all)) throw new Error("이 브라우저에 저장할 수 없습니다.");
        return rec;
      }
      // text/plain 으로 보내 사전 요청(preflight)을 피한다 — Apps Script 웹앱의 제약.
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ kind: "cheers", action: "add", item: rec })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "write failed");
      return rec;
    },

    async getPrints() {
      if (!ENDPOINT) return lsRead(LS_PRINTS) || {};
      const r = await fetch(ENDPOINT + "?kind=prints&t=" + Date.now());
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "read failed");
      return j.data || {};
    },

    async putPrints(map) {
      if (!ENDPOINT) {
        if (!lsWrite(LS_PRINTS, map)) throw new Error("이 브라우저에 저장할 수 없습니다.");
        return;
      }
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ kind: "prints", action: "put", data: map })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "write failed");
    }
  };

  /* ======================================================================
     5. 로고
     ====================================================================== */
  const logo = { img: null, ready: null };
  logo.ready = new Promise(resolve => {
    const im = new Image();
    im.onload = () => { logo.img = im; resolve(im); };
    im.onerror = () => resolve(null);       // 없으면 도형으로 그린다
    im.src = "assets/logo.png";
  });

  /* ======================================================================
     6. 결산 슬라이드
     ====================================================================== */
  function slides() {
    const s = stats();
    const out = [
      { kick: "Felicia", lead: "우리의 결산", foot: "숫자만 보여줍니다. 해석은 각자.", quiet: true },
      { kick: "처음", lead: "우리는 " + s.foundedLabel + "에 처음 만났습니다.", big: nf(s.days), unit: "일 전", foot: "약 " + s.years.toFixed(1) + "년입니다." },
      { kick: "연습", lead: "그동안 모여서 연습한 횟수", big: nf(TEAM.practice), unit: "번", foot: "한 번도 안 빠진 사람은 아무도 없었습니다." },
      { kick: "시간", lead: "연습에 쓴 시간을 모두 더하면", big: nf(s.practiceH), unit: "시간", foot: "쉬지 않고 이어 붙이면 " + s.practiceDays.toFixed(1) + "일입니다." },
      { kick: "그런데", lead: "그중 실제로 무대에 선 시간은", big: nf(s.stageMin), unit: "분", foot: "무대 " + TEAM.stages + "번, 한 번에 " + TEAM.smin + "분." },
      { kick: "비율", lead: "연습한 시간 대비 무대에 선 시간", big: s.ratio.toFixed(2) + "%", foot: "나머지 " + (100 - s.ratio).toFixed(2) + "%는 전부 연습이었습니다.", quiet: true },
      { kick: "일곱 명", lead: "일곱 명의 시간을 모두 더하면", big: nf(s.personH), unit: "시간", foot: "전부 주말과 퇴근 후에서 잘라낸 시간입니다." },
      { kick: "레퍼토리", lead: "함께 부른 곡", big: nf(TEAM.songs), unit: "곡" },
      { kick: "함께 간 곳", lead: "총회와 지파 행사에 함께 지원 간 횟수", big: nf(TEAM.events), unit: "번", foot: "노래하러 간 날, 그 이동 시간까지는 세지 않았습니다." }
    ];

    TEAM.members.forEach((m, i) => {
      out.push({
        kick: "단원 " + String(i + 1).padStart(2, "0") + " · " + m.part + (m.role ? " · " + m.role : "") + (m.absent ? " · 오늘은 함께 있지 않음" : ""),
        member: m.name,
        memberId: m.id,
        absent: !!m.absent,
        foot: m.absent ? "이번 여행에는 함께 오지 못했습니다. 그래도 " + nf(s.practiceH) + "시간 안에는 있습니다." : ""
      });
    });

    out.push({ kick: "마지막", lead: "무대에 선 " + nf(s.stageMin) + "분이 아니라,", big: nf(s.practiceH), unit: "시간 — 같은 방에 함께 있었던 시간." });
    out.push({ kick: "", lead: "그게 우리가 한 일의 전부입니다.\n그리고 오늘 밤도, 그중 하나입니다.", quiet: true });
    return out;
  }

  /* 슬라이드 하나를 HTML로. prints 가 있으면 개인 슬라이드에 측정 음역을 얹는다. */
  function slideHTML(s, prints) {
    let html = '<p class="wr-kicker">' + esc(s.kick || "") + "</p>";
    if (s.member) {
      html += '<p class="wr-lead">' + esc(s.member) + "</p>";
      const p = prints && prints[s.memberId];
      if (p) html += '<div class="wr-big" style="font-size:clamp(32px,6.5vw,68px)">' + esc(p.low + " – " + p.high) + "</div>";
      else html += '<p class="wr-unit">' + esc(s.absent ? "" : "목소리 지문 준비 중") + "</p>";
    } else {
      if (s.lead) html += '<p class="wr-lead">' + esc(s.lead).replace(/\n/g, "<br>") + "</p>";
      if (s.big) html += '<div class="wr-big">' + esc(s.big) + "</div>";
      if (s.unit) html += '<p class="wr-unit">' + esc(s.unit) + "</p>";
    }
    let foot = s.foot;
    if (s.member && prints && prints[s.memberId] && !s.absent) foot = "오늘 측정한 음역입니다.";
    if (foot) html += '<p class="wr-foot">' + esc(foot) + "</p>";
    return '<div class="wr-slide fadein">' + html + "</div>";
  }

  /* 슬라이드 뷰어 하나를 붙인다. 반환된 객체로 넘기고 되돌린다. */
  function mountWrapped(opts) {
    const stageEl = opts.stage, dotsEl = opts.dots, prevEl = opts.prev, nextEl = opts.next;
    let idx = 0, arr = slides(), prints = opts.prints || null;

    function paint() {
      const s = arr[idx];
      stageEl.className = "wr" + (s.quiet ? " wr-quiet" : "") + (s.absent ? " wr-absent" : "");
      stageEl.innerHTML = slideHTML(s, prints);
      if (dotsEl) dotsEl.innerHTML = arr.map((_, i) => '<i class="' + (i === idx ? "on" : "") + '"></i>').join("");
      if (prevEl) prevEl.disabled = idx === 0;
      if (nextEl) nextEl.textContent = idx === arr.length - 1 ? "처음으로" : "다음";
    }
    function step(d) { idx = (idx + d + arr.length) % arr.length; paint(); }

    if (prevEl) prevEl.addEventListener("click", () => step(-1));
    if (nextEl) nextEl.addEventListener("click", () => step(1));
    if (opts.keys) {
      document.addEventListener("keydown", e => {
        if (opts.active && !opts.active()) return;
        if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); step(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      });
    }
    paint();
    return {
      paint,
      step,
      setPrints(p) { prints = p; paint(); },
      reset() { idx = 0; arr = slides(); paint(); }
    };
  }

  /* ======================================================================
     7. 목소리 분석
     ====================================================================== */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, half = len >> 1;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const a = ang * k, wr = Math.cos(a), wi = Math.sin(a);
          const ur = re[i + k], ui = im[i + k];
          const xr = re[i + k + half], xi = im[i + k + half];
          const vr = xr * wr - xi * wi, vi = xr * wi + xi * wr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + half] = ur - vr; im[i + k + half] = ui - vi;
        }
      }
    }
  }

  const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const hzToNote = hz => {
    const n = Math.round(12 * Math.log2(hz / 440) + 69);
    return NOTE[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  };

  function resample(data, from, to) {
    const ratio = from / to, out = new Float32Array(Math.floor(data.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const p = i * ratio, i0 = Math.floor(p), f = p - i0;
      out[i] = (data[i0] || 0) * (1 - f) + (data[i0 + 1] || 0) * f;
    }
    return out;
  }

  /* 자기상관 피치 — 다운샘플한 신호에서만 돌린다. */
  function pitchAt(buf, off, len, sr) {
    let rms = 0;
    for (let i = 0; i < len; i++) { const v = buf[off + i] || 0; rms += v * v; }
    if (Math.sqrt(rms / len) < 0.012) return -1;
    const minLag = Math.max(2, Math.floor(sr / 1000)), maxLag = Math.min(len - 1, Math.floor(sr / 65));
    let best = -1, bestC = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0, e1 = 0, e2 = 0;
      for (let i = 0; i < len - lag; i++) {
        const a = buf[off + i] || 0, b = buf[off + i + lag] || 0;
        c += a * b; e1 += a * a; e2 += b * b;
      }
      const norm = c / Math.sqrt(e1 * e2 + 1e-12);
      if (norm > bestC) { bestC = norm; best = lag; }
    }
    return (bestC < 0.55 || best < 0) ? -1 : sr / best;
  }

  const yieldTick = () => new Promise(r => setTimeout(r, 0));

  async function analyze(arrayBuffer, onProgress) {
    const prog = onProgress || function () {};
    const ctx = new (global.AudioContext || global.webkitAudioContext)();
    const audio = await ctx.decodeAudioData(arrayBuffer);
    const sr = audio.sampleRate, n = audio.length;
    const mono = new Float32Array(n);
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const d = audio.getChannelData(ch);
      for (let i = 0; i < n; i++) mono[i] += d[i] / audio.numberOfChannels;
    }
    ctx.close();
    prog(0.25); await yieldTick();

    // 시간축 진폭 — 원주에 감을 720조각
    const SLICES = 720, env = new Float32Array(SLICES);
    const per = Math.max(1, Math.floor(n / SLICES));
    let peak = 0;
    for (let s = 0; s < SLICES; s++) {
      let sum = 0; const start = s * per;
      for (let i = 0; i < per; i++) { const v = mono[start + i] || 0; sum += v * v; }
      env[s] = Math.sqrt(sum / per);
      if (env[s] > peak) peak = env[s];
    }
    if (peak > 0) for (let s = 0; s < SLICES; s++) env[s] /= peak;
    prog(0.45); await yieldTick();

    // 평균 스펙트럼 — 링을 변조할 96개 밴드 (60Hz~6kHz 로그 분할)
    const N = 2048, BANDS = 96, bands = new Float32Array(BANDS);
    let frames = 0;
    const hop = Math.max(N, Math.floor(n / 60));
    for (let off = 0; off + N < n; off += hop) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = (mono[off + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      fft(re, im);
      for (let b = 0; b < BANDS; b++) {
        const f0 = 60 * Math.pow(100, b / BANDS), f1 = 60 * Math.pow(100, (b + 1) / BANDS);
        const k0 = Math.max(1, Math.floor(f0 / sr * N)), k1 = Math.min(N / 2 - 1, Math.ceil(f1 / sr * N));
        let m = 0, c = 0;
        for (let k = k0; k <= k1; k++) { m += Math.hypot(re[k], im[k]); c++; }
        bands[b] += c ? m / c : 0;
      }
      frames++;
    }
    if (frames) for (let b = 0; b < BANDS; b++) bands[b] /= frames;
    let bmax = 1e-9;
    for (let b = 0; b < BANDS; b++) if (bands[b] > bmax) bmax = bands[b];
    for (let b = 0; b < BANDS; b++) bands[b] = Math.pow(bands[b] / bmax, 0.45);
    prog(0.7); await yieldTick();

    // 음역
    const PSR = 11025, low = resample(mono, sr, PSR);
    const FR = 1024, step = Math.max(FR, Math.floor(low.length / 120));
    const hz = [];
    for (let off = 0; off + FR < low.length; off += step) {
      const p = pitchAt(low, off, FR, PSR);
      if (p > 60 && p < 1100) hz.push(p);
    }
    hz.sort((a, b) => a - b);
    prog(1);

    const pick = q => hz.length ? hz[clamp(Math.floor(hz.length * q), 0, hz.length - 1)] : 0;
    const lowHz = pick(0.05), highHz = pick(0.95), midHz = pick(0.5);
    return {
      env, bands,
      seconds: +(n / sr).toFixed(1),
      voiced: hz.length,
      low: lowHz ? hzToNote(lowHz) : "—",
      high: highHz ? hzToNote(highHz) : "—",
      avg: midHz ? hzToNote(midHz) : "—",
      avgHz: Math.round(midHz)
    };
  }

  function pack(a) {
    return {
      low: a.low, high: a.high, avg: a.avg, avgHz: a.avgHz,
      seconds: a.seconds, voiced: a.voiced,
      env: encArr(a.env), bands: encArr(a.bands)
    };
  }

  /* ======================================================================
     8. 지문 로고 작도
     ====================================================================== */
  function drawFallbackMark(g, S, fg) {
    // logo.png 가 없을 때: 손그림 느낌의 삼중 링 + 워드마크
    const box = S * LOGO_BOX.w, left = (S - box) / 2, top = S * LOGO_BOX.top;
    const cx = left + box * LOGO_GEOM.cx, cy = top + box * LOGO_GEOM.cy, R = box * LOGO_GEOM.r;
    g.save();
    g.strokeStyle = fg; g.lineWidth = R * 0.016; g.lineCap = "round";
    for (let s = 0; s < 3; s++) {
      g.beginPath();
      const rr = R * (1 - s * 0.018), ph = s * 1.9;
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.02) {
        const w = rr * (1 + 0.012 * Math.sin(a * 3 + ph) + 0.008 * Math.sin(a * 7 + ph * 2));
        const x = cx + Math.cos(a - 0.4) * w, y = cy + Math.sin(a - 0.4) * w;
        a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = fg;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = 'italic 300 ' + (R * 0.95) + 'px "Cormorant Garamond", serif';
    g.fillText("F", cx, cy + R * 0.02);
    g.font = '400 ' + (box * 0.086) + 'px "Cormorant Garamond", serif';
    g.letterSpacing = (box * 0.055).toFixed(1) + "px";
    g.fillText("FELICIA", cx + box * 0.027, top + box * 0.82);
    g.letterSpacing = "0px";
    g.restore();
  }

  /**
   * 지문 로고 한 장을 캔버스에 그린다.
   *   cv    정사각 캔버스
   *   vp    {memberId, a:{env,bands,low,high,avg,seconds}} 또는 null
   *   bg    "cream" | "ink"
   */
  function drawArt(cv, vp, bg) {
    const g = cv.getContext("2d");
    const S = cv.width;
    const onCream = bg !== "ink";
    const ground = onCream ? "#F6F1E3" : "#14120D";
    const fg = onCream ? "#C9A639" : "#F2CF5B";
    const txt = onCream ? "#3B3629" : "#E8E1CC";

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = ground;
    g.fillRect(0, 0, S, S);

    const box = S * LOGO_BOX.w, left = (S - box) / 2, top = S * LOGO_BOX.top;
    const cx = left + box * LOGO_GEOM.cx, cy = top + box * LOGO_GEOM.cy, R = box * LOGO_GEOM.r;
    const inner = R * 1.10, span = S * 0.105;
    const a = vp && vp.a;

    if (a) {
      // (1) 스펙트럼으로 변조된 동심 링 — 로고의 손그림 링과 같은 어법
      g.save(); g.lineCap = "round";
      for (let s = 0; s < 3; s++) {
        g.beginPath();
        g.strokeStyle = fg;
        g.globalAlpha = (onCream ? 0.26 : 0.30) - s * 0.07;
        g.lineWidth = S * 0.0018;
        const rr = inner + span * (0.34 + s * 0.28);
        for (let ang = 0; ang <= Math.PI * 2 + 0.01; ang += 0.01) {
          const b = a.bands[Math.floor(ang / (Math.PI * 2) * a.bands.length) % a.bands.length];
          const w = rr * (1 + 0.032 * b * Math.sin(ang * (3 + s * 2) + s * 1.7) + 0.012 * b);
          g[ang === 0 ? "moveTo" : "lineTo"](cx + Math.cos(ang - 0.4) * w, cy + Math.sin(ang - 0.4) * w);
        }
        g.stroke();
      }
      g.restore();

      /* (2) 방사형 진폭 지문 — 시간축을 원주에 감아 놓은 파형.
         720개를 다 그리면 선이 서로 붙어 덩어리로 보인다. 광선 수를 원주에 맞춰
         줄이고 구간 평균을 쓰면 정보는 남고 획은 하나하나 읽힌다. */
      const SL = a.env.length;
      const RAYS = 240;
      const group = Math.max(1, Math.round(SL / RAYS));
      const ray = new Float32Array(RAYS);
      for (let i = 0; i < RAYS; i++) {
        const base = Math.floor(i / RAYS * SL);
        let sum = 0;
        for (let j = 0; j < group; j++) sum += a.env[(base + j) % SL];
        ray[i] = sum / group;
      }

      g.save(); g.lineCap = "round";
      for (let i = 0; i < RAYS; i++) {
        const sm = ray[i];
        const len = span * Math.pow(sm, 0.7);
        if (len < span * 0.03) continue;
        const ang = i / RAYS * Math.PI * 2 - Math.PI / 2;
        g.beginPath();
        g.strokeStyle = fg;
        g.globalAlpha = (onCream ? 0.16 : 0.20) + sm * (onCream ? 0.34 : 0.42);
        g.lineWidth = S * 0.0013;
        g.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
        g.lineTo(cx + Math.cos(ang) * (inner + len), cy + Math.sin(ang) * (inner + len));
        g.stroke();
      }
      g.restore();

      // (3) 정점에 금색 점 — 그 사람이 가장 크게 낸 순간
      g.save(); g.fillStyle = fg;
      for (let i = 0; i < RAYS; i++) {
        const p = ray[i];
        if (p > 0.82 && ray[(i + 1) % RAYS] <= p && ray[(i - 1 + RAYS) % RAYS] < p) {
          const ang = i / RAYS * Math.PI * 2 - Math.PI / 2;
          const r = inner + span * Math.pow(p, 0.7) + S * 0.009;
          g.globalAlpha = onCream ? 0.6 : 0.75;
          g.beginPath();
          g.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, S * 0.0026, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }

    // (4) 로고를 그 위에 — 지문은 로고 뒤에 깔린다
    if (logo.img) {
      g.save();
      if (onCream) g.globalCompositeOperation = "multiply";   // 흰 배경 로고를 아이보리에 녹인다
      g.drawImage(logo.img, left, top, box, box);
      g.restore();
    } else {
      drawFallbackMark(g, S, fg);
    }

    // (5) 캡션 — 로고의 넓은 자간 워드마크와 같은 어법
    const m = vp ? member(vp.memberId) : null;
    g.save();
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    if (m) {
      g.fillStyle = txt;
      g.font = '400 ' + (S * 0.044) + 'px "Gowun Batang", serif';
      g.fillText(m.name, S / 2, S * 0.815);
      g.fillStyle = fg;
      g.font = '400 ' + (S * 0.0155) + 'px "IBM Plex Sans KR", sans-serif';
      g.letterSpacing = (S * 0.006).toFixed(1) + "px";
      g.fillText(m.part.toUpperCase() + (m.role ? "  ·  " + m.role : ""), S / 2, S * 0.855);
      g.letterSpacing = "0px";
    }
    if (a) {
      g.fillStyle = onCream ? "#7A7159" : "#8C8674";
      g.font = '300 ' + (S * 0.0145) + 'px "IBM Plex Sans KR", sans-serif';
      g.letterSpacing = (S * 0.003).toFixed(1) + "px";
      g.fillText("RANGE " + a.low + "–" + a.high + "   ·   MEDIAN " + a.avg + "   ·   " + a.seconds + "S", S / 2, S * 0.902);
      g.fillText(TEAM.trip.replace(/-/g, "."), S / 2, S * 0.936);
      g.letterSpacing = "0px";
    }
    g.restore();
  }

  /* 표지용 로고 — 이미지가 없으면 도형으로 그린 캔버스를 돌려준다. */
  function coverMark(el) {
    if (logo.img) {
      el.innerHTML = '<img src="assets/logo.png" alt="FELICIA 로고">';
      return;
    }
    const c = document.createElement("canvas");
    c.width = c.height = 800;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 800, 800);
    drawFallbackMark(g, 800, "#F2CF5B");
    el.innerHTML = "";
    el.appendChild(c);
  }

  /* ======================================================================
     9. PNG 저장
     ====================================================================== */
  function savePNG(cv, filename) {
    return new Promise(resolve => {
      cv.toBlob(blob => {
        if (!blob) { resolve(false); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        resolve(true);
      }, "image/png");
    });
  }

  global.FELICIA = {
    TEAM, ENDPOINT, stats, store, logo,
    $, $$, esc, nf, clamp, member,
    encArr, decArr, inflate, pack,
    slides, slideHTML, mountWrapped,
    analyze, drawArt, coverMark, savePNG
  };
})(window);
