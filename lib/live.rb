# encoding: utf-8
# 진행 중 경기 (실시간). 서버(server.rb)가 /api/live 요청 때 불러 쓴다. 15초 동안은 받은 걸 다시 쓴다.
require 'json'
require 'open3'
require 'nokogiri'
require_relative 'parse'

module Live
  @cache = {}
  def self.cached(key, ttl = 15)
    hit = @cache[key]
    return hit[1] if hit && Time.now - hit[0] < ttl
    v = yield
    @cache.delete_if { |_, (t, _)| Time.now - t > 600 } if @cache.size > 200   # 끝난 경기 · 지난 세트 기록이 계속 쌓이지 않게
    @cache[key] = [Time.now, v]
    v
  end
  def self.clean(s) s.to_s.gsub(/[[:space:]]+/, ' ').strip end
  def self.num(s) clean(s)[/-?\d+(\.\d+)?/].then { |x| x && (x.include?('.') ? x.to_f : x.to_i) } end

  # 개인투어: 진행 중 투어의 live_info → 경기마다 선수·세트 스코어·현재 세트 점수·이닝·차례
  def self.individual(tours)
    tours.flat_map do |t|
      html = cached("ilive#{t['code']}") do
        out, = Open3.capture2('curl', '-sL', '--max-time', '15', '-A', 'Mozilla/5.0', '-e', "#{PBA::BASE}/mob/contest_new/admin/live_info.asp",
                              '--data', "TourCode=#{t['code']}", "#{PBA::BASE}/mob/contest_new/code_behind/live_info.asp")
        out.force_encoding('utf-8')
      end
      html.split('<div class="set_game">')[1..-1].to_a.map do |chunk|
        d = Nokogiri::HTML('<div>' + chunk)
        info = clean(d.at_css('.tbl_info')&.text)
        codes = chunk[/comGameResultSet\([^)]*'(M\d+)',\s*'(M\d+)'\)/] ? [$1, $2] : []
        lis = d.css('ul.score_01 > li')
        players = lis.map.with_index do |li, i|
          box = li.at_css('.point_box01, .point_box02')
          spans = box ? box.css('span').map { |x| clean(x.text) } : []
          { code: codes[i], name: clean(li.at_css('.name_lft .spbox')&.text), sets: num(li.at_css('.set_point')&.text),
            pts: num(box&.at_css('.number0.t22')&.text), avg: num(spans.find { |x| x.start_with?('AVG') }), hr: num(spans.find { |x| x.start_with?('HR') }),
            run: num(box&.at_css('.r_col')&.text), ball: box&.at_css('.w_col') ? 'white' : box&.at_css('.y_col') ? 'yellow' : nil,
            turn: !li.at_css('.icon_turn').nil? }
        end
        next nil if players.size < 2
        { kind: 'indiv', tour: t['code'], tour_name: t['name'], type: t['type'], pst: chunk[/setview\((\d+)\)/, 1]&.to_i,
          no: info[/No\s*(\d+)/, 1]&.to_i, round: info[/\|\s*(\S+강|결승|준결승|PPQ|PQ|Q)\b/, 1] || info[/(\d+강|결승|준결승)/, 1],
          table: info[/\b(T\d+)\b/, 1], inning: info[/inn\s*(\d+)/, 1]&.to_i, players: players }
      end.compact
    end
  end

  # 경기 상세(끝난 세트 점수·이닝)와 현재 세트 이닝 기록
  def self.detail(tour, pst)
    cached("idet#{pst}", 20) do
      sv = PBA::Parse.setview(PBA.get('/mob/contest_new/admin/contest_result_setview.asp', { TourCode: tour, PSTCode: pst }, false), pst)
      sv[:sets].each do |s|
        next unless s[:gm]
        s[:record] = (PBA::Parse.record(PBA.get('/mob/contest_new/code_behind/contest_result_set_record.asp', { PCGMCode: s[:gm] }, false)) rescue nil)
      end
      sv
    rescue => e
      { error: e.message }
    end
  end

  # 팀리그: live.asp 에 진행 중 경기가 HTML 로 들어온다 (결과 목록과 같은 모양일 것으로 보고 읽는다)
  def self.team
    html = cached('tlive') do
      out, = Open3.capture2('curl', '-sL', '--max-time', '15', '-A', 'Mozilla/5.0', 'https://team.pbatour.org/mob/ko/live.asp')
      out.force_encoding('utf-8')
    end
    return [] if html.include?('해당 내역이 없습니다')
    # 경기마다 진행 중 세트(set_game) 하나 + 나머지 세트 칸들(set_box). 팀 코드는 로고 파일 이름에 있다
    html.split(/<div class="set_game"/)[1..-1].to_a.map do |chunk|
      codes = chunk.scan(%r{/team/(T\d+)_}).flatten.uniq.first(2)
      next nil unless codes.size == 2
      d = Nokogiri::HTML('<div>' + chunk)
      sets = [clean(d.at_css('.set_point')&.text), clean(d.at_css('.set_point_rgt')&.text)].map(&:to_i)
      names = d.css('ul.score_01 span.w_80').map { |x| clean(x.text) }
      cur_no = chunk[/(\d+)\s*Set/, 1].to_i
      split = ->(s) { clean(s).split(',').map(&:strip).reject(&:empty?) }
      order = chunk.split('<div class="set_box">')[1..-1].to_a.map do |c|
        sd = Nokogiri::HTML('<div>' + c)
        lis = sd.css('ul.win_lost_block01 > li').select { |li| li.at_css('.t_name') && !li.text.include?('Player') && !li.text.include?('Result') }
        { no: sd.at_css('.no_order')&.text.to_s[/\d+/].to_i, p: lis.first(2).map { |li| split.(li.at_css('.t_name').text) } }
      end
      now = d.css('ul.score_01 .n_col').map { |x| split.(x.text) }
      order << { no: cur_no, p: now } if cur_no > 0 && now.size == 2
      { kind: 'team', t1: codes[0], t2: codes[1], teams: names.each_with_index.map { |n, i| { short: n, sets: sets[i] } }, cur_set: cur_no,
        order: order.select { |o| o[:no] > 0 }.sort_by { |o| o[:no] }, text: clean(d.at_css('ul.score_01')&.text)[0, 300] }
    end.compact
  end
end
