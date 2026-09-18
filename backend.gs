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
 *   시트 "prints" — 목소리 분석 결과. 단원 한 명이 한 줄 (id | data)
 *
 * 시트 위치와 판 번호는 웹앱 주소 뒤에 ?kind=info 를 붙여 열면 보입니다.
 */

/* 이 판의 번호입니다. 웹앱 주소 뒤에 ?kind=info 를 붙여 열면 보입니다.
   배포가 제대로 반영됐는지 이 숫자로 확인하세요. */
var VERSION = 4;

var CHEERS_HEADERS = ["id", "at", "to", "from", "title", "body"];
var PROP_SHEET_ID = "FELICIA_SHEET_ID";
var PROP_FOLDER_ID = "FELICIA_FOLDER_ID";

/**
 * 녹음 파일을 담는 드라이브 폴더. 시트 칸에는 5만 자까지만 들어가서
 * 음성을 넣을 수 없으므로 파일은 드라이브에 둡니다. 없으면 만듭니다.
 */
function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_FOLDER_ID);
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* 지워졌으면 새로 만듭니다 */ }
  }
  var made = DriveApp.createFolder("FELICIA 녹음");
  props.setProperty(PROP_FOLDER_ID, made.getId());
  return made;
}

/** 그 단원의 녹음 파일. 없으면 null. 이름은 "<단원id>.<확장자>" 입니다. */
function audioFile_(id) {
  var it = folder_().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var n = String(f.getName());
    if (n === id || n.indexOf(id + ".") === 0) return f;
  }
  return null;
}

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
        actions: ["cheers/add", "prints/merge", "prints/put", "audio/put"],
        sheet: ss.getUrl(), name: ss.getName(), id: ss.getId(),
        folder: folder_().getUrl()
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

    /* 어느 단원이 녹음을 올렸는지 목록만 돌려줍니다. 파일 내용은 무겁습니다. */
    if (kind === "audios") {
      var it = folder_().getFiles(), items = [];
      while (it.hasNext()) {
        var f = it.next(), n = String(f.getName());
        items.push({
          id: n.replace(/\.[^.]*$/, ""),
          name: n,
          mime: f.getMimeType(),
          bytes: f.getSize(),
          at: f.getLastUpdated().toISOString()
        });
      }
      return json_({ ok: true, items: items });
    }

    /* 녹음 파일 하나를 base64 로 돌려줍니다. 드라이브 공유 설정을 건드리지
       않으므로 파일은 내 드라이브에 그대로 비공개로 남습니다. */
    if (kind === "audio") {
      var aid = String((e && e.parameter && e.parameter.id) || "");
      if (!aid) return json_({ ok: false, error: "id 가 필요합니다." });
      var file = audioFile_(aid);
      if (!file) return json_({ ok: false, error: "녹음이 없습니다." });
      var blob = file.getBlob();
      return json_({
        ok: true, name: file.getName(), mime: file.getMimeType(),
        bytes: file.getSize(), b64: Utilities.base64Encode(blob.getBytes())
      });
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

    /* 녹음 파일을 드라이브에 넣습니다. 그 단원의 예전 파일은 휴지통으로
       보내고 새 것만 남깁니다 — 다시 녹음하면 덮어쓰는 셈입니다. */
    if (body.kind === "audio" && body.action === "put") {
      var id = String(body.id || "");
      if (!id) return json_({ ok: false, error: "id 가 필요합니다." });
      if (!body.b64) return json_({ ok: false, error: "녹음이 비어 있습니다." });

      var ext = String(body.ext || "m4a").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "m4a";
      var mime = String(body.mime || "audio/mp4").slice(0, 80);
      var bytes = Utilities.base64Decode(body.b64);
      if (bytes.length > 12 * 1024 * 1024) return json_({ ok: false, error: "녹음이 너무 큽니다 (12MB 넘음)." });

      var lock = LockService.getScriptLock();
      try { lock.waitLock(20000); } catch (e) {
        return json_({ ok: false, error: "저장소가 사용 중입니다. 잠시 후 다시 시도해주세요." });
      }
      try {
        var old = audioFile_(id);
        if (old) old.setTrashed(true);
        var f = folder_().createFile(Utilities.newBlob(bytes, mime, id + "." + ext));
        return json_({ ok: true, name: f.getName(), bytes: f.getSize() });
      } finally {
        lock.releaseLock();
      }
    }

    return json_({ ok: false, error: "bad request" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
