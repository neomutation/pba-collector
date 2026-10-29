// osascript -l JavaScript colorscan.js <doc> <sheet> <firstRow> <out.json> : 입력 영역(J열부터 AV/AZ열)에서 채우기 색이 있는 셀
ObjC.import('Foundation');
function pickTable(s){ var ts = s.tables(); for (var i = 0; i < ts.length; i++) { if (ts[i].name() == '우승표 1') return s.tables[i]; } return s.tables[0]; }
function run(argv){
  var N = Application("Numbers"); var t = pickTable(N.documents.byName(argv[0]).sheets.byName(argv[1]));
  var nr = t.rowCount(), nc = t.columnCount(), bg = t.cells.backgroundColor(), nm = t.cells.name(), first = parseInt(argv[2]), out = [];
  for (var r = first; r <= nr; r++) { for (var c = 9; c < Math.min(nc, 52); c++) { var i = (r - 1) * nc + c; if (bg[i]) out.push({ cell: nm[i], rgb: bg[i].map(function(x){ return Math.round(x * 100) / 100; }) }); } }
  var s = JSON.stringify(out);
  $.NSString.alloc.initWithUTF8String(s).writeToFileAtomicallyEncodingError(argv[3], true, $.NSUTF8StringEncoding, null);
  return argv[1] + ": colored cells in input area = " + out.length;
}
