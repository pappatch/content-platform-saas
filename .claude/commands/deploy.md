Read CLAUDE.md fully, then produce an AWS deployment status report and actionable next steps.

## Current State Assessment

Check the following and report status for each:

1. **Database** — is `DATABASE_URL` still pointing to SQLite? Check `backend/.env`
2. **Secret key** — is `SECRET_KEY` a real secret (not "your-secret-key")? Check `backend/.env` (report yes/no, don't print the value)
3. **API keys set** — TAVILY, GOOGLE, ANTHROPIC, UNSPLASH all present in `.env`?
4. **Dockerfile** — does `backend/Dockerfile` exist?
5. **Docker Compose** — does `docker-compose.yml` exist at repo root?
6. **CI/CD** — does `.github/workflows/` exist?
7. **Frontend build** — run `cd frontend && npm run build 2>&1 | tail -5` to check for build errors
8. **Site renderer build** — run `cd site-renderer && npm run build 2>&1 | tail -5`

## Deployment Checklist

Show each item as ✅ done or 🔲 pending:

### Infrastructure
- [ ] Choose compute: EC2 (simple, manual) vs ECS Fargate (managed containers) vs Elastic Beanstalk (easiest)
- [ ] RDS Postgres instance created (or Aurora Serverless for cost savings)
- [ ] `DATABASE_URL` updated to Postgres connection string
- [ ] S3 bucket created for frontend builds
- [ ] CloudFront distribution pointing to S3
- [ ] Route 53 or external DNS configured for each site domain
- [ ] SSL/TLS certificates via ACM

### Backend
- [ ] `Dockerfile` written for FastAPI app
- [ ] Environment variables moved to AWS Secrets Manager or Parameter Store
- [ ] Health check endpoint exists (`GET /health` or similar)
- [ ] CORS origins updated to production domains (currently allows all)
- [ ] `alembic upgrade head` run against production Postgres DB

### Frontend (Admin)
- [ ] `VITE_API_BASE` set to production backend URL in build env
- [ ] `npm run build` produces clean output in `frontend/dist/`
- [ ] Deployed to S3 + CloudFront (or Amplify)

### Site Renderers
- [ ] One build per site with correct `VITE_SITE_ID` baked in
- [ ] Each renderer deployed separately (separate S3 prefix or subdomain)

### Operations
- [ ] Background workers (`scrape_worker`, `review_worker`) running as separate processes or ECS tasks
- [ ] CloudWatch logs configured
- [ ] Alerting on worker failures

## Recommended First Steps

If nothing is deployed yet, suggest this order:

1. Write `backend/Dockerfile` + `docker-compose.yml` for local parity
2. Test with Postgres locally: `DATABASE_URL=postgresql://...` + `alembic upgrade head`
3. Provision RDS Postgres (t3.micro for dev, t3.small for prod)
4. Deploy backend to EC2 or ECS (single instance is fine to start)
5. Build frontend + renderer, upload to S3, create CloudFront distributions
6. Update DNS for each site domain

Offer to help implement any of these steps if the user asks.
