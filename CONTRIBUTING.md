# Contributing to GrievanceIQ

First off, thank you for considering contributing to GrievanceIQ! It's people like you that make GrievanceIQ such a great tool for civic management.

## Where do I go from here?

If you've noticed a bug or have a feature request, make sure to check our [Issues](https://github.com/Vishh70/grievanceiq/issues) first to see if someone else has already created it. If not, feel free to open a new issue!

## Development Setup

We have split the application into two parts: Frontend and Backend (Node + Python ML).
For a quick start, follow these instructions:

### Backend & ML Setup
1. Fork the repo and clone your fork.
2. Navigate to `backend/` and run `npm install`.
3. Set up the Python ML Service in `backend/ml` using `pip install -r requirements.txt`.
4. Copy `.env.example` to `.env` and configure your local Postgres/Supabase keys.

### Frontend Setup
1. Navigate to `frontend/` and run `npm install`.
2. Configure `.env` based on `.env.example`.
3. Run `npm run dev` to start the Vite server.

## Pull Requests
1. Create a new branch for your feature or bugfix (`git checkout -b feature/my-feature`).
2. Make your changes and commit them with descriptive commit messages.
3. Push to your fork and submit a Pull Request.

> [!NOTE]
> Ensure all local tests pass by running `npm test` before submitting your PR!
