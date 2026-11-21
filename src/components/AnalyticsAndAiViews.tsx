import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { apiRequest } from '../api.ts';
import { ChartCard } from './ChartCard.tsx';
import type { AuthUser, CatalogData } from '../types.ts';

interface AnalyticsSuiteResponse {
  overview: {
    total_submissions: number;
    avg_satisfaction: number | null;
    high_satisfaction_count: number;
    moderate_satisfaction_count: number;
    low_satisfaction_count: number;
    avg_teaching_quality: number | null;
    avg_communication: number | null;
    avg_punctuality: number | null;
    avg_subject_knowledge: number | null;
    avg_methodology: number | null;
    avg_classroom_environment: number | null;
    avg_infrastructure: number | null;
  };
  sentimentRows: Array<{ sentiment: string; count: number }>;
  departmentRows: Array<{ code: string; department_name: string; avg_satisfaction: number; avg_infrastructure: number; submissions: number }>;
  teacherRows: Array<{ faculty_name: string; dept_code: string; avg_overall: number; avg_teaching: number; submissions: number }>;
  subjectRows: Array<{ code: string; subject_name: string; avg_satisfaction: number; submissions: number }>;
  monthlyRows: Array<{ month: string; submissions: number; avg_satisfaction: number }>;
  semesterRows: Array<{ semester_name: string; avg_satisfaction: number; avg_teaching: number; avg_infrastructure: number; submissions: number }>;
  participationRows: Array<{ code: string; department_name: string; participation_pct: number; participating_students: number; total_students: number }>;
  reportedIssues: Array<{ category: string; count: number }>;
  aiCategoryRows: Array<{ category: string; positive: number; neutral: number; negative: number }>;
  improvementDelta: number;
}

interface AnalyticsViewProps {
  catalog: CatalogData | null;
  isDark: boolean;
}

export function AnalyticsView({ catalog, isDark }: AnalyticsViewProps) {
  const [filters, setFilters] = useState({
    departmentId: '',
    courseId: '',
    facultyId: '',
    subjectId: '',
    academicYearId: '',
    semesterId: '',
    startDate: '',
    endDate: '',
  });
  const [data, setData] = useState<AnalyticsSuiteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    try {
      const res = await apiRequest<AnalyticsSuiteResponse>(`/analytics/full-suite?${params.toString()}`);
      setData(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const resetFilters = () =>
    setFilters({
      departmentId: '',
      courseId: '',
      facultyId: '',
      subjectId: '',
      academicYearId: '',
      semesterId: '',
      startDate: '',
      endDate: '',
    });

  // 12 Chart.js configurations driven strictly by SQL data
  const charts = useMemo(() => {
    if (!data) return null;
    const ov = data.overview;

    return {
      // 1. Overall Student Satisfaction Doughnut
      satisfactionDoughnut: {
        type: 'doughnut' as const,
        data: {
          labels: ['High (>= 4.0)', 'Moderate (3.0 - 3.9)', 'Needs Review (< 3.0)'],
          datasets: [
            {
              data: [
                ov?.high_satisfaction_count ?? 0,
                ov?.moderate_satisfaction_count ?? 0,
                ov?.low_satisfaction_count ?? 0,
              ],
              backgroundColor: ['#1E40AF', '#60A5FA', '#DC2626'],
              borderWidth: 0,
            },
          ],
        },
      },
      // 2. Sentiment Pie Chart
      sentimentPie: {
        type: 'pie' as const,
        data: {
          labels: data.sentimentRows.map((r) => r.sentiment),
          datasets: [
            {
              data: data.sentimentRows.map((r) => r.count),
              backgroundColor: data.sentimentRows.map((r) =>
                r.sentiment === 'Positive'
                  ? '#16A34A'
                  : r.sentiment === 'Negative'
                  ? '#DC2626'
                  : r.sentiment === 'Neutral'
                  ? '#D97706'
                  : '#64748B'
              ),
              borderWidth: 0,
            },
          ],
        },
      },
      // 3. Department-wise Satisfaction Bar Chart
      departmentBar: {
        type: 'bar' as const,
        data: {
          labels: data.departmentRows.map((d) => d.code),
          datasets: [
            {
              label: 'Overall Satisfaction',
              data: data.departmentRows.map((d) => d.avg_satisfaction),
              backgroundColor: '#1E40AF',
              borderRadius: 6,
            },
            {
              label: 'Infrastructure',
              data: data.departmentRows.map((d) => d.avg_infrastructure),
              backgroundColor: '#0EA5E9',
              borderRadius: 6,
            },
          ],
        },
        options: { scales: { y: { min: 0, max: 5 } } },
      },
      // 4. Teacher-wise Performance Comparison
      teacherBar: {
        type: 'bar' as const,
        data: {
          labels: data.teacherRows.map((t) => t.faculty_name.replace(/^Dr\.\s|^Prof\.\s/, '')),
          datasets: [
            {
              label: 'Overall Rating',
              data: data.teacherRows.map((t) => t.avg_overall),
              backgroundColor: '#0B192C',
              borderRadius: 6,
            },
            {
              label: 'Teaching Quality',
              data: data.teacherRows.map((t) => t.avg_teaching),
              backgroundColor: '#3B82F6',
              borderRadius: 6,
            },
          ],
        },
        options: { scales: { y: { min: 0, max: 5 } } },
      },
      // 5. Subject-wise Feedback Comparison
      subjectBar: {
        type: 'bar' as const,
        data: {
          labels: data.subjectRows.map((s) => s.code),
          datasets: [
            {
              label: 'Subject Satisfaction (1-5)',
              data: data.subjectRows.map((s) => s.avg_satisfaction),
              backgroundColor: '#2563EB',
              borderRadius: 6,
            },
          ],
        },
        options: { scales: { y: { min: 0, max: 5 } } },
      },
      // 6. Monthly Feedback Submission Line Chart
      monthlyLine: {
        type: 'line' as const,
        data: {
          labels: data.monthlyRows.map((m) => m.month),
          datasets: [
            {
              label: 'Submissions',
              data: data.monthlyRows.map((m) => m.submissions),
              borderColor: '#1E40AF',
              backgroundColor: 'rgba(30, 64, 175, 0.14)',
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: { scales: { y: { beginAtZero: true } } },
      },
      // 7. Semester-wise Satisfaction Trend
      semesterLine: {
        type: 'line' as const,
        data: {
          labels: data.semesterRows.map((s) => s.semester_name),
          datasets: [
            {
              label: 'Overall Satisfaction',
              data: data.semesterRows.map((s) => s.avg_satisfaction),
              borderColor: '#16A34A',
              backgroundColor: 'rgba(22, 163, 74, 0.1)',
              tension: 0.25,
            },
            {
              label: 'Teaching Quality',
              data: data.semesterRows.map((s) => s.avg_teaching),
              borderColor: '#2563EB',
              tension: 0.25,
            },
          ],
        },
        options: { scales: { y: { min: 0, max: 5 } } },
      },
      // 8. Teaching Quality Radar Chart
      teachingRadar: {
        type: 'radar' as const,
        data: {
          labels: [
            'Teaching',
            'Communication',
            'Punctuality',
            'Knowledge',
            'Methodology',
            'Classroom',
            'Infrastructure',
          ],
          datasets: [
            {
              label: 'Mean Score (1-5)',
              data: [
                ov?.avg_teaching_quality ?? 0,
                ov?.avg_communication ?? 0,
                ov?.avg_punctuality ?? 0,
                ov?.avg_subject_knowledge ?? 0,
                ov?.avg_methodology ?? 0,
                ov?.avg_classroom_environment ?? 0,
                ov?.avg_infrastructure ?? 0,
              ],
              borderColor: '#1E40AF',
              backgroundColor: 'rgba(30, 64, 175, 0.2)',
              pointBackgroundColor: '#1E40AF',
            },
          ],
        },
        options: { scales: { r: { min: 0, max: 5 } } },
      },
      // 9. Feedback Participation Percentage Chart
      participationBar: {
        type: 'bar' as const,
        data: {
          labels: data.participationRows.map((p) => p.code),
          datasets: [
            {
              label: 'Participation %',
              data: data.participationRows.map((p) => p.participation_pct),
              backgroundColor: '#0284C7',
              borderRadius: 6,
            },
          ],
        },
        options: { scales: { y: { min: 0, max: 100 } } },
      },
      // 10. Most Frequently Reported Issues
      issuesBar: {
        type: 'bar' as const,
        data: {
          labels: data.reportedIssues.map((i) => i.category),
          datasets: [
            {
              label: 'Issue / Flag Index',
              data: data.reportedIssues.map((i) => i.count),
              backgroundColor: '#D97706',
              borderRadius: 6,
            },
          ],
        },
        options: { indexAxis: 'y' as const, scales: { x: { beginAtZero: true } } },
      },
      // 11. AI Sentiment Distribution by Category
      aiSentimentBar: {
        type: 'bar' as const,
        data: {
          labels:
            data.aiCategoryRows.length > 0
              ? data.aiCategoryRows.map((c) => c.category)
              : ['Run Gemini Analysis in AI Insights'],
          datasets:
            data.aiCategoryRows.length > 0
              ? [
                  {
                    label: 'Positive',
                    data: data.aiCategoryRows.map((c) => c.positive),
                    backgroundColor: '#16A34A',
                  },
                  {
                    label: 'Neutral',
                    data: data.aiCategoryRows.map((c) => c.neutral),
                    backgroundColor: '#D97706',
                  },
                  {
                    label: 'Negative',
                    data: data.aiCategoryRows.map((c) => c.negative),
                    backgroundColor: '#DC2626',
                  },
                ]
              : [
                  {
                    label: 'Pending Gemini Classification',
                    data: [ov?.total_submissions ?? 0],
                    backgroundColor: '#64748B',
                  },
                ],
        },
        options: {
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
        },
      },
      // 12. Academic Performance Improvement Indicator Chart
      improvementBar: {
        type: 'bar' as const,
        data: {
          labels: data.semesterRows.map((s) => s.semester_name),
          datasets: [
            {
              label: 'Academic Index',
              data: data.semesterRows.map((s) => s.avg_satisfaction),
              backgroundColor: data.semesterRows.map((_, idx) =>
                idx === data.semesterRows.length - 1 ? '#16A34A' : '#334155'
              ),
              borderRadius: 6,
            },
          ],
        },
        options: { scales: { y: { min: 0, max: 5 } } },
      },
    };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* 7-Filter Control Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Live Database Analytics &amp; Cross-Filters
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
            <button
              type="button"
              onClick={loadAnalytics}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E40AF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <select
            value={filters.departmentId}
            onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value }))}
            aria-label="Filter by Department"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All Departments</option>
            {(catalog?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>

          <select
            value={filters.courseId}
            onChange={(e) => setFilters((f) => ({ ...f, courseId: e.target.value }))}
            aria-label="Filter by Course"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All Courses</option>
            {(catalog?.courses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filters.facultyId}
            onChange={(e) => setFilters((f) => ({ ...f, facultyId: e.target.value }))}
            aria-label="Filter by Teacher"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All Teachers</option>
            {(catalog?.teachers ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>

          <select
            value={filters.subjectId}
            onChange={(e) => setFilters((f) => ({ ...f, subjectId: e.target.value }))}
            aria-label="Filter by Subject"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All Subjects</option>
            {(catalog?.subjects ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>

          <select
            value={filters.academicYearId}
            onChange={(e) => setFilters((f) => ({ ...f, academicYearId: e.target.value }))}
            aria-label="Filter by Academic Year"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All Years</option>
            {(catalog?.academicYears ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>

          <select
            value={filters.semesterId}
            onChange={(e) => setFilters((f) => ({ ...f, semesterId: e.target.value }))}
            aria-label="Filter by Semester"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All Semesters</option>
            {(catalog?.semesters ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            aria-label="Start Date"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />

          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            aria-label="End Date"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* KPI Indicator Row */}
      {data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Filtered Submissions</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {data.overview.total_submissions}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Mean Satisfaction</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#1E40AF] tabular-nums dark:text-blue-400">
              {data.overview.avg_satisfaction ?? '0.00'} / 5.0
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Teaching Quality Mean</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {data.overview.avg_teaching_quality ?? '0.00'} / 5.0
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Semester Improvement Indicator</p>
            <p
              className={`mt-1 flex items-center gap-1.5 font-mono text-2xl font-bold tabular-nums ${
                data.improvementDelta >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              <TrendingUp className="h-5 w-5" />
              {data.improvementDelta >= 0 ? `+${data.improvementDelta}` : data.improvementDelta}
            </p>
          </div>
        </div>
      )}

      {/* All 12 Chart.js Visualizations */}
      {charts && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard
            title="01. Overall Student Satisfaction"
            subtitle="Distribution across satisfaction tiers"
            config={charts.satisfactionDoughnut}
            isDark={isDark}
            badgeText={`${data?.overview.avg_satisfaction ?? 0} / 5.0`}
          />
          <ChartCard
            title="02. Feedback Sentiment Breakdown"
            subtitle="Gemini AI sentiment classification counts"
            config={charts.sentimentPie}
            isDark={isDark}
          />
          <ChartCard
            title="03. Department-Wise Satisfaction"
            subtitle="Overall satisfaction vs. campus infrastructure"
            config={charts.departmentBar}
            isDark={isDark}
          />
          <ChartCard
            title="04. Teacher-Wise Performance Comparison"
            subtitle="Overall score vs. teaching quality"
            config={charts.teacherBar}
            isDark={isDark}
          />
          <ChartCard
            title="05. Subject-Wise Feedback Comparison"
            subtitle="Course-level evaluation ratings"
            config={charts.subjectBar}
            isDark={isDark}
          />
          <ChartCard
            title="06. Monthly Feedback Submission Volume"
            subtitle="Submission cadence across calendar months"
            config={charts.monthlyLine}
            isDark={isDark}
          />
          <ChartCard
            title="07. Semester-Wise Satisfaction Trend"
            subtitle="Longitudinal progression across terms"
            config={charts.semesterLine}
            isDark={isDark}
          />
          <ChartCard
            title="08. Teaching Quality Dimensions Radar"
            subtitle="Seven-axis pedagogical and infrastructure profile"
            config={charts.teachingRadar}
            isDark={isDark}
          />
          <ChartCard
            title="09. Department Participation Percentage"
            subtitle="Percentage of enrolled students submitting feedback"
            config={charts.participationBar}
            isDark={isDark}
          />
          <ChartCard
            title="10. Most Frequently Reported Issues"
            subtitle="Low-score dimensions and flagged AI categories"
            config={charts.issuesBar}
            isDark={isDark}
          />
          <ChartCard
            title="11. AI Sentiment Distribution by Category"
            subtitle="Positive, neutral, and negative counts per academic category"
            config={charts.aiSentimentBar}
            isDark={isDark}
          />
          <ChartCard
            title="12. Academic Performance Improvement Indicator"
            subtitle="Semester-over-semester satisfaction index comparison"
            config={charts.improvementBar}
            isDark={isDark}
            badgeText={`${data && data.improvementDelta >= 0 ? '+' : ''}${data?.improvementDelta ?? 0}`}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 11: AI INSIGHTS DASHBOARD (REAL GEMINI API INTEGRATION)
// ---------------------------------------------------------------------------
interface AiInsightsData {
  summaries: Array<{
    id: number;
    scope_type: string;
    summary_text: string;
    frequent_topics_json: string;
    positive_highlights_json: string;
    recurring_complaints_json: string;
    model_name: string;
    created_at: string;
  }>;
  sentimentRecords: Array<{
    id: number;
    submission_id: number;
    sentiment: string;
    confidence_score: number;
    primary_category: string;
    urgency_level: string;
    key_phrases_json: string;
    model_name: string;
    comment_text: string;
    subject_code: string;
    subject_name: string;
    department_name: string;
    overall_satisfaction: number;
  }>;
  unanalyzedCount: number;
  alerts: Array<{
    id: number;
    recommendation_title: string;
    recommendation_body: string;
    alert_reason: string | null;
    priority: string;
    reviewed_by_admin: number;
    created_at: string;
  }>;
}

interface AiInsightsViewProps {
  user: AuthUser;
  catalog: CatalogData | null;
}

export function AiInsightsView({ user, catalog }: AiInsightsViewProps) {
  const [data, setData] = useState<AiInsightsData | null>(null);
  const [recommendations, setRecommendations] = useState<
    Array<{
      id: number;
      target_type: string;
      recommendation_title: string;
      recommendation_body: string;
      priority: string;
      is_alert: number;
      reviewed_by_admin: number;
      model_name: string;
    }>
  >([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [busySentiment, setBusySentiment] = useState(false);
  const [busyInsights, setBusyInsights] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAiData = useCallback(async () => {
    const [ins, recs] = await Promise.all([
      apiRequest<AiInsightsData>('/ai/insights'),
      apiRequest<{ recommendations: typeof recommendations }>('/ai/recommendations'),
    ]);
    setData(ins);
    setRecommendations(recs.recommendations);
  }, []);

  useEffect(() => {
    loadAiData().catch(() => null);
  }, [loadAiData]);

  async function handleRunSentiment() {
    setBusySentiment(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ analyzed: number; message?: string }>('/ai/analyze-feedback', {
        method: 'POST',
        body: JSON.stringify({ limit: 8 }),
      });
      setStatusMsg({
        type: 'success',
        text: res.message || `Gemini classified ${res.analyzed} feedback submissions across 9 academic categories.`,
      });
      await loadAiData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Gemini sentiment analysis failed.' });
    } finally {
      setBusySentiment(false);
    }
  }

  async function handleGenerateInsights() {
    setBusyInsights(true);
    setStatusMsg(null);
    try {
      await apiRequest('/ai/generate-insights', {
        method: 'POST',
        body: JSON.stringify({
          scope_type: selectedDeptId ? 'department' : 'institutional',
          department_id: selectedDeptId ? Number(selectedDeptId) : null,
        }),
      });
      setStatusMsg({
        type: 'success',
        text: 'Gemini generated a fresh executive summary, recurring complaints report, and teaching recommendations.',
      });
      await loadAiData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Insight generation failed.' });
    } finally {
      setBusyInsights(false);
    }
  }

  async function handleMarkReviewed(id: number) {
    try {
      await apiRequest(`/ai/recommendations/${id}/review`, { method: 'PATCH' });
      await loadAiData();
    } catch {
      // ignore
    }
  }

  const latestSummary = data?.summaries[0];
  const parseJsonList = (raw?: string): string[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-5 w-5 text-[#1E40AF] dark:text-blue-400" />
              Gemini AI Feedback Intelligence
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Live server-side sentiment analysis, 9-category classification, executive summaries, and early-warning alerts. AI outputs serve as advisory signals for human review.
            </p>
          </div>

          {(user.role === 'admin' || user.role === 'faculty') && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                aria-label="Scope department for AI summary"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">All Departments (Institutional)</option>
                {(catalog?.departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={busySentiment}
                onClick={handleRunSentiment}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {busySentiment
                  ? 'Analyzing...'
                  : `Analyze Pending (${data?.unanalyzedCount ?? 0})`}
              </button>

              <button
                type="button"
                disabled={busyInsights}
                onClick={handleGenerateInsights}
                className="rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-60 dark:bg-blue-600"
              >
                {busyInsights ? 'Synthesizing...' : 'Generate Executive Insights'}
              </button>
            </div>
          )}
        </div>

        {statusMsg && (
          <div
            className={`mt-4 rounded-lg border px-4 py-2.5 text-xs ${
              statusMsg.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            {statusMsg.text}
          </div>
        )}
      </div>

      {/* Latest Executive Summary & Topic Extraction */}
      {latestSummary ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Executive Feedback Summary
              </h3>
              <span className="font-mono text-xs text-slate-500">
                {latestSummary.model_name} · {latestSummary.scope_type}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {latestSummary.summary_text}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-800">
              <div>
                <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Positive Highlights</h4>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {parseJsonList(latestSummary.positive_highlights_json).map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400">Recurring Complaints</h4>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {parseJsonList(latestSummary.recurring_complaints_json).map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Frequent Topics:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {parseJsonList(latestSummary.frequent_topics_json).join(' · ')}
              </span>
            </div>
          </div>

          {/* Alerts & Recommendations */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-[#111C2E]">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              AI Alerts &amp; Recommendations
            </h3>
            <div className="mt-4 space-y-3">
              {recommendations.slice(0, 5).map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {rec.is_alert === 1 && <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
                      {rec.recommendation_title}
                    </p>
                    <span className="font-mono text-[11px] text-slate-500">{rec.priority}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {rec.recommendation_body}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Target: {rec.target_type}</span>
                    {user.role === 'admin' && rec.reviewed_by_admin === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleMarkReviewed(rec.id)}
                        className="font-medium text-[#1E40AF] hover:underline dark:text-blue-400"
                      >
                        Mark Reviewed
                      </button>
                    ) : rec.reviewed_by_admin === 1 ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Reviewed
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            No Gemini institutional summary has been generated yet.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Click &ldquo;Analyze Pending&rdquo; and &ldquo;Generate Executive Insights&rdquo; above to run real Gemini analysis and persist the results.
          </p>
        </div>
      )}

      {/* Sentiment Classification Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          Stored Gemini Sentiment &amp; 9-Category Classifications
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Subject</th>
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 font-medium">Sentiment</th>
                <th className="py-2 font-medium">Urgency</th>
                <th className="py-2 font-medium">Comment Excerpt</th>
                <th className="py-2 text-right font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data?.sentimentRecords ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Click &ldquo;Analyze Pending&rdquo; above to classify feedback submissions using Gemini.
                  </td>
                </tr>
              ) : (
                data!.sentimentRecords.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.subject_code} · {row.subject_name}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-300">{row.primary_category}</td>
                    <td
                      className={`py-2.5 pr-3 font-semibold ${
                        row.sentiment === 'Positive'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.sentiment === 'Negative'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {row.sentiment} ({Math.round(row.confidence_score * 100)}%)
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-slate-600 dark:text-slate-300">{row.urgency_level}</td>
                    <td className="max-w-sm truncate py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      {row.comment_text}
                    </td>
                    <td className="py-2.5 text-right font-mono font-semibold tabular-nums">
                      {row.overall_satisfaction.toFixed(1)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
