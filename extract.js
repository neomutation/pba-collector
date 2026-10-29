function pickTable(s){ var ts = s.tables(); for (var i = 0; i < ts.length; i++) { if (ts[i].name() == '우승표 1') return s.tables[i]; } return s.tables[0]; }
// osascript -l JavaScript extract.js <doc name> <sheet name> <out file>
ObjC.import('Foundation');
function run(argv){
  var N = Application("Numbers");
  var t = pickTable(N.documents.byName(argv[0]).sheets.byName(argv[1]));
  var nr = t.rowCount(), nc = t.columnCount();
  var vals = t.cells.value(), fs = (argv[3] == 'values') ? null : t.cells.formula();
  var rows = [];
  for (var r = 0; r < nr; r++) {
    var row = [], frow = [];
    for (var c = 0; c < nc; c++) {
      var v = vals[r*nc+c], f = fs ? fs[r*nc+c] : 0;
      row.push(v === undefined ? null : v);
      frow.push(f ? 1 : 0);
    }
    rows.push(row); rows.push(frow);
  }
  var s = JSON.stringify({rows: nr, cols: nc, data: rows});
  $.NSString.alloc.initWithUTF8String(s).writeToFileAtomicallyEncodingError(argv[2], true, $.NSUTF8StringEncoding, null);
  return nr + "x" + nc;
}
