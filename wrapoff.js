// osascript -l JavaScript wrapoff.js <doc> <wrap.json> : 목록의 범위에서 텍스트 줄바꿈을 끈다
ObjC.import('Foundation');
function pickTable(s){ var ts = s.tables(); for (var i = 0; i < ts.length; i++) { if (ts[i].name() == '우승표 1') return s.tables[i]; } return s.tables[0]; }
function run(argv){
  var list = JSON.parse($.NSString.stringWithContentsOfFileEncodingError(argv[1], $.NSUTF8StringEncoding, null).js);
  var N = Application("Numbers"); var d = N.documents.byName(argv[0]); var out = [];
  list.forEach(function(x){ var t = pickTable(d.sheets.byName(x.sheet)); t.ranges.byName(x.range).textWrap = false; out.push(x.sheet + " " + x.range); });
  return out.join(", ");
}
