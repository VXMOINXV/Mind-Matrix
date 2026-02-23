import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database("proctor.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    evidence_url TEXT
  );
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get("/api/students", (req, res) => {
    const students = db.prepare("SELECT * FROM students").all();
    res.json(students);
  });

  app.post("/api/students", (req, res) => {
    const { id, name } = req.body;
    try {
      db.prepare("INSERT INTO students (id, name) VALUES (?, ?)").run(id, name);
      res.status(201).json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Student ID already exists" });
    }
  });

  app.get("/api/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all();
    res.json(logs);
  });

  app.post("/api/logs", (req, res) => {
    const { student_id, type, severity, message, evidence_data } = req.body;
    let evidence_url = null;

    if (evidence_data) {
      const dir = "evidence/screenshots";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `${Date.now()}_${student_id}.png`;
      const filepath = path.join(dir, filename);
      const base64Data = evidence_data.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(filepath, base64Data, 'base64');
      evidence_url = `/evidence/screenshots/${filename}`;
    }

    db.prepare("INSERT INTO logs (student_id, type, severity, message, evidence_url) VALUES (?, ?, ?, ?, ?)")
      .run(student_id, type, severity, message, evidence_url);
    
    io.emit("new_log", { student_id, type, severity, message, timestamp: new Date().toISOString(), evidence_url });
    res.status(201).json({ success: true });
  });

  // Serve evidence
  app.use("/evidence", express.static("evidence"));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`MindMatrix AI Proctor X running on http://localhost:${PORT}`);
  });
}

startServer();
