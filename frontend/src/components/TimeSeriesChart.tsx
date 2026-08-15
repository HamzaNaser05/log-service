import type { AggregateBucket, AggregatePoint } from "../api/types";
import { formatChartTime, formatCompactNumber } from "../lib/format";

const SERIES_COLORS = ["#7c6cf2", "#20b8a6", "#f0a34a", "#e85d75", "#4b9ef8", "#a36feb", "#69b96f"];

export function TimeSeriesChart({
  points,
  bucket,
  compact = false,
}: {
  points: AggregatePoint[];
  bucket: AggregateBucket;
  compact?: boolean;
}) {
  const starts = Array.from(new Set(points.map((point) => point.start))).sort();
  const groups = Array.from(new Set(points.map((point) => point.group ?? "Logs"))).sort();
  const lookup = new Map(points.map((point) => [`${point.start}\u0000${point.group ?? "Logs"}`, point.count]));
  const maxValue = Math.max(1, ...points.map((point) => point.count));

  const width = 920;
  const height = compact ? 180 : 300;
  const margin = compact
    ? { top: 12, right: 12, bottom: 28, left: 45 }
    : { top: 18, right: 18, bottom: 42, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (index: number) => margin.left + (starts.length <= 1 ? plotWidth / 2 : (index / (starts.length - 1)) * plotWidth);
  const y = (value: number) => margin.top + plotHeight - (value / maxValue) * plotHeight;
  const labelIndexes = Array.from(new Set([0, Math.floor((starts.length - 1) * 0.25), Math.floor((starts.length - 1) * 0.5), Math.floor((starts.length - 1) * 0.75), starts.length - 1])).filter((index) => index >= 0);

  return (
    <div className={`chart-wrap ${compact ? "chart-compact" : ""}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Log count over time">
        <defs>
          <linearGradient id={`area-gradient-${compact ? "small" : "large"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLORS[0]} stopOpacity="0.24" />
            <stop offset="100%" stopColor={SERIES_COLORS[0]} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = maxValue * (1 - ratio);
          const lineY = margin.top + plotHeight * ratio;
          return (
            <g key={ratio}>
              <line className="chart-grid" x1={margin.left} x2={width - margin.right} y1={lineY} y2={lineY} />
              <text className="chart-axis-label" x={margin.left - 10} y={lineY + 4} textAnchor="end">
                {formatCompactNumber(Math.round(value))}
              </text>
            </g>
          );
        })}

        {groups.map((group, groupIndex) => {
          const values = starts.map((start) => lookup.get(`${start}\u0000${group}`) ?? 0);
          const coordinates = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
          const areaCoordinates = `${x(0)},${margin.top + plotHeight} ${coordinates} ${x(starts.length - 1)},${margin.top + plotHeight}`;

          return (
            <g key={group}>
              {groups.length === 1 && starts.length > 0 && (
                <polygon points={areaCoordinates} fill={`url(#area-gradient-${compact ? "small" : "large"})`} />
              )}
              <polyline
                className="chart-line"
                points={coordinates}
                style={{ stroke: SERIES_COLORS[groupIndex % SERIES_COLORS.length] }}
              />
              {values.map((value, index) => (
                <circle
                  className="chart-point"
                  cx={x(index)}
                  cy={y(value)}
                  fill={SERIES_COLORS[groupIndex % SERIES_COLORS.length]}
                  key={`${starts[index]}-${group}`}
                  r={compact ? 2.5 : 3.5}
                >
                  <title>{`${group} · ${formatChartTime(starts[index], bucket)} · ${value.toLocaleString()} logs`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {labelIndexes.map((index) => (
          <text className="chart-axis-label" key={index} x={x(index)} y={height - 8} textAnchor="middle">
            {formatChartTime(starts[index], bucket)}
          </text>
        ))}
      </svg>
      {groups.length > 1 && (
        <div className="chart-legend">
          {groups.map((group, index) => (
            <span key={group}><i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{group}</span>
          ))}
        </div>
      )}
    </div>
  );
}
