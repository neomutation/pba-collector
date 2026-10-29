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
    blocks = html.split(/<div class="(?:proud_box_set|set_game)"/)[1..-1].to_a
    blocks.map do |chunk|
      codes = chunk[/viewRanktOther\('(\w+)','(\w+)'\)/] ? [$1, $2] : nil
      next nil unless codes
      d = Nokogiri::HTML('<div>' + chunk)
      rows = d.css('li').reject { |li| li.text.include?('Result') }
      teams = rows.first(2).map { |li| { short: clean(li.at_css('.t_name')&.text), sets: num(li.at_css('.t_set')&.text) } }
      { kind: 'team', t1: codes[0], t2: codes[1], teams: teams, tg: chunk.scan(/viewResultDetail\('?(\d+)'?\)/).flatten.map(&:to_i).max,
        text: clean(d.text)[0, 300] }
    end.compact
  end
end
