# GrievanceIQ — AI-Powered Citizen Complaint Intelligence Platform

> Built from the project proposal and end-to-end guide documents.

## Architecture

```
frontend/    React + Vite              → http://localhost:5173
backend/     Node.js + Express + MongoDB → http://localhost:5000
ai-service/  Python + FastAPI           → http://localhost:8000
```

## Quick Start

### Prerequisites
- Node.js 18+ (`node -v`)
- Python 3.10+ (`python --version`)
- MongoDB running locally OR MongoDB Atlas connection string

---

### 1. Backend

```bash
cd backend
# Copy .env.example → .env and fill in MONGO_URI
copy .env.example .env

npm install
npm run dev
# Server: http://localhost:5000
# Health: http://localhost:5000/health
```

---

### 2. AI Service

```bash
cd ai-service
python -m venv venv
venv\Scripts\activate          # Windows

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Health: http://localhost:8000/health
# Docs:   http://localhost:8000/docs
```

---

### 3. Frontend

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
| GET | `/api/dashboard/similar-groups` | All similarity groups |

### AI Service
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/analyze` | Returns category, priority, embedding, department |

---

## Features

| Module | Description |
|--------|-------------|
| 🔐 Auth | JWT-based login/register for citizens and admins |
| 📝 Complaint Submission | Text + image + GPS location |
| 🤖 NLP Classification | TF-IDF + LinearSVC → 6 civic categories |
| ⚡ Priority Prediction | Critical / High / Medium / Low |
| 🔗 Similarity Detection | SentenceTransformer embeddings, cosine ≥ 0.80 |
| 🏛 Dept Recommendation | Auto-routing to correct government department |
| 📊 Admin Dashboard | Charts, filters, status updates, trend analysis |
| 📋 Status Tracking | Full timeline visible to citizens |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Recharts, React Router, Lucide |
| Backend | Node.js, Express.js, Mongoose, JWT, Multer |
| Database | MongoDB |
| AI/ML | Python, FastAPI, scikit-learn, sentence-transformers |
| Deployment | Docker (AI service), Vercel/Render/Railway |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `MongoNetworkError` | Check MONGO_URI in backend .env |
| AI service timeout | Ensure `uvicorn` is running on port 8000 |
| Images not uploading | Check `backend/uploads/` folder exists |
| 401 Unauthorized | Re-login; check JWT_SECRET matches |
| Dashboard charts empty | Check category/priority values are case-exact |

---

## Security Notes

- Passwords hashed with **bcrypt** (12 rounds)
- JWT signed with long random secret — change in production
- File upload: images only, 5 MB max
- Role-based access: citizens cannot reach admin routes
- **Never commit `.env` files to Git**
