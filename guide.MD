# 🏆 MLIC CHALLENGE - Production Guide

## 🌐 Live Platform URL
- **Website Link:** [http://localhost:3000](http://localhost:3000)

---

## 🚀 Production Setup Completed:

1. **All Demo Elements & Hardcoded Accounts Removed:**
   - The test switcher bar and all dummy accounts (Sami, Maryam, Karim, Salma, Adel) have been completely removed.
   - The database is clean and ready for real users and organizers.
   - Language toggle (`🌐 EN / عربي`) is neatly integrated into the main navigation bar.

2. **Admin Creation Script (`npm run create-admin`):**
   - Run the script to create your official Admin account:
     ```bash
     npm run create-admin
     ```
     Or with flags:
     ```bash
     node scripts/create_admin.js --name "Admin Name" --email "admin@mlic.com" --password "yourpassword"
     ```

3. **PostgreSQL Connection via `.env` (`DATABASE_URL`):**
   - Open `.env` in the root folder and paste your PostgreSQL connection string:
     ```env
     DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE_NAME
     ```
   - The app automatically initializes all tables, foreign keys, and indexes on startup.

4. **Lajna Jury Approval Workflow:**
   - Only the Admin can approve Lajna accounts from the **"👥 اعتماد المحكمين (Lajna Approvals)"** dashboard.
   - Unapproved jurors cannot access confidential submissions.

---

## 🔒 Confidential Submission & Document Workflow:

1. **Admin Approval for Lajna Judges ("Only Admin can approve Lajna"):**
   - Any user who registers with the `lajna` role starts with `is_approved = 0` (Pending Admin Approval).
   - Unapproved judges are blocked from accessing confidential submissions, downloading documents, or grading projects.
   - **Only the Admin** has access to the **"👥 اعتماد المحكمين (Lajna Approvals)"** dashboard to inspect applicants and click `✅ اعتماد كـ محكّم رسمي` or `⏸️ تجميد الصلاحية`.
2. **You Provide the Ideas ("I'll give the ideas"):**
   - The Organizer (Admin) has full control to create, edit, or customize the challenge ideas via the UI (`➕ إضافة فكرة جديدة` / `✏️ تعديل الفكرة`).
3. **Confidential Database Storage ("not posted on site, goes to the DB"):**
   - The public project wall has been removed.
   - When a participant submits their SWOT and Feasibility study, it is saved directly into the database.
   - Participants only see their own private submission in **"📂 دراستي المقدمة"**.
   - Only **Approved Lajna (لجنة التحكيم المعتمدة)** and **Admin** can access all submitted studies in the database for evaluation.
4. **Document Uploads ("they can post doc"):**
   - Step 5 of the submission wizard allows uploading `.pdf`, `.docx`, `.doc`, `.pptx`, `.xlsx` files up to 20MB.
   - Files are stored securely on the server and linked in the database.
   - Approved Lajna committee members can download and review the full attached document with one click.
5. **Lajna Scoring & Winner Announcement ("see who won later"):**
   - Approved Lajna scores proposals out of 100 points based on target audience fit, SWOT depth, technical feasibility, financial viability, and innovation.
   - Results are hidden until Lajna officially clicks **"📢 إعلان الفائزين رسمياً"**, revealing the Top 3 podium (🥇 1st, 🥈 2nd, 🥉 3rd).

---

## 🔑 Demo Accounts & One-Click Role Switcher

You can switch between any role instantly using the **Quick Role Bar** at the top of the webpage, or log in with these credentials:

| Role | Name | Email | Password | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **👑 Admin / Organizer** | إدارة المسابقة | `admin@agrivers.com` | `admin123` | Create challenges, toggle official winner announcement |
| **⚖️ Lajna (Jury Judge 1)** | د. كريم المنصوري | `lajna@agrivers.com` | `lajna123` | Score proposals (0-100), write feedback, evaluate feasibility |
| **⚖️ Lajna (Jury Judge 2)** | م. سلمى التازي | `salma.lajna@agrivers.com` | `lajna123` | Technical jury scoring and evaluation |
| **🚀 Participant 1** | سامي بوعلام (SolarDrop) | `sami@agrivers.com` | `sami123` | Submit proposals, edit, upvote projects |
| **🚀 Participant 2** | مريم القادري (FreshLock) | `maryam@agrivers.com` | `maryam123` | Submit proposals, edit, upvote projects |

---

## 💡 Official Competition Challenges (The 2 Ideas)

1. **Idea 1: AgriSmart Solar Irrigation & Soil Sensors (نظام الري الذكي بالطاقة الشمسية)**
   - *Problem:* Severe groundwater depletion, 40% water waste, and excessive fuel pump expenses.
   - *Goal:* IoT sensors, automated LoRa valves, solar-driven micro-irrigation saving up to 40% water.
2. **Idea 2: BioFresh Decentralized Cold Storage & Market Link (شبكة غرف التبريد وسوق المزارعين)**
   - *Problem:* 35%–45% post-harvest spoilage of perishable produce and exploitation by market middlemen.
   - *Goal:* Modular clean-energy cold rooms + direct B2B buyer marketplace app.

---

## 📝 5-Step Project Submission Flow ("Post it in site")

Participants fill out a guided proposal wizard:
1. **Project Identity:** Title, Elevator Pitch, Challenge Track selection, Team members.
2. **Target Audience (دراسة الجمهور المستهدف):**
   - Primary target segment.
   - Critical customer pain points.
   - Unique Value Proposition (UVP).
   - TAM / SAM / SOM market sizing.
   - Customer Persona breakdown.
3. **SWOT Matrix (تحليل سوات الرباعي):**
   - 🟢 **Strengths (نقاط القوة)**
   - 🟡 **Weaknesses (نقاط الضعف)**
   - 🔵 **Opportunities (الفرص السوقية)**
   - 🔴 **Threats (التهديدات الخارجية)**
4. **Feasibility Study (دراسة الجدوى - Dirasat Jadwa):**
   - 🛠️ **Technical Feasibility:** TRL readiness, hardware/software specifications, infrastructure.
   - 🛍️ **Market Feasibility:** Market demand, competitive edge, acquisition channels.
   - 💰 **Financial Feasibility (With Live Dynamic Calculator):**
     - Initial Capital (CAPEX)
     - Monthly Operating Expenses (OPEX)
     - Unit economics (Sales price vs unit cost)
     - **Automated Calculations:** Break-even period (months), Year 1 Net Profit, and ROI %.
   - ⚖️ **Operational & Legal Feasibility:** Permits, team structure, execution roadmap.
5. **Review & Post:** Live preview and instant posting to the public gallery.

---

## ⚖️ Lajna (لجنة التحكيم) Evaluation & Winners Podium

Jurors have access to a dedicated evaluation suite with a **100-point rubric**:
- **Target Audience & Problem Fit:** 0 – 20 pts
- **SWOT Analysis Rigor & Realism:** 0 – 20 pts
- **Technical Feasibility:** 0 – 25 pts
- **Financial Viability & ROI:** 0 – 25 pts
- **Innovation & Pitch Quality:** 0 – 10 pts
- **Juror Remarks & Recommendations**

### 🏆 Winners Podium & Official Leaderboard:
- 🥇 **1st Place Champion (Gold Trophy)**
- 🥈 **2nd Place Runner-Up (Silver Medal)**
- 🥉 **3rd Place Third Place (Bronze Medal)**
- Detailed comparison table showing criteria averages across all judges.
- **"Publish Winners Officially"** toggle button for the Lajna committee with festive celebration banner!

---

## 🐘 PostgreSQL Integration

- Schema DDL: [database/init_postgres.sql](file:///d:/agrivers/database/init_postgres.sql)
- Full SQL Data Dump: [database/agrivers_export.sql](file:///d:/agrivers/database/agrivers_export.sql)
- In-app status tab: View live database health, test connection to port 5432, and download the latest `.sql` export.
- Generate fresh export anytime:
  ```bash
  npm run export:pg
  ```
