# SystemDNA

SystemDNA scans a code repository into a cross-layer knowledge graph and predicts what one change, such as renaming a database column, will break across every layer. It then shows parallel IBM Bob agents fixing each affected part live in a 3D "Agent City".

## Repository layout

| Path | What it is |
|---|---|
| `systemdna/web/` | The Agent City dashboard (Next.js, TypeScript, Tailwind, Cytoscape + three.js). See its [README](systemdna/web/README.md). |
| `systemdna/core/scanner/` | TypeScript repo scanner that produces `graph.json` |
| `bob_sessions/<role>/` | Exported IBM Bob task histories and usage screenshots, one folder per teammate ([index](bob_sessions/README.md)) |
| `TEAM_PLAN.md` | Who owns what, hand-off contracts and checkpoints |
| `SystemDNA — PRD (IBM Bob 2.0 Hackathon).md` | Product requirements |

## Run the dashboard

```bash
cd systemdna/web
npm install
npm run dev     # http://localhost:3000, demo data unless NEXT_PUBLIC_API_URL is set
npm test        # contract tests
npm run build
```

Never put the demo write token in an env file. Type it into the dashboard's Settings page instead.

---

## Hackathon template: security setup

This GitHub project template is for IBM Hackathon projects. It includes pre-configured security files to help prevent accidental credential commits and potential account suspension during the hackathon.

## 🚀 Quick Start

1. **Use this template to create your project:**
   - Click "Use this template" button above and select "Create a new repository"
   - Name your repository
   - Click "Create repository"

2. **Clone your new repository:**

   ```bash
   git clone https://github.com/HACKATHON-ORG/your-repo-name.git
   cd your-repo-name
   ```

3. **Set up environment variables:**

   ```bash
   # Copy the example file
   cp .env.example .env

   # Edit .env with your actual credentials
   # Use your preferred editor (nano, vim, code, etc.)
   nano .env
   ```

4. **Verify .gitignore is working:**

   ```bash
   # This should NOT show .env file
   git status

   # This should confirm .env is ignored
   git check-ignore -v .env
   ```

5. **Start developing!**

## 🔒 Security Features

This template includes:

- **`.gitignore`** - Prevents committing credentials and live session files
- **`.bobignore`** - Prevents AI assistants from logging credentials
- **`.env.example`** - Template for your environment variables

## 📋 Before Every Commit

Always run this checklist:

- [ ] Reviewed `git diff` for sensitive data
- [ ] No hardcoded API keys or passwords
- [ ] `.env` file is NOT in staged changes
- [ ] No files with "credential" or "secret" in name
- [ ] Used environment variables for all credentials

## 🆘 Need Help?

- Read [SECURITY.md](SECURITY.MD) for detailed guidelines
- Contact hackathon support through mentor channel
- Ask in the hackathon Slack workspace

---

**Remember:** Security is everyone's responsibility. When in doubt, ask for help!
