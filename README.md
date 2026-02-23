# MINDMATRIX AI PROCTOR X

**"Let's Hack the Future"**

Advanced AI-powered exam proctoring system for real-time cheating detection using computer vision and behavioral analysis.

## 🚀 Features
- **Multi-Student Tracking**: Real-time monitoring of students via webcam.
- **AI Behavioral Analysis**: Detects looking away, looking down, and suspicious head movements.
- **Object Detection**: Detects mobile phones and other unauthorized devices using Gemini 2.5 Vision.
- **Suspicion Scoring**: Dynamic scoring system (0-100) based on detected behaviors.
- **Real-time Alerts**: Instant visual and logged alerts for proctors.
- **Evidence Storage**: Automatically captures screenshots of suspicious activities.
- **Futuristic Dashboard**: High-tech control panel with live feed and logs.

## 🛠 Tech Stack
- **Frontend**: React 19, Tailwind CSS 4, Motion, Lucide Icons.
- **Backend**: Node.js, Express, Socket.io, SQLite (better-sqlite3).
- **AI Engine**: Google Gemini 2.5 Flash (Vision).

## 📦 Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run the Application (Web)**:
   ```bash
   npm run dev
   ```

## 🖥️ Desktop Application (Windows .EXE)

To run the application as a standalone desktop app or build an executable:

1. **Run in Desktop Mode (Development)**:
   ```bash
   npm run electron:start
   ```

2. **Build Windows Executable (.exe)**:
   ```bash
   npm run electron:build
   ```
   The generated `.exe` file will be located in the `release/` folder.

## 📂 Project Structure
- `server.ts`: Express server with WebSocket and SQLite integration.
- `src/App.tsx`: Main futuristic dashboard UI.
- `src/services/geminiService.ts`: AI analysis logic using Gemini API.
- `evidence/`: Directory for captured screenshots (auto-created).
- `proctor.db`: SQLite database for students and logs.

## 🎓 Credits
- **Created By**: Md Moinuddin Islam (Dept: CST, Sem: 1st)
- **Idea By**: Suman Dutta
- **Institution**: The Calcutta Technical School
- **Event**: Tech Fest

---
*Developed for educational and demonstration purposes.*
