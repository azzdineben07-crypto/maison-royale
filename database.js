
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
    path.join(__dirname, "maison-royale.db")
);

db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        guests INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Add status to existing databases if it doesn't exist
const columns = db.prepare(
    "PRAGMA table_info(reservations)"
).all();

const hasStatus = columns.some(column => column.name === "status");

if (!hasStatus) {
    db.exec(`
        ALTER TABLE reservations
        ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending'
    `);
}

console.log("Maison Royale Database connected!");

module.exports = db;
