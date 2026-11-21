import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Moon, Printer, ShieldCheck, Sun, AlertCircle } from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { VerifiedReceiptData } from '../types.ts';

interface ReceiptVerificationViewProps {
  receiptNumber: string;
  token: string;
  isDark: boolean;
  onToggleTheme: () => void;
  onBackToPortal: () => void;
  isLoggedIn: boolean;
}

export function ReceiptVerificationView({
  receiptNumber,
  token,
  isDark,
  onToggleTheme,
  onBackToPortal,
  isLoggedIn,
}: ReceiptVerificationViewProps) {
  const [receipt, setReceipt] = useState<VerifiedReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErrorMsg(null);
    apiRequest<{ receipt: VerifiedReceiptData }>(
      `/feedback/receipt/verify?receipt=${encodeURIComponent(receiptNumber)}&token=${encodeURIComponent(token)}`
    )
      .then((res) => setReceipt(res.receipt))
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Unable to verify feedback receipt.'))
      .finally(() => setLoading(false));
  }, [receiptNumber, token]);

  const ratingDimensions = receipt
    ? [
        { label: 'Teaching Quality', score: receipt.ratings.teaching_quality },
        { label: 'Communication', score: receipt.ratings.communication },
        { label: 'Punctuality & Scheduling', score: receipt.ratings.punctuality },
        { label: 'Subject Knowledge', score: receipt.ratings.subject_knowledge },
        { label: 'Teaching Methodology', score: receipt.ratings.methodology },
        { label: 'Classroom Environment', score: receipt.ratings.classroom_environment },
        { label: 'Lab & Campus Infrastructure', score: receipt.ratings.infrastructure },
        { label: 'Overall Satisfaction', score: receipt.ratings.overall_satisfaction },
      ]
    : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#09111E] dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden dark:border-slate-800 dark:bg-[#09111E]/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-base font-bold tracking-tight text-[#0B192C] dark:text-white">
              Sapthagiri NPS University
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified Feedback Submission Receipt Portal
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle color theme"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onBackToPortal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E40AF] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] dark:bg-blue-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {isLoggedIn ? 'Back to History' : 'Open Student Portal'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {loading ? (
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-80 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          </div>
        ) : errorMsg || !receipt ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center dark:border-red-900/60 dark:bg-[#111C2E]">
            <AlertCircle className="mx-auto h-10 w-10 text-red-600 dark:text-red-400" />
            <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              Receipt Verification Failed
            </h1>
            <p className="mt-2 text-sm text-red-600 dark:text-red-300">
              {errorMsg || 'This QR code receipt could not be verified.'}
            </p>
            <button
              type="button"
              onClick={onBackToPortal}
              className="mt-6 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] dark:bg-blue-600"
            >
              Return to Sapthagiri Feedback Portal
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Verification Status Banner */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <div>
                  <h1 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    Authentic Submission Verified · {receipt.receiptNumber}
                  </h1>
                  <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                    Recorded permanently in Sapthagiri NPS University Academic Evaluation Registry ({receipt.status.toUpperCase()}).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 print:hidden dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Receipt
              </button>
            </div>

            {/* Official Receipt Card */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111C2E]">
              <div className="bg-[#0B192C] px-6 py-5 text-white">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-medium text-blue-300">Sapthagiri NPS University</p>
                    <h2 className="mt-1 text-xl font-bold tracking-tight">
                      {receipt.subject_code}
                      {receipt.short_code ? ` (${receipt.short_code})` : ''} · {receipt.subject_name}
                    </h2>
                    <p className="mt-1 text-xs text-slate-300">{receipt.form_title}</p>
                  </div>
                  <div className="rounded-xl border border-blue-400/30 bg-blue-950/60 px-4 py-2.5 text-left sm:text-right">
                    <p className="text-[11px] text-blue-200">Overall Satisfaction</p>
                    <p className="font-mono text-2xl font-bold text-white tabular-nums">
                      {Number(receipt.ratings.overall_satisfaction).toFixed(1)} / 5.0
                    </p>
                  </div>
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 gap-4 border-b border-slate-200 p-6 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800">
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Receipt ID</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-[#1E40AF] dark:text-blue-400">
                    {receipt.receiptNumber}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Enrollment ID</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                    {receipt.roll_number}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Respondent Privacy</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                    <ShieldCheck className="h-4 w-4 text-[#1E40AF] dark:text-blue-400" />
                    {receipt.is_anonymous ? 'Anonymous Respondent' : receipt.student_name}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Department &amp; Program</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                    {receipt.department_name} · {receipt.course_code}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Semester &amp; Group</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                    {receipt.semester_name}
                    {receipt.elective_group ? ` · ${receipt.elective_group}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Course Faculty</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {receipt.faculty_name}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Submission Timestamp</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-700 dark:text-slate-300">{receipt.submitted_at}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Campaign Deadline</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-700 dark:text-slate-300">{receipt.close_date}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Submission Status</p>
                  <p className="mt-0.5 text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400">
                    {receipt.status}
                  </p>
                </div>
              </div>

              {/* 8 Evaluation Rating Breakdown */}
              <div className="border-b border-slate-200 p-6 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Submitted Evaluation Ratings (1.0 – 5.0 Scale)
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {ratingDimensions.map((dim) => {
                    const score = Number(dim.score ?? 0);
                    const pct = Math.min(100, Math.max(0, (score / 5) * 100));
                    return (
                      <div key={dim.label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{dim.label}</span>
                          <span className="font-mono font-semibold text-[#1E40AF] tabular-nums dark:text-blue-400">
                            {score.toFixed(1)} / 5.0
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-[#1E40AF] dark:bg-blue-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Written Feedback & AI Sentiment */}
              <div className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Written Feedback Comment</h3>
                  {receipt.sentiment && (
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      AI Classification: {receipt.sentiment}
                      {receipt.primary_category ? ` · ${receipt.primary_category}` : ''}
                    </span>
                  )}
                </div>
                <p className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                  {receipt.comment_text || 'No narrative comment was recorded with this submission.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
