import { countAnalysisIssues } from '../../domain';
import type { Analysis, LayoutMode } from '../../types';

interface AnalysisPanelProps { analysis: Analysis; mode: LayoutMode; elementCount: number; obstacleCount: number; }

export function AnalysisPanel({ analysis, mode, elementCount, obstacleCount }: AnalysisPanelProps) {
  const issueCount = countAnalysisIssues(analysis);
  const pathMessage = !analysis.path
    ? '需要入口和重点区域才能生成路径'
    : analysis.path.status === 'blocked'
      ? `${analysis.path.fromName} → ${analysis.path.toName} · 路线被不可占用区域切断，无法绕行`
      : `${analysis.path.fromName} → ${analysis.path.toName} · ${analysis.path.distance} m`;
  const partitionMessage = analysis.partition
    ? `不可占用区域把场地切成 ${analysis.partition.regions} 块，约 ${analysis.partition.strandedArea.toFixed(1)} m² 无法到达`
    : '';
  const headline = analysis.partition
    ? '可通行空间被隔断，请先调整不可占用区域'
    : analysis.path?.status === 'blocked'
      ? '访问路线被阻断'
      : issueCount ? `${issueCount} 项需要关注` : '当前布局通行顺畅';
  return <section className={`analysis-panel analysis-${mode} ${analysis.partition || analysis.path?.status === 'blocked' ? 'is-blocked' : ''}`}>
    <div className="analysis-title"><span className="analysis-pulse" /><div><span className="section-kicker">LIVE ANALYSIS</span><strong>{mode === 'path' ? '访问路径预览' : mode === 'inspect' ? '空间检查结果' : '布局概览'}</strong></div></div>
    <div className="analysis-metrics"><span><b>{elementCount}</b>元素</span><span><b>{obstacleCount}</b>禁用区</span><span className={analysis.overlaps.length ? 'metric-warning' : ''}><b>{analysis.overlaps.length}</b>重叠</span><span className={analysis.bounds.length ? 'metric-warning' : ''}><b>{analysis.bounds.length}</b>越界</span><span className={analysis.channels.length ? 'metric-warning' : ''}><b>{analysis.channels.length}</b>窄通道</span><span className={analysis.obstacleHits.length ? 'metric-warning' : ''}><b>{analysis.obstacleHits.length}</b>占压</span>{analysis.partition ? <span className="metric-warning"><b>!</b>隔断</span> : null}</div>
    <div className="analysis-result"><strong>{headline}</strong><small>{analysis.partition ? partitionMessage : pathMessage}</small></div>
  </section>;
}
