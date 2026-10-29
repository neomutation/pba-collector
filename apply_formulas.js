// osascript -l JavaScript apply_formulas.js <doc> <edits.json> : { "B2": "=2223::우승표 1::AF6" | 값 | null }
ObjC.import('Foundation');
function run(argv){
  var e = JSON.parse($.NSString.stringWithContentsOfFileEncodingError(argv[1], $.NSUTF8StringEncoding, null).js);
  var N = Application("Numbers"); var t = N.documents.byName(argv[0]).sheets.byName("시즌비교").tables[0];
  var n = 0; Object.keys(e).forEach(function(k){ t.cells.byName(k).value = e[k]; n++; });
  return "set " + n + " cells";
}
