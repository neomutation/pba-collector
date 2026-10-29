# encoding: utf-8
require 'json'

# 선수 Numbers 파일의 시즌 시트를 읽어 열 위치를 자동으로 찾는다.
# (시즌마다 열 위치가 달라서 헤더 글자로 찾는다.)
class SeasonSheet
  attr_reader :name, :rows, :cols, :layout

  def self.col_letter(i)
    s = ''; i += 1
    while i > 0
      i, r = (i - 1).divmod(26); s = (65 + r).chr + s
    end
    s
  end

  def initialize(name, json_path)
    @name = name
    j = JSON.parse(File.read(json_path))
    @rows = j['rows']; @cols = j['cols']
    @vals = j['data'].each_slice(2).map(&:first)
    @fml  = j['data'].each_slice(2).map(&:last)
    @layout = detect
  end

  def v(r, c) (@vals[r - 1] || [])[c] end
  def formula?(r, c) ((@fml[r - 1] || [])[c] || 0) == 1 end

  def detect
    e = nil
    (1..14).each do |r|
      (20...@cols).each { |c| if %w[영봉 Ko KO].include?(v(r, c).to_s.strip) then e = [r, c]; break end }
      break if e
    end
    return nil unless e
    hr, ec = e
    tie = ((ec + 4)...@cols).find { |c| v(hr, c) == '승' }
    nsets = tie - (ec + 4)
    # 세트별 이닝 칸: 머리글에 1,2,3.. 이 오른쪽에서 왼쪽으로 두 칸씩 떨어져 적혀 있다 (이닝, 득점 쌍)
    lab = ->(c) { x = v(hr, c); x.is_a?(Numeric) ? x.to_i : (x.to_s =~ /\A\d\z/ ? x.to_i : nil) }
    start = (ec - 1).downto(2).find { |c| lab.(c) == 1 && lab.(c - 2) == 2 && lab.(c - 4) == 3 }
    inn = {}
    if start
      (1..nsets).each do |k|
        c = start - 2 * (k - 1)
        next unless c >= 1 && lab.(c) == k
        c -= 1 if lab.(c - 1) == k       # 머리글이 두 칸에 걸쳐 합쳐져 있으면 왼쪽 칸이 이닝 칸
        inn[k] = c
      end
    end
    tb = (0...20).find { |c| v(hr, c) == '승부' }
    single = (0...ec).find { |c| v(hr, c) == '단판' }
    { hdr: hr, tour: ec + 1, round: ec + 2, opp: ec + 3, wins: ec + 4, nsets: nsets, tie: tie, ball: tie + 1,
      fb: tie + 2, fb_tie: tie + 2 + nsets, inn: inn, tb_inn: tb, single: single,
      avg: (0...ec).find { |c| v(hr, c) == 'BA' || v(hr, c) == '세트' }, win: ec - 1, ko: ec }
  end

  # 경기가 적힌 줄만 모은다 (상대 이름이 있는 줄)
  def matches
    l = @layout
    last_tour = nil
    ((l[:hdr] + 1)..@rows).map do |r|
      t = v(r, l[:tour]); last_tour = t unless t.nil?
      opp = v(r, l[:opp])
      next if opp.nil? || opp.to_s.strip.empty?
      tour = t.nil? ? last_tour : t
      next if tour.nil?
      num = ->(c) { x = v(r, c); x.is_a?(Numeric) ? x : nil }
      sets = (1..l[:nsets]).map do |k|
        w = num.(l[:wins] + k - 1)
        ic = l[:inn][k]
        { win: w, inn: ic && num.(ic), pts: ic && num.(ic + 1), fb: num.(l[:fb] + k - 1) }
      end
      { row: r, tour: tour.to_s.sub(/\.0\z/, ''), round: v(r, l[:round]), opp: opp.to_s, sets: sets,
        tie_win: num.(l[:tie]), tie_fb: num.(l[:fb_tie]), ball: v(r, l[:ball]),
        tb_inn: l[:tb_inn] && num.(l[:tb_inn]), tb_pts: l[:tb_inn] && num.(l[:tb_inn] + 1),
        single_inn: l[:single] && num.(l[:single] + 1), single_pts: l[:single] && num.(l[:single] + 2),
        result: num.(l[:win]), ko: num.(l[:ko]) }
    end.compact
  end
end
