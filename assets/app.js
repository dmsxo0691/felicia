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
      { id: "jaebin",  name: "신재빈",     part: "Bass" },
      { id: "dohyung", name: "이도형",     part: "Bass" },
      { id: "solchan", name: "강솔찬마루", part: "Bass" }
    ]
  };

  /* 응원 메시지 저장소 주소 (Google Apps Script 웹앱 URL).
     비워두면 이 기기 안에서만 저장됩니다. */
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbxZ6sjJBfBnd0EkPlMCIOiOprjhU6fXKKFbg39squ0lN7QJP9Wz5Cs8FgwXwtcYlRrZvg/exec";

  /* 로고 이미지 안에서 원형 링이 차지하는 위치 (이미지 크기에 대한 비율).
     logo.png 픽셀에서 실측한 값입니다 — 로고를 교체하면 다시 측정해야 합니다.
     지문 링이 로고 원과 어긋나 보이면 이 세 값만 조정하면 됩니다. */
  const LOGO_GEOM = { cx: 0.4985, cy: 0.3770, r: 0.2712 };
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
    if (!p || !p.env) return null;   // 생년월일만 넣고 녹음은 아직인 경우
    return {
      env: decArr(p.env), bands: decArr(p.bands),
      low: p.low, high: p.high, avg: p.avg, avgHz: p.avgHz,
      seconds: p.seconds, voiced: p.voiced
    };
  }

  /* ---------- 별자리 ---------- */
  const ZODIAC = [
    [20, "물병자리"], [19, "물고기자리"], [21, "양자리"],   [20, "황소자리"],
    [21, "쌍둥이자리"], [22, "게자리"],   [23, "사자자리"], [23, "처녀자리"],
    [23, "천칭자리"], [23, "전갈자리"],   [23, "궁수자리"], [22, "염소자리"]
  ];
  /** 생년월일(YYYY-MM-DD)로 별자리를 구한다. 경계일 당일은 뒤쪽 별자리. */
  function zodiac(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return "";
    const i = d.getMonth();
    return d.getDate() >= ZODIAC[i][0] ? ZODIAC[i][1] : ZODIAC[(i + 11) % 12][1];
  }

  /** 2026-09-23 -> 2026.09.23 */
  const dotDate = iso => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) ? iso.replace(/-/g, ".") : "";

  /** 입교 날짜는 연도를 두 자리로 적고 두 자리로 보여줍니다.
      19-03-11 -> 19.03.11. 예전에 네 자리로 넣은 값도 두 자리로 줄여 받습니다. */
  function shortDate(v) {
    if (!v) return "";
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return m[1].slice(2) + "." + m[2] + "." + m[3];
    m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(v);
    return m ? m[1] + "." + m[2] + "." + m[3] : "";
  }
  /** 저장된 입교 값을 연·월·일로 쪼갭니다. */
  function splitJoined(v) {
    const s = shortDate(v);
    return s ? { y: s.slice(0, 2), m: s.slice(3, 5), d: s.slice(6, 8) } : { y: "", m: "", d: "" };
  }

  /* ---------- 개인 아이콘 ----------
     캔버스에 직접 그린다. 글꼴에 있는 기호를 쓰면 기기마다 없을 수 있다.
     각 draw 는 원점이 가운데, 한 변이 1인 상자 안에 그린다고 보고 그린다. */
  const ICONS = {
    note: { label: "음표", draw(g) {
      g.beginPath(); g.ellipse(-0.12, 0.26, 0.19, 0.14, -0.32, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(0.06, 0.26); g.lineTo(0.06, -0.4); g.stroke();
      g.beginPath(); g.moveTo(0.06, -0.4); g.quadraticCurveTo(0.34, -0.3, 0.3, -0.06); g.stroke();
    } },
    star: { label: "별", draw(g) {
      g.beginPath();
      g.moveTo(0, -0.46); g.quadraticCurveTo(0.08, -0.08, 0.46, 0);
      g.quadraticCurveTo(0.08, 0.08, 0, 0.46); g.quadraticCurveTo(-0.08, 0.08, -0.46, 0);
      g.quadraticCurveTo(-0.08, -0.08, 0, -0.46); g.fill();
    } },
    /* 바깥은 크게, 안쪽은 얕게 휘어 초승달을 만든다. */
    moon: { label: "달", draw(g) {
      g.beginPath();
      g.moveTo(0.12, -0.45);
      g.bezierCurveTo(-0.36, -0.34, -0.36, 0.34, 0.12, 0.45);
      g.bezierCurveTo(-0.11, 0.26, -0.11, -0.26, 0.12, -0.45);
      g.fill();
    } },
    leaf: { label: "잎", draw(g) {
      g.beginPath();
      g.moveTo(0, -0.44); g.quadraticCurveTo(0.44, -0.06, 0, 0.44);
      g.quadraticCurveTo(-0.44, -0.06, 0, -0.44); g.stroke();
      g.beginPath(); g.moveTo(0, -0.3); g.lineTo(0, 0.36); g.stroke();
    } },
    wave: { label: "물결", draw(g) {
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(-0.44, k * 0.22);
        g.bezierCurveTo(-0.15, k * 0.22 - 0.2, 0.15, k * 0.22 + 0.2, 0.44, k * 0.22);
        g.stroke();
      }
    } },
    /* 물방울과 갈리는 건 왼쪽으로 한 번 꺾이는 허리와 안쪽 혀다. */
    flame: { label: "불꽃", draw(g) {
      g.beginPath();
      g.moveTo(0.03, -0.48);
      g.bezierCurveTo(0.07, -0.26, 0.27, -0.20, 0.27, 0.05);
      g.bezierCurveTo(0.27, 0.29, 0.11, 0.45, -0.03, 0.45);
      g.bezierCurveTo(-0.22, 0.45, -0.33, 0.28, -0.29, 0.08);
      g.bezierCurveTo(-0.25, -0.09, -0.09, -0.07, -0.12, -0.23);
      g.bezierCurveTo(-0.14, -0.35, -0.05, -0.42, 0.03, -0.48);
      g.stroke();
      g.beginPath();
      g.moveTo(0.00, 0.01);
      g.bezierCurveTo(0.15, 0.13, 0.13, 0.29, 0.00, 0.35);
      g.bezierCurveTo(-0.13, 0.29, -0.15, 0.13, 0.00, 0.01);
      g.fill();
    } },
    /* 동그란 수관에 줄기를 붙이면 막대사탕으로 읽힌다. 삼각 두 단으로 세운다. */
    tree: { label: "나무", draw(g) {
      g.beginPath();
      g.moveTo(0, -0.48); g.lineTo(0.25, -0.12); g.lineTo(-0.25, -0.12); g.closePath(); g.stroke();
      g.beginPath();
      g.moveTo(0, -0.28); g.lineTo(0.36, 0.20); g.lineTo(-0.36, 0.20); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(0, 0.20); g.lineTo(0, 0.48); g.stroke();
    } },
    sun: { label: "해", draw(g) {
      g.beginPath(); g.arc(0, 0, 0.19, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        g.beginPath();
        g.moveTo(Math.cos(a) * 0.29, Math.sin(a) * 0.29);
        g.lineTo(Math.cos(a) * 0.45, Math.sin(a) * 0.45);
        g.stroke();
      }
    } },
    cross: { label: "십자", draw(g) {
      g.beginPath(); g.moveTo(0, -0.46); g.lineTo(0, 0.46); g.stroke();
      g.beginPath(); g.moveTo(-0.3, -0.12); g.lineTo(0.3, -0.12); g.stroke();
    } }
  };
  const ICON_KEYS = Object.keys(ICONS);

  /** 아이콘 하나를 (cx,cy)에 size 크기로 그린다. */
  function drawIcon(g, key, cx, cy, size, color) {
    const ic = ICONS[key];
    if (!ic) return;
    g.save();
    g.translate(cx, cy);
    g.scale(size, size);
    g.strokeStyle = color; g.fillStyle = color;
    g.lineWidth = 0.075; g.lineCap = "round"; g.lineJoin = "round";
    ic.draw(g);
    g.restore();
  }

  /* ======================================================================
     3-2. 단원 확인 코드
     네 자리 코드를 평문으로 두면 공개된 소스에서 그대로 읽힙니다. 그래서
     "felicia:<단원id>:<코드>" 의 SHA-256 앞 32자만 싣고, 입력한 코드를
     같은 방식으로 해시해 맞춰봅니다. 원본 코드는 어디에도 들어 있지 않습니다.
     다만 네 자리는 만 가지뿐이므로 작정하면 전부 시도해볼 수 있습니다 —
     소스를 들여다본 사람이 코드를 바로 읽지 못하게 막는 수준입니다.
     ====================================================================== */
  const CODE_HASH = {
    "8fae3bf3576f1644c86049fa53feec93": "soyeon",
    "2ad8930af5a37ca37f98d7708437e8a7": "jeongeun",
    "95ade685cbd78e19d8519e619b2cb0af": "sumin",
    "e6031a9f2a337215ebf37ab3f0cf8a99": "euntae",
    "b97b41de36b1ee9400d79b01207efae9": "jaebin",
    "8a1c03617126cfabefb73e8c540eaf18": "dohyung",
    "d1a36c5eae716dc9137abf4e18d7dfff": "solchan"
  };
  const LS_ME = "felicia.me";

  async function sha256hex(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /** 코드를 확인해 단원 id 를 돌려줍니다. 맞는 사람이 없으면 null. */
  async function verifyCode(code) {
    const clean = String(code || "").replace(/\D/g, "");
    if (clean.length !== 4) return null;
    for (const m of TEAM.members) {
      const h = await sha256hex("felicia:" + m.id + ":" + clean);
      if (CODE_HASH[h.slice(0, 32)] === m.id) return m.id;
    }
    return null;
  }

  const rememberMe = id => { try { localStorage.setItem(LS_ME, id); } catch (e) {} };
  const recallMe = () => {
    try {
      const id = localStorage.getItem(LS_ME);
      return id && member(id) ? id : null;
    } catch (e) { return null; }
  };
  const forgetMe = () => { try { localStorage.removeItem(LS_ME); } catch (e) {} };

  /** 그 단원에게 온 응원 + 모두에게 온 응원. */
  const cheersFor = (list, id) => list.filter(c => c.to === id || c.to === "team");

  /* ======================================================================
     4. 저장소 — Apps Script 웹앱이 있으면 거기에, 없으면 이 기기에
     ====================================================================== */
  const LS_CHEERS = "felicia.cheers";
  const LS_PRINTS = "felicia.prints";
  const lsRead = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const lsWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  /* Apps Script 는 가끔 JSON 대신 404 나 HTML 오류 페이지를 돌려준다. 실제로
     쓰기가 끝난 뒤에도 그런 응답이 와서 "실패" 로 보이는 일이 있었다.
     그래서 모든 호출을 이 함수로 감싸 몇 번 다시 시도한다.
     다시 보내도 결과가 같은 요청(읽기, prints/merge, audio/put)에만 쓴다. */
  async function callJSON(url, opts, tries) {
    const n = tries || 3;
    let last = null;
    for (let i = 0; i < n; i++) {
      try {
        const r = await fetch(url, opts);
        const text = await r.text();
        if (!r.ok) throw new Error("저장소 응답 " + r.status);
        try { return JSON.parse(text); }
        catch (e) { throw new Error("저장소가 JSON 이 아닌 응답을 보냈습니다"); }
      } catch (e) {
        last = e;
        if (i < n - 1) await new Promise(res => setTimeout(res, 900 + i * 1200));
      }
    }
    throw last;
  }

  const store = {
    remote: !!ENDPOINT,

    async getCheers() {
      if (!ENDPOINT) return lsRead(LS_CHEERS) || [];
      const j = await callJSON(ENDPOINT + "?kind=cheers&t=" + Date.now());
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
      /* text/plain 으로 보내 사전 요청(preflight)을 피한다 — Apps Script 의 제약.
         응원은 줄을 새로 붙이므로 무턱대고 다시 보내면 두 번 올라간다. 그래서
         한 번만 보내고, 응답을 못 읽었을 때는 목록에서 그 id 를 찾아 확인한다. */
      const send = () => fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ kind: "cheers", action: "add", item: rec })
      }).then(r => r.text()).then(t => JSON.parse(t));

      try {
        const j = await send();
        if (!j.ok) throw new Error(j.error || "write failed");
        return rec;
      } catch (e) {
        await new Promise(res => setTimeout(res, 1800));
        let landed = false;
        try { landed = (await store.getCheers()).some(c => c.id === rec.id); } catch (e2) {}
        if (landed) return rec;             // 실은 들어갔다
        const j2 = await send();            // 확실히 안 들어갔으니 한 번 더
        if (!j2.ok) throw new Error(j2.error || "write failed");
        return rec;
      }
    },

    async getPrints() {
      if (!ENDPOINT) return lsRead(LS_PRINTS) || {};
      const j = await callJSON(ENDPOINT + "?kind=prints&t=" + Date.now());
      if (!j.ok) throw new Error(j.error || "read failed");
      return j.data || {};
    },

    /** 단원 한 명만 저장한다. 각자 자기 기기에서 만들기 때문에,
        지도 전체를 덮어쓰면 동시에 만든 사람의 것이 지워질 수 있다. */
    async mergePrint(id, rec) {
      if (!ENDPOINT) {
        const all = lsRead(LS_PRINTS) || {};
        all[id] = rec;
        if (!lsWrite(LS_PRINTS, all)) throw new Error("이 브라우저에 저장할 수 없습니다.");
        return;
      }
      const j = await callJSON(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ kind: "prints", action: "merge", id: id, data: rec })
      });
      if (j.ok) return;
      // 저장소가 아직 merge 를 모르는 예전 판이면 읽어서 합쳐 다시 쓴다.
      const all = await store.getPrints();
      all[id] = rec;
      await store.putPrints(all);
    },

    /* ---------- 녹음 파일 ----------
       시트 칸에는 5만 자까지만 들어가 음성을 담을 수 없으므로 저장소가
       드라이브에 넣습니다. 여기서는 base64 로 주고받습니다. */
    async putAudio(id, file) {
      if (!ENDPOINT) throw new Error("저장소가 연결되지 않았습니다.");
      const b64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(",")[1] || "");
        fr.onerror = () => rej(new Error("파일을 읽지 못했습니다."));
        fr.readAsDataURL(file);
      });
      const ext = ((file.name || "").match(/\.([A-Za-z0-9]{1,8})$/) || [, ""])[1]
        || (String(file.type || "").split("/")[1] || "m4a").replace(/[^a-z0-9]/gi, "");
      const j = await callJSON(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          kind: "audio", action: "put", id: id,
          ext: ext.toLowerCase(), mime: file.type || "audio/mp4", b64: b64
        })
      }, 2);
      if (!j.ok) throw new Error(j.error || "녹음을 저장하지 못했습니다.");
      return j;
    },

    /** 올라온 녹음 목록. [{id, name, mime, bytes, at}] */
    async listAudio() {
      if (!ENDPOINT) return [];
      const j = await callJSON(ENDPOINT + "?kind=audios&t=" + Date.now());
      if (!j.ok) throw new Error(j.error || "목록을 불러오지 못했습니다.");
      return j.items || [];
    },

    /** 녹음 하나를 받아 Blob 으로 돌려줍니다. */
    async getAudio(id) {
      if (!ENDPOINT) throw new Error("저장소가 연결되지 않았습니다.");
      const j = await callJSON(ENDPOINT + "?kind=audio&id=" + encodeURIComponent(id) + "&t=" + Date.now());
      if (!j.ok) throw new Error(j.error || "녹음을 불러오지 못했습니다.");
      const bin = atob(j.b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return { name: j.name, mime: j.mime, bytes: j.bytes, blob: new Blob([u8], { type: j.mime }) };
    },

    async putPrints(map) {
      if (!ENDPOINT) {
        if (!lsWrite(LS_PRINTS, map)) throw new Error("이 브라우저에 저장할 수 없습니다.");
        return;
      }
      const j = await callJSON(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ kind: "prints", action: "put", data: map })
      });
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
    /* 무대 1분마다 연습 몇 분인지. 정확히는 59분, 아래 문장에서는 1시간으로 말한다. */
    const minPerStageMin = s.stageMin > 0 ? Math.round(s.practiceH * 60 / s.stageMin) : 0;
    const hoursPerSong = TEAM.songs > 0 ? s.practiceH / TEAM.songs : 0;

    /* num 을 함께 실어두면 화면에서 0 부터 세어 올릴 수 있다. */
    const out = [
      { kick: "Felicia", lead: "우리의 결산", quiet: true, cover: true },
      { kick: "처음", lead: "우리는 " + s.foundedLabel + "에 처음 만났습니다.", big: nf(s.days), num: s.days, unit: "일 전", foot: "약 " + s.years.toFixed(1) + "년입니다." },
      { kick: "연습", lead: "그동안 모여서 연습한 횟수", big: nf(TEAM.practice), num: TEAM.practice, unit: "번", foot: "한 번도 안 빠진 사람은 아무도 없었습니다." },
      { kick: "시간", lead: "연습에 쓴 시간을 모두 더하면", big: nf(s.practiceH), num: s.practiceH, unit: "시간", foot: "쉬지 않고 이어 붙이면 " + s.practiceDays.toFixed(1) + "일입니다." },
      { kick: "그런데", lead: "그중 실제로 무대에 선 시간은", big: nf(s.stageMin), num: s.stageMin, unit: "분", foot: "무대 " + TEAM.stages + "번, 한 번에 " + TEAM.smin + "분." },
      /* 100% 에서 깎여 내려와야 얼마나 작은 몫인지가 눈에 보인다. */
      { kick: "비율", lead: "연습한 시간 대비 무대에 선 시간", big: s.ratio.toFixed(2) + "%", num: s.ratio, from: 100, dec: 2, suffix: "%", foot: "나머지 " + (100 - s.ratio).toFixed(2) + "%는 전부 연습이었습니다.", quiet: true },
      { kick: "일곱 명", lead: "일곱 명의 시간을 모두 더하면", big: nf(s.personH), num: s.personH, unit: "시간", foot: "전부 주말과 퇴근 후에 할애한 시간입니다." },
      { kick: "바꿔 말하면", big: nf(minPerStageMin), num: minPerStageMin, unit: "분", foot: "1분의 무대를 위해 1시간을 연습했습니다." },
      { kick: "레퍼토리", lead: "함께 부른 곡", big: nf(TEAM.songs), num: TEAM.songs, unit: "곡" },
      { kick: "한 곡", lead: "한 곡을 무대에 올리기까지 평균", big: hoursPerSong.toFixed(1), num: hoursPerSong, dec: 1, unit: "시간", foot: "악보를 처음 펴고 무대에 서기까지 걸린 시간입니다." },
      { kick: "함께 간 곳", lead: "총회와 지파 행사에 함께 지원 간 횟수는 약", big: nf(TEAM.events), num: TEAM.events, unit: "번", foot: "새벽 이슬같은 우리를 하나님께서 지켜보셨습니다." }
    ];

    /* 숫자가 끝나고 사람이 나오기 전의 한 박자. 감상을 적지 않고 질문만 둔다.
       뒤따르는 일곱 장이 그대로 답이 된다. */
    /* 팀 이름이 로고 워드마크처럼 먼저 서고, 한 박자 뒤에 질문이 붙는다.
       두 줄을 다른 글꼴로 두어 이름과 물음이 섞이지 않게 한다. */
    out.push({
      kick: "", quiet: true, cover: true, hold: 2200,
      lines: [
        { t: "FELICIA", cls: "wr-mark" },
        { t: "행복했나요?", cls: "wr-ask", gap: 1.4 }
      ]
    });

    TEAM.members.forEach((m, i) => {
      out.push({
        kick: "단원 " + String(i + 1).padStart(2, "0") + " · " + m.part,
        member: m.name,
        memberId: m.id
      });
    });

    /* 닫는 장은 말을 얹지 않는다. 표지와 같은 모습으로 날짜만 남긴다. */
    out.push({ kick: "Felicia", lead: TEAM.trip.replace(/-/g, ". "), quiet: true, cover: true, hold: 3000 });

    return out;
  }

  /* 개인 슬라이드에 띄울 지문 로고. 넘길 때마다 다시 그리면 느리니 담아둔다. */
  const slideArtCache = {};
  function slideArt(memberId, p) {
    const key = memberId + ":" + String(p.env || "").slice(0, 16) + ":" + (p.icon || "") + ":" + (p.born || "") + ":" + (p.joined || "");
    if (slideArtCache[key]) return slideArtCache[key];
    const c = document.createElement("canvas");
    c.width = c.height = 900;                      // 화면용이므로 2048 까지 갈 필요가 없다
    drawArt(c, { memberId: memberId, a: inflate(p), info: p }, "clear");
    return (slideArtCache[key] = c.toDataURL("image/png"));
  }

  /* 슬라이드 하나를 HTML로. 개인 슬라이드에는 그 사람의 지문 로고를 띄운다. */
  function slideHTML(s, prints) {
    /* 머리말이 없으면 아예 넣지 않는다. 빈 칸이 자리를 차지해 아래 글이
       가운데에서 밀려 내려간다. */
    let html = s.kick ? '<p class="wr-kicker">' + esc(s.kick) + "</p>" : "";
    if (s.member) {
      const p = prints && prints[s.memberId];
      if (p && p.env) {
        html += '<img class="wr-art" src="' + slideArt(s.memberId, p)
          + '" alt="' + esc(s.member) + '의 목소리 지문 로고">';
      } else {
        html += '<p class="wr-lead">' + esc(s.member) + "</p>"
          + '<p class="wr-unit">목소리 지문 준비 중</p>';
      }
    } else {
      /* lines 는 한 줄씩 텀을 두고 들어온다. 한 덩어리로 넣으면 같이 뜬다.
         줄마다 다른 글꼴을 주려면 {t, cls} 로 적는다. */
      if (s.lines) {
        s.lines.forEach((ln, i) => {
          const t = typeof ln === "string" ? ln : ln.t;
          const cls = (typeof ln === "string" ? "" : (ln.cls || ""));
          html += '<p class="wr-lead wr-line ' + cls + '" style="--d:'
            + (0.25 + i * (ln.gap || 1.65)).toFixed(2) + 's">' + esc(t) + "</p>";
        });
      } else if (s.lead) {
        html += '<p class="wr-lead">' + esc(s.lead).replace(/\n/g, "<br>") + "</p>";
      }
      if (s.big) html += '<div class="wr-big"' + (s.num != null ? ' data-num="' + s.num + '" data-dec="' + (s.dec || 0) + '" data-suffix="' + esc(s.suffix || "") + '"' + (s.from != null ? ' data-from="' + s.from + '"' : "") : "") + ">" + esc(s.big) + "</div>";
      if (s.unit) html += '<p class="wr-unit">' + esc(s.unit) + "</p>";
    }
    /* 지문 로고 안에 이름·파트·날짜가 다 들어 있으므로 덧붙일 말이 없다. */
    if (s.foot) html += '<p class="wr-foot">' + esc(s.foot) + "</p>";
    return '<div class="wr-slide fadein">' + html + "</div>";
  }

  /* 진행 점 — 점을 3개만 만들어 두면 중간 구간에서는 활성 점이 늘 가운데라
     클래스 배치가 매번 같아지고, 바뀌는 게 없으니 전환도 걸리지 않는다.
     그래서 점은 전부 만들어 두고 띠를 움직여 현재 점을 가운데로 데려온다.
     보이는 창은 좁게 잘라 두므로 화면에는 세 개 남짓만 보인다. */
  const DOT = 6, DOT_ON = 22, DOT_GAP = 6;

  function paintDots(el, idx, total) {
    if (!el) return;
    if (total <= 0) { el.innerHTML = ""; return; }

    let track = el.firstElementChild;
    if (!track || !track.classList.contains("track")) {
      el.innerHTML = "";
      track = document.createElement("div");
      track.className = "track";
      el.appendChild(track);
    }
    while (track.children.length > total) track.lastElementChild.remove();
    while (track.children.length < total) track.appendChild(document.createElement("i"));
    for (let i = 0; i < total; i++) track.children[i].classList.toggle("on", i === idx);

    /* 폭이 전환 중이라 offsetLeft 를 읽으면 중간값이 나온다. 목표 배치를 직접 계산한다. */
    const center = idx * (DOT + DOT_GAP) + DOT_ON / 2;
    const view = el.clientWidth || 76;
    track.style.transform = "translateX(" + Math.round(view / 2 - center) + "px)";
  }

  /* 슬라이드 뷰어 하나를 붙인다. 반환된 객체로 넘기고 되돌린다. */
  /* 0 에서 목표까지 세어 올린다. 마지막 프레임은 반드시 정확한 값으로 끝낸다. */
  /**
   * from 에서 to 까지 숫자가 넘어간다.
   *
   * 글자를 갈아끼우는 것뿐이라 빠르게 바뀌면 움직임이 아니라 깜빡임으로 보인다.
   * 두 가지로 다스린다.
   *  - 느리게 출발해 중간에 빨라지고 끝에서 다시 느려진다 (ease-in-out).
   *    처음이 제일 빨랐던 예전 곡선은 시작하자마자 숫자가 튀었다.
   *  - 매 프레임(초당 60번) 바꾸지 않고 STEP 간격으로만 바꾼다. 눈이 한 값씩
   *    읽을 수 있어야 세는 것처럼 보인다.
   */
  const COUNT_STEP = 80;
  function countUp(el, to, dec, suffix, ms, from) {
    const t0 = performance.now();
    const start = from == null ? 0 : from;
    const fmt = v => (dec ? v.toFixed(dec) : nf(Math.round(v))) + (suffix || "");
    const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    let done = false, lastSlot = -1;
    const finish = () => { if (!done) { done = true; el.textContent = fmt(to); } };

    function frame(now) {
      if (done) return;
      const t = now - t0;
      const p = clamp(t / ms, 0, 1);
      const slot = Math.floor(t / COUNT_STEP);
      if (slot !== lastSlot) {
        lastSlot = slot;
        el.textContent = fmt(start + (to - start) * ease(p));
      }
      if (p < 1) requestAnimationFrame(frame);
      else finish();
    }

    el.textContent = fmt(start);
    requestAnimationFrame(frame);
    /* 창이 가려져 있으면 requestAnimationFrame 이 아예 돌지 않아 숫자가 처음
       값에 머문다. 시간이 지나면 무조건 제 값으로 앉힌다. */
    setTimeout(finish, ms + 300);
  }

  /* 한 장을 얼마나 보여줄지. 숫자가 올라가는 시간과 읽을 글자 수를 더한다. */
  function slideMs(s) {
    let d = 4400;
    if (s.num != null) d += 2000;          // 숫자가 다 넘어갈 때까지
    if (s.member) d += 1700;
    if (s.cover) d += 600;
    const lineText = s.lines
      ? s.lines.map(l => (typeof l === "string" ? l : l.t)).join("")
      : (s.lead || "");
    d += Math.min(3000, (lineText + (s.unit || "") + (s.foot || "")).length * 56);
    /* 줄을 나눠 띄우는 장은 마지막 줄이 다 들어올 때까지 기다려야 한다. */
    if (s.lines) {
      d += s.lines.slice(1).reduce((a, l) => a + (typeof l === "string" ? 1.65 : (l.gap || 1.65)) * 1000, 0);
    }
    return d + (s.hold || 0);
  }

  /**
   * 결산 뷰어. 영상처럼 저절로 넘어가고, 요소가 차례로 들어온다.
   *   stage/dots/prev/next  화면 요소
   *   progress              남은 시간 막대 (선택)
   *   play                  재생·일시정지 단추 (선택)
   *   auto                  true 면 켜진 채로 시작
   */
  function mountWrapped(opts) {
    const stageEl = opts.stage, dotsEl = opts.dots, prevEl = opts.prev, nextEl = opts.next;
    const barEl = opts.progress || null, playEl = opts.play || null;
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let idx = 0, arr = slides(), prints = opts.prints || null;
    let playing = !!opts.auto && !reduced;
    let timer = null, outTimer = null;

    function clearTimers() { clearTimeout(timer); clearTimeout(outTimer); timer = outTimer = null; }

    function render() {
      const s = arr[idx];
      stageEl.className = "wr" + (s.quiet ? " wr-quiet" : "") + (s.cover ? " wr-cover" : "")
        + (reduced ? "" : " wr-anim");
      stageEl.innerHTML = slideHTML(s, prints);
      paintDots(dotsEl, idx, arr.length);
      if (prevEl) prevEl.disabled = idx === 0;
      if (nextEl) nextEl.textContent = idx === arr.length - 1 ? "처음으로" : "다음";

      const big = stageEl.querySelector(".wr-big[data-num]");
      if (big && !reduced) {
        countUp(big, +big.dataset.num, +big.dataset.dec || 0, big.dataset.suffix || "", 2400,
          big.dataset.from != null ? +big.dataset.from : null);
      }
      runBar(slideMs(s));
    }

    /* 남은 시간 막대. 애니메이션을 다시 시작하려면 한 번 지웠다 걸어야 한다. */
    function runBar(ms) {
      if (!barEl) return;
      const fill = barEl.firstElementChild || barEl;
      fill.style.animation = "none";
      void fill.offsetWidth;
      fill.style.animation = playing ? "wrBar " + ms + "ms linear forwards" : "none";
      fill.style.width = playing ? "" : "0%";
    }

    /* 나갈 때도 움직여야 장이 툭 끊기지 않는다. */
    function leaveThen(fn) {
      const slide = stageEl.querySelector(".wr-slide");
      if (!slide || reduced) { fn(); return; }
      slide.classList.add("wr-out");
      outTimer = setTimeout(fn, 380);
    }

    function schedule() {
      clearTimers();
      if (!playing) return;
      const ms = slideMs(arr[idx]);
      timer = setTimeout(() => {
        if (idx >= arr.length - 1) { setPlaying(false); return; }   // 끝에서 멈춘다
        leaveThen(() => { idx++; render(); schedule(); });
      }, Math.max(1200, ms - 380));
    }

    function go(d) {
      clearTimers();
      const next = (idx + d + arr.length) % arr.length;
      leaveThen(() => { idx = next; render(); schedule(); });
    }

    function setPlaying(v) {
      playing = v;
      if (playEl) {
        playEl.textContent = v ? "일시정지" : (idx >= arr.length - 1 ? "처음부터" : "재생");
        playEl.setAttribute("aria-pressed", String(v));
      }
      if (v) {
        if (idx >= arr.length - 1) { idx = 0; render(); }
        else runBar(slideMs(arr[idx]));
        schedule();
      } else {
        clearTimers();
        if (barEl) {
          const fill = barEl.firstElementChild || barEl;
          const w = fill.getBoundingClientRect().width;
          fill.style.animation = "none";
          fill.style.width = Math.round(w) + "px";
        }
      }
    }

    if (prevEl) prevEl.addEventListener("click", () => go(-1));
    if (nextEl) nextEl.addEventListener("click", () => go(1));
    if (playEl) playEl.addEventListener("click", () => setPlaying(!playing));
    if (opts.keys) {
      document.addEventListener("keydown", e => {
        if (opts.active && !opts.active()) return;
        if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
      });
    }

    render();
    if (playEl) setPlaying(playing);
    else if (playing) schedule();

    return {
      paint: render,
      step: go,
      setPlaying,
      setPrints(p) { prints = p; render(); schedule(); },
      reset() { clearTimers(); idx = 0; arr = slides(); render(); schedule(); }
    };
  }

  /* ======================================================================
     6-1. 직접 만든 선택기
     네이티브 <select> 목록과 <input type=date> 달력은 OS 가 그리는 화면이라
     색을 바꿀 수 없고(안드로이드는 청록 머리말, 흰 배경), 고른 뒤 "완료" 를
     또 눌러야 한다. 그래서 페이지 안에 직접 만든다 — 테마가 그대로 유지되고
     한 번 누르면 바로 정해지며, 기기나 OS 에 따라 달라지지도 않는다.
     ====================================================================== */
  function closeAllPickers(except) {
    $$(".sel-list").forEach(l => { if (l !== except) l.hidden = true; });
  }
  document.addEventListener("click", e => {
    if (!e.target.closest(".sel")) closeAllPickers(null);
  });

  /**
   * 한 칸을 만든다.
   *   host     .sel 컨테이너
   *   options  [{v, text}]
   *   value    처음 값 ("" 면 비어 있음)
   *   onPick   고를 때 부른다
   */
  function mountSelect(host, options, value, onPick) {
    const ph = host.dataset.placeholder || "선택";
    host.innerHTML = '<button type="button" class="sel-btn"></button><div class="sel-list" hidden></div>';
    const btn = host.querySelector(".sel-btn");
    const list = host.querySelector(".sel-list");
    let cur = value || "";

    function render() {
      const hit = options.find(o => o.v === cur);
      btn.textContent = hit ? hit.text : ph;
      btn.classList.toggle("empty", !hit);
      list.innerHTML = options.map(o =>
        '<button type="button" data-v="' + o.v + '"'
        + (o.v === cur ? ' aria-current="true"' : "") + ">" + esc(o.text) + "</button>").join("");
    }

    btn.addEventListener("click", e => {
      e.stopPropagation();
      const opening = list.hidden;
      closeAllPickers(list);
      list.hidden = !opening;
      if (opening) {
        const sel = list.querySelector("[aria-current]");
        if (sel) list.scrollTop = Math.max(0, sel.offsetTop - list.clientHeight / 2 + sel.offsetHeight / 2);
      }
    });

    list.addEventListener("click", e => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      cur = b.dataset.v;
      render();
      list.hidden = true;
      onPick(cur);
    });

    render();
    return { get: () => cur, set(v) { cur = v || ""; render(); } };
  }

  /** 연·월·일 세 칸을 묶어 하나의 날짜로 다룬다.
      digits 2 면 "YY-MM-DD", 4 면 "YYYY-MM-DD" 로 주고받는다. */
  function mountDate(hosts, conf) {
    const pad = n => String(n).padStart(2, "0");
    const years = [];
    for (let y = conf.yearFrom; conf.yearFrom <= conf.yearTo ? y <= conf.yearTo : y >= conf.yearTo;
         y += (conf.yearFrom <= conf.yearTo ? 1 : -1)) {
      years.push({ v: conf.digits === 2 ? pad(y) : String(y), text: (conf.digits === 2 ? pad(y) : y) + "년" });
    }
    const months = [], days = [];
    for (let m = 1; m <= 12; m++) months.push({ v: pad(m), text: m + "월" });
    for (let d = 1; d <= 31; d++) days.push({ v: pad(d), text: d + "일" });

    const parse = v => {
      const s = String(v || "");
      const re = conf.digits === 2 ? /^(\d{2})-(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/;
      const m = re.exec(s);
      return m ? { y: m[1], m: m[2], d: m[3] } : { y: "", m: "", d: "" };
    };
    const cur = parse(conf.value);
    const fire = () => {
      const y = ctl.y.get(), m = ctl.m.get(), d = ctl.d.get();
      conf.onChange(y && m && d ? y + "-" + m + "-" + d : "");
    };
    const ctl = {
      y: mountSelect(hosts.y, years, cur.y, fire),
      m: mountSelect(hosts.m, months, cur.m, fire),
      d: mountSelect(hosts.d, days, cur.d, fire)
    };
    return {
      set(v) { const p = parse(v); ctl.y.set(p.y); ctl.m.set(p.m); ctl.d.set(p.d); }
    };
  }

  /* ======================================================================
     6-2. 페이지 사이 이동
     ====================================================================== */
  const PAGES = [
    { key: "voice",    n: "01", title: "목소리 지문",    href: "voice.html" },
    { key: "wrapped",  n: "02", title: "우리의 결산",    href: "wrapped.html" },
    { key: "mycheers", n: "03", title: "나에게 온 응원", href: "mycheers.html" }
  ];

  /** 앞뒤 순서를 이름으로 보여주는 하단 이동. 셋을 순환한다. */
  function mountPageNav(el, key) {
    if (!el) return;
    const i = PAGES.findIndex(p => p.key === key);
    const prev = PAGES[(i - 1 + PAGES.length) % PAGES.length];
    const next = PAGES[(i + 1) % PAGES.length];
    el.innerHTML =
      '<a class="pn-side pn-prev" href="' + prev.href + '">'
      + '<span class="pn-dir">이전 · ' + prev.n + '</span>'
      + '<span class="pn-title">' + esc(prev.title) + '</span></a>'
      + '<a class="pn-side pn-next" href="' + next.href + '">'
      + '<span class="pn-dir">' + next.n + ' · 다음</span>'
      + '<span class="pn-title">' + esc(next.title) + '</span></a>'
      + '<a class="pn-home" href="index.html">Felicia</a>';
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
    g.fillText("FELICIA", cx + box * 0.028, top + box * 0.8035);
    g.letterSpacing = "0px";
    g.restore();
  }

  /**
   * 지문 로고 한 장을 캔버스에 그린다.
   *   cv    정사각 캔버스
   *   vp    {memberId, a:{env,bands,low,high,avg,seconds}} 또는 null
   *   bg    "cream" | "ink" | "clear" (배경을 칠하지 않는다 — 결산 슬라이드용)
   */
  function drawArt(cv, vp, bg) {
    const g = cv.getContext("2d");
    const S = cv.width;
    const clear = bg === "clear";
    const onCream = !clear && bg !== "ink";
    const fg = onCream ? "#C6A33A" : "#F8D870";
    const txt = onCream ? "#3B3629" : "#E8E1CC";

    g.setTransform(1, 0, 0, 1, 0, 0);
    if (clear) {
      g.clearRect(0, 0, S, S);      // 카드 배경이 그대로 비쳐 덩어리로 도드라지지 않는다
    } else {
      g.fillStyle = onCream ? "#F6F1E3" : "#14120D";
      g.fillRect(0, 0, S, S);
    }

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
      // logo.png 는 배경이 투명하므로 그대로 얹으면 원래 금색이 살아난다.
      g.drawImage(logo.img, left, top, box, box);
    } else {
      drawFallbackMark(g, S, fg);
    }

    // (5) 캡션 — 로고의 넓은 자간 워드마크와 같은 어법
    const m = vp ? member(vp.memberId) : null;
    const info = (vp && vp.info) || {};
    g.save();
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    /* 로고 워드마크가 끝나는 자리와 아래 여백 사이에 캡션 덩어리를 앉힌다.
       전에는 이름이 0.804 에 있어 워드마크와 300px 가까이 떨어져 부속처럼 보였다. */
    if (m) {
      g.fillStyle = txt;
      g.font = '400 ' + (S * 0.056) + 'px "Gowun Batang", serif';
      g.fillText(m.name, S / 2, S * 0.757);
      g.fillStyle = fg;
      g.font = '400 ' + (S * 0.019) + 'px "IBM Plex Sans KR", sans-serif';
      g.letterSpacing = (S * 0.0072).toFixed(1) + "px";
      g.fillText(m.part.toUpperCase(), S / 2, S * 0.805);   // 역할은 넣지 않는다
      g.letterSpacing = "0px";
    }

    if (info.icon) drawIcon(g, info.icon, S / 2, S * 0.850, S * 0.046, fg);

    const born = dotDate(info.born), joined = shortDate(info.joined);
    const sign = zodiac(info.born);
    g.fillStyle = onCream ? "#7A7159" : "#8C8674";
    g.font = '300 ' + (S * 0.019) + 'px "IBM Plex Sans KR", sans-serif';
    const dateY = S * 0.898;
    const ls = S * 0.0035;
    /* 자간을 켜면 캔버스가 마지막 글자 뒤에도 간격을 붙여, 가운데·오른쪽 정렬이
       그만큼 밀린다. 그래서 자간 없이 폭을 재고 (글자수-1)*자간을 더해
       실제 보이는 폭을 구한 뒤, 왼쪽 정렬로 직접 앉힌다. */
    const inkWidth = t => {
      g.letterSpacing = "0px";
      return g.measureText(t).width + Math.max(0, t.length - 1) * ls;
    };
    if (born && joined) {
      const pad = S * 0.024;
      const wb = inkWidth(born);
      g.letterSpacing = ls.toFixed(2) + "px";
      g.textAlign = "left";
      g.fillText(born, S / 2 - pad - wb, dateY);
      g.fillText(joined, S / 2 + pad, dateY);
      g.letterSpacing = "0px";
      g.textAlign = "center";
      g.fillText("·", S / 2, dateY);          // 자간 없이 찍어 정확히 가운데
    } else if (born || joined) {
      const one = born || joined, w = inkWidth(one);
      g.letterSpacing = ls.toFixed(2) + "px";
      g.textAlign = "left";
      g.fillText(one, S / 2 - w / 2, dateY);
      g.letterSpacing = "0px";
      g.textAlign = "center";
    }
    if (sign) {
      g.fillStyle = fg;
      g.font = '400 ' + (S * 0.024) + 'px "Gowun Batang", serif';
      g.fillText(sign, S / 2, S * 0.938);
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
    drawFallbackMark(g, 800, "#F8D870");
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
    slides, slideHTML, mountWrapped, paintDots, mountPageNav,
    mountSelect, mountDate,
    zodiac, dotDate, shortDate, splitJoined, ICONS, ICON_KEYS, drawIcon,
    analyze, drawArt, coverMark, savePNG,
    verifyCode, rememberMe, recallMe, forgetMe, cheersFor
  };
})(window);
