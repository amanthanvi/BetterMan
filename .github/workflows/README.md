# GitHub Actions Workflows

## Required Secrets

To use the deployment workflows, you need to configure the following secrets in your GitHub repository settings:

### Vercel (Frontend Deployment)
- `VERCEL_TOKEN`: Your Vercel authentication token
  - Get it from: https://vercel.com/account/tokens
- `VERCEL_ORG_ID`: Your Vercel organization ID (optional if using personal account)
- `VERCEL_PROJECT_ID`: Your Vercel project ID

### Render (Backend Deployment)
- `RENDER_API_KEY`: Your Render API key
  - Get it from: https://dashboard.render.com/u/settings/api-keys
- `RENDER_SERVICE_ID`: Your Render service ID
  - Find it in your service's dashboard URL

### Alternative Backend Deployment Options

If you prefer Railway instead of Render:
- `RAILWAY_TOKEN`: Your Railway API token
  - Get it from: https://railway.app/account/tokens

## Workflow Descriptions

### `ci.yml`
Runs on every push and pull request to ensure code quality:
- Frontend: Linting, type checking, tests, and build
- Backend: Linting, tests with coverage

### `deploy.yml`
Runs on pushes to main branch:
1. Runs CI checks
2. Parses man pages using Ubuntu's man database
3. Deploys backend to Render
4. Deploys frontend to Vercel

### `update-man-pages.yml`
Runs weekly (Sunday at midnight) or manually:
- Updates the man pages database
- Commits changes back to the repository

## Local Testing

To test workflows locally, you can use [act](https://github.com/nektos/act):

```bash
# Test CI workflow
act -j frontend

# Test with secrets
act -s VERCEL_TOKEN=xxx -s RENDER_API_KEY=yyy
```