import type { Analysis, LayoutMode } from '../../types';

interface AnalysisPanelProps { analysis: Analysis; mode: LayoutMode; elementCount: number; zoneCount: number; }

export function AnalysisPanel({ analysis, mode, elementCount, zoneCount }: AnalysisPanelProps) {
  const issueCount = analysis.overlaps.length + analysis.bounds.length + analysis.channels.length + analysis.zoneIssues.length + analysis.accessibility.length;
  const split = analysis.accessibility.find((issue) => issue.kind === 'space-split');
  const routeBlocked = analysis.accessibility.find((issue) => issue.kind === 'route-blocked');
  const pathMessage = !analysis.path
    ? '需要入口和重点区域才能生成路径'
    : !analysis.path.reachable
      ? `${analysis.path.fromName} → ${analysis.path.toName} 被不可占用区域阻断，无可绕行通路`
      : `${analysis.path.fromName} → ${analysis.path.toName} · ${analysis.path.distance} m`;
  const headline = routeBlocked
    ? routeBlocked.message
    : split
      ? split.message
      : analysis.zoneIssues.length
        ? `有 ${analysis.zoneIssues.length} 处元素压到不可占用区域`
        : issueCount
          ? `${issueCount} 项需要关注`
          : zoneCount
            ? `禁区已纳入通行分析，当前布局通行顺畅`
            : '当前布局通行顺畅';
  return <section className={`analysis-panel ${issueCount ? 'has-warning' : ''} analysis-${mode}`}>
    <div className="analysis-title"><span className="analysis-pulse" /><div><span className="section-kicker">LIVE ANALYSIS</span><strong>{mode === 'path' ? '访问路径预览' : mode === 'inspect' ? '空间检查结果' : '布局概览'}</strong></div></div>
    <div className="analysis-metrics">
      <span><b>{elementCount}</b>元素</span>
      <span className={zoneCount ? 'metric-zone' : ''}><b>{zoneCount}</b>禁区</span>
      <span className={analysis.overlaps.length ? 'metric-warning' : ''}><b>{analysis.overlaps.length}</b>重叠</span>
      <span className={analysis.zoneIssues.length ? 'metric-warning' : ''}><b>{analysis.zoneIssues.length}</b>压禁区</span>
      <span className={analysis.bounds.length ? 'metric-warning' : ''}><b>{analysis.bounds.length}</b>越界</span>
      <span className={analysis.channels.length ? 'metric-warning' : ''}><b>{analysis.channels.length}</b>窄通道</span>
      <span className={analysis.accessibility.length ? 'metric-danger' : ''}><b>{analysis.accessibility.length}</b>阻断</span>
    </div>
    <div className="analysis-result"><strong>{headline}</strong><small>{pathMessage}</small></div>
  </section>;
}
