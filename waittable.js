// osascript -l JavaScript waittable.js <doc> <sheet> <rows> : 붙여넣기로 표가 생길 때까지 기다린다
ObjC.import('Foundation');
function run(argv){
  var N = Application("Numbers"); var d = N.documents.byName(argv[0]);
  for (var i = 0; i < 90; i++) {
    var ts = d.sheets.byName(argv[1]).tables();
    for (var j = 0; j < ts.length; j++) { if (ts[j].name() == '우승표 1' && ts[j].rowCount() >= parseInt(argv[2])) return 'table ok ' + ts[j].rowCount(); }
    $.NSThread.sleepForTimeInterval(1);
  }
  return "ERR table missing";
}
