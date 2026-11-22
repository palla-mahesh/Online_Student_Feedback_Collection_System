import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, setAuthToken } from './api.ts';
import { LANGUAGE_LABELS, TRANSLATIONS } from './i18n.ts';
import { LandingAndAuth } from './components/LandingAndAuth.tsx';
import { ReceiptVerificationView } from './components/ReceiptVerificationView.tsx';
import {
  FeedbackHistoryView,
  FeedbackSubmitView,
  type HistoryRow,
  StudentDashboardView,
} from './components/StudentViews.tsx';
import { AiInsightsView, AnalyticsView } from './components/AnalyticsAndAiViews.tsx';
import {
  AdminDashboardView,
  CoursesSubjectsView,
  FacultyDashboardView,
  HelpSupportView,
  ProfileSettingsView,
  ReportsExportView,
  StudentsManagementView,
  TeachersManagementView,
} from './components/ManagementAndPortals.tsx';
import type { AuthUser, CatalogData, LanguageCode, PageId } from './types.ts';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [page, setPage] = useState<PageId>('landing');
  const [isDark, setIsDark] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [preselectedFormId, setPreselectedFormId] = useState<number | null>(null);
  const [preselectedSubjectId, setPreselectedSubjectId] = useState<number | null>(null);
  const [editingEntry, setEditingEntry] = useState<HistoryRow | null>(null);
  const [pendingQrToken, setPendingQrToken] = useState<string | null>(null);
  const [receiptVerifyParams, setReceiptVerifyParams] = useState<{ receipt: string; token: string } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  const refreshCatalog = useCallback(async () => {
    const data = await apiRequest<CatalogData>('/catalog');
    setCatalog(data);
  }, []);

  useEffect(() => {
    refreshCatalog().catch(() => null);
    const params = new URLSearchParams(window.location.search);
    const receipt = params.get('receipt');
    const token = params.get('token');
    if (receipt && token) {
      setReceiptVerifyParams({ receipt, token });
      setPage('receipt-verify');
      return;
    }
    const qr = params.get('qr');
    if (qr) {
      setPendingQrToken(qr);
      setPage('student-login');
    }
  }, [refreshCatalog]);

  async function handleAuthenticated(authUser: AuthUser, targetPage: PageId) {
    setUser(authUser);
    setLanguage(authUser.preferred_language || 'en');

    if (pendingQrToken && authUser.role === 'student') {
      try {
        const res = await apiRequest<{ form: { id: number } }>(
          `/feedback/forms/qr/${encodeURIComponent(pendingQrToken)}`
        );
        setPreselectedFormId(res.form.id);
        setPendingQrToken(null);
        setPage('feedback-submit');
        return;
      } catch {
        setPendingQrToken(null);
      }
    }
    setPage(targetPage);
  }

  async function handleLogout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setEditingEntry(null);
    setPreselectedFormId(null);
    setPreselectedSubjectId(null);
    setPage('landing');
  }

  if (page === 'receipt-verify' && receiptVerifyParams) {
    return (
      <ReceiptVerificationView
        receiptNumber={receiptVerifyParams.receipt}
        token={receiptVerifyParams.token}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        isLoggedIn={Boolean(user)}
        onBackToPortal={() => {
          setReceiptVerifyParams(null);
          if (window.location.search) {
            window.history.replaceState({}, '', window.location.pathname);
          }
          setPage(user ? (user.role === 'student' ? 'feedback-history' : 'admin-dashboard') : 'landing');
        }}
      />
    );
  }

  if (!user || page === 'landing' || page === 'register' || page === 'student-login' || page === 'admin-login') {
    const publicPage =
      page === 'register' || page === 'student-login' || page === 'admin-login' ? page : 'landing';
    return (
      <LandingAndAuth
        page={publicPage}
        onNavigate={(p) => setPage(p)}
        onAuthenticated={handleAuthenticated}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        catalog={catalog}
        pendingQrToken={pendingQrToken}
        onClearPendingQr={() => {
          setPendingQrToken(null);
          if (window.location.search) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
      />
    );
  }

  const t = TRANSLATIONS[language];

  const navItems: Array<{ id: PageId; label: string; icon: ReactNode; roles: Array<AuthUser['role']> }> = [
    {
      id: 'student-dashboard',
      label: t.navDashboard,
      icon: <LayoutDashboard className="h-4 w-4" />,
      roles: ['student'],
    },
    {
      id: 'feedback-submit',
      label: t.navSubmitFeedback,
      icon: <ClipboardList className="h-4 w-4" />,
      roles: ['student'],
    },
    {
      id: 'feedback-history',
      label: t.navHistory,
      icon: <History className="h-4 w-4" />,
      roles: ['student'],
    },
    {
      id: 'faculty-dashboard',
      label: t.navDashboard,
      icon: <LayoutDashboard className="h-4 w-4" />,
      roles: ['faculty'],
    },
    {
      id: 'admin-dashboard',
      label: t.navDashboard,
      icon: <Shield className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      id: 'analytics',
      label: t.navAnalytics,
      icon: <BarChart3 className="h-4 w-4" />,
      roles: ['faculty', 'admin'],
    },
    {
      id: 'ai-insights',
      label: t.navAiInsights,
      icon: <Sparkles className="h-4 w-4" />,
      roles: ['faculty', 'admin'],
    },
    {
      id: 'courses-subjects',
      label: t.navCourses,
      icon: <BookOpen className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      id: 'teachers',
      label: t.navTeachers,
      icon: <Users className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      id: 'students',
      label: t.navStudents,
      icon: <GraduationCap className="h-4 w-4" />,
      roles: ['admin'],
    },
    {
      id: 'reports',
      label: t.navReports,
      icon: <FileSpreadsheet className="h-4 w-4" />,
      roles: ['faculty', 'admin'],
    },
    {
      id: 'settings',
      label: t.navSettings,
      icon: <Settings className="h-4 w-4" />,
      roles: ['student', 'faculty', 'admin'],
    },
    {
      id: 'help',
      label: t.navHelp,
      icon: <HelpCircle className="h-4 w-4" />,
      roles: ['student', 'faculty', 'admin'],
    },
  ];

  const visibleNav = navItems.filter((item) => item.roles.includes(user.role));
  const currentNavLabel = visibleNav.find((n) => n.id === page)?.label || 'Workspace';

  const navigateTo = (target: PageId) => {
    if (target !== 'feedback-submit') {
      setEditingEntry(null);
      setPreselectedSubjectId(null);
    }
    setPage(target);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-[#09111E] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-[#0B192C]">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => navigateTo('landing')}
            className="text-left text-base font-bold tracking-tight text-[#0B192C] dark:text-white"
          >
            {t.appBrand}
          </button>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)} Portal
          </p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#1E40AF] text-white dark:bg-blue-600'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user.full_name}</p>
          <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{user.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t.signOut}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 flex w-64 flex-col bg-white p-4 dark:bg-[#0B192C]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <span className="text-sm font-bold text-[#0B192C] dark:text-white">{t.appBrand}</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="mt-3 flex-1 space-y-1">
              {visibleNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                    page === item.id
                      ? 'bg-[#1E40AF] text-white'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-xs font-medium dark:border-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t.signOut}
            </button>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-3.5 backdrop-blur dark:border-slate-800 dark:bg-[#09111E]/95">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
              <span className="hidden sm:inline">{t.appBrand} / </span>
              <span className="font-semibold text-slate-900 dark:text-white">{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              aria-label="Select interface language"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label="Toggle theme"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-6">
          {page === 'student-dashboard' && (
            <StudentDashboardView
              onNavigate={navigateTo}
              onSelectFormForSubmission={(formId, subjectId, editRow) => {
                setPreselectedFormId(formId);
                setPreselectedSubjectId(subjectId || null);
                setEditingEntry(editRow || null);
                setPage('feedback-submit');
              }}
            />
          )}

          {page === 'feedback-submit' && (
            <FeedbackSubmitView
              catalog={catalog}
              language={language}
              onChangeLanguage={setLanguage}
              preselectedFormId={preselectedFormId}
              preselectedSubjectId={preselectedSubjectId}
              editingEntry={editingEntry}
              onDoneNavigate={navigateTo}
            />
          )}

          {page === 'feedback-history' && (
            <FeedbackHistoryView
              onStartNew={() => {
                setEditingEntry(null);
                setPreselectedSubjectId(null);
                setPage('feedback-submit');
              }}
              onEditSubmission={(row) => {
                setEditingEntry(row);
                setPreselectedFormId(row.form_id);
                setPreselectedSubjectId(row.subject_id);
                setPage('feedback-submit');
              }}
              onOpenVerifiedReceipt={(receipt, token) => {
                setReceiptVerifyParams({ receipt, token });
                setPage('receipt-verify');
              }}
            />
          )}

          {page === 'faculty-dashboard' && <FacultyDashboardView isDark={isDark} />}

          {page === 'admin-dashboard' && <AdminDashboardView catalog={catalog} />}

          {page === 'analytics' && <AnalyticsView catalog={catalog} isDark={isDark} />}

          {page === 'ai-insights' && <AiInsightsView user={user} catalog={catalog} />}

          {page === 'courses-subjects' && (
            <CoursesSubjectsView catalog={catalog} onRefreshCatalog={refreshCatalog} />
          )}

          {page === 'teachers' && (
            <TeachersManagementView catalog={catalog} onRefreshCatalog={refreshCatalog} />
          )}

          {page === 'students' && <StudentsManagementView catalog={catalog} />}

          {page === 'reports' && <ReportsExportView />}

          {page === 'settings' && (
            <ProfileSettingsView
              user={user}
              catalog={catalog}
              onUserUpdated={(updated) => {
                setUser(updated);
                setLanguage(updated.preferred_language || 'en');
              }}
              isDark={isDark}
              onToggleTheme={() => setIsDark((d) => !d)}
            />
          )}

          {page === 'help' && <HelpSupportView language={language} />}
        </main>
      </div>
    </div>
  );
}
