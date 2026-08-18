# GrievanceIQ — AI-Powered Citizen Complaint Intelligence Platform

> Built from the project proposal and end-to-end guide documents.

## Architecture

```
frontend/    React + Vite (PWA)          → Vercel
backend/     Node.js + Express + MongoDB → Render
AI Service   Google Gemini API           → External API Call
```

## Quick Start

### Prerequisites
- Node.js 18+ (`node -v`)
- MongoDB running locally OR MongoDB Atlas connection string
- Google Gemini API Key

---

### 1. Backend

```bash
cd backend
# Copy .env.example → .env and fill in MONGO_URI and GEMINI_API_KEY
copy .env.example .env

npm install
npm run dev
# Server: http://localhost:5000
# Health: http://localhost:5000/health
```

---

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create citizen or admin account |
| POST | `/api/auth/login` | Authenticate, receive JWT |
| GET  | `/api/auth/me` | Get current user (protected) |

### Complaints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/complaints` | Submit complaint (text + optional image + location) |
| GET    | `/api/complaints` | List complaints (citizen: own; admin: all with filters) |
| GET    | `/api/complaints/:id` | Full complaint detail + status history |
| PATCH  | `/api/complaints/:id/status` | Admin: update status + note |
| GET    | `/api/complaints/:id/similar` | Get similar/duplicate complaint group |

### Dashboard (admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Summary cards + chart data + trend |

---

## Features

| Module | Description |
|--------|-------------|
| 🔐 Auth | JWT-based login/register for citizens and admins |
| 📝 Complaint Submission | Text + image (Camera/Upload) + GPS location via Map |
| 🤖 AI Classification | Real-time categorization using Google Gemini API |
| ⚡ Priority Prediction | Critical / High / Medium / Low via Gemini |
| 🏛 Dept Recommendation | Auto-routing to correct government department |
| 📊 Admin Dashboard | Charts, filters, status updates, trend analysis |
| 📋 Status Tracking | Full timeline visible to citizens |
| 📱 PWA Support | Installable Progressive Web App with caching |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Recharts, React Router, Lucide, Framer Motion |
| Backend | Node.js, Express.js, Mongoose, JWT, Multer |
| Database | MongoDB Atlas |
| AI/ML | Google Gemini API (`@google/generative-ai`) |
| Deployment | Vercel (Frontend), Render (Backend) |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `MongoNetworkError` | Check MONGO_URI in backend .env or Atlas IP Whitelist (`0.0.0.0/0`) |
| AI Analysis Failing | Ensure `GEMINI_API_KEY` is set in the `.env` (it will fallback gracefully if missing) |
| Server sleeping / Timeout | Free-tier Render takes ~45s to wake up on the first request. Wait 1 min and retry. |
| 401 Unauthorized | Re-login; check JWT_SECRET matches |
| Dashboard charts empty | Check category/priority values are case-exact |

---

## Security Notes

- Passwords hashed with **bcrypt** (12 rounds)
- JWT signed with long random secret
- File upload: images only, 5 MB max
- Role-based access: citizens cannot reach admin routes
- **Never commit `.env` files to Git**
