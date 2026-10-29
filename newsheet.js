// osascript -l JavaScript newsheet.js <doc> <new name> : 방금 만든 "시트 N" 의 이름을 바꾸고 기본 표를 지운다 (생길 때까지 기다림)
ObjC.import('Foundation');
function run(argv){
  var N = Application("Numbers"); var d = N.documents.byName(argv[0]);
  var fresh = [];
  for (var i = 0; i < 20; i++) {
    fresh = d.sheets().map(function(s){ return s.name(); }).filter(function(n){ return /^시트 \d+$/.test(n); });
    if (fresh.length) break;
    $.NSThread.sleepForTimeInterval(1);
  }
  if (!fresh.length) return "ERR no fresh sheet";
  var s = d.sheets.byName(fresh[0]);
  for (var k = 0; k < 5 && s.tables().length; k++) { try { s.tables[0].delete(); } catch (e) {} }
  d.activeSheet = s;
  s.name = argv[1];
  return "renamed " + fresh[0] + " -> " + argv[1];
}
