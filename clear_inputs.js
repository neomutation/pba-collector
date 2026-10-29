function pickTable(s){ var ts = s.tables(); for (var i = 0; i < ts.length; i++) { if (ts[i].name() == '우승표 1') return s.tables[i]; } return s.tables[0]; }
// osascript -l JavaScript clear_inputs.js <doc> <sheet> <cells.json>   cells.json = ["AH12", ...]
ObjC.import('Foundation');
function run(argv){
  var cells = JSON.parse($.NSString.stringWithContentsOfFileEncodingError(argv[2], $.NSUTF8StringEncoding, null).js);
  var N = Application("Numbers"); var t = pickTable(N.documents.byName(argv[0]).sheets.byName(argv[1]));
  // clear() 는 정렬·테두리 같은 서식까지 지워서, 값만 비우는 value = null 을 쓴다
  cells.forEach(function(c){ var cell = t.cells.byName(c); cell.value = null; try { if (cell.backgroundColor() !== null) cell.backgroundColor = null; } catch(e) {} });
  return "cleared " + cells.length;
}
