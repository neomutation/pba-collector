// osascript -l JavaScript dumpf.js <doc> <sheet> <out.json> : 모든 수식(셀 이름 -> 수식 문자열)과 값
ObjC.import('Foundation');
function run(argv){
  var N = Application("Numbers"); var t = N.documents.byName(argv[0]).sheets.byName(argv[1]).tables[0];
  var f = t.cells.formula(), v = t.cells.value(), n = t.cells.name(), out = {};
  for (var i = 0; i < f.length; i++) { if (f[i]) out[n[i]] = { f: String(f[i]), v: v[i] }; }
  var s = JSON.stringify(out);
  $.NSString.alloc.initWithUTF8String(s).writeToFileAtomicallyEncodingError(argv[2], true, $.NSUTF8StringEncoding, null);
  return Object.keys(out).length + " formulas";
}
