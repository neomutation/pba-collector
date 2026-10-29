#!/usr/bin/env ruby
# encoding: utf-8
# 이닝 기록이 비어 있는 세트를 다시 받아 채운다.
require_relative 'lib/parse'
fixed = 0; still = 0
Dir[File.join(PBA::ROOT, 'data', 'matches', '*.json')].sort.each do |f|
  ms = JSON.parse(File.read(f)); dirty = false
  ms.each do |m|
    m['sets'].each do |s|
      next unless s['gm']
      r = s['record']
      next if r && !r['names'].empty? && !r['innings'].empty?
      3.times do |i|
        rec = PBA::Parse.record(PBA.get('/mob/contest_new/code_behind/contest_result_set_record.asp', { PCGMCode: s['gm'] }, false))
        if !rec[:names].empty? && !rec[:innings].empty?
          s['record'] = JSON.parse(JSON.generate(rec)); dirty = true; fixed += 1; break
        end
        sleep 1
        still += 1 if i == 2
      end
    end
  end
  File.write(f, JSON.pretty_generate(ms)) if dirty
end
puts "repaired=#{fixed} unresolved=#{still}"
