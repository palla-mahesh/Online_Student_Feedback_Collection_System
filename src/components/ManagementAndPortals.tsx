import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  Archive,
  BookOpen,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  MessageSquare,
  Moon,
  Plus,
  QrCode,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { apiRequest, downloadAuthenticatedBlob } from '../api.ts';
import { getSuggestedEnrollmentPrefix, isValidEnrollmentFormat } from '../enrollment.ts';
import { LANGUAGE_LABELS, TRANSLATIONS } from '../i18n.ts';
import { ChartCard } from './ChartCard.tsx';
import type {
  AuthUser,
  CatalogData,
  DepartmentSemesterTrackingResponse,
  FeedbackFormItem,
  LanguageCode,
  ProctorMenteeRecord,
  ProctorSubjectAnalysisRow,
  SemesterTrackingItem,
  StudentProfileRecord,
  SubjectPollItem,
} from '../types.ts';

// ---------------------------------------------------------------------------
// PAGE 8: FACULTY DASHBOARD (REQUESTS, POLLS, PROCTOR ANALYSIS & STUDENT DB)
// ---------------------------------------------------------------------------
export function FacultyDashboardView({ isDark }: { isDark: boolean }) {
  const [data, setData] = useState<{
    faculty: { id: number; full_name: string; department_name: string; designation: string; employee_code: string };
    allFaculty?: Array<{
      id: number;
      full_name: string;
      employee_code: string;
      department_code: string;
      department_name: string;
      designation: string;
    }>;
    activeForms?: Array<{ id: number; title: string; close_date: string; qr_token: string }>;
    assignedSubjects: Array<{
      id: number;
      code: string;
      short_code?: string | null;
      name: string;
      course_name: string;
      semester_name: string;
      response_count: number;
      avg_satisfaction: number | null;
      avg_teaching?: number | null;
      avg_infrastructure?: number | null;
      requests_sent?: number;
      completed_requests?: number;
      pending_requests?: number;
    }>;
    metrics: {
      total_responses: number;
      avg_overall: number | null;
      avg_teaching: number | null;
      avg_communication: number | null;
      avg_punctuality: number | null;
      avg_knowledge: number | null;
      avg_methodology: number | null;
    };
    requestStats?: {
      total_requests: number;
      completed_requests: number;
      in_progress_requests: number;
      pending_requests: number;
      completion_rate: number;
    };
    semesterTrend: Array<{ semester_name: string; avg_satisfaction: number; submissions: number }>;
    anonymizedComments: Array<{
      id: number;
      subject_code: string;
      short_code?: string | null;
      subject_name: string;
      semester_name?: string;
      is_anonymous?: number;
      respondent_display?: string;
      comment_text: string;
      overall_satisfaction: number;
      teaching_quality?: number;
      infrastructure?: number;
      submitted_at: string;
      sentiment: string | null;
      primary_category: string | null;
    }>;
    subjectPolls?: SubjectPollItem[];
    proctorMentees?: ProctorMenteeRecord[];
    proctorSubjectAnalysis?: ProctorSubjectAnalysisRow[];
    proctorReviews?: Array<{
      id: number;
      subject_code: string;
      short_code?: string | null;
      subject_name: string;
      semester_name: string;
      instructor_name: string | null;
      is_anonymous: number;
      respondent_display: string;
      comment_text: string;
      overall_satisfaction: number;
      teaching_quality: number;
      infrastructure: number;
      submitted_at: string;
      sentiment: string | null;
      primary_category: string | null;
    }>;
    studentDatabase?: Array<{
      student_id: number;
      roll_number: string;
      full_name: string;
      email: string;
      department_code: string;
      department_name: string;
      course_code: string;
      semester_name: string;
      term_order: number;
      proctor_name: string | null;
      requests_given: number;
      feedbacks_completed: number;
      feedbacks_pending: number;
    }>;
    recommendations: Array<{ id: number; recommendation_title: string; recommendation_body: string; priority: string }>;
  } | null>(null);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'polls' | 'proctor' | 'students'>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [dispatchForm, setDispatchForm] = useState({
    form_id: '',
    subject_id: '',
    target_scope: 'subject_students' as 'subject_students' | 'proctor_mentees' | 'all_dept_students',
    request_note: 'Please submit your semester course feedback evaluation.',
  });
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadFacultyDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const qs = selectedFacultyId ? `?facultyId=${encodeURIComponent(selectedFacultyId)}` : '';
    try {
      const res = await apiRequest<NonNullable<typeof data>>(`/faculty/dashboard${qs}`);
      setData(res);
      if (res.activeForms?.length && !dispatchForm.form_id) {
        setDispatchForm((f) => ({ ...f, form_id: String(res.activeForms![0].id) }));
      }
      if (res.assignedSubjects?.length && !dispatchForm.subject_id) {
        setDispatchForm((f) => ({ ...f, subject_id: String(res.assignedSubjects[0].id) }));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load faculty dashboard.');
    } finally {
      setLoading(false);
    }
  }, [selectedFacultyId]);

  useEffect(() => {
    loadFacultyDashboard();
  }, [loadFacultyDashboard]);

  async function handleDispatchRequests(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setDispatchBusy(true);
    setDispatchMsg(null);
    try {
      const res = await apiRequest<{ message: string; inserted: number; skippedExisting: number }>(
        '/faculty/requests/dispatch',
        {
          method: 'POST',
          body: JSON.stringify({
            faculty_id: data.faculty.id,
            form_id: dispatchForm.form_id ? Number(dispatchForm.form_id) : undefined,
            subject_id: dispatchForm.subject_id ? Number(dispatchForm.subject_id) : undefined,
            target_scope: dispatchForm.target_scope,
            request_note: dispatchForm.request_note,
          }),
        }
      );
      setDispatchMsg(res.message);
      await loadFacultyDashboard();
    } catch (err) {
      setDispatchMsg(err instanceof Error ? err.message : 'Failed to dispatch requests.');
    } finally {
      setDispatchBusy(false);
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />;
  if (errorMsg) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {errorMsg}
      </div>
    );
  }
  if (!data) return null;

  const satisfactionPct = data.metrics.avg_overall ? Math.round((data.metrics.avg_overall / 5) * 100) : 0;
  const filteredStudentDb = (data.studentDatabase ?? []).filter((stu) => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      stu.roll_number.toLowerCase().includes(q) ||
      stu.full_name.toLowerCase().includes(q) ||
      stu.department_code.toLowerCase().includes(q) ||
      stu.semester_name.toLowerCase().includes(q) ||
      (stu.proctor_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#111C2E]">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {data.faculty.department_name} · {data.faculty.employee_code}
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{data.faculty.full_name}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {data.faculty.designation} · Subject Instructor &amp; Proctor Workbench
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(data.allFaculty?.length ?? 0) > 1 && (
            <select
              value={selectedFacultyId || String(data.faculty.id)}
              onChange={(e) => {
                setSelectedFacultyId(e.target.value);
                setDispatchForm((f) => ({ ...f, subject_id: '' }));
              }}
              aria-label="Inspect Faculty / Proctor Profile"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {data.allFaculty!.map((fac) => (
                <option key={fac.id} value={String(fac.id)}>
                  {fac.full_name} ({fac.department_code})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => downloadAuthenticatedBlob('/reports/export/csv', 'faculty_feedback_report.csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Export My CSV
          </button>
          <button
            type="button"
            onClick={() => downloadAuthenticatedBlob('/reports/export/pdf', 'faculty_institutional_report.pdf')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E40AF] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
          >
            <FileText className="h-3.5 w-3.5" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Metrics Strip (Satisfaction, Online Requests Given vs Completed, Teaching & Knowledge) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Satisfaction Index</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#1E40AF] tabular-nums dark:text-blue-400">
            {satisfactionPct}%
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Online Requests Given</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
            {data.requestStats?.total_requests ?? 0}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {data.requestStats?.completed_requests ?? 0} done · {data.requestStats?.pending_requests ?? 0} pending
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Submitted Reviews</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
            {data.metrics.total_responses}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {data.requestStats?.completion_rate ?? 0}% request rate
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Teaching Quality</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
            {data.metrics.avg_teaching ?? '—'} / 5
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Proctor Mentees</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
            {data.proctorMentees?.length ?? 0}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {data.proctorSubjectAnalysis?.length ?? 0} subjects tracked
          </p>
        </div>
      </div>

      {/* Section View Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {(
          [
            { id: 'all', label: 'All Faculty & Proctor Views' },
            { id: 'polls', label: `Polls & Online Reviews (${(data.subjectPolls?.length ?? 0) + data.anonymizedComments.length})` },
            { id: 'proctor', label: `Proctor Subject Analysis (${data.proctorMentees?.length ?? 0} Mentees)` },
            { id: 'students', label: `Saved Student Database (${data.studentDatabase?.length ?? 0})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-[#1E40AF] text-white dark:bg-blue-600'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dispatch Online Feedback Requests Form */}
      {activeTab === 'all' && (
        <form
          onSubmit={handleDispatchRequests}
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]"
        >
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Send Online Feedback Requests to Students
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Persist online evaluation requests for subject students or your assigned proctor mentees.
              </p>
            </div>
            {dispatchMsg && (
              <span className="font-mono text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {dispatchMsg}
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
            <select
              value={dispatchForm.form_id}
              onChange={(e) => setDispatchForm((f) => ({ ...f, form_id: e.target.value }))}
              aria-label="Campaign Form"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-3 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {(data.activeForms ?? []).map((fm) => (
                <option key={fm.id} value={String(fm.id)}>
                  {fm.title}
                </option>
              ))}
            </select>
            <select
              value={dispatchForm.subject_id}
              onChange={(e) => setDispatchForm((f) => ({ ...f, subject_id: e.target.value }))}
              aria-label="Assigned Subject"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-3 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {data.assignedSubjects.map((sub) => (
                <option key={sub.id} value={String(sub.id)}>
                  {sub.code} · {sub.name}
                </option>
              ))}
            </select>
            <select
              value={dispatchForm.target_scope}
              onChange={(e) =>
                setDispatchForm((f) => ({
                  ...f,
                  target_scope: e.target.value as 'subject_students' | 'proctor_mentees' | 'all_dept_students',
                }))
              }
              aria-label="Target Students"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="subject_students">Subject Semester Students</option>
              <option value="proctor_mentees">My Proctor Mentees</option>
              <option value="all_dept_students">All Department Students</option>
            </select>
            <input
              type="text"
              value={dispatchForm.request_note}
              onChange={(e) => setDispatchForm((f) => ({ ...f, request_note: e.target.value }))}
              placeholder="Instruction note for students..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={dispatchBusy || data.assignedSubjects.length === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1E40AF] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-60 md:col-span-2 dark:bg-blue-600"
            >
              <Send className="h-3.5 w-3.5" />
              {dispatchBusy ? 'Sending...' : 'Send Requests'}
            </button>
          </div>
        </form>
      )}

      {/* Assigned Subjects & Semester Trend */}
      {activeTab === 'all' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-[#111C2E]">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Assigned Subjects &amp; Online Feedback Requests
            </h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 font-medium">Subject</th>
                    <th className="py-2 font-medium">Sem</th>
                    <th className="py-2 text-right font-medium">Requests</th>
                    <th className="py-2 text-right font-medium">Completed</th>
                    <th className="py-2 text-right font-medium">Pending</th>
                    <th className="py-2 text-right font-medium">Reviews</th>
                    <th className="py-2 text-right font-medium">Mean</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.assignedSubjects.map((sub) => (
                    <tr key={sub.id}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-slate-500">{sub.code}</span> · {sub.name}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{sub.semester_name}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{sub.requests_sent ?? 0}</td>
                      <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {sub.completed_requests ?? 0}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                        {sub.pending_requests ?? 0}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{sub.response_count}</td>
                      <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-[#1E40AF] dark:text-blue-400">
                        {sub.avg_satisfaction ? sub.avg_satisfaction.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5">
            <ChartCard
              title="Semester-over-Semester Trend"
              subtitle="Comparison across academic terms"
              isDark={isDark}
              config={{
                type: 'line',
                data: {
                  labels: data.semesterTrend.map((t) => t.semester_name),
                  datasets: [
                    {
                      label: 'Average Satisfaction (1-5)',
                      data: data.semesterTrend.map((t) => t.avg_satisfaction),
                      borderColor: '#1E40AF',
                      backgroundColor: 'rgba(30, 64, 175, 0.15)',
                      fill: true,
                      tension: 0.3,
                    },
                  ],
                },
                options: { scales: { y: { min: 0, max: 5 } } },
              }}
            />
          </div>
        </div>
      )}

      {/* Assigned Instructor Polls & Online Reviews */}
      {(activeTab === 'all' || activeTab === 'polls') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-[#111C2E]">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Assigned Instructor Polls &amp; Survey Breakdown
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Live poll tallies from student responses across your assigned subjects.
            </p>
            <div className="mt-4 space-y-4">
              {(data.subjectPolls?.length ?? 0) === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No poll responses recorded for this instructor yet.
                </p>
              ) : (
                data.subjectPolls!.map((poll) => (
                  <div key={poll.question_id} className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{poll.question_text}</p>
                      <span className="shrink-0 font-mono text-[11px] text-[#1E40AF] dark:text-blue-400">
                        {poll.total_votes} votes{poll.avg_score ? ` · ${poll.avg_score}/5` : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{poll.category}</p>
                    <div className="mt-2.5 space-y-1.5">
                      {poll.options.map((opt) => (
                        <div key={opt.label} className="space-y-0.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-700 dark:text-slate-300">{opt.label}</span>
                            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {opt.count} ({opt.percentage}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-[#1E40AF] dark:bg-blue-500"
                              style={{ width: `${opt.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Online Reviews for Assigned Subject Faculty
              </h3>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-[#1E40AF] dark:text-blue-400" />
                Anonymous Flags Enforced
              </span>
            </div>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {data.anonymizedComments.length === 0 ? (
                <p className="py-4 text-xs text-slate-500">No student reviews submitted yet.</p>
              ) : (
                data.anonymizedComments.map((c) => (
                  <div key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {c.subject_code}
                        </span>{' '}
                        · {c.subject_name}
                        {c.semester_name ? ` (${c.semester_name})` : ''} ·{' '}
                        <span className="font-medium text-[#1E40AF] dark:text-blue-400">
                          {c.respondent_display || 'Anonymous Respondent'}
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {c.overall_satisfaction.toFixed(1)} / 5
                        {c.sentiment ? ` · ${c.sentiment}` : ''}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">{c.comment_text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proctor Subject Analysis, Mentees & Mentee Reviews */}
      {(activeTab === 'all' || activeTab === 'proctor') && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Proctor Subject-Wise Analysis (Mentee Evaluations)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                How your assigned proctor mentees rated their courses, instructors, and labs.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2 font-medium">Subject &amp; Instructor</th>
                      <th className="py-2 text-right font-medium">Reqs</th>
                      <th className="py-2 text-right font-medium">Reviews</th>
                      <th className="py-2 text-right font-medium">Teach</th>
                      <th className="py-2 text-right font-medium">Mean</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(data.proctorSubjectAnalysis ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500">
                          No proctor subject reviews recorded yet.
                        </td>
                      </tr>
                    ) : (
                      data.proctorSubjectAnalysis!.map((row) => (
                        <tr key={row.subject_id}>
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              <span className="font-mono text-[#1E40AF] dark:text-blue-400">{row.subject_code}</span> ·{' '}
                              {row.subject_name}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {row.semester_name} · {row.instructor_name || 'Department Faculty'}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{row.requests_count}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{row.reviews_count}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                            {row.avg_teaching ? row.avg_teaching.toFixed(1) : '—'}
                          </td>
                          <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-[#1E40AF] dark:text-blue-400">
                            {row.avg_overall ? row.avg_overall.toFixed(2) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                My Proctor Mentees ({data.proctorMentees?.length ?? 0})
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Saved student records assigned to you as proctor with online request completion counts.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2 font-medium">SRN</th>
                      <th className="py-2 font-medium">Student</th>
                      <th className="py-2 font-medium">Sem</th>
                      <th className="py-2 text-right font-medium">Reqs</th>
                      <th className="py-2 text-right font-medium">Done</th>
                      <th className="py-2 text-right font-medium">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(data.proctorMentees ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          No mentees currently assigned.
                        </td>
                      </tr>
                    ) : (
                      data.proctorMentees!.map((m) => (
                        <tr key={m.student_id}>
                          <td className="py-2.5 pr-3 font-mono font-semibold text-[#1E40AF] dark:text-blue-400">
                            {m.roll_number}
                          </td>
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{m.full_name}</p>
                            <p className="font-mono text-[10px] text-slate-500">{m.department_code}</p>
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{m.semester_name}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.requests_given}</td>
                          <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {m.feedbacks_completed}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                            {m.feedbacks_pending}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {(data.proctorReviews?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Proctor Mentee Reviews Across Subjects
                </h3>
                <span className="text-xs text-slate-500">Anonymous submissions protect student identity</span>
              </div>
              <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
                {data.proctorReviews!.slice(0, 10).map((rev) => (
                  <div key={rev.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {rev.subject_code}
                        </span>{' '}
                        · {rev.subject_name} · Faculty: {rev.instructor_name || 'Department Faculty'} ·{' '}
                        <span className="font-medium text-[#1E40AF] dark:text-blue-400">
                          {rev.respondent_display}
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {rev.overall_satisfaction.toFixed(1)} / 5
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{rev.comment_text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Saved Student Database (Faculty View) */}
      {(activeTab === 'all' || activeTab === 'students') && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Saved Student Database ({filteredStudentDb.length} Students)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Complete university student database with 4-digit SRN, department, semester (1–8), assigned proctor, and request completion counts.
              </p>
            </div>
            <input
              type="search"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search SRN, student, dept, or proctor..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:w-64 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">SRN</th>
                  <th className="py-2 font-medium">Student Name</th>
                  <th className="py-2 font-medium">Dept &amp; Program</th>
                  <th className="py-2 font-medium">Semester</th>
                  <th className="py-2 font-medium">Assigned Proctor</th>
                  <th className="py-2 text-right font-medium">Requests</th>
                  <th className="py-2 text-right font-medium">Completed</th>
                  <th className="py-2 text-right font-medium">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStudentDb.map((stu) => (
                  <tr key={stu.student_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 pr-3 font-mono font-semibold text-[#1E40AF] dark:text-blue-400">
                      {stu.roll_number}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{stu.full_name}</p>
                      <p className="font-mono text-[10px] text-slate-500">{stu.email}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      {stu.department_code} · {stu.course_code}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-slate-700 dark:text-slate-300">{stu.semester_name}</td>
                    <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-300">
                      {stu.proctor_name || 'Unassigned'}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{stu.requests_given}</td>
                    <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {stu.feedbacks_completed}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {stu.feedbacks_pending}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Teaching Recommendations */}
      {activeTab === 'all' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            AI Teaching Improvement Suggestions
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.recommendations.length === 0 ? (
              <p className="text-xs text-slate-500">
                Run &ldquo;Generate Executive Insights&rdquo; in AI Insights to receive personalized Gemini teaching recommendations.
              </p>
            ) : (
              data.recommendations.map((rec) => (
                <div key={rec.id} className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rec.recommendation_title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{rec.recommendation_body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 9: ADMIN DASHBOARD
// ---------------------------------------------------------------------------
export function AdminDashboardView({ catalog }: { catalog: CatalogData | null }) {
  const [data, setData] = useState<{
    kpis: {
      total_students: number;
      total_faculty: number;
      active_forms: number;
      total_submissions: number;
      avg_satisfaction: number | null;
      open_alerts: number;
    };
    recentSubmissions: Array<{
      id: number;
      status: string;
      is_anonymous: number;
      comment_text: string;
      submitted_at: string;
      form_title: string;
      subject_code: string;
      subject_name: string;
      department_name: string;
      faculty_name: string;
      student_display: string;
      overall_satisfaction: number;
      sentiment: string | null;
    }>;
    auditLogs: Array<{
      id: number;
      user_email: string;
      user_role: string;
      action: string;
      entity_type: string;
      created_at: string;
    }>;
    users: Array<{
      id: number;
      email: string;
      full_name: string;
      role: 'student' | 'faculty' | 'admin';
      is_active: number;
    }>;
  } | null>(null);
  const [forms, setForms] = useState<FeedbackFormItem[]>([]);
  const [newForm, setNewForm] = useState({
    title: '',
    description: '',
    department_id: '',
    open_date: '2026-11-21',
    close_date: '2026-12-30',
    question_text: 'How effective were the laboratory sessions and practical assignments?',
    question_type: 'star' as 'star' | 'slider' | 'radio' | 'text',
  });
  const [notif, setNotif] = useState({ target_role: 'student', title: '', message: '' });
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    const [dash, fRes] = await Promise.all([
      apiRequest<NonNullable<typeof data>>('/admin/dashboard'),
      apiRequest<{ forms: FeedbackFormItem[] }>('/feedback/forms'),
    ]);
    setData(dash);
    setForms(fRes.forms);
  }, []);

  useEffect(() => {
    loadAdmin().catch(() => null);
  }, [loadAdmin]);

  async function createCampaign(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/admin/feedback-forms', {
      method: 'POST',
      body: JSON.stringify({
        title: newForm.title,
        description: newForm.description || 'Institutional course and teaching evaluation.',
        department_id: newForm.department_id ? Number(newForm.department_id) : null,
        open_date: newForm.open_date,
        close_date: newForm.close_date,
        questions: [
          {
            question_text: newForm.question_text,
            question_type: newForm.question_type,
            category: 'Laboratory Facilities',
          },
        ],
      }),
    });
    setNewForm((f) => ({ ...f, title: '', description: '' }));
    setFeedbackBanner('Feedback campaign created and students notified.');
    await loadAdmin();
  }

  async function toggleCampaign(form: FeedbackFormItem) {
    await apiRequest(`/admin/feedback-forms/${form.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: form.is_active === 1 ? 0 : 1 }),
    });
    await loadAdmin();
  }

  async function deleteCampaign(id: number) {
    await apiRequest(`/admin/feedback-forms/${id}`, { method: 'DELETE' });
    await loadAdmin();
  }

  async function sendReminder(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ ...notif, category: 'deadline' }),
    });
    setNotif({ target_role: 'student', title: '', message: '' });
    setFeedbackBanner('Deadline notification dispatched.');
    await loadAdmin();
  }

  async function updateUserRole(userId: number, role: string, is_active: number) {
    await apiRequest(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role, is_active }),
    });
    await loadAdmin();
  }

  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />;

  return (
    <div className="space-y-6">
      {feedbackBanner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {feedbackBanner}
          </span>
          <button type="button" onClick={() => setFeedbackBanner(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        {[
          { label: 'Students', val: data.kpis.total_students },
          { label: 'Faculty', val: data.kpis.total_faculty },
          { label: 'Active Forms', val: data.kpis.active_forms },
          { label: 'Submissions', val: data.kpis.total_submissions },
          { label: 'Mean Score', val: data.kpis.avg_satisfaction ?? '—' },
          { label: 'Open AI Alerts', val: data.kpis.open_alerts },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">{k.val}</p>
          </div>
        ))}
      </div>

      {/* Campaign Builder + Notifications */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={createCampaign}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-[#111C2E]"
        >
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Create Feedback Campaign</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              value={newForm.title}
              onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Campaign title (e.g. End-Term Review)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <select
              value={newForm.department_id}
              onChange={(e) => setNewForm((f) => ({ ...f, department_id: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="">University-Wide (All Departments)</option>
              {(catalog?.departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                required
                value={newForm.open_date}
                onChange={(e) => setNewForm((f) => ({ ...f, open_date: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <input
                type="date"
                required
                value={newForm.close_date}
                onChange={(e) => setNewForm((f) => ({ ...f, close_date: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <input
              type="text"
              value={newForm.question_text}
              onChange={(e) => setNewForm((f) => ({ ...f, question_text: e.target.value }))}
              placeholder="Custom question prompt"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <select
              value={newForm.question_type}
              onChange={(e) =>
                setNewForm((f) => ({ ...f, question_type: e.target.value as 'star' | 'slider' | 'radio' | 'text' }))
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="star">Star Rating</option>
              <option value="slider">Slider</option>
              <option value="text">Text Response</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
          >
            <Plus className="h-4 w-4" />
            Launch Campaign
          </button>
        </form>

        <form
          onSubmit={sendReminder}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-[#111C2E]"
        >
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Dispatch Campaign &amp; Deadline Reminder
          </h3>
          <select
            value={notif.target_role}
            onChange={(e) => setNotif((n) => ({ ...n, target_role: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="student">All Students</option>
            <option value="faculty">All Faculty</option>
            <option value="all">University-Wide</option>
          </select>
          <input
            type="text"
            required
            value={notif.title}
            onChange={(e) => setNotif((n) => ({ ...n, title: e.target.value }))}
            placeholder="Reminder headline"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <textarea
            rows={2}
            required
            value={notif.message}
            onChange={(e) => setNotif((n) => ({ ...n, message: e.target.value }))}
            placeholder="Message body..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] dark:bg-blue-600"
          >
            <Send className="h-3.5 w-3.5" />
            Send Reminder
          </button>
        </form>
      </div>

      {/* Existing Campaigns */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Manage Feedback Campaigns</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Campaign Title</th>
                <th className="py-2 font-medium">Window</th>
                <th className="py-2 font-medium">QR Token</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {forms.map((f) => (
                <tr key={f.id}>
                  <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">{f.title}</td>
                  <td className="py-2.5 pr-3 font-mono text-slate-500">
                    {f.open_date} → {f.close_date}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-slate-600 dark:text-slate-300">{f.qr_token}</td>
                  <td className="py-2.5 pr-3">
                    <span className={f.is_active ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                      {f.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2.5 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => toggleCampaign(f)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {f.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCampaign(f.id)}
                      className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:hover:bg-red-950/40"
                      aria-label="Delete campaign"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Authorized Submissions + Audit Logs + Role Permissions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Recent Evaluations (Anonymous Protection Active)
          </h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">Respondent</th>
                  <th className="py-2 font-medium">Subject</th>
                  <th className="py-2 font-medium">AI Sentiment</th>
                  <th className="py-2 text-right font-medium">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentSubmissions.slice(0, 12).map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-200">{s.student_display}</td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      {s.subject_code} · {s.subject_name}
                    </td>
                    <td className="py-2.5 pr-3">{s.sentiment || 'Pending'}</td>
                    <td className="py-2.5 text-right font-mono font-semibold tabular-nums">
                      {s.overall_satisfaction?.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <Activity className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
            Security Audit Logs
          </h3>
          <div className="mt-4 max-h-72 space-y-2.5 overflow-y-auto pr-1 text-xs">
            {data.auditLogs.map((log) => (
              <div key={log.id} className="border-b border-slate-100 pb-2 dark:border-slate-800">
                <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{log.action}</span>
                  <span>{log.created_at}</span>
                </div>
                <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                  {log.user_email || 'system'} ({log.user_role || 'system'}) · {log.entity_type}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Role & Access Permissions */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">User Roles &amp; Account Permissions</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.users.slice(0, 15).map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">{u.full_name}</td>
                  <td className="py-2 pr-3 font-mono text-slate-500">{u.email}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateUserRole(u.id, e.target.value, u.is_active)}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="student">student</option>
                      <option value="faculty">faculty</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => updateUserRole(u.id, u.role, u.is_active ? 0 : 1)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-700"
                    >
                      {u.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 12: COURSE & SUBJECT MANAGEMENT
// ---------------------------------------------------------------------------
export function CoursesSubjectsView({
  catalog,
  onRefreshCatalog,
}: {
  catalog: CatalogData | null;
  onRefreshCatalog: () => Promise<void>;
}) {
  const [deptForm, setDeptForm] = useState({ code: '', name: '', head_name: '' });
  const [courseForm, setCourseForm] = useState({ department_id: '1', code: '', name: '' });
  const [subjectForm, setSubjectForm] = useState({
    department_id: '1',
    course_id: '1',
    semester_id: '5',
    faculty_id: '1',
    code: '',
    short_code: '',
    elective_group: 'Core',
    name: '',
    credits: '4',
  });
  const [msg, setMsg] = useState<string | null>(null);

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/admin/departments', { method: 'POST', body: JSON.stringify(deptForm) });
    setDeptForm({ code: '', name: '', head_name: '' });
    setMsg('Department added.');
    await onRefreshCatalog();
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/admin/courses', { method: 'POST', body: JSON.stringify(courseForm) });
    setCourseForm({ department_id: '1', code: '', name: '' });
    setMsg('Course added.');
    await onRefreshCatalog();
  }

  async function addSubject(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/admin/subjects', { method: 'POST', body: JSON.stringify(subjectForm) });
    setSubjectForm((s) => ({ ...s, code: '', short_code: '', name: '' }));
    setMsg('Subject created and assigned.');
    await onRefreshCatalog();
  }

  async function reassignTeacher(subjectId: number, facultyId: number) {
    await apiRequest(`/admin/subjects/${subjectId}`, {
      method: 'PUT',
      body: JSON.stringify({ faculty_id: facultyId }),
    });
    setMsg('Subject instructor updated.');
    await onRefreshCatalog();
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={addDepartment} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Add Department</h3>
          <input
            type="text"
            required
            placeholder="Code (e.g. BIO)"
            value={deptForm.code}
            onChange={(e) => setDeptForm((d) => ({ ...d, code: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="text"
            required
            placeholder="Department Name"
            value={deptForm.name}
            onChange={(e) => setDeptForm((d) => ({ ...d, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="text"
            required
            placeholder="Department Head"
            value={deptForm.head_name}
            onChange={(e) => setDeptForm((d) => ({ ...d, head_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button type="submit" className="w-full rounded-lg bg-[#1E40AF] py-2 text-xs font-semibold text-white">
            Create Department
          </button>
        </form>

        <form onSubmit={addCourse} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Add Course / Program</h3>
          <select
            value={courseForm.department_id}
            onChange={(e) => setCourseForm((c) => ({ ...c, department_id: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            {(catalog?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            placeholder="Program Code (e.g. 24BECSE)"
            value={courseForm.code}
            onChange={(e) => setCourseForm((c) => ({ ...c, code: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="text"
            required
            placeholder="Program Name"
            value={courseForm.name}
            onChange={(e) => setCourseForm((c) => ({ ...c, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button type="submit" className="w-full rounded-lg bg-[#1E40AF] py-2 text-xs font-semibold text-white">
            Create Program
          </button>
        </form>

        <form onSubmit={addSubject} className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Add Subject &amp; Assign Faculty</h3>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={subjectForm.department_id}
              onChange={(e) => setSubjectForm((s) => ({ ...s, department_id: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {(catalog?.departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                </option>
              ))}
            </select>
            <select
              value={subjectForm.course_id}
              onChange={(e) => setSubjectForm((s) => ({ ...s, course_id: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {(catalog?.courses ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={subjectForm.semester_id}
              onChange={(e) => setSubjectForm((s) => ({ ...s, semester_id: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {(catalog?.semesters ?? []).map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.name}
                </option>
              ))}
            </select>
            <select
              value={subjectForm.faculty_id}
              onChange={(e) => setSubjectForm((s) => ({ ...s, faculty_id: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {(catalog?.teachers ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              required
              placeholder="Code (e.g. 24BECSE501)"
              value={subjectForm.code}
              onChange={(e) => setSubjectForm((s) => ({ ...s, code: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              type="text"
              placeholder="Short Code (e.g. CCT)"
              value={subjectForm.short_code}
              onChange={(e) => setSubjectForm((s) => ({ ...s, short_code: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <input
            type="text"
            required
            placeholder="Subject Title"
            value={subjectForm.name}
            onChange={(e) => setSubjectForm((s) => ({ ...s, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button type="submit" className="w-full rounded-lg bg-[#0B192C] py-2 text-xs font-semibold text-white dark:bg-blue-600">
            Create Subject
          </button>
        </form>
      </div>

      {/* Departments & Program Codes Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            University Departments ({catalog?.departments.length ?? 0})
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 font-medium">Code</th>
                  <th className="py-1.5 font-medium">Department Name</th>
                  <th className="py-1.5 font-medium">Head</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(catalog?.departments ?? []).map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pr-3 font-mono font-semibold text-[#1E40AF] dark:text-blue-400">{d.code}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">{d.name}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-300">{d.head_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Program Codes &amp; Semesters (1 – 8)
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 font-medium">Program Code</th>
                  <th className="py-1.5 font-medium">Program Title</th>
                  <th className="py-1.5 font-medium">Department</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(catalog?.courses ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-mono font-semibold text-[#1E40AF] dark:text-blue-400">{c.code}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">{c.name}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-300">{c.department_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Active Semesters: {(catalog?.semesters ?? []).map((s) => s.name).join(' · ')}
          </p>
        </div>
      </div>

      {/* Subjects Directory with Live Reassignment */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
          <BookOpen className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
          University Subjects &amp; Faculty Assignments
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Course Code</th>
                <th className="py-2 font-medium">Short Code</th>
                <th className="py-2 font-medium">Course Name &amp; Track</th>
                <th className="py-2 font-medium">Department</th>
                <th className="py-2 font-medium">Semester</th>
                <th className="py-2 font-medium">Course Faculty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(catalog?.subjects ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="py-2.5 pr-3 font-mono font-semibold text-[#1E40AF] dark:text-blue-400">{s.code}</td>
                  <td className="py-2.5 pr-3 font-mono text-slate-700 dark:text-slate-300">{s.short_code || '—'}</td>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{s.name}</p>
                    {s.elective_group && s.elective_group !== 'Core' && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.elective_group}</p>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{s.department_name}</td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{s.semester_name}</td>
                  <td className="py-2.5">
                    <select
                      value={s.faculty_id ?? ''}
                      onChange={(e) => reassignTeacher(s.id, Number(e.target.value))}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      {(catalog?.teachers ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 13: TEACHER MANAGEMENT
// ---------------------------------------------------------------------------
export function TeachersManagementView({
  catalog,
  onRefreshCatalog,
}: {
  catalog: CatalogData | null;
  onRefreshCatalog: () => Promise<void>;
}) {
  const [teachers, setTeachers] = useState<CatalogData['teachers']>([]);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    department_id: '1',
    employee_code: '',
    designation: 'Assistant Professor',
    specialization: '',
  });
  const [msg, setMsg] = useState<string | null>(null);

  const loadTeachers = useCallback(async () => {
    const res = await apiRequest<{ faculty: CatalogData['teachers'] }>('/faculty');
    setTeachers(res.faculty);
  }, []);

  useEffect(() => {
    loadTeachers().catch(() => null);
  }, [loadTeachers]);

  async function handleAddFaculty(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/admin/faculty', { method: 'POST', body: JSON.stringify(form) });
    setForm({
      full_name: '',
      email: '',
      password: '',
      department_id: '1',
      employee_code: '',
      designation: 'Assistant Professor',
      specialization: '',
    });
    setMsg('Faculty profile created.');
    await Promise.all([loadTeachers(), onRefreshCatalog()]);
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {msg}
        </div>
      )}

      <form
        onSubmit={handleAddFaculty}
        className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]"
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
          <UserPlus className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
          Add Faculty Member
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            type="text"
            required
            placeholder="Full Name"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="email"
            required
            placeholder="Faculty Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Initial Password (8+ chars)"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            value={form.department_id}
            onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            {(catalog?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            placeholder="Employee Code (e.g. FAC-108)"
            value={form.employee_code}
            onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="text"
            placeholder="Specialization"
            value={form.specialization}
            onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button type="submit" className="mt-4 rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white">
          Register Faculty
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Faculty Roster &amp; Aggregate Scores</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Code</th>
                <th className="py-2 font-medium">Faculty Member</th>
                <th className="py-2 font-medium">Department</th>
                <th className="py-2 font-medium">Designation</th>
                <th className="py-2 text-right font-medium">Subjects</th>
                <th className="py-2 text-right font-medium">Mean Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td className="py-2.5 pr-3 font-mono text-slate-500">{t.employee_code}</td>
                  <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">{t.full_name}</td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{t.department_name}</td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{t.designation}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{t.subject_count ?? 0}</td>
                  <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-[#1E40AF] dark:text-blue-400">
                    {t.avg_rating ? Number(t.avg_rating).toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 14: STUDENT MANAGEMENT & 8-SEMESTER TRACKING ACROSS DEPARTMENTS
// ---------------------------------------------------------------------------
export function StudentsManagementView({ catalog }: { catalog?: CatalogData | null }) {
  const [search, setSearch] = useState('');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [tracking, setTracking] = useState<DepartmentSemesterTrackingResponse | null>(null);
  const [students, setStudents] = useState<
    Array<{
      id: number;
      user_id: number;
      full_name: string;
      email: string;
      is_active: number;
      roll_number: string;
      batch_year: number;
      department_id: number;
      semester_id: number;
      proctor_faculty_id: number | null;
      proctor_name: string | null;
      proctor_employee_code: string | null;
      department_code: string;
      department_name: string;
      course_code: string;
      course_name: string;
      semester_name: string;
      term_order: number;
      submissions_count: number;
      requests_count: number;
      completed_requests_count: number;
    }>
  >([]);
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    email: '',
    password: '',
    department_id: '1',
    course_id: '1',
    semester_id: '5',
    proctor_faculty_id: '',
    roll_number: '',
    batch_year: '2024',
  });
  const [stuMsg, setStuMsg] = useState<string | null>(null);
  const [stuErr, setStuErr] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    const [stuRes, trackRes] = await Promise.all([
      apiRequest<{ students: typeof students }>(`/students?search=${encodeURIComponent(search)}`),
      apiRequest<DepartmentSemesterTrackingResponse>('/analytics/semester-tracking'),
    ]);
    setStudents(stuRes.students);
    setTracking(trackRes);
  }, [search]);

  useEffect(() => {
    loadStudents().catch(() => null);
  }, [loadStudents]);

  const deptCourses = (catalog?.courses ?? []).filter(
    (c) => String(c.department_id) === newStudent.department_id
  );
  const selectedNewDept = (catalog?.departments ?? []).find((d) => String(d.id) === newStudent.department_id);
  const newPrefix = getSuggestedEnrollmentPrefix(selectedNewDept?.code, Number(newStudent.batch_year) || 2024);

  async function addStudentRecord(e: FormEvent) {
    e.preventDefault();
    setStuMsg(null);
    setStuErr(null);
    try {
      const res = await apiRequest<{ roll_number: string; message: string }>('/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          full_name: newStudent.full_name,
          email: newStudent.email,
          password: newStudent.password || undefined,
          department_id: Number(newStudent.department_id),
          course_id: Number(newStudent.course_id),
          semester_id: Number(newStudent.semester_id),
          proctor_faculty_id: newStudent.proctor_faculty_id ? Number(newStudent.proctor_faculty_id) : undefined,
          roll_number: newStudent.roll_number.trim() ? newStudent.roll_number.trim().toUpperCase() : undefined,
          batch_year: Number(newStudent.batch_year) || 2024,
        }),
      });
      setNewStudent((s) => ({ ...s, full_name: '', email: '', password: '', roll_number: '' }));
      setStuMsg(res.message);
      await loadStudents();
    } catch (err) {
      setStuErr(err instanceof Error ? err.message : 'Unable to save student record.');
    }
  }

  async function assignStudentProctor(studentId: number, proctorFacultyId: number) {
    await apiRequest(`/admin/students/${studentId}/proctor`, {
      method: 'PUT',
      body: JSON.stringify({ proctor_faculty_id: proctorFacultyId || null }),
    });
    setStuMsg('Student proctor assignment updated.');
    await loadStudents();
  }

  async function toggleStudentStatus(userId: number, currentActive: number) {
    await apiRequest(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: currentActive ? 0 : 1 }),
    });
    await loadStudents();
  }

  const filteredStudents = students.filter((s) => {
    if (semesterFilter !== 'all' && String(s.semester_id) !== semesterFilter) return false;
    if (departmentFilter !== 'all' && String(s.department_id) !== departmentFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 8-Semester Tracking Across All Departments */}
      {tracking && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                8-Semester Tracking Across Departments
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enrollment, scheduled subjects, and feedback submissions across Semesters 1–8 for all university departments.
              </p>
            </div>
            <span className="font-mono text-xs text-[#1E40AF] dark:text-blue-400">
              Format: 24SUU[PROGRAM]0001
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Department</th>
                  <th className="py-2 pr-3 font-medium">ID Prefix</th>
                  {tracking.semesters.map((sem) => (
                    <th key={sem.id} className="px-2 py-2 text-center font-medium">
                      <span className={sem.is_current ? 'font-bold text-[#1E40AF] dark:text-blue-400' : ''}>
                        S{sem.term_order}
                      </span>
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tracking.departments.map((dept) => (
                  <tr key={dept.department_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{dept.department_name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{dept.head_name}</p>
                    </td>
                    <td className="py-2.5 pr-3 font-mono font-semibold text-[#1E40AF] dark:text-blue-400">
                      {dept.program_prefix}0001
                    </td>
                    {dept.semesters.map((cell) => {
                      const hasActivity =
                        cell.enrolled_students > 0 || cell.subjects_count > 0 || cell.submitted_feedbacks > 0;
                      return (
                        <td key={cell.semester_id} className="px-2 py-2 text-center">
                          <div
                            className={`rounded border px-1.5 py-1 font-mono text-[10px] tabular-nums ${
                              hasActivity
                                ? 'border-blue-200 bg-blue-50/60 text-slate-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-slate-200'
                                : 'border-slate-100 text-slate-400 dark:border-slate-800/80 dark:text-slate-600'
                            }`}
                            title={`${dept.department_code} ${cell.semester_name}: ${cell.enrolled_students} students, ${cell.subjects_count} subjects, ${cell.submitted_feedbacks} feedback submissions`}
                          >
                            <div>{cell.enrolled_students}st · {cell.subjects_count}sb</div>
                            <div className="font-semibold text-[#1E40AF] dark:text-blue-400">
                              {cell.submitted_feedbacks}fb
                            </div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      <div>{dept.total_students} stu</div>
                      <div className="text-[11px] text-[#1E40AF] dark:text-blue-400">{dept.total_submissions} fb</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            Legend: <span className="font-mono">st</span> = Enrolled Students ·{' '}
            <span className="font-mono">sb</span> = Department Subjects ·{' '}
            <span className="font-mono">fb</span> = Submitted Feedbacks
          </p>
        </div>
      )}

      {/* Save New Student Record (4-Digit SRN & Proctor) */}
      <form
        onSubmit={addStudentRecord}
        className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
              <UserPlus className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
              Save Student Database Record (4-Digit SRN)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create persistent student records with auto-sequenced 4-digit SRN ({newPrefix}0001), semester (1–8), and assigned proctor.
            </p>
          </div>
          {stuMsg && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{stuMsg}</span>}
          {stuErr && <span className="text-xs font-medium text-red-600 dark:text-red-400">{stuErr}</span>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            type="text"
            required
            placeholder="Student Full Name"
            value={newStudent.full_name}
            onChange={(e) => setNewStudent((s) => ({ ...s, full_name: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <input
            type="email"
            required
            placeholder="student@sapthagiri.edu"
            value={newStudent.email}
            onChange={(e) => setNewStudent((s) => ({ ...s, email: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <input
            type="text"
            placeholder={`SRN (optional, e.g. ${newPrefix}0042)`}
            value={newStudent.roll_number}
            onChange={(e) => setNewStudent((s) => ({ ...s, roll_number: e.target.value.toUpperCase() }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <select
            value={newStudent.department_id}
            onChange={(e) => {
              const nextDeptId = e.target.value;
              const matchingCourse = (catalog?.courses ?? []).find((c) => String(c.department_id) === nextDeptId);
              setNewStudent((s) => ({
                ...s,
                department_id: nextDeptId,
                course_id: matchingCourse ? String(matchingCourse.id) : s.course_id,
              }));
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {(catalog?.departments ?? []).map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>
          <select
            value={newStudent.course_id}
            onChange={(e) => setNewStudent((s) => ({ ...s, course_id: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {(deptCourses.length > 0 ? deptCourses : catalog?.courses ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          <select
            value={newStudent.semester_id}
            onChange={(e) => setNewStudent((s) => ({ ...s, semester_id: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {(catalog?.semesters ?? tracking?.semesters ?? []).map((sem) => (
              <option key={sem.id} value={String(sem.id)}>
                {sem.name}
              </option>
            ))}
          </select>
          <select
            value={newStudent.proctor_faculty_id}
            onChange={(e) => setNewStudent((s) => ({ ...s, proctor_faculty_id: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">Auto-Assign Dept Proctor</option>
            {(catalog?.teachers ?? []).map((t) => (
              <option key={t.id} value={String(t.id)}>
                Proctor: {t.full_name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
          >
            Save Student to DB
          </button>
        </div>
      </form>

      {/* Student Enrollment Registry */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Student Enrollment Registry</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search students by 4-digit 24SUU SRN, assign proctors, inspect feedback request completion, and manage portal access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="all">All Departments</option>
              {(catalog?.departments ?? []).map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
            <select
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="all">All Semesters (1–8)</option>
              {(catalog?.semesters ?? tracking?.semesters ?? []).map((sem) => (
                <option key={sem.id} value={String(sem.id)}>
                  {sem.name}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, 24SUU SRN, or email..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:w-64 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Enrollment SRN</th>
                <th className="py-2 font-medium">Student Name</th>
                <th className="py-2 font-medium">Department &amp; Course</th>
                <th className="py-2 font-medium">Semester</th>
                <th className="py-2 font-medium">Assigned Proctor</th>
                <th className="py-2 text-right font-medium">Requests</th>
                <th className="py-2 text-right font-medium">Submissions</th>
                <th className="py-2 text-right font-medium">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredStudents.map((s) => (
                <tr key={s.id}>
                  <td className="py-2.5 pr-3 font-mono font-medium text-[#1E40AF] dark:text-blue-400">{s.roll_number}</td>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{s.full_name}</p>
                    <p className="font-mono text-[11px] text-slate-500">{s.email}</p>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                    {s.department_name} · {s.course_code || s.course_name}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-slate-700 dark:text-slate-300">{s.semester_name}</td>
                  <td className="py-2.5 pr-3">
                    <select
                      value={s.proctor_faculty_id ? String(s.proctor_faculty_id) : ''}
                      onChange={(e) => assignStudentProctor(s.id, Number(e.target.value))}
                      aria-label={`Assign proctor for ${s.roll_number}`}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">Unassigned</option>
                      {(catalog?.teachers ?? []).map((t) => (
                        <option key={t.id} value={String(t.id)}>
                          {t.full_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                    {s.completed_requests_count ?? 0}/{s.requests_count ?? 0}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{s.submissions_count}</td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleStudentStatus(s.user_id, s.is_active)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-700"
                    >
                      {s.is_active ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 15: REPORTS, QR & FLASK/MYSQL/VERCEL EXPORT BUNDLE
// ---------------------------------------------------------------------------
export function ReportsExportView() {
  const [bundleFiles, setBundleFiles] = useState<Array<{ path: string; content: string; category: string }>>([]);
  const [selectedFile, setSelectedFile] = useState<string>('database/schema.sql');
  const [forms, setForms] = useState<FeedbackFormItem[]>([]);
  const [qrResult, setQrResult] = useState<{
    qrDataUrl: string;
    targetUrl: string;
    title: string;
    qrToken: string;
  } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ files: typeof bundleFiles }>('/export/bundle-files')
      .then((res) => setBundleFiles(res.files))
      .catch(() => null);
    apiRequest<{ forms: FeedbackFormItem[] }>('/feedback/forms')
      .then((res) => setForms(res.forms))
      .catch(() => null);
  }, []);

  async function generateQr(form: FeedbackFormItem) {
    setQrError(null);
    try {
      const lookupKey = form.qr_token || String(form.id);
      const res = await apiRequest<{ qrDataUrl: string; targetUrl: string; form?: { qr_token?: string } }>(
        `/feedback/forms/qr/${encodeURIComponent(lookupKey)}`
      );
      setQrResult({
        qrDataUrl: res.qrDataUrl,
        targetUrl: res.targetUrl,
        title: form.title,
        qrToken: res.form?.qr_token || form.qr_token,
      });
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Unable to generate campaign QR code.');
    }
  }

  const activeFile = bundleFiles.find((f) => f.path === selectedFile) || bundleFiles[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
          <FileSpreadsheet className="h-6 w-6 text-[#1E40AF] dark:text-blue-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">CSV Analytics Export</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Privacy-scrubbed dataset of all authorized feedback ratings, categories, and sentiments.
          </p>
          <button
            type="button"
            onClick={() => downloadAuthenticatedBlob('/reports/export/csv', 'sapthagiri_feedback_report.csv')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] dark:bg-blue-600"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV Report
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
          <FileText className="h-6 w-6 text-[#1E40AF] dark:text-blue-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">PDF Institutional Report</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Formatted executive report with department averages, faculty summaries, and Gemini AI narrative.
          </p>
          <button
            type="button"
            onClick={() => downloadAuthenticatedBlob('/reports/export/pdf', 'sapthagiri_institutional_report.pdf')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF Report
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
          <Archive className="h-6 w-6 text-[#1E40AF] dark:text-blue-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
            Flask + MySQL + Vercel Project (.zip)
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Complete Python Flask backend, 18-table MySQL schema, Vanilla HTML/CSS/JS, Docker Compose, GitHub CI &amp; Vercel config.
          </p>
          <button
            type="button"
            onClick={() => downloadAuthenticatedBlob('/export/project-zip', 'sapthagiri-flask-mysql-vercel.zip')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
          >
            <Download className="h-3.5 w-3.5" />
            Download Full Bundle (.zip)
          </button>
        </div>
      </div>

      {/* QR Code Generator */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
          <QrCode className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
          Campaign QR Code Generator
        </h3>
        {qrError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {qrError}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {forms.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => generateQr(f)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:border-[#1E40AF] dark:border-slate-700 dark:text-slate-200"
            >
              {f.title} <span className="ml-1 font-mono text-[11px] text-slate-400">({f.qr_token})</span>
            </button>
          ))}
        </div>
        {qrResult && (
          <div className="mt-5 flex flex-col items-start gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center dark:border-slate-800">
            <img src={qrResult.qrDataUrl} alt="Campaign QR Code" className="h-36 w-36 rounded-lg border border-slate-200 bg-white p-2" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{qrResult.title}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">Token: {qrResult.qrToken}</p>
              <a
                href={qrResult.targetUrl}
                className="mt-1.5 inline-block break-all font-mono text-xs text-[#1E40AF] underline dark:text-blue-400"
              >
                {qrResult.targetUrl}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Flask/MySQL/Docker/Vercel File Inspector */}
      {bundleFiles.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Exported Python Flask, MySQL, Docker &amp; Vercel Source Inspector
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect deployment files before pushing to GitHub and importing into Vercel.
              </p>
            </div>
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {bundleFiles.map((f) => (
                <option key={f.path} value={f.path}>
                  [{f.category}] {f.path}
                </option>
              ))}
            </select>
          </div>
          {activeFile && (
            <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 dark:border-slate-800">
              {activeFile.content || '# Empty package initializer'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 16: PROFILE & SETTINGS
// ---------------------------------------------------------------------------
export function ProfileSettingsView({
  user,
  catalog,
  onUserUpdated,
  isDark,
  onToggleTheme,
}: {
  user: AuthUser;
  catalog?: CatalogData | null;
  onUserUpdated: (u: AuthUser) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone || '');
  const [language, setLanguage] = useState<LanguageCode>(user.preferred_language);
  const [newPassword, setNewPassword] = useState('');

  // Student-specific enrollment & 8-semester state
  const [rollNumber, setRollNumber] = useState('');
  const [departmentId, setDepartmentId] = useState<number>(1);
  const [courseId, setCourseId] = useState<number>(1);
  const [semesterId, setSemesterId] = useState<number>(5);
  const [batchYear, setBatchYear] = useState<number>(2024);
  const [proctorLabel, setProctorLabel] = useState<string>('');
  const [tracking, setTracking] = useState<SemesterTrackingItem[]>([]);

  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user.role !== 'student') return;
    apiRequest<{ profile: StudentProfileRecord; eightSemesterTracking: SemesterTrackingItem[] }>(
      '/students/profile'
    )
      .then((res) => {
        if (res.profile) {
          setRollNumber(res.profile.roll_number);
          setDepartmentId(res.profile.department_id);
          setCourseId(res.profile.course_id);
          setSemesterId(res.profile.semester_id);
          setBatchYear(res.profile.batch_year || 2024);
          setFullName(res.profile.full_name);
          setPhone(res.profile.phone || '');
          setLanguage(res.profile.preferred_language || 'en');
          setProctorLabel(
            res.profile.proctor_name
              ? `${res.profile.proctor_name}${res.profile.proctor_employee_code ? ` (${res.profile.proctor_employee_code})` : ''}`
              : 'Department Proctor'
          );
        }
        setTracking(res.eightSemesterTracking || []);
      })
      .catch(() => null);
  }, [user.role]);

  const filteredCourses = (catalog?.courses ?? []).filter((c) => c.department_id === departmentId);
  const selectedDept = (catalog?.departments ?? []).find((d) => d.id === departmentId);
  const suggestedPrefix = getSuggestedEnrollmentPrefix(selectedDept?.code, batchYear);
  const normalizedRoll = rollNumber.trim().toUpperCase();
  const isRollInvalid = user.role === 'student' && normalizedRoll.length > 0 && !isValidEnrollmentFormat(normalizedRoll);

  useEffect(() => {
    if (filteredCourses.length > 0 && !filteredCourses.some((c) => c.id === courseId)) {
      setCourseId(filteredCourses[0].id);
    }
  }, [departmentId, filteredCourses, courseId]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErrMsg(null);

    if (user.role === 'student') {
      if (!normalizedRoll || !isValidEnrollmentFormat(normalizedRoll)) {
        setErrMsg(`Enrollment number (SRN) must follow the ${suggestedPrefix}0001 format (e.g. ${suggestedPrefix}0001).`);
        return;
      }
      try {
        const res = await apiRequest<{
          message: string;
          user: AuthUser;
          profile: StudentProfileRecord;
          eightSemesterTracking: SemesterTrackingItem[];
        }>('/students/profile', {
          method: 'PUT',
          body: JSON.stringify({
            full_name: fullName,
            phone,
            preferred_language: language,
            new_password: newPassword || undefined,
            roll_number: normalizedRoll,
            department_id: departmentId,
            course_id: courseId,
            semester_id: semesterId,
            batch_year: batchYear,
          }),
        });
        setNewPassword('');
        setTracking(res.eightSemesterTracking || []);
        onUserUpdated(res.user);
        setMsg('Student enrollment profile and semester tracking updated.');
      } catch (err) {
        setErrMsg(err instanceof Error ? err.message : 'Unable to save student profile.');
      }
      return;
    }

    try {
      const res = await apiRequest<{ user: AuthUser }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: fullName,
          phone,
          preferred_language: language,
          new_password: newPassword || undefined,
        }),
      });
      setNewPassword('');
      onUserUpdated(res.user);
      setMsg('Profile preferences saved.');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form
        onSubmit={saveProfile}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]"
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Account Profile &amp; Preferences</h2>
        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            {msg}
          </div>
        )}
        {errMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {errMsg}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Email</label>
          <input
            type="text"
            disabled
            value={user.email}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Full Name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {user.role === 'student' && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Academic Enrollment &amp; Semester Details
              </h3>
              <span className="font-mono text-[11px] text-[#1E40AF] dark:text-blue-400">
                Format: {suggestedPrefix}0001
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Enrollment Number / SRN (4-Digit)
                </label>
                <input
                  type="text"
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                  placeholder={`${suggestedPrefix}0001`}
                  className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm dark:bg-slate-900 dark:text-white ${
                    isRollInvalid
                      ? 'border-red-500'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                {isRollInvalid && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                    Must match 24SUUBECS0001 pattern (YY + SUU + Program + 4 digits).
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Batch Year</label>
                <select
                  value={batchYear}
                  onChange={(e) => setBatchYear(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {[2022, 2023, 2024, 2025, 2026].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Department</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {(catalog?.departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Course / Program
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {filteredCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Enrolled Semester (1 – 8)
                </label>
                <select
                  value={semesterId}
                  onChange={(e) => setSemesterId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {(catalog?.semesters ?? []).map((sem) => (
                    <option key={sem.id} value={sem.id}>
                      {sem.name} ({sem.academic_year_label})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Assigned Proctor
                </label>
                <input
                  type="text"
                  disabled
                  value={proctorLabel || 'Assigned automatically by department'}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300"
                />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Interface Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((c) => (
                <option key={c} value={c}>
                  {LANGUAGE_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Change Password (optional, min 8 characters)
          </label>
          <input
            type="password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </button>
          <button
            type="submit"
            className="rounded-lg bg-[#1E40AF] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
          >
            {user.role === 'student' ? 'Save Enrollment & Preferences' : 'Save Preferences'}
          </button>
        </div>
      </form>

      {user.role === 'student' && tracking.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            8-Semester Progression Summary
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tracks all 8 semesters for your enrolled department ({selectedDept?.name || 'CSE'}).
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">Semester</th>
                  <th className="py-2 font-medium">Academic Year</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Dept Subjects</th>
                  <th className="py-2 text-right font-medium">Submitted</th>
                  <th className="py-2 text-right font-medium">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tracking.map((sem) => (
                  <tr
                    key={sem.semester_id}
                    className={sem.is_enrolled_semester ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''}
                  >
                    <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">{sem.semester_name}</td>
                    <td className="py-2 pr-3 font-mono text-slate-600 dark:text-slate-300">{sem.academic_year_label}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`font-semibold ${
                          sem.is_enrolled_semester
                            ? 'text-[#1E40AF] dark:text-blue-400'
                            : sem.status === 'Completed'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {sem.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{sem.department_subjects}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-[#1E40AF] dark:text-blue-400">
                      {sem.submitted_count}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {sem.avg_satisfaction ? `${sem.avg_satisfaction.toFixed(2)} / 5` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 17: HELP, SUPPORT & AI FEEDBACK ASSISTANT CHATBOT
// ---------------------------------------------------------------------------
export function HelpSupportView({ language }: { language: LanguageCode }) {
  const t = TRANSLATIONS[language];
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string }>>([
    {
      sender: 'assistant',
      text: 'Hello! Ask me about active feedback deadlines, saving drafts, editing submissions, QR access, or how anonymous protection works.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  async function askAssistant(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    setMessages((m) => [...m, { sender: 'user', text: q }]);
    setInput('');
    setSending(true);
    try {
      const res = await apiRequest<{ reply: string }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: q, language }),
      });
      setMessages((m) => [...m, { sender: 'assistant', text: res.reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          sender: 'assistant',
          text: err instanceof Error ? err.message : 'Unable to reach Gemini assistant right now.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-[#111C2E]">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <HelpCircle className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
          Academic Feedback Guidelines
        </h2>
        <div className="divide-y divide-slate-200 text-xs dark:divide-slate-800">
          <div className="py-3">
            <p className="font-semibold text-slate-900 dark:text-slate-100">How is anonymity protected?</p>
            <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
              When &ldquo;Submit Anonymously&rdquo; is enabled, backend API routes strip student IDs, names, and roll numbers from all faculty dashboards, admin review tables, and CSV/PDF exports.
            </p>
          </div>
          <div className="py-3">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Can I edit a submitted evaluation?</p>
            <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
              Yes. Both saved drafts and submitted evaluations can be updated from Feedback History until the campaign&apos;s closing date.
            </p>
          </div>
          <div className="py-3">
            <p className="font-semibold text-slate-900 dark:text-slate-100">How are duplicate submissions prevented?</p>
            <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
              A database unique constraint on (form_id, student_id, subject_id) prevents duplicate entries for the same course within a campaign.
            </p>
          </div>
        </div>
      </div>

      {/* Live Gemini AI Assistant Chatbot */}
      <div className="flex h-[480px] flex-col rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <MessageSquare className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
            {t.helpTitle}
          </h3>
          <span className="font-mono text-xs text-slate-500">{LANGUAGE_LABELS[language]}</span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto py-4 pr-1">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                m.sender === 'user'
                  ? 'ml-auto bg-[#1E40AF] text-white'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div className="max-w-[60%] rounded-xl bg-slate-100 px-4 py-2.5 text-xs text-slate-500 dark:bg-slate-800">
              Thinking...
            </div>
          )}
        </div>

        <form onSubmit={askAssistant} className="flex items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.askAssistantPlaceholder}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60 dark:bg-blue-600"
          >
            {t.sendMessage}
          </button>
        </form>
      </div>
    </div>
  );
}
