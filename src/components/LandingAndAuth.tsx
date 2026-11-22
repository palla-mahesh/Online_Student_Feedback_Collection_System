import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Lock, Mail, Moon, QrCode, ShieldCheck, Sun, User, UserPlus } from 'lucide-react';
import { apiRequest, setAuthToken } from '../api.ts';
import { getSuggestedEnrollmentPrefix, isValidEnrollmentFormat } from '../enrollment.ts';
import { LANGUAGE_LABELS } from '../i18n.ts';
import type { AuthUser, CatalogData, LanguageCode, PageId } from '../types.ts';

interface LandingAndAuthProps {
  page: 'landing' | 'register' | 'student-login' | 'admin-login';
  onNavigate: (page: PageId) => void;
  onAuthenticated: (user: AuthUser, targetPage: PageId) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  catalog: CatalogData | null;
  pendingQrToken?: string | null;
  onClearPendingQr?: () => void;
}

export function LandingAndAuth({
  page,
  onNavigate,
  onAuthenticated,
  isDark,
  onToggleTheme,
  catalog,
  pendingQrToken,
  onClearPendingQr,
}: LandingAndAuthProps) {
  const [stats, setStats] = useState<{
    totalSubmissions: number;
    avgSatisfaction: number;
    totalDepartments: number;
    activeCampaigns: number;
    totalSubjects: number;
  } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [departmentId, setDepartmentId] = useState<number>(1);
  const [courseId, setCourseId] = useState<number>(1);
  const [semesterId, setSemesterId] = useState<number>(5);
  const [batchYear, setBatchYear] = useState<number>(2024);
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>('en');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [hallImgFailed, setHallImgFailed] = useState(false);
  const [deanImgFailed, setDeanImgFailed] = useState(false);
  const [qrPreview, setQrPreview] = useState<{
    title: string;
    description: string;
    qr_token: string;
    semester_name?: string;
    department_name?: string | null;
    close_date: string;
    questions_count?: number;
  } | null>(null);
  const [qrPreviewError, setQrPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
  }, [page]);

  useEffect(() => {
    if (!pendingQrToken) {
      setQrPreview(null);
      setQrPreviewError(null);
      return;
    }
    setQrPreviewError(null);
    apiRequest<{
      form: {
        title: string;
        description: string;
        qr_token: string;
        semester_name?: string;
        department_name?: string | null;
        close_date: string;
        questions_count?: number;
      };
    }>(`/feedback/forms/qr/${encodeURIComponent(pendingQrToken)}`)
      .then((res) => setQrPreview(res.form))
      .catch((err) => {
        setQrPreview(null);
        setQrPreviewError(err instanceof Error ? err.message : 'Scanned campaign QR token not found.');
      });
  }, [pendingQrToken]);

  useEffect(() => {
    if (page !== 'landing') return;
    apiRequest<{
      totalSubmissions: number;
      avgSatisfaction: number;
      totalDepartments: number;
      activeCampaigns: number;
      totalSubjects: number;
    }>('/public/landing-stats')
      .then(setStats)
      .catch(() => null);
  }, [page]);

  const filteredCourses = (catalog?.courses ?? []).filter((c) => c.department_id === departmentId);
  const selectedDept = (catalog?.departments ?? []).find((d) => d.id === departmentId);
  const suggestedPrefix = getSuggestedEnrollmentPrefix(selectedDept?.code, batchYear);
  const normalizedRollInput = rollNumber.trim().toUpperCase();
  const isRollInvalid = normalizedRollInput.length > 0 && !isValidEnrollmentFormat(normalizedRollInput);

  useEffect(() => {
    if (filteredCourses.length > 0 && !filteredCourses.some((c) => c.id === courseId)) {
      setCourseId(filteredCourses[0].id);
    }
  }, [departmentId, filteredCourses, courseId]);

  useEffect(() => {
    const semesters = catalog?.semesters ?? [];
    if (semesters.length > 0 && !semesters.some((s) => s.id === semesterId)) {
      const currentSem = semesters.find((s) => s.is_current === 1) || semesters[0];
      setSemesterId(currentSem.id);
    }
  }, [catalog, semesterId]);

  const routeForRole = (role: AuthUser['role']): PageId => {
    if (role === 'admin') return 'admin-dashboard';
    if (role === 'faculty') return 'faculty-dashboard';
    return 'student-dashboard';
  };

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user, routeForRole(res.user.role));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(role: 'student' | 'faculty' | 'admin') {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user, routeForRole(res.user.role));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Demo login unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (normalizedRollInput && !isValidEnrollmentFormat(normalizedRollInput)) {
      setErrorMsg(
        `Enrollment number (SRN) must follow the ${suggestedPrefix}0001 format (e.g. ${suggestedPrefix}0042).`
      );
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          department_id: departmentId,
          course_id: courseId,
          semester_id: semesterId,
          batch_year: batchYear,
          roll_number: normalizedRollInput || undefined,
          preferred_language: preferredLanguage,
        }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user, 'student-dashboard');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  const TopBar = (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-[#09111E]/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          className="text-left text-lg font-bold tracking-tight text-[#0B192C] whitespace-nowrap shrink-0 dark:text-white"
        >
          Sapthagiri NPS University
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
          <a href="#overview" onClick={() => onNavigate('landing')} className="hover:text-[#1E40AF] dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0">
            Overview
          </a>
          <a href="#capabilities" onClick={() => onNavigate('landing')} className="hover:text-[#1E40AF] dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0">
            Capabilities
          </a>
          <button
            type="button"
            onClick={() => onNavigate('register')}
            className="hover:text-[#1E40AF] dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0"
          >
            Student Register
          </button>
          <button
            type="button"
            onClick={() => onNavigate('admin-login')}
            className="hover:text-[#1E40AF] dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0"
          >
            Faculty &amp; Admin
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle color theme"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('student-login')}
            className="rounded-lg bg-[#1E40AF] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            Student Sign In
          </button>
        </div>
      </div>
    </header>
  );

  if (page === 'landing') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#09111E] dark:text-slate-100">
        {TopBar}

        <main className="mx-auto max-w-7xl px-6 pt-12 pb-20">
          {/* Hero Split */}
          <section id="overview" className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
            <div className="flex flex-col justify-between lg:col-span-6 py-2">
              <div>
                <p className="text-xs font-medium tracking-wide text-[#1E40AF] dark:text-blue-400">
                  Academic Quality &amp; Institutional Evaluation · Fall 2026 Cycle
                </p>
                <h1 className="mt-4 text-4xl font-bold tracking-tight text-[#0B192C] sm:text-5xl leading-[1.12] [text-wrap:balance] dark:text-white">
                  Transparent course feedback engineered for academic excellence
                </h1>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  Sapthagiri NPS University collects structured evaluations on instruction, laboratory infrastructure, and curriculum pacing across four languages while safeguarding respondent anonymity at the database boundary.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate('student-login')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0B192C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  Enter Student Portal
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-[#111C2E] dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Register Student ID
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('admin-login')}
                  className="text-sm font-medium text-[#1E40AF] hover:underline whitespace-nowrap shrink-0 dark:text-blue-400"
                >
                  Faculty &amp; Admin Console
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-900">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/sapthagiri_campus_clean_1795255721253.jpg"
                    alt="Sapthagiri NPS University campus building"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[300px] items-center justify-center bg-gradient-to-br from-[#0B192C] to-[#1E40AF] p-8 text-white">
                    <span className="text-lg font-semibold">Sapthagiri NPS University Campus</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 4-Column Live Institutional Telemetry Strip */}
          <section className="mt-10 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-6 md:grid-cols-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Submitted Evaluations</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-[#0B192C] tabular-nums dark:text-white">
                {stats ? stats.totalSubmissions : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Institutional Satisfaction</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-[#1E40AF] tabular-nums dark:text-blue-400">
                {stats?.avgSatisfaction ? `${stats.avgSatisfaction} / 5.00` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Campaigns</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-[#0B192C] tabular-nums dark:text-white">
                {stats ? stats.activeCampaigns : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Departments &amp; Subjects</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-[#0B192C] tabular-nums dark:text-white">
                {stats ? `${stats.totalDepartments} · ${stats.totalSubjects}` : '—'}
              </p>
            </div>
          </section>

          {/* Numbered Core Capabilities + Lecture Hall Showcase */}
          <section id="capabilities" className="mt-20 grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                {!hallImgFailed ? (
                  <img
                    src="/assets/aistudio/image_3189eba8.png"
                    alt="Sapthagiri NPS University seminar hall during academic session"
                    referrerPolicy="no-referrer"
                    onError={() => setHallImgFailed(true)}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-[#0B192C] text-white">
                    Sapthagiri NPS University Seminar Hall
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[#0B192C] dark:text-white">
                  Built for rigorous academic governance
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Every rating, comment, and AI classification is stored permanently in a normalized relational schema with strict role isolation.
                </p>
              </div>

              <div className="divide-y divide-slate-200 border-t border-b border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                <div className="py-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    01. Multi-Language Evaluations &amp; QR Access
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Complete star, slider, radio, and narrative evaluations in English, Hindi, Kannada, or Telugu, with draft saving and QR code campaign links.
                  </p>
                </div>
                <div className="py-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    02. Twelve Live Chart.js Analytics Views
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Slice real database metrics by department, course, instructor, subject, academic year, semester, and date range with zero static mock values.
                  </p>
                </div>
                <div className="py-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    03. Gemini AI Synthesis &amp; Early-Warning Alerts
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Server-side Gemini integration classifies sentiment across nine academic categories, surfaces recurring infrastructure complaints, and recommends pedagogical improvements.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Attributable Leadership Note */}
          <section className="mt-20 rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-slate-200 dark:border-slate-700">
                {!deanImgFailed ? (
                  <img
                    src="/assets/aistudio/image_3cda7516.png"
                    alt="Dr. H. Ramakrishna, Principal of Sapthagiri NPS University"
                    referrerPolicy="no-referrer"
                    onError={() => setDeanImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#0B192C] text-sm font-bold text-white">
                    HR
                  </div>
                )}
              </div>
              <div>
                <p className="text-base leading-relaxed text-slate-700 dark:text-slate-200">
                  “Structured student feedback reduced unresolved laboratory hardware delays by 42% between Spring 2026 and Fall 2026 while giving faculty concrete, privacy-safe guidance each semester.”
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Dr. H. Ramakrishna · Principal · Sapthagiri NPS University
                </p>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-[#0B192C]/40">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-xs text-slate-500 sm:flex-row dark:text-slate-400">
            <span>Sapthagiri NPS University · Office of Academic Quality &amp; Institutional Analytics</span>
            <div className="flex items-center gap-6">
              <button type="button" onClick={() => onNavigate('student-login')} className="hover:text-slate-900 dark:hover:text-white">
                Student Login
              </button>
              <button type="button" onClick={() => onNavigate('admin-login')} className="hover:text-slate-900 dark:hover:text-white">
                Faculty &amp; Admin Login
              </button>
              <button type="button" onClick={() => onNavigate('register')} className="hover:text-slate-900 dark:hover:text-white">
                Student Registration
              </button>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // AUTHENTICATION PAGES (Student Register, Student Login, Admin/Faculty Login)
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#09111E] dark:text-slate-100">
      {TopBar}
      <main className="mx-auto flex max-w-5xl items-center justify-center px-6 py-12">
        <div className="grid w-full grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-12 dark:border-slate-800 dark:bg-[#111C2E]">
          {/* Left Navy Context Panel */}
          <div className="flex flex-col justify-between bg-[#0B192C] p-8 text-white lg:col-span-5">
            <div>
              <p className="text-xs font-medium text-blue-300">
                Sapthagiri NPS University Portal
              </p>
              <h1 className="mt-3 text-2xl font-bold tracking-tight">
                {page === 'register' && 'Create your student account'}
                {page === 'student-login' && 'Student Feedback Sign In'}
                {page === 'admin-login' && 'Faculty & Administrator Sign In'}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {page === 'register' &&
                  'Register your institutional roll number and department to access active semester feedback forms and track submission deadlines.'}
                {page === 'student-login' &&
                  'Sign in to submit course ratings, save evaluation drafts, or scan campaign QR codes in English, Hindi, Kannada, or Telugu.'}
                {page === 'admin-login' &&
                  'Authorized portal for faculty members and academic administrators to inspect analytics, AI insights, and institutional reports.'}
              </p>
            </div>

            <div className="mt-8 space-y-3 border-t border-slate-800 pt-6 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Anonymous respondent protection enforced at query layer</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Persistent 18-table relational storage &amp; audit logging</span>
              </div>
            </div>
          </div>

          {/* Right Form Panel */}
          <div className="p-8 lg:col-span-7">
            {qrPreview && (
              <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-800/70 dark:bg-blue-950/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-[#1E40AF] dark:text-blue-400" />
                    <div>
                      <p className="font-mono text-[11px] font-semibold text-[#1E40AF] dark:text-blue-400">
                        SCANNED CAMPAIGN QR · {qrPreview.qr_token}
                      </p>
                      <h2 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                        {qrPreview.title}
                      </h2>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {qrPreview.semester_name || 'Semester 5'} ·{' '}
                        {qrPreview.department_name || 'All Departments'} · Closes{' '}
                        <span className="font-mono">{qrPreview.close_date}</span>
                        {typeof qrPreview.questions_count === 'number'
                          ? ` · ${qrPreview.questions_count} custom prompts`
                          : ''}
                      </p>
                      <p className="mt-1.5 text-[11px] font-medium text-[#1E40AF] dark:text-blue-300">
                        Sign in as a student below to open this evaluation form directly.
                      </p>
                    </div>
                  </div>
                  {onClearPendingQr && (
                    <button
                      type="button"
                      onClick={onClearPendingQr}
                      className="text-[11px] font-medium text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {qrPreviewError && (
              <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                {qrPreviewError}
              </div>
            )}

            {errorMsg && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            {page === 'register' ? (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Rohan Deshmukh"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Enrollment Number / SRN (4-Digit 24SUU Format)
                    </label>
                    <input
                      type="text"
                      value={rollNumber}
                      onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                      placeholder={`${suggestedPrefix}0042`}
                      className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-white ${
                        isRollInvalid
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-slate-300 focus:border-[#1E40AF] dark:border-slate-700'
                      }`}
                    />
                    <p
                      className={`mt-1 text-[11px] ${
                        isRollInvalid ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isRollInvalid
                        ? `Invalid format. Expected e.g. ${suggestedPrefix}0001 (Year + SUU + Program + 4 digits).`
                        : `Expected: ${suggestedPrefix}0001 · Leave blank to auto-assign`}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">University Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rohan.d@sapthagiri.edu"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Department</label>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {(catalog?.departments ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Course / Program</label>
                    <select
                      value={courseId}
                      onChange={(e) => setCourseId(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {filteredCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Current Semester (1 – 8)
                    </label>
                    <select
                      value={semesterId}
                      onChange={(e) => setSemesterId(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {(catalog?.semesters ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.academic_year_label})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Batch Year</label>
                    <select
                      value={batchYear}
                      onChange={(e) => setBatchYear(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {[2022, 2023, 2024, 2025, 2026].map((yr) => (
                        <option key={yr} value={yr}>
                          {yr} ({String(yr).slice(-2)}SUU...)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Password (8+ chars)</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Preferred Language</label>
                    <select
                      value={preferredLanguage}
                      onChange={(e) => setPreferredLanguage(e.target.value as LanguageCode)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => (
                        <option key={code} value={code}>
                          {LANGUAGE_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E40AF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-60 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  {loading ? 'Creating account...' : 'Register Student Account'}
                </button>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('student-login')}
                    className="font-medium text-[#1E40AF] hover:underline dark:text-blue-400"
                  >
                    Sign in to Student Portal
                  </button>
                </p>
              </form>
            ) : (
              <div className="space-y-6">
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Institutional Email
                    </label>
                    <div className="relative mt-1">
                      <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={page === 'student-login' ? 'student@sapthagiri.edu' : 'admin@sapthagiri.edu'}
                        className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Password</label>
                    <div className="relative mt-1">
                      <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-[#1E40AF] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-[#0B192C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60 transition-colors dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    {loading ? 'Verifying credentials...' : 'Sign In'}
                  </button>
                </form>

                {/* One-Click Demo Sign-In Section (Confirmed in Phase 1) */}
                <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Quick Academic Demo Access
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {page === 'student-login' ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleDemoLogin('student')}
                        className="sm:col-span-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-sm hover:border-[#1E40AF] hover:bg-blue-50/50 transition-colors dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-blue-500"
                      >
                        <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                          <User className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
                          Demo Student · Aarav Sharma
                        </span>
                        <span className="font-mono text-xs text-slate-500">B.Tech CSE</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleDemoLogin('faculty')}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm hover:border-[#1E40AF] hover:bg-blue-50/50 transition-colors dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-blue-500"
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">Demo Faculty</span>
                          <span className="font-mono text-xs text-slate-500">Prof. Krishnan</span>
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleDemoLogin('admin')}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm hover:border-[#1E40AF] hover:bg-blue-50/50 transition-colors dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-blue-500"
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">Demo Admin</span>
                          <span className="font-mono text-xs text-slate-500">Dr. H. Ramakrishna</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  {page === 'student-login' ? (
                    <>
                      <button type="button" onClick={() => onNavigate('register')} className="text-[#1E40AF] hover:underline dark:text-blue-400">
                        Need an account? Register
                      </button>
                      <button type="button" onClick={() => onNavigate('admin-login')} className="hover:underline">
                        Faculty / Admin Sign In
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => onNavigate('student-login')} className="text-[#1E40AF] hover:underline dark:text-blue-400">
                        Student Sign In
                      </button>
                      <button type="button" onClick={() => onNavigate('register')} className="hover:underline">
                        Student Registration
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
