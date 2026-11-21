import { useEffect, useRef } from 'react';
import Chart, { type ChartConfiguration } from 'chart.js/auto';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  config: ChartConfiguration;
  isDark: boolean;
  heightClass?: string;
  badgeText?: string;
}

export function ChartCard({
  title,
  subtitle,
  config,
  isDark,
  heightClass = 'h-64',
  badgeText,
}: ChartCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const textColor = isDark ? '#CBD5E1' : '#334155';
    const gridColor = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.08)';

    const baseOptions = (config.options || {}) as Record<string, unknown>;
    const existingScales = (baseOptions.scales as Record<string, Record<string, unknown>>) || undefined;
    const styledScales = existingScales
      ? Object.fromEntries(
          Object.entries(existingScales).map(([axisKey, axisVal]) => [
            axisKey,
            {
              ...axisVal,
              ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 11 }, ...(axisVal.ticks as object) },
              grid: { color: gridColor, ...(axisVal.grid as object) },
              ...(axisKey === 'r'
                ? {
                    angleLines: { color: gridColor },
                    pointLabels: { color: textColor, font: { family: "'DM Sans', sans-serif", size: 11 } },
                  }
                : {}),
            },
          ])
        )
      : undefined;

    const mergedConfig: ChartConfiguration = {
      ...config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...baseOptions,
        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: { family: "'DM Sans', sans-serif", size: 12 },
              boxWidth: 12,
              padding: 14,
            },
            ...((baseOptions.plugins as Record<string, unknown>)?.legend as object),
          },
          tooltip: {
            backgroundColor: isDark ? '#0F172A' : '#0B192C',
            titleColor: '#F8FAFC',
            bodyColor: '#E2E8F0',
            borderColor: isDark ? '#334155' : '#1E40AF',
            borderWidth: 1,
            padding: 10,
          },
          ...((baseOptions.plugins as Record<string, unknown>) || {}),
        },
        ...(styledScales ? { scales: styledScales } : {}),
      } as ChartConfiguration['options'],
    };

    chartRef.current = new Chart(canvas, mergedConfig);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [config, isDark]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {badgeText && (
          <span className="shrink-0 font-mono text-xs font-medium text-blue-700 tabular-nums dark:text-blue-400">
            {badgeText}
          </span>
        )}
      </div>
      <div className={`relative w-full ${heightClass}`}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
