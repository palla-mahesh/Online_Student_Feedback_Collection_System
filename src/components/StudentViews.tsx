import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  QrCode,
  Save,
  Send,
  Shield,
  Star,
  X,
} from 'lucide-react';
import { apiRequest, downloadAuthenticatedBlob } from '../api.ts';
import { LANGUAGE_LABELS, TRANSLATIONS } from '../i18n.ts';
import type {
  CatalogData,
  FeedbackFormItem,
  LanguageCode,
  PageId,
  SemesterTrackingItem,
} from '../types.ts';

interface StudentDashboardData {
  student: {
    id: number;
    department_id: number;
    course_id: number;
    department_name: string;
    course_code?: string;
    course_name: string;
    semester_name?: string;
    academic_year_label?: string;
    roll_number: string;
  } | null;
  activeForms: FeedbackFormItem[];
  mySubmissions: Array<{
    id: number;
    form_id: number;
    subject_id: number;
    status: string;
    is_anonymous: number;
    submitted_at: string;
    subject_name: string;
    subject_code: string;
  }>;
  progress: {
    submittedCount: number;
    draftCount: number;
    totalAvailable: number;
    completionPercent: number;
  };
  eightSemesterTracking: SemesterTrackingItem[];
  leaderboard: Array<{
    code: string;
    department_name: string;
    enrolled_students: number;
    completed_evaluations: number;
    participation_rate: number;
  }>;
  notifications: Array<{
    id: number;
    title: string;
    message: string;
    category: string;
    created_at: string;
  }>;
}

interface StudentDashboardProps {
  onNavigate: (page: PageId) => void;
  onSelectFormForSubmission: (formId: number, subjectId?: number, editEntry?: HistoryRow | null) => void;
}

export interface HistoryRow {
  id: number;
  form_id: number;
  subject_id: number;
  status: 'draft' | 'submitted';
  is_anonymous: number;
  comment_text: string;
  submitted_at: string;
  updated_at: string;
  form_title: string;
  close_date: string;
  is_active: number;
  can_edit: boolean;
  subject_code: string;
  short_code?: string | null;
  elective_group?: string | null;
  subject_name: string;
  course_code?: string;
  course_name?: string;
  semester_name?: string;
  roll_number?: string;
  department_name: string;
  faculty_name: string | null;
  teaching_quality: number;
  communication: number;
  punctuality: number;
  subject_knowledge: number;
  methodology: number;
  classroom_environment: number;
  infrastructure: number;
  overall_satisfaction: number;
}

export function StudentDashboardView({
  onNavigate,
  onSelectFormForSubmission,
}: StudentDashboardProps) {
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState<{
    formId: number;
    qrToken: string;
    title: string;
    qrDataUrl: string;
    targetUrl: string;
  } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiRequest<StudentDashboardData>('/students/dashboard')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  async function openQrCode(formId: number, qrToken: string, title: string) {
    setQrError(null);
    setCopiedUrl(false);
    try {
      const lookupKey = qrToken || String(formId);
      const res = await apiRequest<{ qrDataUrl: string; targetUrl: string; form?: { qr_token?: string } }>(
        `/feedback/forms/qr/${encodeURIComponent(lookupKey)}`
      );
      setQrModal({
        formId,
        qrToken: res.form?.qr_token || qrToken,
        title,
        qrDataUrl: res.qrDataUrl,
        targetUrl: res.targetUrl,
      });
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Unable to load campaign QR code.');
    }
  }

  function copyLink(url: string) {
    navigator.clipboard?.writeText(url).catch(() => null);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-xl bg-slate-200 lg:col-span-2 dark:bg-slate-800" />
          <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Progress & Enrollment Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 md:col-span-2 dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Semester Feedback Completion
            </p>
            <span className="font-mono text-sm font-semibold text-[#1E40AF] tabular-nums dark:text-blue-400">
              {data.progress.completionPercent}%
            </span>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-[#1E40AF] transition-all duration-300 dark:bg-blue-500"
              style={{ width: `${data.progress.completionPercent}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
            {data.progress.submittedCount} submitted · {data.progress.draftCount} saved drafts ·{' '}
            {data.progress.totalAvailable} active campaigns
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Enrolled Program</p>
          <p className="mt-1.5 font-mono text-base font-bold tracking-tight text-[#1E40AF] dark:text-blue-400">
            {data.student?.roll_number || '24SUUBECS001'}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">
            {data.student?.course_code ? `${data.student.course_code} · ` : ''}
            {data.student?.course_name || 'B.E. Computer Science & Engineering'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {data.student?.department_name || 'Computer Science & Engineering'} ·{' '}
            {data.student?.semester_name || 'Semester 5'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Quick Actions</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onNavigate('feedback-submit')}
              className="w-full rounded-lg bg-[#1E40AF] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] transition-colors dark:bg-blue-600"
            >
              Start Evaluation
            </button>
            <button
              type="button"
              onClick={() => onNavigate('feedback-history')}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              View Submission History
            </button>
          </div>
        </div>
      </div>

      {/* 8-Semester Progression & Feedback Tracking */}
      {data.eightSemesterTracking?.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                8-Semester Academic &amp; Feedback Tracking
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Semester 1 to Semester 8 milestone overview for {data.student?.department_name || 'your department'}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="text-xs font-medium text-[#1E40AF] hover:underline dark:text-blue-400"
            >
              Update Enrollment &amp; Semester
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {data.eightSemesterTracking.map((sem) => (
              <div
                key={sem.semester_id}
                className={`rounded-lg border p-3 ${
                  sem.is_enrolled_semester
                    ? 'border-[#1E40AF] bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/40'
                    : sem.status === 'Completed'
                    ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                    : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    S{sem.term_order}
                  </span>
                  <span
                    className={`text-[10px] font-semibold ${
                      sem.is_enrolled_semester
                        ? 'text-[#1E40AF] dark:text-blue-400'
                        : sem.status === 'Completed'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {sem.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] font-medium text-slate-700 dark:text-slate-300">
                  {sem.academic_year_label}
                </p>
                <div className="mt-2 space-y-0.5 border-t border-slate-200/70 pt-2 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Subjects</span>
                    <span className="font-mono font-semibold tabular-nums">{sem.department_subjects}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Feedbacks</span>
                    <span className="font-mono font-semibold tabular-nums text-[#1E40AF] dark:text-blue-400">
                      {sem.submitted_count}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Split: Active Campaigns + Notifications/Leaderboard */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Active Feedback Campaigns
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Select a campaign to evaluate your courses or scan a campaign QR code for mobile submission.
            </p>
            {qrError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {qrError}
              </div>
            )}

            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {data.activeForms.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">No active feedback campaigns at this time.</p>
              ) : (
                data.activeForms.map((form) => {
                  const submittedForForm = data.mySubmissions.filter(
                    (s) => s.form_id === form.id && s.status === 'submitted'
                  ).length;
                  return (
                    <div key={form.id} className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{form.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {form.semester_name} · Code:{' '}
                          <span className="font-mono font-semibold text-[#1E40AF] dark:text-blue-400">{form.qr_token}</span> · Closes{' '}
                          <span className="font-mono text-slate-700 dark:text-slate-300">{form.close_date}</span> ·{' '}
                          {submittedForForm > 0 ? `${submittedForForm} submitted` : 'Pending'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openQrCode(form.id, form.qr_token, form.title)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          QR Code
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectFormForSubmission(form.id)}
                          className="rounded-lg bg-[#0B192C] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1E40AF] transition-colors dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          Open Form
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Department Aggregate Participation Leaderboard */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Department Participation Leaderboard
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Aggregate response rates only — individual student ratings remain confidential.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 font-medium">Department</th>
                    <th className="py-2 text-right font-medium">Evaluations</th>
                    <th className="py-2 text-right font-medium">Participation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {data.leaderboard.map((row) => (
                    <tr key={row.code}>
                      <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                        {row.department_name}{' '}
                        <span className="font-mono text-slate-400">({row.code})</span>
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {row.completed_evaluations}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-[#1E40AF] dark:text-blue-400">
                        {row.participation_rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Notifications & Deadline Reminders */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Campaign &amp; Deadline Reminders
              </h2>
            </div>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {data.notifications.map((n) => (
                <div key={n.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                    <span className="font-mono text-[11px] text-slate-400">{n.category}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Direct QR Feedback Access</h3>
                <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">{qrModal.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-[#1E40AF] dark:text-blue-400">
                  Campaign Token: {qrModal.qrToken}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center rounded-xl border border-slate-200 bg-white p-4">
              <img src={qrModal.qrDataUrl} alt="Feedback form QR code" className="h-48 w-48" />
            </div>
            <a
              href={qrModal.targetUrl}
              className="mt-3 block break-all text-center font-mono text-[11px] text-[#1E40AF] underline hover:text-[#1E3A8A] dark:text-blue-400"
            >
              {qrModal.targetUrl}
            </a>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => copyLink(qrModal.targetUrl)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedUrl ? 'Copied Link' : 'Copy Link'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = qrModal.formId;
                  setQrModal(null);
                  onSelectFormForSubmission(id);
                }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1E40AF] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE 6: FEEDBACK SUBMISSION PAGE (MULTI-LANGUAGE, STAR, SLIDER, RADIO, TEXT)
// ---------------------------------------------------------------------------
interface FeedbackSubmitViewProps {
  catalog: CatalogData | null;
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  preselectedFormId?: number | null;
  preselectedSubjectId?: number | null;
  editingEntry?: HistoryRow | null;
  onDoneNavigate: (page: PageId) => void;
}

export function FeedbackSubmitView({
  catalog,
  language,
  onChangeLanguage,
  preselectedFormId,
  preselectedSubjectId,
  editingEntry,
  onDoneNavigate,
}: FeedbackSubmitViewProps) {
  const t = TRANSLATIONS[language];
  const [forms, setForms] = useState<FeedbackFormItem[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<number>(preselectedFormId || 0);
  const [departmentId, setDepartmentId] = useState<number>(0);
  const [courseId, setCourseId] = useState<number>(0);
  const [semesterId, setSemesterId] = useState<number>(0);
  const [subjectId, setSubjectId] = useState<number>(preselectedSubjectId || 0);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(true);
  const [commentText, setCommentText] = useState<string>('');
  const [ratings, setRatings] = useState({
    teaching_quality: 4,
    communication: 4,
    punctuality: 5,
    subject_knowledge: 5,
    methodology: 4,
    classroom_environment: 4,
    infrastructure: 4,
    overall_satisfaction: 4,
  });
  const [customResponses, setCustomResponses] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiRequest<{ forms: FeedbackFormItem[] }>('/feedback/forms').then((res) => {
      const active = res.forms.filter((f) => f.is_active === 1);
      setForms(active);
      if (editingEntry) {
        setSelectedFormId(editingEntry.form_id);
        setSubjectId(editingEntry.subject_id);
        setIsAnonymous(Boolean(editingEntry.is_anonymous));
        setCommentText(editingEntry.comment_text || '');
        setRatings({
          teaching_quality: editingEntry.teaching_quality || 4,
          communication: editingEntry.communication || 4,
          punctuality: editingEntry.punctuality || 4,
          subject_knowledge: editingEntry.subject_knowledge || 4,
          methodology: editingEntry.methodology || 4,
          classroom_environment: editingEntry.classroom_environment || 4,
          infrastructure: editingEntry.infrastructure || 4,
          overall_satisfaction: editingEntry.overall_satisfaction || 4,
        });
      } else if (preselectedFormId) {
        setSelectedFormId(preselectedFormId);
      } else if (active.length > 0 && !selectedFormId) {
        setSelectedFormId(active[0].id);
      }
    });
  }, [preselectedFormId, editingEntry]);

  const activeForm = useMemo(
    () => forms.find((f) => f.id === selectedFormId) || forms[0] || null,
    [forms, selectedFormId]
  );

  const filteredSubjects = useMemo(() => {
    let list = catalog?.subjects ?? [];
    if (departmentId) list = list.filter((s) => s.department_id === departmentId);
    if (courseId) list = list.filter((s) => s.course_id === courseId);
    if (semesterId) list = list.filter((s) => s.semester_id === semesterId);
    return list;
  }, [catalog, departmentId, courseId, semesterId]);

  useEffect(() => {
    if (!editingEntry && filteredSubjects.length > 0 && !filteredSubjects.some((s) => s.id === subjectId)) {
      setSubjectId(filteredSubjects[0].id);
    }
  }, [filteredSubjects, subjectId, editingEntry]);

  const selectedSubject = useMemo(
    () => (catalog?.subjects ?? []).find((s) => s.id === subjectId) || null,
    [catalog, subjectId]
  );

  const alreadySubmittedForSubject = useMemo(() => {
    if (!activeForm || !subjectId || editingEntry) return false;
    return Boolean(
      activeForm.existingSubmissions?.some((s) => s.subject_id === subjectId && s.status === 'submitted')
    );
  }, [activeForm, subjectId, editingEntry]);

  const completionPercent = useMemo(() => {
    let filled = 0;
    const total = 3 + (activeForm?.questions?.length ?? 0);
    if (selectedFormId) filled++;
    if (subjectId) filled++;
    if (commentText.trim().length >= 5) filled++;
    for (const q of activeForm?.questions ?? []) {
      if ((customResponses[q.id] || '').trim().length > 0) filled++;
    }
    return Math.min(100, Math.round((filled / Math.max(1, total)) * 100));
  }, [selectedFormId, subjectId, commentText, activeForm, customResponses]);

  async function submitEvaluation(targetStatus: 'draft' | 'submitted', e?: FormEvent) {
    if (e) e.preventDefault();
    if (!activeForm || !subjectId) {
      setBanner({ type: 'error', text: 'Please select a feedback campaign and subject.' });
      return;
    }
    setBanner(null);
    setSubmitting(true);
    try {
      const responseArray = (activeForm.questions ?? []).map((q) => ({
        question_id: q.id,
        response_value: customResponses[q.id] || '',
        numeric_score: q.question_type === 'star' || q.question_type === 'slider' ? Number(customResponses[q.id]) || null : null,
      }));

      const res = await apiRequest<{ message: string; ai_sentiment?: string }>('/feedback/submit', {
        method: 'POST',
        body: JSON.stringify({
          form_id: activeForm.id,
          subject_id: subjectId,
          status: targetStatus,
          is_anonymous: isAnonymous,
          comment_text: commentText,
          ratings,
          responses: responseArray,
          allow_edit_before_deadline: Boolean(editingEntry),
        }),
      });

      setBanner({
        type: 'success',
        text: `${res.message}${res.ai_sentiment && res.ai_sentiment !== 'pending' ? ` · AI Sentiment: ${res.ai_sentiment}` : ''}`,
      });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  const dimensionEntries: Array<{ key: keyof typeof ratings; label: string; control: 'star' | 'slider' }> = [
    { key: 'teaching_quality', label: t.dimensions.teaching_quality, control: 'star' },
    { key: 'communication', label: t.dimensions.communication, control: 'star' },
    { key: 'punctuality', label: t.dimensions.punctuality, control: 'star' },
    { key: 'subject_knowledge', label: t.dimensions.subject_knowledge, control: 'star' },
    { key: 'methodology', label: t.dimensions.methodology, control: 'slider' },
    { key: 'classroom_environment', label: t.dimensions.classroom_environment, control: 'slider' },
    { key: 'infrastructure', label: t.dimensions.infrastructure, control: 'slider' },
    { key: 'overall_satisfaction', label: t.dimensions.overall_satisfaction, control: 'star' },
  ];

  return (
    <form onSubmit={(e) => submitEvaluation('submitted', e)} className="space-y-6">
      {/* Header + Language Switcher + Progress */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t.submitFeedbackTitle}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.submitFeedbackSubtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)}
              aria-label="Feedback interface language"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-300">{t.completionProgress}</span>
            <span className="font-mono font-semibold text-[#1E40AF] tabular-nums dark:text-blue-400">
              {completionPercent}%
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-[#1E40AF] transition-all duration-200 dark:bg-blue-500"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-3.5 text-sm ${
            banner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          <span className="flex items-center gap-2">
            {banner.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {banner.text}
          </span>
          {banner.type === 'success' && (
            <button
              type="button"
              onClick={() => onDoneNavigate('feedback-history')}
              className="shrink-0 font-semibold underline"
            >
              View History
            </button>
          )}
        </div>
      )}

      {alreadySubmittedForSubject && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Duplicate protection: You already submitted feedback for {selectedSubject?.name}. Visit Feedback History to edit before the campaign deadline.
        </div>
      )}

      {/* Academic Selectors */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">{t.selectCampaign}</label>
            <select
              value={selectedFormId}
              disabled={Boolean(editingEntry)}
              onChange={(e) => setSelectedFormId(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} (Closes {f.close_date})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">{t.selectDepartment}</label>
            <select
              value={departmentId}
              disabled={Boolean(editingEntry)}
              onChange={(e) => {
                setDepartmentId(Number(e.target.value));
                setCourseId(0);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value={0}>All Departments</option>
              {(catalog?.departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">{t.selectCourse}</label>
            <select
              value={courseId}
              disabled={Boolean(editingEntry)}
              onChange={(e) => setCourseId(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value={0}>All Courses</option>
              {(catalog?.courses ?? [])
                .filter((c) => !departmentId || c.department_id === departmentId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">{t.selectSemester}</label>
            <select
              value={semesterId}
              disabled={Boolean(editingEntry)}
              onChange={(e) => setSemesterId(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value={0}>All Semesters</option>
              {(catalog?.semesters ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.academic_year_label})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">{t.selectSubject}</label>
            <select
              value={subjectId}
              disabled={Boolean(editingEntry)}
              onChange={(e) => setSubjectId(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {filteredSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}{s.short_code ? ` (${s.short_code})` : ''} · {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">{t.assignedInstructor}</label>
            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <span>{selectedSubject?.faculty_name || 'Department Faculty'}</span>
              {selectedSubject?.elective_group && selectedSubject.elective_group !== 'Core' && (
                <span className="ml-2 text-xs font-normal text-[#1E40AF] dark:text-blue-400">
                  · {selectedSubject.elective_group}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 8 Rating Dimensions (Stars + Sliders) */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          Core Academic &amp; Infrastructure Ratings
        </h3>
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          {dimensionEntries.map((dim) => (
            <div key={dim.key} className="space-y-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-800 dark:text-slate-200">{dim.label}</label>
                <span className="font-mono text-sm font-semibold text-[#1E40AF] tabular-nums dark:text-blue-400">
                  {ratings[dim.key].toFixed(1)} / 5.0
                </span>
              </div>
              {dim.control === 'star' ? (
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRatings((prev) => ({ ...prev, [dim.key]: star }))}
                      className="rounded-md p-1 transition-transform hover:scale-110"
                      aria-label={`${dim.label} ${star} stars`}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= ratings[dim.key]
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={ratings[dim.key]}
                  onChange={(e) => setRatings((prev) => ({ ...prev, [dim.key]: Number(e.target.value) }))}
                  className="w-full accent-[#1E40AF]"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Custom Questionnaire Items (Radio, Star, Slider, Text) */}
      {(activeForm?.questions?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Campaign-Specific Questions
          </h3>
          <div className="mt-5 space-y-5">
            {activeForm!.questions.map((q) => {
              let options: string[] = [];
              if (q.options_json) {
                try {
                  options = JSON.parse(q.options_json) as string[];
                } catch {
                  options = [];
                }
              }
              return (
                <div key={q.id} className="space-y-2">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {q.question_text}{' '}
                    <span className="text-xs font-normal text-slate-400">· {q.category}</span>
                  </p>
                  {q.question_type === 'radio' && options.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {options.map((opt) => (
                        <label
                          key={opt}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            customResponses[q.id] === opt
                              ? 'border-[#1E40AF] bg-blue-50/70 text-[#0B192C] dark:border-blue-500 dark:bg-blue-950/40 dark:text-white'
                              : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={opt}
                            checked={customResponses[q.id] === opt}
                            onChange={() => setCustomResponses((prev) => ({ ...prev, [q.id]: opt }))}
                            className="accent-[#1E40AF]"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {(q.question_type === 'star' || q.question_type === 'slider') && (
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={0.5}
                        value={Number(customResponses[q.id]) || 4}
                        onChange={(e) => setCustomResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        className="w-64 accent-[#1E40AF]"
                      />
                      <span className="font-mono text-sm font-semibold text-[#1E40AF] tabular-nums dark:text-blue-400">
                        {(Number(customResponses[q.id]) || 4).toFixed(1)} / 5.0
                      </span>
                    </div>
                  )}
                  {q.question_type === 'text' && (
                    <input
                      type="text"
                      value={customResponses[q.id] || ''}
                      onChange={(e) => setCustomResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Enter your response..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Written Comments & Anonymity Toggle */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <label className="block text-sm font-semibold text-slate-900 dark:text-white">
          {t.writtenCommentsLabel}
        </label>
        <textarea
          rows={4}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={t.writtenCommentsPlaceholder}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />

        <div className="mt-5 flex flex-col justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center dark:border-slate-800">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="mt-1 h-4 w-4 rounded accent-[#1E40AF]"
            />
            <div>
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                <Shield className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
                {t.anonymousLabel}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.anonymousHint}</p>
            </div>
          </label>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitEvaluation('draft')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Save className="h-4 w-4" />
              {t.saveDraft}
            </button>
            <button
              type="submit"
              disabled={submitting || alreadySubmittedForSubject}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1E40AF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-60 transition-colors dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Saving...' : editingEntry ? t.updateEvaluation : t.submitEvaluation}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// PAGE 7: FEEDBACK HISTORY
// ---------------------------------------------------------------------------
interface FeedbackHistoryProps {
  onEditSubmission: (row: HistoryRow) => void;
  onStartNew: () => void;
  onOpenVerifiedReceipt?: (receiptNumber: string, token: string) => void;
}

export function FeedbackHistoryView({
  onEditSubmission,
  onStartNew,
  onOpenVerifiedReceipt,
}: FeedbackHistoryProps) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<HistoryRow | null>(null);
  const [detailQr, setDetailQr] = useState<{
    receiptNumber: string;
    receiptToken: string;
    qrDataUrl: string;
    verifyUrl: string;
  } | null>(null);
  const [qrOnlyModal, setQrOnlyModal] = useState<{
    row: HistoryRow;
    receiptNumber: string;
    receiptToken: string;
    qrDataUrl: string;
    verifyUrl: string;
  } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copiedVerify, setCopiedVerify] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiRequest<{ history: HistoryRow[] }>('/feedback/history')
      .then((res) => setHistory(res.history))
      .finally(() => setLoading(false));
  }, []);

  async function openReceiptModal(row: HistoryRow) {
    setDetailRow(row);
    setDetailQr(null);
    setQrError(null);
    try {
      const qrRes = await apiRequest<{
        receiptNumber: string;
        receiptToken: string;
        qrDataUrl: string;
        verifyUrl: string;
      }>(`/feedback/submissions/${row.id}/qr`);
      setDetailQr(qrRes);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Unable to generate receipt QR.');
    }
  }

  async function openQrModal(row: HistoryRow) {
    setQrError(null);
    setCopiedVerify(false);
    try {
      const qrRes = await apiRequest<{
        receiptNumber: string;
        receiptToken: string;
        qrDataUrl: string;
        verifyUrl: string;
      }>(`/feedback/submissions/${row.id}/qr`);
      setQrOnlyModal({ row, ...qrRes });
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Unable to generate receipt QR.');
    }
  }

  function copyVerifyUrl(url: string) {
    navigator.clipboard?.writeText(url).catch(() => null);
    setCopiedVerify(true);
    setTimeout(() => setCopiedVerify(false), 2000);
  }

  function previewScannedDetails(receiptNumber: string, receiptToken: string, verifyUrl: string) {
    if (onOpenVerifiedReceipt) {
      onOpenVerifiedReceipt(receiptNumber, receiptToken);
    } else {
      window.location.href = verifyUrl;
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Feedback Submission History</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Download PDF receipts with QR verification, inspect QR codes, or edit saved drafts prior to deadlines.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => downloadAuthenticatedBlob('/feedback/history/export/csv', 'feedback_submission_history.csv')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                Download History (CSV)
              </button>
            )}
            <button
              type="button"
              onClick={onStartNew}
              className="rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
            >
              New Evaluation
            </button>
          </div>
        </div>

        {qrError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {qrError}
          </div>
        )}

        {history.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              You have not saved or submitted any course evaluations yet.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2.5 font-medium">Subject &amp; Campaign</th>
                  <th className="py-2.5 font-medium">Instructor</th>
                  <th className="py-2.5 font-medium">Status</th>
                  <th className="py-2.5 text-right font-medium">Overall</th>
                  <th className="py-2.5 text-right font-medium">Deadline</th>
                  <th className="py-2.5 text-right font-medium">Receipt, QR &amp; Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-xs text-[#1E40AF] dark:text-blue-400">
                          {row.subject_code}
                          {row.short_code ? ` (${row.short_code})` : ''}
                        </span>{' '}
                        · {row.subject_name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {row.semester_name ? `${row.semester_name} · ` : ''}
                        {row.form_title} · {row.is_anonymous ? 'Anonymous' : 'Named'}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-700 dark:text-slate-300">
                      {row.faculty_name || 'Department Faculty'}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          row.status === 'submitted'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {row.status === 'submitted' ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Clock className="h-3.5 w-3.5" />
                        )}
                        {row.status === 'submitted' ? 'Submitted' : 'Draft'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-[#1E40AF] dark:text-blue-400">
                      {row.overall_satisfaction ? `${row.overall_satisfaction.toFixed(1)} / 5` : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-slate-500">
                      {row.close_date}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openReceiptModal(row)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Eye className="h-3 w-3" />
                          Receipt
                        </button>
                        <button
                          type="button"
                          onClick={() => openQrModal(row)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <QrCode className="h-3 w-3" />
                          QR
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadAuthenticatedBlob(
                              `/feedback/submissions/${row.id}/receipt/pdf`,
                              `SNU_Receipt_${row.subject_code}_${row.id}.pdf`
                            )
                          }
                          className="inline-flex items-center gap-1 rounded border border-[#1E40AF]/30 bg-blue-50/70 px-2.5 py-1 text-xs font-medium text-[#1E40AF] hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
                        >
                          <Download className="h-3 w-3" />
                          PDF
                        </button>
                        {row.can_edit && (
                          <button
                            type="button"
                            onClick={() => onEditSubmission(row)}
                            className="inline-flex items-center gap-1 rounded bg-[#0B192C] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1E40AF] dark:bg-blue-600"
                          >
                            <Edit3 className="h-3 w-3" />
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Submission Receipt · SNU-REC-{String(detailRow.id).padStart(5, '0')}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {detailRow.roll_number || '24SUUBECS001'} · {detailRow.subject_code}
                  {detailRow.short_code ? ` (${detailRow.short_code})` : ''} · {detailRow.subject_name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Faculty: {detailRow.faculty_name || 'Department Faculty'} · {detailRow.submitted_at}
                </p>
              </div>
              <button type="button" onClick={() => setDetailRow(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-b border-slate-200 py-4 sm:grid-cols-12 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2.5 text-xs sm:col-span-8">
                <div>Teaching Quality: <strong className="font-mono">{detailRow.teaching_quality}/5</strong></div>
                <div>Communication: <strong className="font-mono">{detailRow.communication}/5</strong></div>
                <div>Punctuality: <strong className="font-mono">{detailRow.punctuality}/5</strong></div>
                <div>Knowledge: <strong className="font-mono">{detailRow.subject_knowledge}/5</strong></div>
                <div>Methodology: <strong className="font-mono">{detailRow.methodology}/5</strong></div>
                <div>Environment: <strong className="font-mono">{detailRow.classroom_environment}/5</strong></div>
                <div>Infrastructure: <strong className="font-mono">{detailRow.infrastructure}/5</strong></div>
                <div>Overall: <strong className="font-mono text-[#1E40AF] dark:text-blue-400">{detailRow.overall_satisfaction}/5</strong></div>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 sm:col-span-4">
                {detailQr?.qrDataUrl ? (
                  <img src={detailQr.qrDataUrl} alt="Submission receipt QR code" className="h-24 w-24" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center text-[11px] text-slate-400">Loading QR...</div>
                )}
                <span className="mt-1 font-mono text-[10px] text-slate-500">
                  {detailQr?.receiptNumber || `SNU-REC-${String(detailRow.id).padStart(5, '0')}`}
                </span>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {detailRow.comment_text || 'No narrative comment recorded.'}
            </p>

            {detailQr?.verifyUrl && (
              <p className="mt-3 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                Scan QR with Google Scan or open:{' '}
                <a href={detailQr.verifyUrl} className="text-[#1E40AF] underline dark:text-blue-400">
                  {detailQr.verifyUrl}
                </a>
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {detailQr && (
                <button
                  type="button"
                  onClick={() => {
                    const qr = detailQr;
                    setDetailRow(null);
                    previewScannedDetails(qr.receiptNumber, qr.receiptToken, qr.verifyUrl);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Scanned Receipt View
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  downloadAuthenticatedBlob(
                    `/feedback/submissions/${detailRow.id}/receipt/pdf`,
                    `SNU_Receipt_${detailRow.subject_code}_${detailRow.id}.pdf`
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {qrOnlyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Receipt Verification QR
                </h3>
                <p className="mt-1 font-mono text-xs text-[#1E40AF] dark:text-blue-400">
                  {qrOnlyModal.receiptNumber} · {qrOnlyModal.row.roll_number || '24SUUBECS001'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {qrOnlyModal.row.subject_code}
                  {qrOnlyModal.row.short_code ? ` (${qrOnlyModal.row.short_code})` : ''} · {qrOnlyModal.row.subject_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrOnlyModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center rounded-xl border border-slate-200 bg-white p-4">
              <img src={qrOnlyModal.qrDataUrl} alt="Feedback receipt verification QR" className="h-48 w-48" />
            </div>
            <p className="mt-2.5 text-center text-[11px] text-slate-600 dark:text-slate-300">
              Scan with Google Scan or smartphone camera to view full feedback details.
            </p>
            <a
              href={qrOnlyModal.verifyUrl}
              className="mt-1.5 block break-all text-center font-mono text-[10px] text-[#1E40AF] underline dark:text-blue-400"
            >
              {qrOnlyModal.verifyUrl}
            </a>
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyVerifyUrl(qrOnlyModal.verifyUrl)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {copiedVerify ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedVerify ? 'Copied' : 'Copy Link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const modal = qrOnlyModal;
                    setQrOnlyModal(null);
                    previewScannedDetails(modal.receiptNumber, modal.receiptToken, modal.verifyUrl);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1E40AF] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Details
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadAuthenticatedBlob(
                    `/feedback/submissions/${qrOnlyModal.row.id}/receipt/pdf`,
                    `SNU_Receipt_${qrOnlyModal.row.subject_code}_${qrOnlyModal.row.id}.pdf`
                  )
                }
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] dark:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
