# encoding: utf-8
require 'open3'
require 'digest'
require 'fileutils'
require 'json'

module PBA
  BASE  = 'https://pba.billiboard.co.kr'
  ROOT  = File.expand_path('..', __dir__)
  CACHE = File.join(ROOT, 'cache')
  UA    = 'Mozilla/5.0'
  FileUtils.mkdir_p(CACHE)

  # 사이트는 Referer 없이 부르면 "정상적인 접근이 아닙니다"를 돌려준다.
  # 스레드마다 쿠키 파일을 따로 쓴다.
  def self.get(path, params = {}, use_cache = true)
    q   = params.map { |k, v| "#{k}=#{v}" }.join('&')
    url = BASE + path + (q.empty? ? '' : "?#{q}")
    file = File.join(CACHE, Digest::MD5.hexdigest(url) + '.html')
    return File.read(file, encoding: 'utf-8') if use_cache && File.exist?(file) && File.size(file) > 0
    jar = File.join(CACHE, "cookies_#{Process.pid}_#{Thread.current.object_id}.txt")
    out = nil
    3.times do
      out, st = Open3.capture2('curl', '-sL', '--max-time', '60', '-c', jar, '-b', jar, '-A', UA,
                               '-e', BASE + '/mob/contest_new/admin/', url)
      out.force_encoding('utf-8')
      break if st.success? && !out.include?('정상적인 접근이 아닙니다') && !out.empty?
      sleep 1
    end
    raise "blocked response: #{url}" if out.include?('정상적인 접근이 아닙니다')
    File.write(file, out) if use_cache && !out.empty?
    sleep 0.05
    out
  end

  def self.text(html)
    html.gsub(/<!--.*?-->/m, '').gsub(/<script.*?<\/script>/m, '').gsub(/<[^>]*>/, ' ')
        .gsub('&nbsp;', ' ').gsub(/\s+/, ' ').strip
  end
end
