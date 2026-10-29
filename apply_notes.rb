#!/usr/bin/env ruby
# encoding: utf-8
# plan.json 의 notes 를 Numbers 셀 주석으로 넣는다.   ruby apply_notes.rb <문서이름> <plan.json>
require 'json'
doc, path = ARGV
notes = JSON.parse(File.read(path)).flat_map { |p| (p['notes'] || []).map { |n| [p['sheet'], n['cell'], n['text']] } }
notes.each_with_index do |(sheet, cell, text), i|
  system('./comment_one.sh', doc, sheet, cell, text) or warn "주석 실패: #{sheet} #{cell}"
  puts "주석 #{i + 1}/#{notes.size}: #{sheet}!#{cell}"
end
