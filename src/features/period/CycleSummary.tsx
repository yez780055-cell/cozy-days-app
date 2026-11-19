import { CalendarDays, ChevronRight, Droplet, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { cycleStats, dateStatus, shortDate, type PeriodData } from './model';

export function CycleOverview({ data, today }: {data: PeriodData; today: string}) {
  const { latest, cycleDay } = cycleStats(data, today);
  if (!latest) return <section className="period-overview" aria-label="周期摘要">
    <div><p>当前周期</p><strong>暂无周期预测</strong></div>
  </section>;
  return <section className="period-overview" aria-label="周期摘要">
    <div>
      <p>当前周期 · {dateStatus(today, data, today) === 'actual' ? '已记录经期' : '非经期'}</p>
      <strong>第 <b>{cycleDay}</b> 天</strong>
    </div>
    <div><p>本次开始</p><strong><time dateTime={latest.start}>{shortDate(latest.start)}</time></strong></div>
  </section>;
}

export function CycleSummary({ data, today, onHistory, onSettings }: {
  data: PeriodData; today: string; onHistory: () => void; onSettings: () => void;
}) {
  const stats = cycleStats(data, today);
  const { latest, remaining, next, cycleDay, cycleLength } = stats;
  const countdown = remaining === undefined ? null : remaining === 0 ? '可能今天开始'
    : remaining > 0 ? `距离下次经期 ${remaining} 天` : `超过预测日期 ${-remaining} 天`;

  return <section className="period-summary" aria-label="周期统计">
    <header className="period-section-heading">
      <h2>当前周期</h2>
      <button type="button" className="icon-button" onClick={onSettings} aria-label="周期设置"><SlidersHorizontal size={20}/></button>
    </header>
    {latest && cycleDay !== undefined ? <>
      <div className="period-overview">
        <div><p>周期天数</p><strong>第 <b>{cycleDay}</b> 天</strong></div>
        <div><p>下次经期预测</p><strong>{countdown}</strong></div>
      </div>
      <progress className="period-progress" aria-label="当前周期进度" value={Math.min(cycleLength, cycleDay)} max={cycleLength}/>
      <p className="period-fine">
        预测 {next && shortDate(next)} · {stats.cycleSamples ? `基于 ${stats.cycleSamples} 个历史周期间隔` : '基于默认周期设置'}。
        仅预测下一次。{remaining !== undefined && remaining < 0 && '预测日期已过，请补充经期记录。'}
        <br/>仅供记录参考，不用于避孕或诊断。
      </p>
    </> : <p className="period-fine">暂无周期预测</p>}
    <div className="period-settings-group">
      <button type="button" className="period-settings-row period-history-link" onClick={onHistory}>
        <CalendarDays size={20}/>
        <span>历史经期记录{latest && <small>本次经期 <b>{shortDate(latest.start)}<br/>{latest.end ? shortDate(latest.end) : '进行中'}</b></small>}</span>
        <ChevronRight size={18} aria-hidden="true"/>
      </button>
      <div className="period-averages">
        <button type="button" className="period-settings-row" onClick={onSettings}
          aria-label={`${stats.cycleSamples ? '平均周期长度' : '设定周期长度'}：${cycleLength} 天，打开周期设置`}>
          <RefreshCw size={20}/><span>{stats.cycleSamples ? '平均周期长度' : '设定周期长度'}<small>{cycleLength} 天</small></span><ChevronRight size={18} aria-hidden="true"/>
        </button>
        <button type="button" className="period-settings-row" onClick={onSettings}
          aria-label={`${stats.periodSamples ? '平均经期时长' : '设定经期时长'}：${stats.periodLength} 天，打开周期设置`}>
          <Droplet size={20}/><span>{stats.periodSamples ? '平均经期时长' : '设定经期时长'}<small>{stats.periodLength} 天</small></span><ChevronRight size={18} aria-hidden="true"/>
        </button>
      </div>
    </div>
  </section>;
}
