# 개인투어 승부 예측 모델 검증 (오프라인)
#  두 모델을 같은 조건으로 비교한다: 경기 날짜 순으로 그 날 이전 기록만 써서 예측 → 실제 결과와 비교 (미래 정보 없음)
#   M = 이닝 득점 마르코프 모델: 선수마다 '한 이닝에 몇 점 내나' 분포(시즌 가중 · 리그 평균으로 당김) → 세트 승률(정확한 동적 계획) → 경기 승률
#   E = 세트 단위 엘로(Elo) 레이팅
#  사용: ruby model/eval_ind.rb [튜닝 시즌] [검증 시즌]
require 'sqlite3'
require 'json'

R = 25   # 한 이닝 최대 득점 칸 (그 이상은 마지막 칸)
TUNE = (ARGV[0] || 2024).to_i
TEST = (ARGV[1] || 2025).to_i

db = SQLite3::Database.new(File.join(__dir__, '..', 'data', 'pba.db'), readonly: true)
rows = db.execute('SELECT pst, player, opp, type, season, date, target, sets, win FROM games ORDER BY date, pst')
by = Hash.new { |h, k| h[k] = {} }
rows.each { |pst, pl, op, ty, se, da, tg, sets, w| by[pst][pl] = { opp: op, type: ty, season: se, date: da, target: tg, sets: (JSON.parse(sets || '[]') rescue []), win: w } }
MATCHES = []
by.each do |pst, h|
  a, b = h.keys.sort
  next unless a && b && h[a][:opp] == b
  x, y = h[a], h[b]
  sets = x[:sets].map do |s|
    o = y[:sets].find { |t| t['no'] == s['no'] } or next
    next unless s['runs_list'].is_a?(Array) && o['runs_list'].is_a?(Array) && !s['first'].nil? && s['gp'].to_i > 0
    { no: s['no'], gp: s['gp'].to_i, af: s['first'], ra: s['runs_list'].map(&:to_i), rb: o['runs_list'].map(&:to_i), win: s['win'] }
  end.compact
  next if sets.empty? || x[:target].to_i < 2
  MATCHES << { pst: pst, a: a, b: b, type: x[:type], season: x[:season], date: x[:date], need: x[:target].to_i, sets: sets, win: x[:win] == 1 }
end
MATCHES.sort_by! { |m| [m[:date], m[:pst]] }
warn "경기 #{MATCHES.size}개"

# 세트 승률: A 남은 a점 · B 남은 b점 · first = A 먼저. qa · qb = 이닝 득점 분포 (0..R)
def set_prob(qa, qb, ga, gb, a_first)
  va = Array.new(ga + 1) { Array.new(gb + 1, 0.0) }   # A 차례
  vb = Array.new(ga + 1) { Array.new(gb + 1, 0.0) }   # B 차례
  ta = Array.new(R + 2, 0.0); (R).downto(0) { |r| ta[r] = ta[r + 1] + qa[r] }   # 꼬리합 P(r >= k)
  tb = Array.new(R + 2, 0.0); (R).downto(0) { |r| tb[r] = tb[r + 1] + qb[r] }
  (1..ga).each do |a|
    (1..gb).each do |b|
      ca = a <= R ? ta[a] : 0.0; (1...[a, R + 1].min).each { |r| ca += qa[r] * vb[a - r][b] }
      cb = 0.0;                   (1...[b, R + 1].min).each { |r| cb += qb[r] * va[a][b - r] }   # B 가 b 이상 치면 A 짐(0)
      x = (qa[0] * cb + ca) / (1 - qa[0] * qb[0])
      va[a][b] = x; vb[a][b] = qb[0] * x + cb
    end
  end
  a_first ? va[ga][gb] : vb[ga][gb]
end

# 경기 승률: 세트마다 승률 ps[k] (k = 0..), need 세트 먼저 따면 승
def match_prob(ps, need)
  memo = {}
  f = lambda do |w, l|
    return 1.0 if w == need
    return 0.0 if l == need
    memo[[w, l]] ||= (p = ps[w + l] || ps.last; p * f.(w + 1, l) + (1 - p) * f.(w, l + 1))
  end
  f.(0, 0)
end

# 세트 점수 형식: 그 경기의 실제 세트 점수(형식은 경기 전에 정해져 있음), 없는 세트는 마지막 세트 점수
def gp_list(m) n = 2 * m[:need] - 1; gs = m[:sets].sort_by { |s| s[:no] }.map { |s| s[:gp] }; (0...n).map { |k| gs[k] || (k == n - 1 ? (m[:type] == 'PBA' ? 11 : 9) : gs.last) } end

class Hist   # 선수별 · 시즌별 이닝 득점 수 (마지막 이닝 = 목표 점수에서 잘린 값은 '그 이상'으로 따로)
  def initialize; @h = Hash.new { |x, k| x[k] = Hash.new { |y, s| y[s] = { c: Array.new(R + 1, 0.0), cens: Hash.new(0) } } }; end
  def add(p, season, runs, gp)
    tot = 0
    runs.each_with_index do |r, i|
      tot += r
      if i == runs.size - 1 && tot >= gp then @h[p][season][:cens][[r, R].min] += 1 else @h[p][season][:c][[r, R].min] += 1 end
    end
  end
  # 가중 분포: 시즌 가중 decay^(지금-그 시즌), 잘린 이닝은 prior 꼬리 비율로 나눠 넣는다
  def dist(p, now, decay, prior, m)
    c = Array.new(R + 1, 0.0); n = 0.0
    @h[p].each do |se, o|
      w = decay**(now - se); next if w < 1e-3
      (0..R).each { |r| c[r] += w * o[:c][r] }; n += w * o[:c].sum
      o[:cens].each { |k, cnt| tail = (k..R).sum { |r| prior[r] }; next if tail <= 0; (k..R).each { |r| c[r] += w * cnt * prior[r] / tail }; n += w * cnt }
    end
    (0..R).map { |r| (c[r] + m * prior[r]) / (n + m) }
  end
  def n(p) @h[p].values.sum { |o| o[:c].sum + o[:cens].values.sum } end
end

def ll(p, y) p = [[p, 1e-6].max, 1 - 1e-6].min; -(y ? Math.log(p) : Math.log(1 - p)) end

# 한 번 돌리기: 날짜 순으로 예측 → 기록 추가. 반환 = 검증 시즌 경기별 [Markov 예측, Elo 예측, 실제]
def run(test_season, decay:, m:, k:, regress:)
  hist = Hist.new
  league = Hash.new { |h, t| h[t] = Array.new(R + 1, 1.0) }   # 종목별 리그 이닝 분포 (누적)
  elo = Hash.new(1500.0); elo_season = {}
  out = []
  MATCHES.group_by { |x| x[:date] }.each do |date, ms|
    ms.each do |mt|
      next unless mt[:season] == test_season
      lg = league[mt[:type]]; prior = lg.map { |v| v / lg.sum }
      qa = hist.dist(mt[:a], mt[:season], decay, prior, m); qb = hist.dist(mt[:b], mt[:season], decay, prior, m)
      sp = Hash.new { |h, g| h[g] = (set_prob(qa, qb, g, g, true) + set_prob(qa, qb, g, g, false)) / 2 }; ps = gp_list(mt).map { |g| sp[g] }
      pm = match_prob(ps, mt[:need])
      ra, rb = [mt[:a], mt[:b]].map { |p| (elo_season[p] && elo_season[p] < mt[:season]) ? 1500 + (elo[p] - 1500) * regress : elo[p] }
      pe1 = 1 / (1 + 10**(-(ra - rb) / 400.0)); pe = match_prob([pe1], mt[:need])
      out << { pm: pm, pe: pe, y: mt[:win], ps: ps, sets: mt[:sets], pe1: pe1, type: mt[:type], na: hist.n(mt[:a]), nb: hist.n(mt[:b]) }
    end
    ms.each do |mt|   # 그 날 경기 결과를 기록에 넣는다
      mt[:sets].each do |s|
        hist.add(mt[:a], mt[:season], s[:ra], s[:gp]); hist.add(mt[:b], mt[:season], s[:rb], s[:gp])
        (s[:ra] + s[:rb]).each { |r| league[mt[:type]][[r, R].min] += 1 }
        [mt[:a], mt[:b]].each { |p| if elo_season[p] && elo_season[p] < mt[:season] then elo[p] = 1500 + (elo[p] - 1500) * regress end; elo_season[p] = mt[:season] }
        e = 1 / (1 + 10**(-(elo[mt[:a]] - elo[mt[:b]]) / 400.0)); d = k * ((s[:win] ? 1 : 0) - e)
        elo[mt[:a]] += d; elo[mt[:b]] -= d
      end
    end
  end
  out
end

def score(out, key)
  n = out.size.to_f
  { n: out.size, logloss: (out.sum { |o| ll(o[key], o[:y]) } / n).round(4), brier: (out.sum { |o| (o[key] - (o[:y] ? 1 : 0))**2 } / n).round(4),
    acc: (out.count { |o| (o[key] >= 0.5) == o[:y] } / n).round(4) }
end

if __FILE__ == $0
  best = nil
  [0.5, 0.7, 0.85].each do |decay|
    [100, 300, 800].each do |m|
      o = run(TUNE, decay: decay, m: m, k: 24, regress: 0.8)
      s = score(o, :pm); warn "tune M decay=#{decay} m=#{m} #{s}"
      best = [s[:logloss], decay, m] if !best || s[:logloss] < best[0]
    end
  end
  bk = nil
  [12, 20, 32].each do |k|
    [0.6, 0.8, 1.0].each do |rg|
      o = run(TUNE, decay: best[1], m: best[2], k: k, regress: rg)
      s = score(o, :pe); warn "tune E k=#{k} rg=#{rg} #{s}"
      bk = [s[:logloss], k, rg] if !bk || s[:logloss] < bk[0]
    end
  end
  o = run(TEST, decay: best[1], m: best[2], k: bk[1], regress: bk[2])
  # 섞기: 로짓 평균 가중치 (튜닝 시즌에서 고른다)
  ot = run(TUNE, decay: best[1], m: best[2], k: bk[1], regress: bk[2])
  lg = ->(p) { p = [[p, 1e-6].max, 1 - 1e-6].min; Math.log(p / (1 - p)) }
  bw = (0..10).map { |i| i / 10.0 }.min_by { |w| ot.sum { |x| ll(1 / (1 + Math.exp(-(w * lg.(x[:pm]) + (1 - w) * lg.(x[:pe])))), x[:y]) } }
  o.each { |x| x[:pb] = 1 / (1 + Math.exp(-(bw * lg.(x[:pm]) + (1 - bw) * lg.(x[:pe])))) }
  base = o.map { |x| x.merge(p0: 0.5) }
  res = { tune: TUNE, test: TEST, markov: { decay: best[1], m: best[2] }.merge(score(o, :pm)), elo: { k: bk[1], regress: bk[2] }.merge(score(o, :pe)), blend: { w_markov: bw }.merge(score(o, :pb)), coin: score(base, :p0) }
  # 세트 단위 정확도 (Markov 세트 승률, 실제 세트 결과)
  sets = o.flat_map { |x| x[:sets].sort_by { |s| s[:no] }.each_with_index.map { |s, i| { p: x[:ps][i] || x[:ps].last, y: s[:win] } } }
  res[:markov_set] = { n: sets.size, logloss: (sets.sum { |s| ll(s[:p], s[:y]) } / sets.size).round(4), acc: (sets.count { |s| (s[:p] >= 0.5) == s[:y] } / sets.size.to_f).round(4) }
  # 보정(calibration): 예측 구간별 실제 승률
  res[:calib] = o.group_by { |x| (x[:pb] * 10).floor.clamp(0, 9) }.sort.map { |b, xs| ["#{b * 10}-#{b * 10 + 10}%", xs.size, (xs.count { |x| x[:y] } * 100.0 / xs.size).round(1)] }
  puts JSON.pretty_generate(res)
end
