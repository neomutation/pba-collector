# encoding: utf-8
require 'json'
require_relative 'pba'

# data/matches/*.json 을 선수 관점의 한 줄(경기)로 풀어서 다룬다.
module Model
  DATA = File.join(PBA::ROOT, 'data')

  def self.tours
    @tours ||= JSON.parse(File.read(File.join(DATA, 'tours.json')), symbolize_names: true).each_with_object({}) { |t, h| h[t[:code]] = t }
  end

  def self.round_value(label)
    case label
    when /\A(\d+)강\z/ then $1.to_i
    when '결승' then 2
    when '준결승' then 4
    else label
    end
  end

  # 한 세트 기록에서 선수별 이닝 득점 목록 [[a...], [b...]] (names 순서)
  def self.runs(rec, gp)
    return nil unless rec && rec['innings'] && !rec['innings'].empty?
    out = [[], []]; cum = [0, 0]
    rec['innings'].each do |i|
      [i['a'], i['b']].each_with_index do |x, k|
        next if x[0].nil?
        v = [x[0].to_i + 2 * x[1].to_i, gp - cum[k]].min
        cum[k] += v; out[k] << v
      end
    end
    out
  end

  def self.set_no(label)
 label =~ /\A(\d+) Set/ ? $1.to_i : nil end

  # 한 경기를 두 선수의 관점으로 풀어 [record, record] 를 돌려준다.
  def self.perspectives(m)
    tour = tours[m['tour']] or return []
    sets = m['sets'].select { |s| set_no(s['label']) }.sort_by { |s| set_no(s['label']) }
    tb = m['sets'].find { |s| s['label'] == '승부치기' }
    notes = { tiebreak: nil, tie: nil }
    if tb && tb['record'] && tb['record']['first']
      s1first = sets[0] && sets[0]['record'] && sets[0]['record']['first']
      wh = s1first && tb['players'].find { |p| p['name'] == s1first }
      first = tb['record']['first']
      if wh && wh['name'] != first
        w = tb['players'].find { |p| p['win'] }; l = tb['players'].find { |p| !p['win'] }
        rec = tb['record']; rr = runs(rec, 99)
        if w && l && rr && rec['names'].size == 2
          fi = rec['names'].index(first); si = 1 - fi
          cf = 0; cs = 0; lines = []
          [rr[fi].size, rr[si].size].max.times do |k|
            cf += rr[fi][k].to_i; cs += rr[si][k].to_i
            lines << "#{k + 1}이닝 #{cf}:#{cs}"
          end
          lines[-1] += " #{w['name']} 승." if lines.any?
          notes[:tiebreak] = (["#{wh['name']} 초구 양보."] + lines).join("\n")
        end
      end
    end
    if sets.size == 1 && sets[0]['gp'] == 25 && sets[0]['players'].map { |p| p['pts'] }.uniq.size == 1 && sets[0]['record']
      rec = sets[0]['record']; rr = runs(rec, 25)
      if rr && rec['names'].size == 2
        nm = rec['names']; sa = rr[0].select { |x| x > 0 }.sort.reverse; sb = rr[1].select { |x| x > 0 }.sort.reverse
        labels = %w[하이런 세컨 서드]; steps = []; decided = nil
        [sa.size, sb.size].max.times do |k|
          a = sa[k].to_i; b = sb[k].to_i
          steps << "#{labels[k] || "#{k + 1}번째"} #{nm[0]} #{a} : #{nm[1]} #{b}"
          if a != b then decided = true; break end
        end
        winner = sets[0]['players'].find { |p| p['win'] }
        pts = sets[0]['players'][0]['pts']; inn = sets[0]['players'][0]['inn']
        tail = decided ? "#{steps.join(' → ')}" : "하이런 전부 동일 → 뱅킹 재대결"
        notes[:tie] = "25점 단판 동점 #{pts}:#{pts} (#{inn}이닝). #{tail} → #{winner ? winner['name'] : '?'} 승"
      end
    end
    m['players'].each_index.map do |i|
      me = m['players'][i]; op = m['players'][1 - i]
      mine = ->(s) { s['players'].find { |p| p['name'] == me['name'] } }
      srows = sets.map do |s|
        p = mine.(s); r = s['record']
        fb = nil; first = false; perfect = nil; my_runs = nil
        if r && r['first']
          first = (r['first'] == me['name'])
          rr = runs(r, s['gp'] || 15)
          if rr
            idx = r['names'].index(me['name']); my_runs = rr[idx]; op_runs = rr[1 - idx]
            fb = my_runs.first if first
            gp = s['gp'] || 15
            perfect = :made if my_runs.max == gp
            perfect = :suffered if op_runs.max == gp
          end
        end
        { no: set_no(s['label']), inn: p['inn'], pts: p['pts'], win: p['win'], ball: p['ball'], first: first,
          first_ball: fb, perfect: perfect, runs: my_runs, avg: p['avg'], hr: p['hr'], gp: s['gp'] }
      end
      trow = nil
      if tb
        p = mine.(tb); r = tb['record']; first = r && r['first'] == me['name']; fb = nil
        if first
          idx = r['names'].index(me['name']); fb = runs(r, 99)[idx].first
        end
        trow = { inn: tb['players'].map { |x| x['inn'].to_i }.max, pts: p['pts'], win: p['win'], first: first, first_ball: fb }
      end
      wins = srows.count { |s| s[:win] }
      loses = srows.count { |s| !s[:win] }
      { tour: m['tour'], season: tour[:season], type: tour[:type], seq: tour[:seq], pst: m['pst'],
        date: m['date'], round_code: m['round_code'].to_i, round: (m['round'] == '예선' && m['round_code'].to_i > 0 ? m['round_code'].to_i : round_value(m['round'])), round_raw: m['round'],
        list_kind: m['list_kind'], single: sets.size == 1 && sets[0]['gp'] == 25,
        player: me['name'], opp: op['name'], win: (sets.size == 1 && sets[0]['gp'] == 25 ? mine.(sets[0])['win'] : me['win']), set_score: [me['score'], op['score']],
        tiebreak: trow, tiebreak_win: me['tiebreak_win'], sets: srows,
        ball: (srows.first && srows.first[:first] ? 'white' : (srows.first && (sets[0]['record'] || {})['first'] ? 'yellow' : srows.first && srows.first[:ball])), site_avg: me['avg'], site_hr: me['hr'],
        shutout: me['win'] && loses.zero? && wins >= 3, notes: notes }
    end
  end

  def self.load_all
    @all ||= Dir[File.join(DATA, 'matches', '*.json')].flat_map do |f|
      JSON.parse(File.read(f)).flat_map { |m| perspectives(m) }
    end
  end

  def self.history(name)
    load_all.select { |r| r[:player] == name }.sort_by { |r| [r[:season], seq_order(r[:seq]), -r[:round_code], r[:pst]] }
  end

  # 파일의 투어 칸이 'F' 또는 (일반 투어 수 + 1) 이면 월드챔피언십
  def self.tour_label_match?(rec, label)
    return true if rec[:seq].to_s == label.to_s
    return false unless rec[:seq] == 'F'
    return true if label.to_s == '10'      # 마지막(10번째) 투어 구역을 월드챔피언십으로 쓰는 파일
    regular = tours.values.count { |t| t[:type] == rec[:type] && t[:season] == rec[:season] && t[:seq] != 'F' }
    label.to_s == (regular + 1).to_s
  end

  ALIASES = (File.exist?(File.join(ROOT = PBA::ROOT, 'aliases.json')) ? JSON.parse(File.read(File.join(PBA::ROOT, 'aliases.json'))) : {})

  def self.norm_name(s) (ALIASES[s.to_s] || s.to_s).gsub(/[\s.]/, '') end

  # 파일의 한 줄(fr)에 해당하는 경기를 gen(홈피 경기 목록)에서 찾는다.
  #  1) 같은 투어 + 같은 상대(표기 차이 무시)  2) 같은 투어·라운드 후보가 하나뿐  3) 후보 중 세트 승패가 같은 것
  def self.match_row(gen, used, fr)
    free = gen.reject { |x| used[x[:pst]] }
    g = free.find { |x| tour_label_match?(x, fr[:tour]) && norm_name(x[:opp]) == norm_name(fr[:opp]) }
    return g if g
    cand = free.select { |x| tour_label_match?(x, fr[:tour]) && x[:round].to_s == fr[:round].to_s }
    return cand.first if cand.size == 1
    wins = fr[:sets].map { |s| s[:win] }.compact
    cand.find { |x| x[:sets].map { |s| s[:win] ? 1 : 0 } == wins.map(&:to_i) } if wins.any?
  end

  def self.seq_order(seq)

 seq == 'F' ? 99 : seq.to_i end
end
