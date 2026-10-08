<div align="center">

  <img src="https://api.iconify.design/logos:pinterest.svg" width="80" height="80" alt="Pinterest Logo" />

  # 📌 Finmunt • Autonomous Pinterest Publishing Engine
  
  **Self-hosted, 100% automated Pinterest publishing machine powered by local Multimodal AI (`Qwen2.5-VL`), 12-step verified pipeline, and real-time Google Sheets sync.**

  <p align="center">
    <a href="#-architecture--pipeline"><strong>Explore Pipeline »</strong></a> ·
    <a href="#-features"><strong>Features »</strong></a> ·
    <a href="#-quick-start"><strong>Quick Start »</strong></a> ·
    <a href="#-boards-configuration"><strong>Boards Setup »</strong></a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Node.js-20+-22c55e?style=for-the-badge&logo=node.js&logoColor=white" />
    <img src="https://img.shields.io/badge/Ollama-Qwen2.5--VL-ff6f00?style=for-the-badge&logo=ollama&logoColor=white" />
    <img src="https://img.shields.io/badge/Pinterest_API-v5_Official-E60023?style=for-the-badge&logo=pinterest&logoColor=white" />
    <img src="https://img.shields.io/badge/Google_Sheets-Live_Sync-34A853?style=for-the-badge&logo=googlesheets&logoColor=white" />
    <img src="https://img.shields.io/badge/UI-Pinterest_Brand-E60023?style=for-the-badge&logo=pinterest&logoColor=white" />
  </p>

  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=0,2,2&height=120&section=header&text=Zero%20Manual%20Effort%20•%20Drop%20Images%20•%20Auto%20Publish&fontSize=22&fontColor=ffffff&animation=twinkling" width="100%" />

</div>

---

## ⚡ Highlights

- 🧠 **Local Multimodal AI (`qwen2.5vl:3b`)**: Zero cloud AI fees. Analyzes raw images directly on your machine.
- 🎯 **Intelligent 5-Board Categorizer**: Classifies incoming pins into the exact best board based on content intent.
- 🛡️ **Self-Correcting AI Verifier (Step 9)**: Audits every title ($\le 100$), description ($\le 500$), and alt text ($\le 500$) with automatic rewrite loops before publishing.
- ⏰ **5 Fixed Daily Slots**: Automatically publishes at `09:00`, `12:00`, `15:00`, `18:00`, and `21:00`.
- 📊 **Real-Time Google Sheets Webhook**: Live 10-column spreadsheet sync for every single attempt & success.
- 🔒 **Safe FIFO Clean-up**: Local images are deleted **only** after Pinterest returns `HTTP 201 Created`. Never lost on error.
- 🎨 **Official Pinterest-Aesthetic Dashboard**: Real-time 7-calendar-day visual activity log with SSE live streams.

---

## 🏗️ Architecture & Pipeline

```mermaid
flowchart TD
    A[📂 Drop Images in /Images FIFO] --> B[⏰ Daily Scheduler Slot Trigger 09:00, 12:00, 15:00, 18:00, 21:00]
    B --> C[📸 Step 3: Ollama Vision qwen2.5vl:3b Analysis]
    C --> D[✍️ Steps 4-7: Generate Title, Description, Tags, Alt Text]
    D --> E[🎯 Step 8: Classify Single Best Board from 5 Finmunt Boards]
    E --> F[🛡️ Step 9: AI Verification & Character Limit Enforcement]
    F -->|Self-Correction Loop Up to 3x| F
    F --> G[🚀 Step 10: Pinterest API v5 Upload Base64]
    G -->|HTTP 201 Created| H[📊 Step 11: Real-time Google Sheet Sync]
    H --> I[🗑️ Safe Delete Local Image from /Images]
    G -->|Failure| J[🔁 Step 12: Retry Engine Up to 10 Attempts - Image Preserved]
```

---

## 📊 Configured Finmunt Boards

The engine is pre-configured with the 5 official Finmunt boards:

| # | Board Name | Pinterest Board ID | Category Focus |
|---|:---|:---|:---|
| 1 | **Make Money** | `1152640167071860781` | Side hustles, online income, freelancing, digital products, monetization |
| 2 | **Save Money** | `1152640167071860782` | Frugal living, cutting expenses, smart savings hacks, deals |
| 3 | **Budgeting** | `1152640167071860784` | Monthly budget planners, 50/30/20 rule, cash envelopes, expense tracking |
| 4 | **Investing** | `1152640167071860785` | Index funds, ETFs, dividend stocks, real estate, compound growth |
| 5 | **Debt & Credit** | `1152640167071860786` | Credit score hacks, debt snowball/avalanche, financial freedom |

---

## 📋 Google Spreadsheet Schema (`Finmunt`)

Every publish automatically appends a structured 10-column record to Google Sheets:

| Col 1 | Col 2 | Col 3 | Col 4 | Col 5 | Col 6 | Col 7 | Col 8 | Col 9 | Col 10 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Date** | **Post Name** | **Time** | **Tries** | **Title** | **Description** | **Alt Text** | **Board** | **Board Id** | **Status** |
| `YYYY-MM-DD` | `image.png` | `HH:mm:ss` | `1` | Max 100 chars | Max 500 chars | Max 500 chars | Board Name | Official ID | `SUCCESS` |

---

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Ollama](https://ollama.com/) with vision model installed:
  ```bash
  ollama pull qwen2.5vl:3b
  ```

### 2. Clone & Install
```bash
git clone https://github.com/witrfaruk/Pinterest.git
cd Pinterest
npm install
```

### 3. Setup Configuration
Copy the environment template:
```bash
cp .env.example .env
```

Fill in your configuration:
```env
PORT=3000
PINTEREST_APP_ID=your_pinterest_app_id
PINTEREST_APP_SECRET=your_pinterest_app_secret
OLLAMA_MODEL=qwen2.5vl:3b
PUBLISH_SLOTS=09:00,12:00,15:00,18:00,21:00
```

### 4. Start Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

### 5. 1-Click Pinterest OAuth
1. Open [http://localhost:3000](http://localhost:3000).
2. Click **"Pinterest: Connect API"** &rarr; **"Authorize with Pinterest"**.
3. Grant permissions & you're live!

---

## 🎨 Dashboard Preview

- **Pinterest Red (`#E60023`) Aesthetic**: Clean rounded cards, pill badges, and smooth animations.
- **Rolling 7-Calendar-Day Feed**: Full visibility into daily progress, completed slots, and skipped states.
- **Zero Mock Data**: Displays only real scheduled executions and true filesystem states.

---

<div align="center">
  <sub>Built for <strong>Finmunt</strong> • Engineered for 100% Autonomous Content Delivery</sub>
</div>

