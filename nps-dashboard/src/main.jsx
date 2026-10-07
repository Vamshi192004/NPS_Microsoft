import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const COLORS = { promoter: '#2f7d63', passive: '#c58b22', detractor: '#d6403a' }
const MIN_GROUP_RESPONSES = 50
const MIN_MONTHLY_RESPONSES = 50
const MIN_STRATUM_RESPONSES = 50
const DIMENSIONS = [
  { label: 'Customer segment', field: 'Tenant_CustomerSegmentGroup' },
  { label: 'Country', field: 'Tenant_Country' },
  { label: 'Industry', field: 'Tenant_MSSalesVerticalName' },
  { label: 'User tenure', field: 'NewUser_Period' },
  { label: 'Client country', field: 'PipelineInfo_ClientCountry' },
]
const ACTIVITY_FIELDS = [
  { field: 'ActiveEvents', label: 'Total activity' },
  { field: 'DesktopEvents', label: 'Desktop activity' },
  { field: 'MobileEvents', label: 'Mobile activity' },
  { field: 'WebEvents', label: 'Web activity' },
  { field: 'ReadEvents', label: 'Reading' },
  { field: 'CollabEvents', label: 'Collaboration' },
  { field: 'ChatCreateEvents', label: 'Chat creation' },
  { field: 'ChannelCreateEvents', label: 'Channel creation' },
  { field: 'FileCreateEvents', label: 'File creation' },
  { field: 'ActiveChannels', label: 'Active channels' },
  { field: 'ActiveTeams', label: 'Active teams' },
]
const FIELD_LABELS = {
  Feedback_DateTime: 'Feedback date', ResponseType: 'Feedback type', Feedback_Rating: 'Rating',
  NewUser_Period: 'User tenure', PipelineInfo_ClientCountry: 'Client country',
  Tenant_CustomerSegmentGroup: 'Customer segment', Tenant_Country: 'Customer country',
  Tenant_MSSalesVerticalName: 'Industry', R7_DeviceInfo_CpuCores: 'CPU cores',
  R7_DeviceInfo_CpuSpeed: 'CPU speed', ActiveEvents: 'Total activity', DesktopEvents: 'Desktop activity',
  MobileEvents: 'Mobile activity', WebEvents: 'Web activity', ReadEvents: 'Reading',
  CollabEvents: 'Collaboration', ChatCreateEvents: 'Chat creation',
  ChannelCreateEvents: 'Channel creation', FileCreateEvents: 'File creation',
  ActiveChannels: 'Active channels', ActiveTeams: 'Active teams',
}
const PANEL_TIPS = {
  'Monthly NPS trend': 'Each point shows NPS for a feedback month, and the line connects the scores over time. The dashed line marks zero; vertical whiskers show an approximate 95% range. Counts appear below each month, and months with fewer than 50 responses are marked low volume.',
  'Response mix by NPS category': 'Shows the number and share of Promoters (ratings 9–10), Passives (7–8), and Detractors (0–6). The NPS in the center is Promoter share minus Detractor share.',
  'NPS for new and existing users': 'Compares NPS across user-tenure groups. Each score uses responses in that group; counts and approximate 95% ranges help you judge how much confidence to place in the comparison.',
  'NPS by client country': 'Compares NPS across client-country groups. Groups with fewer than 50 responses are hidden. Differences describe the observed responses and do not show what caused a rating.',
  'Groups to review': 'Lists up to three customer groups with lower NPS than the selected comparison group. Select a row to filter Overview to that group. Small samples are flagged.',
  'Activity patterns by feedback type': 'Bars compare average activity per response for Promoters and Detractors during the seven days before feedback. A difference is an association and does not prove that activity caused a rating.',
  'Activity gap within customer groups': 'Breaks the largest overall activity difference down by the selected customer dimension. The table reports Detractor average minus Promoter average; each group needs at least 50 responses of each type.',
  'Highest detractor concentration': 'Ranks customer groups using a risk score: 55% detractor share, 20% share of selected responses, and 25% normalized NPS shortfall. Only groups with at least 50 responses appear. This is a prioritization score, not a probability.',
  'Detractor share in selected group': 'The percentage of responses in the current filter selection classified as Detractors (ratings 0–6). The count is shown above the percentage.',
  'Suggested research actions': 'Follow-up ideas based on the patterns in this dashboard. The data has no written comments, so customer conversations are needed to learn the reasons behind ratings.',
  'NPS opportunity by customer group': 'Ranks groups below the current comparison NPS. Priority score equals the NPS shortfall multiplied by the group’s share of selected responses. Groups with at least 50 responses are ordered first; smaller groups may appear for context.',
}

function parseCsv(text) {
  const records = []
  let row = [], value = '', quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(value); value = '' }
    else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(value); value = ''
      if (row.some((cell) => cell !== '')) records.push(row)
      row = []
    } else value += char
  }
  if (value || row.length) { row.push(value); records.push(row) }
  const headers = (records.shift() || []).map((header, index) => index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim())
  return records.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

function nps(rows) {
  if (!rows.length) return 0
  const promoters = rows.filter((row) => row.ResponseType === 'Promoter').length
  const detractors = rows.filter((row) => row.ResponseType === 'Detractor').length
  return ((promoters - detractors) / rows.length) * 100
}

function npsInterval(rows) {
  if (!rows.length) return { lower: -100, upper: 100 }
  const promoters = rows.filter((row) => row.ResponseType === 'Promoter').length
  const detractors = rows.filter((row) => row.ResponseType === 'Detractor').length
  const mean = (promoters - detractors) / rows.length
  const variance = Math.max((promoters + detractors) / rows.length - mean ** 2, 0)
  const margin = 1.96 * 100 * Math.sqrt(variance / rows.length)
  const value = mean * 100
  return { lower: Math.max(-100, value - margin), upper: Math.min(100, value + margin) }
}

function mean(rows, field) {
  if (!rows.length) return 0
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0) / rows.length
}

function rankDimension(rows, field) {
  const groups = new Map()
  rows.forEach((row) => {
    const value = row[field]?.trim() || 'Unknown'
    if (!groups.has(value)) groups.set(value, [])
    groups.get(value).push(row)
  })
  return [...groups.entries()].map(([value, groupRows]) => {
    const detractorCount = groupRows.filter((row) => row.ResponseType === 'Detractor').length
    return { value, count: groupRows.length, nps: nps(groupRows), ...npsInterval(groupRows), detractorRate: detractorCount / groupRows.length }
  }).sort((a, b) => b.nps - a.nps)
}

const integer = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
const signed = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
const percent = (value, total) => total ? `${((value / total) * 100).toFixed(1)}%` : '0.0%'
const monthName = (key) => {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function PanelTitle({ eyebrow, title, detail, fields }) {
  const fieldLabels = fields?.map((field) => FIELD_LABELS[field] || field.replaceAll('_', ' '))
  const tip = PANEL_TIPS[title] || 'This panel summarizes the currently selected responses. Check the response counts and filter selection when comparing groups.'
  return <div className="panel-title"><div><span className="eyebrow">{eyebrow}</span><div className="panel-heading"><h2>{title}</h2><span className="tooltip-trigger" tabIndex={0} role="note" aria-label={`About ${title}`}><span aria-hidden="true">?</span><span className="tooltip-content" role="tooltip">{tip}</span></span></div>{fieldLabels && <small className="panel-fields">Based on: {fieldLabels.join(' · ')}</small>}</div>{detail && <span className="panel-detail">{detail}</span>}</div>
}

function MonthlyChart({ data, insight, showCount = true }) {
  if (!data.length) return <div className="empty-state">No dated responses for this selection.</div>
  const points = data.map((item, index) => ({
    ...item,
    x: 48 + ((index + 0.5) / data.length) * 552,
    y: 40 + ((100 - item.value) / 200) * 150,
    lowY: 40 + ((100 - item.lower) / 200) * 150,
    highY: 40 + ((100 - item.upper) / 200) * 150,
  }))
  return <>
    <p className="chart-insight">{insight}</p>
    <div className="monthly-chart">
      <svg className="monthly-line-plot" viewBox="0 0 620 250" role="img" aria-label="Monthly NPS trend line chart. Horizontal axis: feedback month. Vertical axis: NPS from minus 100 to plus 100. Vertical whiskers show approximate 95 percent ranges.">
        <title>Monthly NPS trend</title>
        <text x="324" y="18" textAnchor="middle" className="monthly-chart-title">Monthly NPS trend</text>
        {[40, 115, 190].map((y, index) => <g key={y}><line x1="48" x2="600" y1={y} y2={y} className={index === 1 ? 'monthly-grid-zero' : 'monthly-grid'} /><text x="42" y={y + 4} textAnchor="end" className="monthly-axis-label">{index === 0 ? '+100' : index === 1 ? '0' : '−100'}</text></g>)}
        <text x="14" y="115" textAnchor="middle" className="monthly-axis-title" transform="rotate(-90 14 115)">NPS</text>
        <text x="324" y="238" textAnchor="middle" className="monthly-axis-title">Feedback month</text>
        {points.length > 1 && <polyline points={points.map((item) => `${item.x},${item.y}`).join(' ')} className="monthly-line" />}
        {points.map((item) => <g key={item.month} className="monthly-point">
          <line x1={item.x} x2={item.x} y1={item.lowY} y2={item.highY} className="monthly-range" />
          <line x1={item.x - 5} x2={item.x + 5} y1={item.lowY} y2={item.lowY} className="monthly-range-cap" />
          <line x1={item.x - 5} x2={item.x + 5} y1={item.highY} y2={item.highY} className="monthly-range-cap" />
          <circle cx={item.x} cy={item.y} r="5" className={item.value < 0 ? 'monthly-dot is-negative' : 'monthly-dot'}><title>{`${monthName(item.month)}: NPS ${signed(item.value)}; approximate 95% range ${signed(item.lower)} to ${signed(item.upper)}; ${integer(item.count)} responses`}</title></circle>
        </g>)}
      </svg>
      <div className="monthly-data-row" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((item) => <div className="monthly-data-point" key={item.month}>
          <b>{monthName(item.month)}</b><strong className={item.value < 0 ? 'value-negative' : ''}>{signed(item.value)}</strong>
          {showCount && <small>{integer(item.count)} responses{item.count < MIN_MONTHLY_RESPONSES && <em className="small-sample">Low volume</em>}</small>}
        </div>)}
      </div>
    </div>
    <div className="chart-legend"><span><i className="legend-positive" />Positive NPS</span><span><i className="legend-negative" />Negative NPS</span><span><i className="legend-range" />Approx. 95% range</span></div>
  </>
}

function ResponseMix({ counts, total, insight }) {
  const promoterEnd = total ? (counts.promoters / total) * 100 : 0
  const passiveEnd = total ? ((counts.promoters + counts.passives) / total) * 100 : 0
  const donut = total
    ? `conic-gradient(${COLORS.promoter} 0 ${promoterEnd}%, ${COLORS.passive} ${promoterEnd}% ${passiveEnd}%, ${COLORS.detractor} ${passiveEnd}% 100%)`
    : '#e8ecea'
  return <>
    <p className="chart-insight">{insight}</p>
    <div className="mix-chart">
      <div className="mix-donut" style={{ background: donut }}><div><strong>{signed(npsFromCounts(counts, total))}</strong><span>NPS</span></div></div>
      <div className="mix-legend">
        {[
          ['Promoters', counts.promoters, COLORS.promoter],
          ['Passives', counts.passives, COLORS.passive],
          ['Detractors', counts.detractors, COLORS.detractor],
        ].map(([label, value, color]) => <div className="mix-legend-row" key={label}><i style={{ background: color }} /><span>{label}</span><b>{integer(value)} <small>{percent(value, total)}</small></b></div>)}
      </div>
    </div>
    <p className="chart-footnote">Promoters rated 9–10 · Passives 7–8 · Detractors 0–6</p>
  </>
}

function npsFromCounts(counts, total) {
  return total ? ((counts.promoters - counts.detractors) / total) * 100 : 0
}

function GroupList({ groups, overall, onSelect, limit, benchmarkLabel = 'all responses' }) {
  const visible = limit ? groups.slice(0, limit) : groups
  if (!visible.length) return <div className="empty-state">No groups in this selection have a lower NPS than the comparison group.</div>
  return <div className="group-list">
    {visible.map((group, index) => <button className="group-row" key={`${group.dimension}-${group.value}`} onClick={() => onSelect(group)}>
      <span className="group-rank">{String(index + 1).padStart(2, '0')}</span>
      <span className="group-name"><b>{group.value}{group.count < MIN_GROUP_RESPONSES && <em className="small-sample">Small sample</em>}</b><small>{group.dimension} · {integer(group.count)} responses</small></span>
      <span className="group-cell"><small>NPS</small><b className="nps-value">{signed(group.nps)}</b></span>
      <span className="group-cell group-gap"><small>Vs. {benchmarkLabel}</small><b>{signed(group.nps - overall)}</b></span>
      <span className="group-cell group-share"><small>Share of responses</small><b>{percent(group.count, group.total)}</b></span>
      <span className="group-open" aria-hidden="true">↗</span>
    </button>)}
  </div>
}

function ActivityChart({ items, insight }) {
  return <>
    <p className="chart-insight">{insight}</p>
    <div className="activity-chart">
      <div className="activity-legend"><span><i className="legend-promoter" />Promoters</span><span><i className="legend-detractor" />Detractors</span></div>
      {items.map((item) => {
        const max = Math.max(item.promoterMean, item.detractorMean, 1)
        return <div className="activity-row" key={item.label}>
          <b className="activity-name">{item.label}</b>
          <div className="activity-bars"><span className="activity-bar promoter-bar" style={{ width: `${(item.promoterMean / max) * 100}%` }} /><span className="activity-bar detractor-bar" style={{ width: `${(item.detractorMean / max) * 100}%` }} /></div>
          <div className="activity-values"><span>{integer(item.promoterMean)}</span><span>{integer(item.detractorMean)}</span></div>
        </div>
      })}
    </div>
    <p className="chart-footnote">Average events in the seven days before feedback. A difference does not show what caused a rating.</p>
  </>
}

function PatternChart({ items, insight }) {
  if (!items.length) return <div className="empty-state">No groups are available for this selection.</div>
  const max = Math.max(...items.map((item) => Math.abs(item.nps)), 1)
  return <>
    <p className="chart-insight">{insight}</p>
    <div className="pattern-chart">
      {items.map((item) => <div className="pattern-row" key={item.value}>
        <div className="pattern-label"><b>{item.value}</b><small>{integer(item.count)} responses · {percent(item.detractorRate * item.count, item.count)} detractors</small></div>
        <div className="pattern-track"><span className={item.nps < 0 ? 'pattern-bar negative' : 'pattern-bar'} style={{ width: `${Math.max((Math.abs(item.nps) / max) * 100, 3)}%` }} /></div>
        <span className="pattern-score"><strong className={item.nps < 0 ? 'text-negative' : 'text-positive'}>{signed(item.nps)}</strong><small>Approx. 95%: {signed(item.lower)} to {signed(item.upper)}</small></span>
      </div>)}
    </div>
  </>
}

function DriverCards({ items }) {
  return <div className="driver-cards">
    {items.slice(0, 3).map((item) => {
      const leader = item.promoterMean >= item.detractorMean ? 'Promoters' : 'Detractors'
      const gap = Math.abs(item.promoterMean - item.detractorMean)
      return <article className="driver-card" key={item.field}>
        <span className="eyebrow">SIGNAL {String(items.indexOf(item) + 1).padStart(2, '0')}</span>
        <h3>{item.label}</h3>
        <strong>{integer(gap)} event gap</strong>
        <p>{leader} had the higher average. This is a pattern to investigate, not proof of a cause.</p>
      </article>
    })}
  </div>
}

function StratifiedActivityTable({ items, metricLabel, minimum }) {
  if (!items.length) return <div className="empty-state">No groups have at least {minimum} Promoters and {minimum} Detractors in this selection.</div>
  return <div className="stratified-table-wrap"><div className="stratified-table">
    <div className="stratified-table-head"><span>Customer group</span><span>Promoters</span><span>{metricLabel} average</span><span>Detractors</span><span>{metricLabel} average</span><span>Detractor minus Promoter</span></div>
    {items.map((item) => <div className="stratified-table-row" key={item.value}>
      <b>{item.value}</b><span>{integer(item.promoterCount)}</span><span>{item.promoterMean.toFixed(1)}</span><span>{integer(item.detractorCount)}</span><span>{item.detractorMean.toFixed(1)}</span><strong className={item.difference > 0 ? 'text-negative' : 'text-positive'}>{signed(item.difference)}</strong>
    </div>)}
  </div></div>
}

function AnalysisTable({ items, type = 'segments', baselineLabel = 'all responses' }) {
  if (!items.length) return <div className="empty-state">No groups are available for this analysis.</div>
  return <div className="analysis-table">
    <div className="analysis-table-head"><span>Rank</span><span>Customer group</span><span>Responses</span><span>NPS</span><span>{type === 'pain' ? 'Detractor share' : `NPS difference vs ${baselineLabel}`}</span><span>{type === 'pain' ? 'Risk score' : 'Priority score'}</span></div>
    {items.map((item, index) => <div className="analysis-table-row" key={`${item.dimension}-${item.value}`}>
      <span className="table-rank">{String(index + 1).padStart(2, '0')}</span>
      <span><b>{item.value}</b><small>{item.dimension}{item.count < MIN_GROUP_RESPONSES && <em className="small-sample">Small sample</em>}</small></span>
      <span>{integer(item.count)} <small>{percent(item.count, item.total)}</small></span>
      <span className="nps-with-ci"><strong className={item.nps < 0 ? 'text-negative' : ''}>{signed(item.nps)}</strong><small>Approx. 95%: {signed(item.lower)} to {signed(item.upper)}</small></span>
      <span className={type === 'pain' ? 'text-negative' : 'text-negative'}>{type === 'pain' ? percent(item.detractorCount, item.count) : signed(item.nps - item.overall)}</span>
      <span>{item.score.toFixed(2)}</span>
    </div>)}
  </div>
}

function App() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState('overview')
  const [dimensionLabel, setDimensionLabel] = useState('All customers')
  const [selectedValue, setSelectedValue] = useState('All')
  const [stratificationLabel, setStratificationLabel] = useState('User tenure')

  useEffect(() => {
    fetch('/Teams_NPS_Cleaned_Imputed1.csv')
      .then((response) => { if (!response.ok) throw new Error(`Dataset request failed (${response.status})`); return response.text() })
      .then((text) => setRows(parseCsv(text)))
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false))
  }, [])

  const dimension = DIMENSIONS.find((item) => item.label === dimensionLabel)
  const stratificationOptions = dimension && selectedValue !== 'All'
    ? DIMENSIONS.filter((item) => item.field !== dimension.field)
    : DIMENSIONS
  const stratificationDimension = stratificationOptions.find((item) => item.label === stratificationLabel) || stratificationOptions[0]
  const cohortValues = useMemo(() => dimension
    ? [...new Set(rows.map((row) => row[dimension.field] || 'Unknown'))].sort((a, b) => a.localeCompare(b))
    : [], [dimension, rows])
  const filteredRows = useMemo(() => {
    if (!dimension || selectedValue === 'All') return rows
    return rows.filter((row) => (row[dimension.field] || 'Unknown') === selectedValue)
  }, [dimension, rows, selectedValue])
  const promoterRows = filteredRows.filter((row) => row.ResponseType === 'Promoter')
  const passiveRows = filteredRows.filter((row) => row.ResponseType === 'Passive')
  const detractorRows = filteredRows.filter((row) => row.ResponseType === 'Detractor')
  const counts = { promoters: promoterRows.length, passives: passiveRows.length, detractors: detractorRows.length }
  const overallNps = nps(rows)
  const currentNps = nps(filteredRows)
  const currentNpsInterval = npsInterval(filteredRows)
  const scoreDifference = currentNps - overallNps
  const responseShare = rows.length ? filteredRows.length / rows.length : 0
  const focusLabel = dimensionLabel === 'All customers' ? 'All customers' : selectedValue === 'All' ? `All ${dimensionLabel.toLowerCase()} groups` : selectedValue
  const comparisonDimensions = dimension && selectedValue !== 'All'
    ? DIMENSIONS.filter((item) => item.field !== dimension.field)
    : DIMENSIONS
  const comparisonScope = dimension && selectedValue !== 'All'
    ? `${selectedValue} (${dimensionLabel})`
    : 'all responses'

  const monthly = useMemo(() => {
    const groups = new Map()
    for (const row of filteredRows) {
      const month = row.Feedback_DateTime?.slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(month || '')) continue
      if (!groups.has(month)) groups.set(month, [])
      groups.get(month).push(row)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, monthRows]) => ({
      month,
      value: nps(monthRows),
      count: monthRows.length,
      ...npsInterval(monthRows),
    }))
  }, [filteredRows])
  const monthlyRange = monthly.length
    ? monthly.length === 1 ? monthName(monthly[0].month) : `${monthName(monthly[0].month)} – ${monthName(monthly.at(-1).month)}`
    : 'No dated responses'
  const excludedDateCount = filteredRows.length - monthly.reduce((sum, item) => sum + item.count, 0)
  const tenurePattern = useMemo(() => rankDimension(filteredRows, 'NewUser_Period'), [filteredRows])
  const clientCountryPattern = useMemo(() => rankDimension(filteredRows, 'PipelineInfo_ClientCountry').filter((item) => item.count >= 50).sort((a, b) => a.nps - b.nps).slice(0, 6), [filteredRows])
  const tenureInsight = tenurePattern.length > 1
    ? `${tenurePattern[0].value} users have a ${signed(tenurePattern[0].nps - tenurePattern[1].nps)} point higher NPS than ${tenurePattern[1].value} users. This result describes groups, not individual users.`
    : 'Both new and existing users are needed to compare tenure patterns.'
  const clientCountryInsight = clientCountryPattern.length
    ? `${clientCountryPattern[0].value} has the lowest NPS among client-country groups with at least 50 responses.`
    : 'No client-country group has enough responses for a stable comparison.'

  const behavior = useMemo(() => ACTIVITY_FIELDS.map(({ field, label }) => ({
    field,
    label,
    promoterMean: mean(promoterRows, field),
    detractorMean: mean(detractorRows, field),
  })), [promoterRows, detractorRows])
  const cpuCorePattern = useMemo(() => {
    const bandRows = filteredRows.map((row) => {
      const rawCores = row.R7_DeviceInfo_CpuCores?.trim()
      const cores = Number(rawCores)
      const band = !rawCores || !Number.isFinite(cores) ? 'Unknown' : cores <= 4 ? '4 or fewer cores' : cores <= 8 ? '5–8 cores' : '9 or more cores'
      return { ...row, _cpuCoreBand: band }
    })
    return rankDimension(bandRows, '_cpuCoreBand').filter((item) => item.count >= MIN_GROUP_RESPONSES)
  }, [filteredRows])
  const cpuSpeedPattern = useMemo(() => {
    const bandRows = filteredRows.map((row) => {
      const rawSpeed = row.R7_DeviceInfo_CpuSpeed?.trim()
      const speed = Number(rawSpeed)
      const band = !rawSpeed || !Number.isFinite(speed) ? 'Unknown' : speed < 2000 ? 'Under 2000' : speed < 2500 ? '2000–2499' : '2500 or higher'
      return { ...row, _cpuSpeedBand: band }
    })
    return rankDimension(bandRows, '_cpuSpeedBand').filter((item) => item.count >= MIN_GROUP_RESPONSES)
  }, [filteredRows])
  const allBehaviorMeans = behavior.map((item) => ({
    ...item,
    difference: item.detractorMean - item.promoterMean,
  }))
  const largestActivityDifference = [...allBehaviorMeans].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))[0]
  const stratifiedActivity = useMemo(() => {
    if (!stratificationDimension || !largestActivityDifference) return []
    const groups = new Map()
    for (const row of filteredRows) {
      const value = row[stratificationDimension.field]?.trim() || 'Unknown'
      if (!groups.has(value)) groups.set(value, [])
      groups.get(value).push(row)
    }
    return [...groups.entries()].map(([value, groupRows]) => {
      const promoters = groupRows.filter((row) => row.ResponseType === 'Promoter')
      const detractors = groupRows.filter((row) => row.ResponseType === 'Detractor')
      const promoterMean = mean(promoters, largestActivityDifference.field)
      const detractorMean = mean(detractors, largestActivityDifference.field)
      return { value, promoterCount: promoters.length, detractorCount: detractors.length, promoterMean, detractorMean, difference: detractorMean - promoterMean }
    }).filter((item) => item.promoterCount >= MIN_STRATUM_RESPONSES && item.detractorCount >= MIN_STRATUM_RESPONSES).sort((a, b) => a.value.localeCompare(b.value))
  }, [filteredRows, stratificationDimension, largestActivityDifference])
  const activityInsight = !promoterRows.length || !detractorRows.length
    ? 'This comparison needs both Promoters and Detractors.'
    : !largestActivityDifference || Math.abs(largestActivityDifference.difference) < 0.005
      ? 'Promoters and Detractors have similar average activity across these measures.'
      : `${largestActivityDifference.difference > 0 ? 'Detractors' : 'Promoters'} had more ${largestActivityDifference.label.toLowerCase()} on average. This does not show why.`

  const groupRanking = useMemo(() => comparisonDimensions.flatMap(({ label, field }) => {
    const groups = new Map()
    for (const row of filteredRows) {
      const value = row[field]?.trim() || 'Unknown'
      if (!groups.has(value)) groups.set(value, [])
      groups.get(value).push(row)
    }
    return [...groups.entries()].map(([value, groupRows]) => {
      const groupScore = nps(groupRows)
      const reach = filteredRows.length ? groupRows.length / filteredRows.length : 0
      const belowOverall = Math.max(currentNps - groupScore, 0)
      return { dimension: label, value, count: groupRows.length, total: filteredRows.length, nps: groupScore, ...npsInterval(groupRows), reach, score: belowOverall * reach, eligible: groupRows.length >= MIN_GROUP_RESPONSES }
    }).filter((item) => item.nps < currentNps)
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score), [comparisonDimensions, filteredRows, currentNps])
  const painPointRanking = useMemo(() => comparisonDimensions.flatMap(({ label, field }) => {
    const groups = new Map()
    for (const row of filteredRows) {
      const value = row[field]?.trim() || 'Unknown'
      if (!groups.has(value)) groups.set(value, [])
      groups.get(value).push(row)
    }
    return [...groups.entries()].map(([value, groupRows]) => {
      const detractorCount = groupRows.filter((row) => row.ResponseType === 'Detractor').length
      const groupScore = nps(groupRows)
      const reach = filteredRows.length ? groupRows.length / filteredRows.length : 0
      const detractorRate = detractorCount / groupRows.length
      const downside = Math.max(currentNps - groupScore, 0) / 100
      return { dimension: label, value, count: groupRows.length, total: filteredRows.length, nps: groupScore, ...npsInterval(groupRows), detractorCount, score: detractorRate * 0.55 + reach * 0.2 + downside * 0.25 }
    })
  }).filter((item) => item.count >= MIN_GROUP_RESPONSES).sort((a, b) => b.score - a.score), [comparisonDimensions, filteredRows, currentNps])
  const priorityGroup = groupRanking.find((group) => group.eligible)
  const priorityRecommendation = priorityGroup
    ? `Review ${priorityGroup.value} first. It has at least ${MIN_GROUP_RESPONSES} responses and a below-average NPS.`
    : `No below-average group has ${MIN_GROUP_RESPONSES} responses yet.`

  const trendInsight = monthly.length > 1
    ? (() => {
      const last = monthly.at(-1)
      const previous = monthly.at(-2)
      const delta = last.value - previous.value
      const change = delta === 0 ? 'did not change' : delta > 0 ? `rose ${signed(delta)}` : `fell ${signed(delta)}`
      const lowVolume = last.count < MIN_MONTHLY_RESPONSES || previous.count < MIN_MONTHLY_RESPONSES
        ? ` One or both months has fewer than ${MIN_MONTHLY_RESPONSES} responses, so treat the change cautiously.`
        : ''
      return `NPS ${change} from ${monthName(previous.month)} to ${monthName(last.month)}. Responses: ${integer(previous.count)} in the earlier month and ${integer(last.count)} in the latest month.${lowVolume}`
    })()
    : 'Choose a group with responses in at least two months to see its trend.'
  const mixInsight = filteredRows.length
    ? `${percent(counts.promoters, filteredRows.length)} of responses were Promoters; ${percent(counts.detractors, filteredRows.length)} were Detractors.`
    : 'No responses are available for this selection.'
  const dateStart = monthly[0]?.month
  const dateEnd = monthly.at(-1)?.month
  const datePeriod = dateStart && dateEnd
    ? dateStart === dateEnd ? monthName(dateStart) : `${monthName(dateStart)} – ${monthName(dateEnd)}`
    : 'No date range available'

  function selectDimension(event) {
    setDimensionLabel(event.target.value)
    setSelectedValue('All')
  }

  function selectGroup(group) {
    setDimensionLabel(group.dimension)
    setSelectedValue(group.value)
    setPage('overview')
  }

  const pageCopy = {
    overview: ['NPS OVERVIEW', 'Customer feedback at a glance', 'Track NPS and see which customer groups may need attention.'],
    drivers: ['ACTIVITY PATTERNS', 'Activity by feedback type', 'Compare recent activity for Promoters and Detractors. Use the results to guide further analysis.'],
    pain: ['DETRACTOR CONCENTRATION', 'Customer groups with more Detractors', 'See which groups have more Detractors and more responses.'],
    segments: ['GROUP PRIORITIES', 'Customer groups with the lowest NPS', 'Compare each group’s NPS and share of responses to decide where to look first.'],
  }[page]

  const summary = loading
    ? { title: 'Loading feedback data', detail: 'Please wait…' }
    : loadError
      ? { title: 'Feedback data unavailable', detail: loadError }
      : { title: `${integer(rows.length)} customer responses`, detail: datePeriod }

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setPage('overview') }}>
          <span className="brand-symbol">C</span>
          <span><b>Customer Pulse</b><small>FEEDBACK INTELLIGENCE</small></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          {[['overview', 'Overview'], ['drivers', 'Drivers'], ['pain', 'Risk signals'], ['segments', 'Segments']].map(([key, label]) => <button key={key} className={page === key ? 'nav-active' : ''} aria-current={page === key ? 'page' : undefined} onClick={() => setPage(key)}>{label}</button>)}
        </nav>
        <div className="dataset-summary"><span className={`data-indicator ${loadError ? 'indicator-error' : ''}`} /> <span><b>{summary.title}</b><small>{summary.detail}</small></span></div>
      </header>

      <section className="page-intro">
        <div><p className="eyebrow">NPS PERFORMANCE · {pageCopy[0]}</p><h1>{pageCopy[1]}</h1><p>{pageCopy[2]}</p></div>
        <div className="period-chip"><span className="period-dot" /> Feedback period <b>{datePeriod}</b></div>
      </section>

      <section className="filter-bar" aria-label="Filter customer responses">
        <div className="filter-heading"><span className="filter-icon">⌕</span><div><b>Filter responses</b><small>Charts and group rankings update with your filters.</small></div></div>
        <label><span>Break down by</span><select value={dimensionLabel} onChange={selectDimension}><option>All customers</option>{DIMENSIONS.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
        {dimension && <label><span>{dimensionLabel}</span><select value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)}><option value="All">All {dimensionLabel.toLowerCase()} groups</option>{cohortValues.map((value) => <option key={value}>{value}</option>)}</select></label>}
      </section>

      {loading ? <section className="loading-card">Loading the feedback data…</section> : loadError ? <section className="error-card"><h2>We couldn’t load the data</h2><p>{loadError}. Check that Teams_NPS_Cleaned_Imputed1.csv is in the app’s public folder, then reload this page.</p></section> : <>
        <section className="kpi-grid" aria-label="Selected group summary">
          <article className="kpi-card kpi-primary"><span>NPS for selected group</span><strong>{signed(currentNps)}</strong><small>{focusLabel} · Estimated 95% range: {signed(currentNpsInterval.lower)} to {signed(currentNpsInterval.upper)}</small></article>
          <article className="kpi-card"><span>Responses</span><strong>{integer(filteredRows.length)}</strong><small>{percent(filteredRows.length, rows.length)} of all responses</small></article>
          <article className="kpi-card"><span>Detractor share</span><strong>{percent(counts.detractors, filteredRows.length)}</strong><small>{integer(counts.detractors)} Detractor responses</small></article>
          <article className="kpi-card"><span>NPS difference from all responses</span><strong className={scoreDifference < 0 ? 'text-negative' : 'text-positive'}>{signed(scoreDifference)}</strong><small>All responses: {signed(overallNps)}</small></article>
        </section>

        {page === 'overview' ? <>
          <div className="overview-grid">
            <section className="panel chart-panel"><PanelTitle eyebrow="NPS BY MONTH" title="Monthly NPS trend" detail={monthlyRange} fields={['Feedback_DateTime', 'ResponseType']} /><MonthlyChart data={monthly} insight={trendInsight} /></section>
            <section className="panel chart-panel"><PanelTitle eyebrow="RESPONSE MIX" title="Response mix by NPS category" detail={`${integer(filteredRows.length)} responses`} fields={['ResponseType', 'Feedback_Rating']} /><ResponseMix counts={counts} total={filteredRows.length} insight={mixInsight} /></section>
          </div>

          <div className="overview-grid">
            <section className="panel chart-panel"><PanelTitle eyebrow="TENURE PATTERN" title="NPS for new and existing users" detail="User groups" fields={['NewUser_Period', 'ResponseType']} /><PatternChart items={tenurePattern} insight={tenureInsight} /></section>
            <section className="panel chart-panel"><PanelTitle eyebrow="CLIENT CONTEXT" title="NPS by client country" detail="50+ responses" fields={['PipelineInfo_ClientCountry', 'ResponseType']} /><PatternChart items={clientCountryPattern} insight={clientCountryInsight} /></section>
          </div>

          <section className="panel groups-panel">
            <PanelTitle eyebrow="WATCHLIST" title="Groups to review" detail="Top 3" fields={['Tenant_CustomerSegmentGroup', 'Tenant_Country', 'Tenant_MSSalesVerticalName', 'ResponseType']} />
            <p className="section-description">Groups are compared with {comparisonScope}. When you choose a group, the same field is left out. Groups with {MIN_GROUP_RESPONSES}+ responses appear first.</p>
            <GroupList groups={groupRanking} overall={currentNps} benchmarkLabel={dimension && selectedValue !== 'All' ? 'selected group' : 'all responses'} onSelect={selectGroup} limit={3} />
            <p className="chart-footnote">Select a group to view its results on Overview.</p>
          </section>
          <section className="definition-strip"><b>Reading the score</b><span>NPS = Promoter share − Detractor share. Scores range from −100 to +100.</span><span>Promoters: ratings 9–10 · Passives: 7–8 · Detractors: 0–6. Passives count in the response total but do not add to or subtract from NPS.</span></section>
        </> : page === 'drivers' ? <>
          <section className="analysis-hero"><div><span className="eyebrow">ACTIVITY SUMMARY</span><h2>{largestActivityDifference ? `${largestActivityDifference.label} shows the biggest gap` : 'Activity comparison unavailable'}</h2><p>{activityInsight}</p></div><div className="hero-stat"><span>Largest average gap</span><strong>{largestActivityDifference ? integer(Math.abs(largestActivityDifference.difference)) : '0'} events</strong><small>per response</small></div></section>
          <section className="panel activity-panel"><PanelTitle eyebrow="PROMOTERS VS DETRACTORS · PREVIOUS 7 DAYS" title="Activity patterns by feedback type" detail="Average events per response" fields={['ResponseType', ...ACTIVITY_FIELDS.map((item) => item.field)]} /><ActivityChart items={allBehaviorMeans} insight="These activity patterns came before the feedback. They may guide further analysis, but do not show what caused the score." /></section>
          <section className="panel groups-panel"><PanelTitle eyebrow="COMPARE GROUPS" title="Activity gap within customer groups" detail={stratificationDimension?.label || 'No dimension'} fields={['ResponseType', largestActivityDifference?.field || 'ActiveEvents', stratificationDimension?.field || 'NewUser_Period']} /><div className="strata-controls"><p className="section-description">This shows whether the largest activity gap is similar across groups. Each group needs {MIN_STRATUM_RESPONSES}+ Promoters and {MIN_STRATUM_RESPONSES}+ Detractors.</p><label><span>Group results by</span><select value={stratificationDimension?.label || ''} onChange={(event) => setStratificationLabel(event.target.value)}>{stratificationOptions.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></label></div><StratifiedActivityTable items={stratifiedActivity} metricLabel={largestActivityDifference?.label || 'Activity'} minimum={MIN_STRATUM_RESPONSES} /><p className="chart-footnote">A similar gap across groups suggests customer mix may not explain the full pattern. It still does not show cause.</p></section>
          <DriverCards items={[...allBehaviorMeans].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))} />
          <section className="definition-strip"><b>How to use this page</b><span>Prioritize experiments that reduce friction for Detractors while protecting behaviors associated with Promoters.</span><span>A pattern can guide investigation, but it does not prove cause.</span></section>
        </> : page === 'pain' ? <>
          <section className="analysis-hero"><div><span className="eyebrow">DETRACTOR CONCENTRATION</span><h2>{painPointRanking[0]?.value || 'No high-risk group found'}</h2><p>{painPointRanking[0] ? `Highest-risk group: ${painPointRanking[0].value} (${painPointRanking[0].dimension}). There are no written comments, so ask customers in this group what is going wrong.` : 'Not enough responses to rank customer groups.'}</p></div><div className="hero-stat"><span>Detractor share</span><strong>{painPointRanking[0] ? percent(painPointRanking[0].detractorCount, painPointRanking[0].count) : '0.0%'}</strong><small>{integer(painPointRanking[0]?.detractorCount || 0)} Detractors</small></div></section>
          <section className="panel groups-panel"><PanelTitle eyebrow="DETRACTOR CONCENTRATION" title="Highest detractor concentration" detail={`Risk score · ${MIN_GROUP_RESPONSES}+ responses`} fields={['ResponseType', 'Tenant_CustomerSegmentGroup', 'Tenant_Country', 'Tenant_MSSalesVerticalName']} /><p className="section-description">Risk score uses Detractor share (55%), share of responses (20%), and NPS difference (25%). Groups with fewer than {MIN_GROUP_RESPONSES} responses are hidden. NPS ranges are estimates.</p><AnalysisTable items={painPointRanking.slice(0, 12)} type="pain" /></section>
          <section className="overview-grid"><section className="panel chart-panel"><PanelTitle eyebrow="DETRACTOR PROFILE" title="Detractor share in selected group" detail={`${integer(detractorRows.length)} detractors`} fields={['ResponseType', 'Feedback_Rating']} /><div className="detractor-stat"><strong>{percent(detractorRows.length, filteredRows.length)}</strong><span>of selected responses are Detractors</span><b>{integer(detractorRows.length)} people to understand</b><small>Use the table above to find the groups with more Detractors.</small></div></section><section className="panel chart-panel"><PanelTitle eyebrow="CUSTOMER RESEARCH" title="Suggested research actions" detail="Suggested follow-up" fields={['ResponseType', 'ActiveEvents', 'NewUser_Period']} /><div className="question-list"><p><b>1</b> Ask customers in the highest-risk group about workflow or reliability problems.</p><p><b>2</b> Compare activity across customer groups to see if the pattern changes.</p><p><b>3</b> Test product changes with Passives and investigate how to improve Detractor experiences.</p></div></section></section>
        </> : <>
          <section className="recommendation-banner"><div><span className="eyebrow">RECOMMENDED STARTING POINT</span><h2>{priorityGroup ? priorityGroup.value : 'No priority group yet'}</h2><p>{priorityRecommendation}</p></div><button onClick={() => priorityGroup && selectGroup(priorityGroup)} disabled={!priorityGroup}>View group <span>↗</span></button></section>
          <section className="panel groups-panel"><PanelTitle eyebrow="SEGMENT PRIORITIZATION" title="NPS opportunity by customer group" detail={`${groupRanking.length} groups below the comparison NPS`} fields={['Tenant_CustomerSegmentGroup', 'Tenant_Country', 'Tenant_MSSalesVerticalName', 'ResponseType']} /><p className="section-description">Groups are compared with {comparisonScope}. Priority score = NPS difference × share of selected responses. Groups with {MIN_GROUP_RESPONSES}+ responses appear first. Smaller groups are included for context. NPS ranges are estimates.</p><AnalysisTable baselineLabel={dimension && selectedValue !== 'All' ? 'selected group' : 'all'} items={groupRanking.slice(0, 20).map((item) => ({ ...item, overall: currentNps }))} /></section>
          <section className="definition-strip"><b>Reading the score</b><span>NPS = Promoter share − Detractor share. Scores range from −100 to +100.</span><span>Promoters: ratings 9–10 · Passives: 7–8 · Detractors: 0–6.</span></section>
        </>}

        {excludedDateCount > 0 && <p className="data-note">{integer(excludedDateCount)} responses without a usable feedback date are not included in the monthly chart.</p>}
      </>}

      <footer className="site-footer"><span>Source: Teams_NPS_Cleaned_Imputed1.csv · {integer(rows.length)} responses</span><span>Feedback dates: {datePeriod} · Activity patterns do not prove cause</span></footer>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
