function pickTable(s){ var ts = s.tables(); for (var i = 0; i < ts.length; i++) { if (ts[i].name() == '우승표 1') return s.tables[i]; } return s.tables[0]; }
// osascript -l JavaScript apply.js <doc name> <plan.json>
ObjC.import('Foundation');
var RGB = { orange: [0.9885557293891907, 0.49925994873046875, 0.034073397517204285],
            blue:   [0.06694132834672928, 0.5531395673751831, 0.998504638671875] };
function run(argv){
  var data = $.NSString.stringWithContentsOfFileEncodingError(argv[1], $.NSUTF8StringEncoding, null).js;
  var plan = JSON.parse(data);
  var N = Application("Numbers"); var d = N.documents.byName(argv[0]);
  var n = 0, k = 0, t0 = Date.now();
  plan.forEach(function(p){
    var t = pickTable(d.sheets.byName(p.sheet));
    if (p.cells) Object.keys(p.cells).forEach(function(c){ t.cells.byName(c).value = p.cells[c]; n++; });
    if (p.colors) Object.keys(p.colors).forEach(function(c){
      t.cells.byName(c).backgroundColor = RGB[p.colors[c]].map(function(x){ return Math.round(x * 65535); }); k++; });
  });
  return "set " + n + " cells, colored " + k + " in " + (Date.now() - t0) + " ms";
}
