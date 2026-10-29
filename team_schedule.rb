#!/usr/bin/env ruby
# encoding: utf-8
# 팀리그 이번 시즌 경기 일정(끝난 경기 + 남은 경기)을 홈피 대진표에서 받아 data/team_schedule.json 에 저장한다.
#  홈피: /mob/ko/planDetail.asp?LeagueCode=… (라운드 고르기) → /mob/code_behind/getPlanDetailEnd_new2.asp (라운드 대진표)
#  [{ league, round: '4R', round_code: 94, no, date: '2026-10-31', time: '12:00', t1: 'T00020', t2: 'T00002' }]
#   ruby team_schedule.rb          # 이번 시즌 (team.db 의 가장 최근 리그)
#   ruby team_schedule.rb 1018     # 리그 코드 지정
require 'json'
require 'open3'
require 'sqlite3'

ROOT = __dir__
BASE = 'https://team.pbatour.org'
OUT = File.join(ROOT, 'data', 'team_schedule.json')

def fetch(path, data = nil, referer)
  args = ['curl', '-sL', '--max-time', '40', '-A', 'Mozilla/5.0', '-e', referer]
  args += ['--data', data] if data
  3.times do
    out, st = Open3.capture2(*args, BASE + path)
    return out.force_encoding('utf-8') if st.success? && !out.empty?
    sleep 2
  end
  raise "받기 실패: #{path}"
end

league = (ARGV[0] || SQLite3::Database.new(File.join(ROOT, 'data', 'team.db')).execute('SELECT MAX(league) FROM leagues')[0][0]).to_i
plan = "/mob/ko/planDetail.asp?LeagueCode=#{league}"
page = fetch(plan, nil, BASE + plan)
# 라운드 고르기: <option value="94|4 Round|N">
rounds = page.scan(/<option value="(\d+)\|([^|"]+)\|([YN])"/).map { |rc, name, post| { code: rc.to_i, name: name.strip, post: post == 'Y' } }.reject { |r| r[:post] }
abort '라운드 목록을 찾지 못함' if rounds.empty?
games = []
rounds.each do |r|
  label = r[:name][/\d+/] + 'R'
  # 끝난 경기(IsCompleted=Y)와 남은 경기(N)를 따로 준다 → 합쳐서 날짜·시간 순
  %w[Y N].each do |done|
    html = fetch('/mob/code_behind/getPlanDetailEnd_new2.asp', "RoundCode=#{r[:code]}&RoundNumber=#{r[:name]}&LCTCode=&LangCode=ko&IsCompleted=#{done}", BASE + plan)
    # 남은 경기 = proud_box (d_day 칸에 날짜 | 시작 시각), 끝난 경기 = proud_box_set (날짜 시각 한 줄)
    html.split(/<div class="proud_box(?:_set)?">/)[1..-1].to_a.each do |blk|
      t1, t2 = blk[/viewRanktOther\('(\w+)','(\w+)'\)/] ? [$1, $2] : next
      day = blk[/(\d{4}-\d{2}-\d{2})/, 1]
      time = blk[/\d{4}-\d{2}-\d{2}.*?(\d{1,2}:\d{2})/m, 1]
      next if games.any? { |g| g[:round] == label && g[:t1] == t1 && g[:t2] == t2 && g[:date] == day }
      games << { league: league, round: label, round_code: r[:code], date: day, time: time, t1: t1, t2: t2, done: done == 'Y' }
    end
  end
  $stderr.puts "#{label}: #{games.count { |g| g[:round] == label }}경기"
end
games.sort_by! { |g| [g[:round][/\d+/].to_i, g[:date].to_s, g[:time].to_s] }
File.write(OUT, JSON.generate(games))
$stderr.puts "saved #{games.size} games (league #{league})"
