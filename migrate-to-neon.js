
require("dotenv").config();

const Database = require("better-sqlite3");
const { Pool } = require("pg");

const sqlite = new Database("./maison-royale.db", {
    readonly: true
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    const client = await pool.connect();

    try {
        const reservations = sqlite.prepare(
            "SELECT * FROM reservations ORDER BY id ASC"
        ).all();

        await client.query("BEGIN");

        for (const r of reservations) {
            await client.query(
                `INSERT INTO reservations
                (id, name, email, phone, date, time, guests, status, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT (id) DO NOTHING`,
                [
                    r.id,
                    r.name,
                    r.email,
                    r.phone,
                    r.date,
                    r.time,
                    r.guests,
                    r.status || "Pending",
                    r.created_at || null
                ]
            );
        }

        await client.query(`
            SELECT setval(
                pg_get_serial_sequence('reservations', 'id'),
                COALESCE((SELECT MAX(id) FROM reservations), 1),
                EXISTS(SELECT 1 FROM reservations)
            )
        `);

        await client.query("COMMIT");

        const result = await client.query(
            "SELECT COUNT(*) FROM reservations"
        );

        console.log("Migration successful!");
        console.log("Old reservations:", reservations.length);
        console.log("Reservations in Neon:", result.rows[0].count);

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Migration failed:", error.message);
    } finally {
        client.release();
        sqlite.close();
        await pool.end();
    }
}

migrate();
