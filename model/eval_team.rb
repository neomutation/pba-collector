# 팀리그 승부 예측 모델 검증 (오프라인)
#  세트마다 실제 출전 선수(콤비)의 이닝 득점 분포로 세트 승률 → 경기(4세트 선승) 승률. 경기 날짜 순으로 그 날 이전 기록만 쓴다
#  안 치른 세트(4:0 등)는 출전 선수를 모르므로 그 팀이 이번 시즌 그 세트 번호에 내보낸 선수 비율로 섞는다 (방송 전 라인업 모를 때와 같은 방식)
#  사용: ruby model/eval_team.rb [튜닝 시즌] [검증 시즌]
require 'sqlite3'
require 'json'
require_relative 'eval_ind'

TUNE_T = (ARGV[0] || 2025).to_i
TEST_T = (ARGV[1] || 2026).to_i
tdb = SQLite3::Database.new(File.join(__dir__, '..', 'data', 'team.db'), readonly: true)
GAMES = tdb.execute('SELECT id, season, date, t1, t2, s1, s2, sets, post FROM games ORDER BY date, no').map do |id, se, da, t1, t2, s1, s2, sets, post|
  ss = (JSON.parse(sets || '[]') rescue []).map do |s|
    next unless s['runs'].is_a?(Array) && s['runs'].size == 2 && s['p'].is_a?(Array) && s['first'] && s['gp'].to_i > 0 && s['win']
    { no: s['no'], gp: s['gp'].to_i, kind: s['kind'].to_s, pa: s['p'][0], pb: s['p'][1], ra: s['runs'][0].map(&:to_i), rb: s['runs'][1].map(&:to_i), af: s['first'] == 1, win: s['win'] == 1 }
  end.compact
  { id: id, season: se, date: da.to_s[0, 10], t1: t1, t2: t2, s1: s1, s2: s2, sets: ss, post: post == 1 }
end.reject { |g| g[:sets].empty? }
warn "팀 경기 #{GAMES.size}개"

# 개인투어 이닝 기록 (선수 이름으로 팀리그 선수와 같은 사람): [날짜, 시즌, 이름, 이닝 득점들, gp]
IND = begin
  idb = SQLite3::Database.new(File.join(__dir__, '..', 'data', 'pba.db'), readonly: true)
  idb.execute('SELECT date, season, player_name, sets FROM games ORDER BY date').flat_map do |da, se, nm, sets|
    (JSON.parse(sets || '[]') rescue []).select { |s| s['runs_list'].is_a?(Array) && s['gp'].to_i > 0 }.map { |s| [da.to_s[0, 10], se, nm, s['runs_list'].map(&:to_i), s['gp'].to_i] }
  end
end

def ent(ps) ps.size == 1 ? "1|#{ps[0]}" : "2|#{ps.sort.join('|')}" end

def mix(dists, ws) (0..R).map { |r| dists.each_with_index.sum { |d, i| d[r] * ws[i] } } end

def run_team(test_season, decay:, m:, m2:, m3: 100, use_ind: true)
  hist = Hist.new; ii = 0
  kinds = Hash.new { |h, k| h[k] = Array.new(R + 1, 1.0) }
  usage = Hash.new { |h, k| h[k] = Hash.new(0) }   # [팀, 시즌, 세트 번호] → { 엔트리: 횟수 }
  gpno = Hash.new { |h, k| h[k] = Hash.new(0) }    # [시즌, 세트 번호] → gp 빈도
  kindno = Hash.new { |h, k| h[k] = Hash.new(0) }  # [시즌, 세트 번호] → 종목 빈도
  out = []
  GAMES.group_by { |g| g[:date] }.each do |date, gs|
    # 그 날 이전 개인투어 이닝을 선수 기본 분포(i|이름)에 넣는다
    while use_ind && ii < IND.size && IND[ii][0] < date
      da, se, nm, runs, gp = IND[ii]; hist.add("i|#{nm}", se, runs, gp); ii += 1
    end
    gs.each do |g|
      next unless g[:season] == test_season && !g[:post]
      prior_of = ->(kind) { k = kinds[kind]; k.map { |v| v / k.sum } }
      # 엔트리 분포: 단식 = 선수 기록, 복식 = 콤비 기록을 두 선수 복식 기록 평균 쪽으로 당김
      # 선수 기본 분포 = 개인투어 + 팀리그 단식 이닝 (종목 평균으로 당김). 단식 = 팀리그 단식 기록을 기본 분포 쪽으로 당김
      #  복식 = 콤비 기록을 두 선수의 복식 기록(각자 기본 분포 쪽으로 당김) 평균 쪽으로 당김
      basep = ->(p, pr) { hist.dist("i|#{p}", g[:season], decay, pr, m) }
      dist = lambda do |ps, kind|
        pr = prior_of.(kind)
        return hist.dist(ent(ps), g[:season], decay, basep.(ps[0], pr), m3) if ps.size == 1
        base = mix(ps.map { |p| hist.dist("d|#{p}", g[:season], decay, basep.(p, pr), m3) }, [0.5, 0.5])
        hist.dist(ent(ps), g[:season], decay, base, m2)
      end
      sp = lambda do |pa, pb, kind, gp|
        qa = dist.(pa, kind); qb = dist.(pb, kind)
        (set_prob(qa, qb, gp, gp, true) + set_prob(qa, qb, gp, gp, false)) / 2
      end
      played = g[:sets].map { |s| [s[:no], s] }.to_h
      ps = (1..7).map do |no|
        if (s = played[no]) then sp.(s[:pa], s[:pb], s[:kind], s[:gp])
        else
          ua = usage[[g[:t1], g[:season], no]].sort_by { |_, c| -c }.first(3); ub = usage[[g[:t2], g[:season], no]].sort_by { |_, c| -c }.first(3)
          kind = kindno[[g[:season], no]].max_by { |_, c| c }&.first; gp = gpno[[g[:season], no]].max_by { |_, c| c }&.first
          if ua.empty? || ub.empty? || !kind then 0.5
          else
            ta = ua.sum { |_, c| c }.to_f; tb = ub.sum { |_, c| c }.to_f
            ua.sum { |ea, ca| ub.sum { |eb, cb| ca / ta * cb / tb * sp.(ea.split('|')[1..], eb.split('|')[1..], kind, gp) } }
          end
        end
      end
      pm = match_prob(ps, 4)
      out << { pm: pm, y: g[:s1] > g[:s2], draw: g[:s1] == g[:s2], ps: ps, sets: g[:sets] }
    end
    gs.each do |g|
      g[:sets].each do |s|
        [[s[:pa], s[:ra]], [s[:pb], s[:rb]]].each do |ps, runs|
          hist.add(ent(ps), g[:season], runs, s[:gp])
          ps.each { |p| hist.add("d|#{p}", g[:season], runs, s[:gp]) } if ps.size == 2
          hist.add("i|#{ps[0]}", g[:season], runs, s[:gp]) if ps.size == 1
          runs.each { |r| kinds[s[:kind]][[r, R].min] += 1 }
        end
        next if g[:post]
        usage[[g[:t1], g[:season], s[:no]]][ent(s[:pa])] += 1; usage[[g[:t2], g[:season], s[:no]]][ent(s[:pb])] += 1
        gpno[[g[:season], s[:no]]][s[:gp]] += 1; kindno[[g[:season], s[:no]]][s[:kind]] += 1
      end
    end
  end
  out
end

# 실시간(이닝마다) 세트 승률 검증: 세트 시작 전 분포로, 매 이닝 뒤 남은 점수 · 다음 차례에서 승률을 계산해 실제 세트 결과와 비교
def live_eval(out_sets)
  rows = []
  out_sets.each do |qa, qb, s|
    a = b = 0; order = s[:af] ? [[:a, s[:ra]], [:b, s[:rb]]] : [[:b, s[:rb]], [:a, s[:ra]]]
    n = [s[:ra].size, s[:rb].size].max
    seq = []; n.times { |k| order.each { |w, arr| seq << [w, arr[k]] if arr[k] } }
    seq.each_with_index do |(w, r), i|
      w == :a ? a += r : b += r
      break if a >= s[:gp] || b >= s[:gp] || i == seq.size - 1
      nxt = seq[i + 1][0]
      p = set_prob(qa, qb, s[:gp] - a, s[:gp] - b, nxt == :a)
      rows << { p: p, y: s[:win], diff: a - b, inn: i }
    end
  end
  rows
end

if __FILE__ == $0
  best = nil
  [0.5, 0.7].each do |decay|
    [100, 300].each do |m|
      [50, 200].each do |m2|
        [30, 150].each do |m3|
          o = run_team(TUNE_T, decay: decay, m: m, m2: m2, m3: m3)
          s = score(o.reject { |x| x[:draw] }, :pm); warn "tune T decay=#{decay} m=#{m} m2=#{m2} m3=#{m3} #{s}"
          best = [s[:logloss], decay, m, m2, m3] if !best || s[:logloss] < best[0]
        end
      end
    end
  end
  o = run_team(TEST_T, decay: best[1], m: best[2], m2: best[3], m3: best[4]).reject { |x| x[:draw] }
  sets = o.flat_map { |x| x[:sets].map { |s| { p: x[:ps][s[:no] - 1], y: s[:win] } } }
  res = { tune: TUNE_T, test: TEST_T, params: { decay: best[1], m: best[2], m2: best[3], m3: best[4] }, game: score(o, :pm),
          set: { n: sets.size, logloss: (sets.sum { |s| ll(s[:p], s[:y]) } / sets.size).round(4), acc: (sets.count { |s| (s[:p] >= 0.5) == s[:y] } / sets.size.to_f).round(4) },
          calib: o.group_by { |x| (x[:pm] * 10).floor.clamp(0, 9) }.sort.map { |b, xs| ["#{b * 10}-#{b * 10 + 10}%", xs.size, (xs.count { |x| x[:y] } * 100.0 / xs.size).round(1)] } }
  puts JSON.pretty_generate(res)
end
