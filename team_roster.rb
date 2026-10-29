#!/usr/bin/env ruby
# encoding: utf-8
# 팀리그 홈피 팀 소개(시즌별): 선수 소개 순서·캡틴·사진·회원 코드 → data/team_rosters.json
#   ruby team_roster.rb            # 전 시즌
#   ruby team_roster.rb --current  # 이번 시즌만 다시
require 'json'
require 'open3'
require 'nokogiri'

ROOT = File.expand_path(__dir__ || '.')
OUT = File.join(ROOT, 'data', 'team_rosters.json')
BASE = 'https://team.pbatour.org'

def get(path, form = nil)
  args = ['curl', '-sL', '--max-time', '30', '-A', 'Mozilla/5.0', '-e', "#{BASE}/mob/ko/team.asp"]
  args += ['--data', URI.encode_www_form(form)] if form
  3.times { out, st = Open3.capture2(*args, BASE + path); return out.force_encoding('utf-8') if st.success? && !out.empty?; sleep 1 }
  ''
end
require 'uri'
clean = ->(s) { s.to_s.gsub(/[[:space:]]+/, ' ').strip }

now = Time.now
current = now.month < 6 ? now.year - 1 : now.year
seasons = ARGV.include?('--current') ? [current] : (2020..current).to_a
res = File.exist?(OUT) ? JSON.parse(File.read(OUT)) : {}
seasons.each do |s|
  h = get('/mob/code_behind/getTeamInfo.asp', 'SeasonCode' => s, 'LTCode' => 'L01', 'LangCode' => 'ko')
  teams = h.scan(/selTeam\('?(\d+)'?\).*?<h4[^>]*>([^<]+)/m).map { |lct, name| { lct: lct.to_i, name: clean.(name) } }
  teams.each do |t|
    d = Nokogiri::HTML(get("/mob/ko/teamPlayers.asp?LCTCode=#{t[:lct]}"))
    t[:players] = d.css('div.col_1').map do |c|
      img = c.at_css('img.pic_player')
      name = clean.(c.at_css('p')&.text)
      next if name.empty?
      { name: name, mem: img && img['src'][/players\/(M\d+)/, 1], photo: img && img['src'],
        captain: !!c.at_css('.icon_leader span:not(.d_hide)') }
    end.compact
    info = d.css('table tr').map { |tr| [clean.(tr.at_css('th')&.text), clean.(tr.at_css('td')&.text)] }.to_h
    t[:leader] = info['팀리더']
  end
  res[s.to_s] = teams
  $stderr.puts "#{s}: 팀 #{teams.size}, 선수 #{teams.sum { |t| t[:players].size }}"
end
File.write(OUT, JSON.pretty_generate(res))
