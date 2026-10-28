# ⚡ Student Helper

A student routine website: build your routine (or upload a photo of it), get alarms for important tasks, check in to earn up to 100 points a day, keep a streak, set goals, follow friends, chat privately and see reports.

The website and the Android app use **the same server and the same MySQL database**. Both call the same REST API (`/api/...`), so every feature only has to be built once.

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
Browsers can only ring while the site is open in a tab (it can be in the background once you allow notifications). The **Android app** asks the phone to ring at the start of every high priority task, every week, even when the app is closed (see section 6).

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
├── mobile/                    The Android app (Capacitor), see section 6
├── .github/workflows/android.yml  Builds the APK on GitHub
├── render.yaml                How Render runs the site (hosting)
└── docs/API.md                API list for the mobile app
```

**Adding a new feature** usually means: a table in `schema.sql` → a file in `server/routes/` → one `app.use(...)` line in `server.js` → an HTML page in `public/app/` with a script in `public/js/pages/`.

## 6. The mobile app

There are two ways to get Student Helper on a phone. Both use the same account and the same database as the website.

**Android app (APK).** Download it from Settings → Get the app, or directly:
https://github.com/nahiyan-al-mahin/student-helper/releases/download/android/student-helper.apk
Open the file on the phone and allow "Install unknown apps" when Android asks. Alarms for high priority tasks ring even when the app is closed.

**Install from the browser (any phone, also iPhone).** Open the website in Chrome (Android) or Safari (iPhone) and choose "Install app" / "Add to Home Screen". It gets an icon and opens without the browser bar, but alarms only ring while it is open.

### How the Android app is made
`mobile/` is a [Capacitor](https://capacitorjs.com/) project. It does not have its own pages: `mobile/build-web.js` copies `public/` into the app and sets `window.API_URL` to the Render address, so the app talks to the online API.

You don't need Android Studio. Every push to `main` that changes `public/` or `mobile/` makes GitHub build a new APK (see the **Actions** tab) and put it on the `android` release, so the download link above always gives the newest app. Install the new APK over the old one; you stay logged in.

- App icon and splash: `node mobile/scripts/make-assets.js` then `cd mobile && npm run icons`
- Phone alarms: `NativeAlarms` in `public/js/shell.js` (only runs inside the app)
- Signing key: every APK must be signed with the same key to install over the last one. The key is **not** in this repo (it is private). It is saved in the repo's secrets `SH_KEYSTORE_BASE64`, `SH_KEYSTORE_PASSWORD` and `SH_KEY_ALIAS`, and a backup copy is on your PC in `student-helper-signing/`. Never lose it and never share it: with the key, someone else could make a fake update of your app.
- Build on your PC instead (needs Android Studio): `cd mobile`, `npm install`, `npm run sync`, `npm run open`.

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

## 8. Security (what protects the app)
- Passwords are hashed with bcrypt (never stored), 8+ characters. Changing your password logs out every other phone and browser.
- Logins are signed tokens (JWT, HS256). Online the server refuses to start without a long random `JWT_SECRET`.
- Every API route checks that the data belongs to you; locked profiles hide routine, stats and goals from non-followers.
- Chat messages are encrypted in the database (AES-256-GCM, `CHAT_SECRET_KEY`).
- Too many wrong logins from one place: blocked for 15 minutes. All API calls are rate limited.
- Security headers (helmet) with a Content-Security-Policy: only our own scripts can run, which stops injected code (XSS). The Android app has the same rules in each page.
- Profile photos are checked by their real file content, not their name.
- The database connection is encrypted (TLS) and all user input goes through `?` placeholders (no SQL injection).
- The Android app asks for only internet, notifications and alarms, never backs up its data, and only talks to the server over HTTPS.
- `server/.env` and the APK signing key are private and never go to GitHub.

## 9. Problems?
- **"Could not use the database"**: MySQL isn't running, the password in `.env` is wrong, or you skipped `npm run db:setup`. On Render: check `DATABASE_URL` (TiDB uses port **4000**) and that `DB_SSL` is `true`.
- **"CHAT_SECRET_KEY must be 64 hex characters"**: generate one with the command in step 2.
- **Port 3000 is busy**: change `PORT` in `.env`.
- **No alarm sound**: click anywhere on the page once (browsers block sound until you interact), and allow notifications in Settings.
