#!/usr/bin/env ruby
# encoding: utf-8
# PBA 사이트에서 투어/경기/세트/이닝 기록을 모아 data/ 아래에 JSON 으로 저장한다.
#   ruby collect.rb                    # 2022-23 시즌부터 전부 (PBA, LPBA)
#   ruby collect.rb --tours 269,271    # 특정 투어만
#   ruby collect.rb --since 2025       # 2025-26 시즌부터
require 'optparse'
require 'thread'
require_relative 'lib/parse'

opts = { since: 2022, types: %w[PBA LPBA], workers: 4, tours: nil }
OptionParser.new do |o|
  o.on('--since YEAR', Integer) { |v| opts[:since] = v }
  o.on('--types LIST') { |v| opts[:types] = v.split(',') }
  o.on('--workers N', Integer) { |v| opts[:workers] = v }
  o.on('--tours LIST') { |v| opts[:tours] = v.split(',').map(&:to_i) }
end.parse!

P = PBA::Parse
DATA = File.join(PBA::ROOT, 'data')

def log(msg) $stderr.puts "[#{Time.now.strftime('%H:%M:%S')}] #{msg}" end

def load_tours(opts)
  tours = []
  opts[:types].each do |type|
    (opts[:since]..Time.now.year).each do |season|
      html = PBA.get('/mob/contest_new/admin/pba_info_lst.asp', { playerType: type, SeasonCode: season }, false)
      list = P.tour_list(html, type, season)
      list = list.sort_by { |t| [t[:end].to_s, t[:code]] }
      regular = 0
      list.each do |t|
        if t[:name] =~ /월드\s*챔피언십/
          t[:seq] = 'F'
        else
          regular += 1
          t[:seq] = regular.to_s
        end
      end
      tours.concat(list)
    end
  end
  tf = File.join(DATA, 'tours.json')
  old = File.exist?(tf) ? JSON.parse(File.read(tf), symbolize_names: true) : []
  merged = (old.reject { |o| tours.any? { |t| t[:code] == o[:code] } } + tours).sort_by { |t| [t[:type], t[:season], t[:end].to_s] }
  File.write(tf, JSON.pretty_generate(merged))
  tours
end

# 한 투어의 모든 경기 PSTCode 를 (라운드 코드, 라운드명)과 함께 모은다.
def tour_psts(tour)
  code = tour[:code]
  page = PBA.get('/mob/contest_new/admin/contest_result_sur.asp', { TourCode: code }, false)
  rounds = P.round_options(page)
  found = {}
  rounds.each do |rcode, rname|
    next unless rcode =~ /\A\d+\z/
    pg = 1
    loop do
      html = PBA.get('/mob/contest_new/code_behind/contest_result_sur.asp',
                     { TourCode: code, iBLCode: rcode, iPage: pg, txt_Search: '' }, false)
      title = P.clean(html[/<div class="tit_round">(.*?)<\/div>/m, 1].to_s.gsub(/<[^>]*>/, ' '))
      break if html.strip.empty?
      if html.include?('showLeagueGamePopup')
        P.league_popups(html).each do |_c, _n, pc|
          ph = PBA.get('/mob/contest_new/code_behind/contest_result_sur_s2.asp',
                       { TourCode: code, iBLCode: rcode, iPage: 1, txt_Search: '', PcPnCode: pc }, false)
          P.list_matches(ph).each { |p| found[p] ||= { round_code: rcode, round_name: rname, list_kind: 'league' } }
        end
        break
      end
      next_ids = P.list_matches(html)
      break if next_ids.empty?
      next_ids.each { |p| found[p] ||= { round_code: rcode, round_name: rname, list_kind: title } }
      pg += 1
      break if pg > 60
    end
  end
  found
end

def collect_match(tour, pst, meta, cache)
  sv = P.setview(PBA.get('/mob/contest_new/admin/contest_result_setview.asp', { TourCode: tour[:code], PSTCode: pst }, cache), pst)
  sv[:sets].each do |s|
    next unless s[:gm]
    rec = nil
    3.times do |i|
      rec = P.record(PBA.get('/mob/contest_new/code_behind/contest_result_set_record.asp', { PCGMCode: s[:gm] }, i.zero? ? cache : false))
      break unless rec[:names].empty? || rec[:innings].empty?
      sleep 1
    end
    s[:record] = rec
  end
  sv.merge(tour: tour[:code], round_code: meta[:round_code], round_name: meta[:round_name], list_kind: meta[:list_kind])
end

def run_tour(tour, workers)
  out = File.join(DATA, 'matches', "#{tour[:code]}.json")
  finished = tour[:status] == '종료'
  psts = tour_psts(tour)
  q = Queue.new
  psts.each { |p, m| q << [p, m] }
  results = []
  lock = Mutex.new
  ths = Array.new(workers) do
    Thread.new do
      loop do
        item = (q.pop(true) rescue nil) or break
        pst, meta = item
        tries = 0
        begin
          tries += 1
          m = collect_match(tour, pst, meta, finished)
          lock.synchronize { results << m }
        rescue => e
          if tries < 3
            sleep 2 * tries
            retry
          end
          log "  ! #{tour[:code]} pst=#{pst}: #{e.class} #{e.message}"
        end
      end
    end
  end
  ths.each(&:join)
  results.sort_by! { |m| m[:pst] }
  File.write(out, JSON.pretty_generate(results))
  results.size
end

tours = load_tours(opts)
tours = tours.select { |t| opts[:tours].include?(t[:code]) } if opts[:tours]
log "tours: #{tours.size}"
tours.each do |t|
  out = File.join(DATA, 'matches', "#{t[:code]}.json")
  # 끝난 투어는 건너뛰되, 저장 파일이 투어가 끝난 날 이전에 만들어졌으면(진행 중일 때 받은 것 → 결승 등 마지막 경기가 빠짐) 한 번 더 받는다
  ended_after = t[:end].to_s =~ /\A\d{4}-\d{2}-\d{2}\z/ ? Time.new(*t[:end].split('-').map(&:to_i)) + 24 * 3600 : nil
  if t[:status] == '종료' && File.exist?(out) && !opts[:tours] && (!ended_after || File.mtime(out) >= ended_after)
    log "skip #{t[:code]} #{t[:name]} (already collected)"
    next
  end
  log "#{t[:code]} #{t[:type]} #{t[:season]} [#{t[:seq]}] #{t[:name]}"
  n = nil
  3.times do |i|
    begin
      n = run_tour(t, opts[:workers]); break
    rescue => e
      log "  ! retry tour #{t[:code]} (#{e.message[0, 80]})"
      sleep 5 * (i + 1)
    end
  end
  next log("  !! failed tour #{t[:code]}") unless n
  log "  -> #{n} matches"
end
