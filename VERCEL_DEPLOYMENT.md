# Vercel Deployment Guide — Sapthagiri NPS University Student Feedback System

This repository is configured for **Vercel** deployment with both:
1. **Production Vite + React Frontend** (`dist/`)
2. **Express Serverless API Backend** (`api/index.ts` -> `/api/*`)

---

## Option A: Deploy Directly via Vercel CLI

1. Install and authenticate the Vercel CLI locally:
   ```bash
   npm i -g vercel
   vercel login
   ```
2. Deploy to preview or production:
   ```bash
   vercel --prod
   ```

## Option B: Deploy via GitHub Integration (Recommended)

1. Push the project to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Sapthagiri NPS University Student Feedback System"
   git branch -M main
   git remote add origin https://github.com/<your-username>/sapthagiri-student-feedback.git
   git push -u origin main
   ```
2. Open **Vercel -> Add New Project** and import your GitHub repository.
3. Vercel automatically reads `vercel.json`:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Serverless API**: `api/index.ts` handles all `/api/*` routes.

---

## Required Vercel Environment Variables

Configure these in **Vercel Project Settings -> Environment Variables**:

| Variable | Description | Required |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for sentiment analysis, summarization & AI assistant | Yes (for AI features) |
| `AUTH_SECRET` | 32+ char random string for consistent HMAC-SHA256 JWT signing across serverless instances | **Yes (Production)** |
| `FRONTEND_ORIGIN` | Optional CORS origin (e.g. `https://your-app.vercel.app`) | Optional |

> **Note on Persistence**: When `VERCEL=1` is detected, SQLite runs inside `/tmp/sapthagiri-feedback-data` so serverless functions boot cleanly with all seeded Sapthagiri NPS University curriculum, 8-semester tracking, and QR workflows. Because Vercel serverless `/tmp` storage is ephemeral across cold starts, use the **Reports & Exports -> Flask + MySQL + Vercel (.zip)** bundle with a managed MySQL database if long-term multi-region persistence is required.
