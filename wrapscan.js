// osascript -l JavaScript wrapscan.js <doc> <sheet> <out.json> : 셀별 자동 줄바꿈(텍스트 줄바꿈) 켜짐 여부
ObjC.import('Foundation');
function pickTable(s){ var ts = s.tables(); for (var i = 0; i < ts.length; i++) { if (ts[i].name() == '우승표 1') return s.tables[i]; } return s.tables[0]; }
function run(argv){
  var N = Application("Numbers");
  var t = pickTable(N.documents.byName(argv[0]).sheets.byName(argv[1]));
  var nr = t.rowCount(), nc = t.columnCount(), w = t.cells.textWrap(), out = [];
  for (var i = 0; i < w.length; i++) { if (w[i]) out.push(i); }
  var s = JSON.stringify({rows: nr, cols: nc, on: out});
  $.NSString.alloc.initWithUTF8String(s).writeToFileAtomicallyEncodingError(argv[2], true, $.NSUTF8StringEncoding, null);
  return argv[1] + ": wrap on " + out.length + " / " + w.length;
}
