# 세트 실시간 승률 검증 (개인투어): 세트 시작 전 두 선수 이닝 득점 분포로, 매 이닝이 끝날 때마다
#  남은 점수 · 다음 차례에서 세트 승률을 계산 → 그 세트 실제 결과와 비교. 경기 날짜 이전 기록만 쓴다
#  비교 기준: 두 선수 실력이 같다고 보고(리그 평균 분포) 점수 상황만으로 계산한 승률
#  또 경기 전 예측의 보정 계수 c 를 튜닝 시즌에서 고른다 (p' = 1 / (1 + e^(-c · logit p)))
require_relative 'eval_ind'

def live_run(season, decay:, m:)
  hist = Hist.new
  league = Hash.new { |h, t| h[t] = Array.new(R + 1, 1.0) }
  rows = []; pre = []
  MATCHES.group_by { |x| x[:date] }.each do |_, ms|
    ms.each do |mt|
      next unless mt[:season] == season
      lg = league[mt[:type]]; prior = lg.map { |v| v / lg.sum }
      qa = hist.dist(mt[:a], mt[:season], decay, prior, m); qb = hist.dist(mt[:b], mt[:season], decay, prior, m)
      sp = Hash.new { |h, g| h[g] = (set_prob(qa, qb, g, g, true) + set_prob(qa, qb, g, g, false)) / 2 }
      pre << { p: match_prob(gp_list(mt).map { |g| sp[g] }, mt[:need]), y: mt[:win] }
      mt[:sets].each do |s|
        a = b = 0; order = s[:af] ? [[:a, s[:ra]], [:b, s[:rb]]] : [[:b, s[:rb]], [:a, s[:ra]]]
        seq = []; [s[:ra].size, s[:rb].size].max.times { |k| order.each { |w, arr| seq << w if arr[k] } }
        idx = { a: 0, b: 0 }
        seq.each_with_index do |w, i|
          r = (w == :a ? s[:ra] : s[:rb])[idx[w]]; idx[w] += 1
          w == :a ? a += r : b += r
          break if a >= s[:gp] || b >= s[:gp] || i == seq.size - 1
          nx = seq[i + 1] == :a
          rows << { p: set_prob(qa, qb, s[:gp] - a, s[:gp] - b, nx), p0: set_prob(prior, prior, s[:gp] - a, s[:gp] - b, nx), y: s[:win], k: i }
        end
      end
    end
    ms.each do |mt|
      mt[:sets].each do |s|
        hist.add(mt[:a], mt[:season], s[:ra], s[:gp]); hist.add(mt[:b], mt[:season], s[:rb], s[:gp])
        (s[:ra] + s[:rb]).each { |r| league[mt[:type]][[r, R].min] += 1 }
      end
    end
  end
  [rows, pre]
end

def m_ll(rows, key) (rows.sum { |o| ll(o[key], o[:y]) } / rows.size).round(4) end
def m_acc(rows, key) (rows.count { |o| (o[key] >= 0.5) == o[:y] } / rows.size.to_f).round(4) end

if __FILE__ == $0
  lgt = ->(p) { p = [[p, 1e-6].max, 1 - 1e-6].min; Math.log(p / (1 - p)) }
  _, pre_t = live_run(TUNE, decay: 0.5, m: 100)
  c = (5..15).map { |i| i / 10.0 }.min_by { |cc| pre_t.sum { |x| ll(1 / (1 + Math.exp(-cc * lgt.(x[:p]))), x[:y]) } }
  rows, pre = live_run(TEST, decay: 0.5, m: 100)
  pre.each { |x| x[:pc] = 1 / (1 + Math.exp(-c * lgt.(x[:p]))) }
  early = rows.select { |o| o[:k] < 4 }; late = rows.select { |o| o[:k] >= 10 }
  puts JSON.pretty_generate(
    calib_c: c, pre_raw: { logloss: m_ll(pre, :p), acc: m_acc(pre, :p) }, pre_cal: { logloss: m_ll(pre, :pc), acc: m_acc(pre, :pc) },
    live: { n: rows.size, logloss: m_ll(rows, :p), brier: (rows.sum { |o| (o[:p] - (o[:y] ? 1 : 0))**2 } / rows.size).round(4), acc: m_acc(rows, :p) },
    live_same_skill: { logloss: m_ll(rows, :p0), acc: m_acc(rows, :p0) },
    live_early: { n: early.size, model: m_ll(early, :p), same_skill: m_ll(early, :p0) },
    live_calib: rows.group_by { |x| (x[:p] * 10).floor.clamp(0, 9) }.sort.map { |b, xs| ["#{b * 10}-#{b * 10 + 10}%", xs.size, (xs.count { |x| x[:y] } * 100.0 / xs.size).round(1)] })
end
