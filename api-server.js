import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApiServer(basePath) {
  const app = express();
  const dataPath = basePath || __dirname;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Ensure directories exist
  const dirs = ["evidence", "videos", "logs"];
  dirs.forEach((dir) => {
    const dirPath = path.join(dataPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });

  // Setup SQLite
  const dbPath = path.join(dataPath, "logs", "database.sqlite");
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err);
    else console.log("Connected to SQLite database at", dbPath);
  });

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId TEXT,
        event TEXT,
        confidence REAL,
        timestamp TEXT,
        evidenceFile TEXT,
        videoFile TEXT
      )
    `);
  });

  // Setup Multer for video uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const studentId = req.body.studentId || "Unknown";
      const studentDir = path.join(dataPath, "evidence", studentId);
      if (!fs.existsSync(studentDir)) {
        fs.mkdirSync(studentDir, { recursive: true });
      }
      cb(null, studentDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `video_${uniqueSuffix}.webm`);
    },
  });
  const upload = multer({ storage });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/evidence", upload.single("video"), (req, res) => {
    try {
      const { studentId, event, confidence, timestamp, imageBase64 } = req.body;
      const videoFile = req.file ? req.file.filename : null;
      let imageFile = null;

      const studentDir = path.join(dataPath, "evidence", studentId);
      if (!fs.existsSync(studentDir)) {
        fs.mkdirSync(studentDir, { recursive: true });
      }

      if (imageBase64) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        imageFile = `screenshot_${Date.now()}.png`;
        fs.writeFileSync(path.join(studentDir, imageFile), base64Data, "base64");
      }

      const stmt = db.prepare(
        "INSERT INTO events (studentId, event, confidence, timestamp, evidenceFile, videoFile) VALUES (?, ?, ?, ?, ?, ?)"
      );
      stmt.run(studentId, event, confidence, timestamp, imageFile, videoFile, function (err) {
        if (err) {
          console.error("Error inserting event:", err);
          return res.status(500).json({ error: "Database error" });
        }
        res.json({ success: true, id: this.lastID });
      });
      stmt.finalize();
    } catch (error) {
      console.error("Error saving evidence:", error);
      res.status(500).json({ error: "Failed to save evidence" });
    }
  });

  app.get("/api/logs", (req, res) => {
    db.all("SELECT * FROM events ORDER BY timestamp DESC LIMIT 100", [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }
      res.json(rows);
    });
  });

  // Serve static evidence files
  app.use("/evidence", express.static(path.join(dataPath, "evidence")));

  return app;
}
