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
      return json_({ ok: true, sheet: ss.getUrl(), name: ss.getName(), id: ss.getId() });
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
      var ps = sheetNamed_("prints");
      var raw = ps.getRange(1, 1).getValue();
      var data = {};
      if (raw) {
        try { data = JSON.parse(raw); } catch (err) { data = {}; }
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

    if (body.kind === "prints" && body.action === "put") {
      var ps = sheetNamed_("prints");
      var payload = JSON.stringify(body.data || {});
      // 한 칸에 5만 자까지 들어갑니다. 단원 한 명당 약 1,200자입니다.
      if (payload.length > 45000) return json_({ ok: false, error: "분석 결과가 너무 큽니다." });
      ps.getRange(1, 1).setValue(payload);
      return json_({ ok: true });
    }

    return json_({ ok: false, error: "bad request" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
