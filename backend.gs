/**
 * FELICIA — 응원 메시지 · 목소리 지문 저장소
 *
 * Google Apps Script 웹앱. 전부 무료입니다.
 * 설치 방법은 README.md 의 "2. 저장소 만들기" 를 보세요.
 *
 * 스프레드시트는 알아서 잡습니다. 따로 ID를 넣을 필요가 없습니다.
 *   1) 스크립트 속성에 기억된 시트가 있으면 그것
 *   2) 스프레드시트에 연결된(바인딩된) 스크립트면 그 시트
 *   3) 둘 다 아니면 내 드라이브에 새로 만들고 그 ID를 기억
 *
 * 저장 위치
 *   시트 "cheers" — 응원 메시지 한 줄에 하나
 *   시트 "prints" — A1 칸에 목소리 분석 결과 전체(JSON 한 덩어리)
 *
 * 시트가 어디에 생겼는지 확인하려면 웹앱 주소 뒤에 ?kind=info 를 붙여 열어보세요.
 */

/* 이 판의 번호입니다. 웹앱 주소 뒤에 ?kind=info 를 붙여 열면 보입니다.
   배포가 제대로 반영됐는지 이 숫자로 확인하세요. */
var VERSION = 3;

var CHEERS_HEADERS = ["id", "at", "to", "from", "title", "body"];
var PROP_SHEET_ID = "FELICIA_SHEET_ID";

function book_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SHEET_ID);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 지워졌으면 아래로 */ }
  }
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active) {
    props.setProperty(PROP_SHEET_ID, active.getId());
    return active;
  }
  var created = SpreadsheetApp.create("FELICIA 응원 메시지");
  props.setProperty(PROP_SHEET_ID, created.getId());
  return created;
}

function sheetNamed_(name, headers) {
  var ss = book_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) sh.appendRow(headers);
  }
  return sh;
}

/**
 * 목소리 지문 시트. 단원 한 명이 한 줄을 씁니다.
 * 한 칸에 전부 모아두면 저장이 겹칠 때 먼저 만든 사람 것이 지워지므로,
 * 줄을 나눠 서로 다른 칸에만 쓰게 합니다.
 *
 * 예전 판은 A1 한 칸에 전체를 JSON 으로 넣었습니다. 그 형태가 남아 있으면
 * 처음 열 때 줄 단위로 옮겨 담습니다.
 */
function printsSheet_() {
  var sh = sheetNamed_("prints");
  var a1 = String(sh.getRange(1, 1).getValue() || "");
  if (a1 === "id") return sh;              // 이미 새 형태

  var old = null;
  if (a1.charAt(0) === "{") {
    try { old = JSON.parse(a1); } catch (e) { old = null; }
  }
  sh.clear();
  sh.appendRow(["id", "data"]);
  if (old) {
    for (var id in old) {
      if (Object.prototype.hasOwnProperty.call(old, id)) {
        sh.appendRow([id, JSON.stringify(old[id])]);
      }
    }
  }
  return sh;
}

/** 그 단원의 줄 번호. 없으면 0. */
function printsRow_(sh, id) {
  var ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for (var i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 1;
  }
  return 0;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var kind = String((e && e.parameter && e.parameter.kind) || "");

    if (kind === "info") {
      var ss = book_();
      return json_({
        ok: true, version: VERSION,
        actions: ["cheers/add", "prints/merge", "prints/put"],
        sheet: ss.getUrl(), name: ss.getName(), id: ss.getId()
      });
    }

    if (kind === "cheers") {
      var sh = sheetNamed_("cheers", CHEERS_HEADERS);
      var rows = sh.getDataRange().getValues();
      var items = [];
      for (var i = 1; i < rows.length; i++) {
        if (!rows[i][0]) continue;
        items.push({
          id: String(rows[i][0]),
          at: String(rows[i][1]),
          to: String(rows[i][2]),
          from: String(rows[i][3]),
          title: String(rows[i][4]),
          body: String(rows[i][5])
        });
      }
      return json_({ ok: true, items: items });
    }

    if (kind === "prints") {
      var ps = printsSheet_();
      var rows = ps.getDataRange().getValues();
      var data = {};
      for (var i = 1; i < rows.length; i++) {
        var id = String(rows[i][0] || "");
        if (!id) continue;
        try { data[id] = JSON.parse(rows[i][1]); } catch (err) { /* 깨진 줄은 건너뜁니다 */ }
      }
      return json_({ ok: true, data: data });
    }

    return json_({ ok: false, error: "unknown kind" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.kind === "cheers" && body.action === "add") {
      var it = body.item || {};
      var title = String(it.title || "").trim();
      var text = String(it.body || "").trim();
      if (!title || !text) return json_({ ok: false, error: "제목과 메시지가 필요합니다." });

      var sh = sheetNamed_("cheers", CHEERS_HEADERS);
      sh.appendRow([
        String(it.id || ("c" + Date.now())),
        String(it.at || new Date().toISOString()),
        String(it.to || "team"),
        String(it.from || "익명").slice(0, 40),
        title.slice(0, 120),
        text.slice(0, 4000)
      ]);
      return json_({ ok: true });
    }

    // 단원 한 명의 줄만 씁니다. 각자 다른 칸을 쓰므로 서로 덮어쓸 일이 없습니다.
    // 줄이 아직 없을 때만 잠깐 잠급니다 — 두 명이 동시에 처음 만들면 같은 줄을
    // 새로 만들려 할 수 있기 때문입니다.
    if (body.kind === "prints" && body.action === "merge") {
      var id = String(body.id || "");
      if (!id) return json_({ ok: false, error: "id 가 필요합니다." });

      var payload = JSON.stringify(body.data || {});
      // 한 칸에 5만 자까지 들어갑니다. 한 명이 약 1,200자입니다.
      if (payload.length > 45000) return json_({ ok: false, error: "분석 결과가 너무 큽니다." });

      var sh = printsSheet_();
      var row = printsRow_(sh, id);
      if (row) {                       // 있는 줄이면 그 칸만 바꿉니다
        sh.getRange(row, 2).setValue(payload);
        return json_({ ok: true, row: row });
      }

      var lock = LockService.getScriptLock();
      try { lock.waitLock(15000); } catch (e) {
        return json_({ ok: false, error: "저장소가 사용 중입니다. 잠시 후 다시 시도해주세요." });
      }
      try {
        row = printsRow_(sh, id);      // 기다리는 사이 누가 만들었을 수 있습니다
        if (row) sh.getRange(row, 2).setValue(payload);
        else sh.appendRow([id, payload]);
        return json_({ ok: true });
      } finally {
        lock.releaseLock();
      }
    }

    // 예전 판과의 호환 — 지도 전체를 한 번에 넣습니다. 지금은 쓰지 않습니다.
    if (body.kind === "prints" && body.action === "put") {
      var lock2 = LockService.getScriptLock();
      try { lock2.waitLock(15000); } catch (e) {
        return json_({ ok: false, error: "저장소가 사용 중입니다." });
      }
      try {
        var sh2 = printsSheet_();
        sh2.clear();
        sh2.appendRow(["id", "data"]);
        var map = body.data || {};
        for (var k in map) {
          if (Object.prototype.hasOwnProperty.call(map, k)) sh2.appendRow([k, JSON.stringify(map[k])]);
        }
        return json_({ ok: true });
      } finally {
        lock2.releaseLock();
      }
    }

    return json_({ ok: false, error: "bad request" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
