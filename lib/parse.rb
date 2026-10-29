# encoding: utf-8
require 'nokogiri'
require_relative 'pba'

module PBA
  module Parse
    def self.clean(s) s.to_s.gsub(" ", ' ').gsub(/\s+/, ' ').strip end
    def self.int(s) s.to_s =~ /-?\d+/ ? $&.to_i : nil end

    # 투어 목록 (pba_info_lst.asp)
    def self.tour_list(html, type, season)
      doc = Nokogiri::HTML(html)
      doc.css('a[href*="contest_result_sur.asp?TourCode="]').map do |a|
        code = a['href'][/TourCode=(\d+)/, 1].to_i
        t = clean(a.text)
        dates = t.scan(/\d{4}-\d{2}-\d{2}/)
        name = t.sub(/\s*(종료|진행중|예정).*$/, '').sub(/^-->\s*/, '').strip
        { code: code, type: type, season: season, name: name,
          start: dates[0], end: dates[1], status: t[/종료|진행중|예정/],
          winner: t[/우승자\s*:\s*(\S+)/, 1] }
      end.uniq { |h| h[:code] }
    end

    # 결과 페이지의 라운드 선택 옵션
    def self.round_options(html)
      doc = Nokogiri::HTML(html)
      sel = doc.at_css('select#sel_Round') or return []
      sel.css('option').map { |o| [o['value'], clean(o.text)] }.reject { |v, _| v.to_s.empty? }
    end

    # 목록 페이지에서 PSTCode 와 라운드 제목
    def self.list_matches(html)
      html.scan(/setview\(['"]?(\d+)['"]?\)/).flatten.map(&:to_i).uniq
    end

    def self.league_popups(html)
      html.scan(/showLeagueGamePopup\('[^']*','[^']*','([^']*)','([^']*)','(\d+)'/).map { |c, n, p| [c, n, p.to_i] }.uniq
    end

    def self.score(cell)
      t = clean(cell.text)
      [int(t), t.include?('(P)')]
    end

    # 경기 상세 (contest_result_setview.asp)
    def self.setview(html, pst)
      doc = Nokogiri::HTML(html)
      info = doc.css('div.tbl_info span.t15').map { |s| clean(s.text) }
      sb = doc.at_css('div.score_board')
      ths = sb.css('th.bg01')
      players = ths.map do |th|
        { name: clean(th.at_css('.player_name').text), win: !th.at_css('.icon_win').nil? }
      end
      rows = sb.css('table tr')
      codes = rows[1].css('img.photo').map { |i| i['src'][/\/(M\d+)/, 1] }
      c1 = rows[1].css('td')
      s1, p1 = score(c1[1]); s2, p2 = score(c1[3])
      kind = clean(c1[2].text)
      avg = rows[2].css('td'); hr = rows[3].css('td')
      players[0].merge!(code: codes[0], score: s1, tiebreak_win: p1, avg: avg[0].text.to_f, hr: int(hr[0].text))
      players[1].merge!(code: codes[1], score: s2, tiebreak_win: p2, avg: avg[2].text.to_f, hr: int(hr[1].text) ? int(hr[2].text) : nil)
      players[0][:hr] = int(hr[0].text); players[1][:hr] = int(hr[2].text)
      sets = html.split('<div class="content_block ')[1..-1].to_a.map do |chunk|
        d = Nokogiri::HTML('<div class="content_block ' + chunk)
        label = clean(d.at_css('.proud_box .no_order').text)
        t14 = d.css('.proud_box span.t14').map { |s| clean(s.text) }
        gm = chunk[/recordlayer\(\d+,\s*(\d+)\)/, 1]&.to_i
        lis = chunk.scan(/<li>\s*<span class="t_order">.*?<\/li>/m)
        ps = lis.map do |li|
          ld = Nokogiri::HTML(li)
          ps = clean(ld.at_css('.t_set')&.text)
          pts, inn = ps =~ /(\d+)\s*P\s*\/\s*(\d+)/ ? [$1.to_i, $2.to_i] : [nil, nil]
          { name: clean(ld.at_css('.t_name').text), win: !ld.at_css('.icon_win').nil?,
            pts: pts, inn: inn, avg: ld.at_css('.t_avg')&.text.to_f, hr: int(ld.at_css('.t_high')&.text),
            ball: li[/ico_(white|yellow)/, 1] }
        end
        { label: label, date: t14[0], gp: t14.find { |x| x =~ /^GP/ }&.sub('GP', '')&.to_i, gm: gm, players: ps }
      end
      { pst: pst, round: info[0], no: info[1], date: info[2], kind: kind, players: players, sets: sets }
    end

    # 이닝 기록 (contest_result_set_record.asp)
    def self.record(html)
      doc = Nokogiri::HTML(html)
      heads = doc.css('table#tbl_list1 thead th.bg01').map { |th| clean(th.text) }
      names = heads.map { |h| h.sub('(선공)', '').strip }
      first = heads.index { |h| h.include?('(선공)') }
      inn = doc.css('table#tbl_list2 tbody tr').map do |tr|
        td = tr.css('td').map { |x| int(x.text) }
        { n: td[0], a: td[1, 3], b: td[4, 3] }
      end
      { names: names, first: first && names[first], innings: inn }
    end
  end
end
