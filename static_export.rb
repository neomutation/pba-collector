# 휴대폰용 정적 사이트 만들기: 서버(server.rb)가 주는 자료를 파일로 저장해 site/ 에 화면 파일과 함께 둔다
#   서버를 먼저 켠다:  PORT=4567 ruby -Eutf-8 server.rb &
#   ruby -Eutf-8 static_export.rb [서버 주소, 기본 http://127.0.0.1:4567]
# site/ 를 그대로 GitHub Pages 같은 정적 호스팅에 올리면 컴퓨터 없이 휴대폰에서 열린다
#   (실시간 브리핑 · 홈피 공식 순위처럼 그때그때 홈피에 물어봐야 하는 기능은 빠진다)
require 'json'
require 'fileutils'
require 'net/http'
require 'uri'
require 'sqlite3'

ROOT = __dir__
API = ARGV[0] || 'http://127.0.0.1:4567'
OUT = File.join(ROOT, 'site')

def get(path)
  uri = URI("#{API}#{path}")
  3.times do |i|
    res = Net::HTTP.get_response(uri)
    return res.body.force_encoding('utf-8') if res.is_a?(Net::HTTPSuccess)
    sleep 1 + i
  end
  raise "받기 실패: #{path}"
end

def save(rel, body)
  file = File.join(OUT, 'data', rel)
  FileUtils.mkdir_p(File.dirname(file))
  File.write(file, body)
end

FileUtils.rm_rf(OUT)
FileUtils.mkdir_p(File.join(OUT, 'data', 'player'))

# 화면 파일: index.html 에는 '정적 모드' 표시를 넣는다 (자료를 서버 대신 data/ 파일에서 읽음)
Dir[File.join(ROOT, 'app', '*')].each { |f| FileUtils.cp(f, OUT) unless File.directory?(f) }
idx = File.join(OUT, 'index.html')
File.write(idx, File.read(idx, encoding: 'utf-8').sub('<head>', "<head>\n<script>window.PBA_STATIC = true;</script>"))
File.write(File.join(OUT, '.nojekyll'), '')

# 선수 검색 목록: 서버 검색과 같은 모양 (경기 수 많은 순)
db = SQLite3::Database.new(File.join(ROOT, 'data', 'pba.db'))
db.results_as_hash = true
players = db.execute(<<~SQL).map { |r| r.reject { |k, _| k.is_a?(Integer) } }
  SELECT p.id, p.name, p.type, p.birth, p.photo, COUNT(g.pst) AS n, MAX(g.season) AS last
  FROM players p LEFT JOIN games g ON g.player = p.id GROUP BY p.id ORDER BY n DESC
SQL
save('players.json', JSON.generate(players))

# 선수마다 한 파일
players.each_with_index do |p, i|
  save("player/#{p['id']}.json", get("/api/player?id=#{URI.encode_www_form_component(p['id'])}"))
  $stderr.print "\r선수 #{i + 1}/#{players.size}" if (i % 20).zero? || i == players.size - 1
end
$stderr.puts

%w[PBA LPBA].each do |t|
  save("league_#{t}.json", get("/api/league?type=#{t}"))
  save("awards_#{t}.json", get("/api/awards?type=#{t}"))
end
save('team_all.json', get('/api/team/all'))
meta = JSON.parse(get('/api/meta'))
meta['ui'] = Time.now.to_f   # 새로 올릴 때마다 바뀌어 휴대폰 화면이 새 화면으로 다시 불러온다
save('meta.json', JSON.generate(meta))

size = Dir[File.join(OUT, '**', '*')].sum { |f| File.file?(f) ? File.size(f) : 0 }
$stderr.puts "완료: #{OUT} (#{(size / 1048576.0).round(1)}MB, 선수 #{players.size}명)"
