# ⚡ Student Helper

A student routine website: build your routine (or upload a photo of it), get alarms for important tasks, check in to earn up to 100 points a day, keep a streak, set goals, follow friends, chat privately and see reports.

The website and the future mobile app use **the same server and the same MySQL database**. The website calls a REST API (`/api/...`) and the mobile app will call the same API, so every feature only has to be built once.

---

## 1. What you need (one time)

| Tool | Why | Get it |
|------|-----|--------|
| **Node.js 18 or newer** (LTS) | Runs the server | https://nodejs.org |
| **MySQL 8** (or MariaDB / XAMPP) | The database | https://dev.mysql.com/downloads/installer/ or XAMPP |

Check that Node works by opening **PowerShell** and typing `node -v`.

## 2. Set up the project (one time)

Open PowerShell in this folder, then:

```powershell
cd server
npm install                     # downloads the packages (express, mysql2 ...)
copy .env.example .env          # creates your settings file
```

Open `server\.env` in VS Code and fill in:

- `DB_USER` / `DB_PASSWORD`: your MySQL login (XAMPP default is `root` with an empty password)
- `JWT_SECRET`: any long random text
- `CHAT_SECRET_KEY`: make one with this command and paste the result:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Then create the database and tables:

```powershell
npm run db:setup
npm run seed        # optional: adds demo users with 3 weeks of history
```

## 3. Run it

```powershell
npm start           # or:  npm run dev   (auto restarts when you change a file)
```

Open **http://localhost:3000**. If you ran the seed, log in with **demo / demo123** (also `rafi` and `nadia`, same password).

To open it on your phone (same Wi-Fi), find your PC's IP with `ipconfig` and visit `http://<your-ip>:3000`.

---

## 4. How the features work

| # | Feature | Where |
|---|---------|-------|
| 1 | Make a weekly routine, **import it with any AI (JSON)**, or upload a photo of it | Routine page |
| 2 | **Alarms** only for 🔔 *High priority* tasks (sound + popup + browser notification) | Every page (`js/shell.js`) |
| 3 | **Streaks**: a day counts when you earn at least 70 points | Today, Profile, Reports |
| 4 | **Important tasks & events** with a calendar | Important page |
| 5 | **Goals**: daily / weekly / one-time. Study tasks can add hours automatically | Goals page |
| 6 | Each student has their own **account** (password is hashed with bcrypt) | Login / Register |
| 7, 11 | **Follow** others, see their progress and success % (100% if perfect) | People + Profile |
| 8 | **Check-in rule**: 15 minutes to check in after a task starts, then mark it done. 100 points a day are split between that day's tasks (High priority tasks count double). No check-in = no points | Today page |
| 9 | **Customize profile** and **lock** it (private: followers need your approval) | Settings |
| 10 | **Private chat**. Messages are **encrypted (AES-256-GCM)** before they go into MySQL, so the `messages` table only holds unreadable ciphertext | Chat page |
| 12 | **Reports**: success %, check-in rate, best time of day, most skipped task, study hours and "how your routine helps your life" | Reports page |

### Import with AI (JSON), for any kind of routine
Grid timetables, colourful planners and handwriting are too hard for the simple photo reader, so the Routine page has **🤖 Import with AI (JSON)**:
1. Click **Copy prompt**.
2. Paste it into any AI chat (ChatGPT, Gemini, Claude, Copilot…) and attach a picture of the routine.
3. Paste the AI's answer back (or upload it as a `.json` file), click **Check tasks**, fix anything in the table, and save.

The prompt is the `AI_PROMPT` text at the top of the JSON section in `public/js/pages/routine.js`. The app is forgiving: it ignores extra text or ```json fences around the answer, accepts `9 AM` or `21:00`, `"weekdays"` or `["Mon","Tue"]`, splits tasks that cross midnight, skips night sleep, and merges the same task on different days. Example file: `docs/example-routine.json`.

JSON format:
```json
{ "tasks": [
  { "title": "Online course study", "days": ["Sat"], "start": "13:00", "end": "15:30", "category": "study", "priority": "high", "notes": "" }
] }
```
`category` is one of study, work, exercise, personal, break, other. `priority` is high (alarm + double points) or normal.

### About the photo upload
The photo is read **in the browser** with [Tesseract.js](https://tesseract.projectnaptha.com/) (free OCR, no API key, needs internet the first time). It looks for lines like `8:00 - 9:30 Math` or `Mon 4pm-5pm Gym`, shows you the rows to check and fix, then saves them. It only works well with a clear, typed list. For anything else use **Import with AI** above.

### About alarms on the website
Browsers can only ring while the site is open in a tab (it can be in the background once you allow notifications). Real phone alarms that work with the app closed will come with the mobile app, using the same `/api/today` data.

### Settings you can change (`server/.env`)
- `CHECKIN_WINDOW_MINUTES` (default 15)
- `STREAK_MIN_POINTS` (default 70)

---

## 5. Project structure

```
student-helper/
├── database/schema.sql        All MySQL tables (with comments)
├── server/                    Node.js + Express backend
│   ├── server.js              Starts everything, lists all API routes
│   ├── config.js  db.js       Settings and the MySQL connection
│   ├── setup-db.js            npm run db:setup
│   ├── seed-demo.js           npm run seed
│   ├── middleware/auth.js     Login tokens (JWT)
│   ├── routes/                One file per feature (auth, routine, today, goals, chat ...)
│   └── utils/routine.js       Points, check-in status, streak and success % rules
├── public/                    The website (plain HTML + CSS + JavaScript)
│   ├── index.html             Landing page
│   ├── login.html  register.html
│   ├── app/*.html             The app pages
│   ├── css/style.css          All styles (colors at the top, dark mode included)
│   └── js/
│       ├── api.js             Calls the API + small helpers
│       ├── icons.js           All SVG icons (<i data-icon="bell"></i>)
│       ├── shell.js           Menu + alarm engine
│       └── pages/*.js         One script per page
├── render.yaml                How Render runs the site (hosting)
└── docs/API.md                API list for the mobile app
```

**Adding a new feature** usually means: a table in `schema.sql` → a file in `server/routes/` → one `app.use(...)` line in `server.js` → an HTML page in `public/app/` with a script in `public/js/pages/`.

## 6. Going mobile later
The API already uses **JSON + token login** (`Authorization: Bearer <token>`), which is exactly what a mobile app needs. Good next steps:
- **React Native (Expo)** or **Flutter** app that calls the same `/api` (see `docs/API.md`)
- Push notifications for alarms (Expo Notifications / Firebase)
- The phone app talks to your hosted address (see section 7), e.g. `https://student-helper.onrender.com/api`, so it uses the **same database** as the website. In a web-view based app, set `window.API_URL = 'https://student-helper.onrender.com'` before loading `api.js`.

## 7. Put it online for free (Render + TiDB Cloud)
The website and the API run together on **Render** (free). The database lives on **TiDB Cloud** (free, works exactly like MySQL). The future phone app calls the same Render address, so everyone shares one database.

**A. Database: TiDB Cloud**
1. Sign up at https://tidbcloud.com and create a **Starter** cluster (free). Pick region **Singapore (ap-southeast-1)**, the closest to Render's Singapore servers.
2. Open the cluster → **Connect**. Choose "General", then **Generate password** and copy it somewhere safe.
3. Build your link from the values shown:
   `mysql://USER:PASSWORD@HOST:4000/student_helper`
   USER looks like `2abc123.root`, HOST looks like `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`.
   If the password has symbols like `@ : / # ?`, generate a new one, or replace them (`@` → `%40`).
4. Keep the spending limit at **$0** so it can never charge you.

**B. Code on GitHub**: Render deploys from a GitHub repository. Your `.env` file is never uploaded (it is in `.gitignore`).

**C. Website + API: Render**
1. Sign up at https://render.com with GitHub.
2. **New → Blueprint** → pick your repository. Render reads `render.yaml` and asks for two values:
   - `DATABASE_URL`: the link from step A3
   - `CHAT_SECRET_KEY`: a new 64-character key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Never change it later**, or old chats can't be read.
3. Click **Apply**. The build installs everything and creates the tables (`npm run db:setup`). After a few minutes your site is live at `https://student-helper-xxxx.onrender.com`.
4. Optional demo accounts: on your PC, put the same `DATABASE_URL`, `DB_SSL=true` and `CHAT_SECRET_KEY` in `server/.env` and run `npm run seed`.

**Good to know about the free plan**
- Render's free server **sleeps after 15 minutes** with no visitors. The first visit after that takes about a minute to wake it up. Then it's fast again.
- Every push to GitHub redeploys the site automatically.
- Profile pictures are stored in the database, so they survive restarts.
- The time zone for "today", check-ins and streaks is `APP_TIMEZONE` (Asia/Dhaka).

## 8. Problems?
- **"Could not use the database"**: MySQL isn't running, the password in `.env` is wrong, or you skipped `npm run db:setup`. On Render: check `DATABASE_URL` (TiDB uses port **4000**) and that `DB_SSL` is `true`.
- **"CHAT_SECRET_KEY must be 64 hex characters"**: generate one with the command in step 2.
- **Port 3000 is busy**: change `PORT` in `.env`.
- **No alarm sound**: click anywhere on the page once (browsers block sound until you interact), and allow notifications in Settings.
