# encoding: utf-8
require_relative 'model'

# 투어별 성적: 우승=1, 준우승=2, 4강 탈락=3, 그 외는 탈락한 라운드(128, 64, 32 ...)
module Results
  def self.tour_results(name, season = nil)
    rs = Model.history(name)
    rs = rs.select { |r| r[:season] == season } if season
    rs.group_by { |r| r[:tour] }.map do |tour, ms|
      ms = ms.sort_by { |r| [-r[:round_code], r[:pst]] }
      last = ms.last
      knock = ms.select { |r| r[:round].is_a?(Integer) && r[:round_code] <= 16 && !(r[:round_raw] =~ /예선/) }
      res =
        if last[:round_code] == 2 && last[:win] then 1
        elsif last[:round_code] == 2 then 2
        elsif last[:round_code] == 4 && !last[:win] then 3
        elsif last[:win] then nil # 다음 라운드에 올라간 채 대회 진행 중이면 아직 성적이 없다
        else last[:round_code]
        end
      { tour: tour, status: Model.tours[tour][:status], season: last[:season], seq: last[:seq], result: res, last: last[:round], won_last: last[:win], matches: ms.size }
    end.sort_by { |x| [x[:season], Model.seq_order(x[:seq])] }
  end
end
