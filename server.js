
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const { pool, initDatabase } = require("./database-pg");

// ======================================
// 1. SECURITY CONFIGURATION
// ======================================

if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    console.error("ERROR: ADMIN_PASSWORD or SESSION_SECRET is missing in .env");
    process.exit(1);
}

const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const COOKIE_NAME = "mr_admin_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000;

const transporter =
    process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
        ? nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        })
        : null;

if (!transporter) {
    console.log("Email service disabled.");
}

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));

// ======================================
// 2. SESSION FUNCTIONS
// ======================================

function createSession() {
    const payload = {
        admin: true,
        expires: Date.now() + SESSION_DURATION
    };

    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");

    const signature = crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(data)
        .digest("base64url");

    return `${data}.${signature}`;
}

function verifySession(token) {
    if (!token || typeof token !== "string") {
        return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return false;
    }

    const [data, signature] = parts;

    const expectedSignature = crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(data)
        .digest("base64url");

    const received = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (
        received.length !== expected.length ||
        !crypto.timingSafeEqual(received, expected)
    ) {
        return false;
    }

    try {
        const payload = JSON.parse(
            Buffer.from(data, "base64url").toString("utf8")
        );

        return payload.admin === true &&
            Number.isFinite(payload.expires) &&
            payload.expires > Date.now();

    } catch {
        return false;
    }
}

function getCookie(req, name) {
    const cookies = req.headers.cookie || "";

    const item = cookies
        .split(";")
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith(name + "="));

    return item ? item.substring(name.length + 1) : null;
}

function setSessionCookie(res, token) {
    const secure = process.env.NODE_ENV === "production";

    res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? "; Secure" : ""}`
    );
}

function clearSessionCookie(res) {
    const secure = process.env.NODE_ENV === "production";

    res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? "; Secure" : ""}`
    );
}

function requireAdmin(req, res, next) {
    const token = getCookie(req, COOKIE_NAME);

    if (!verifySession(token)) {
        return res.status(401).json({
            success: false,
            message: "Accès non autorisé. Veuillez vous connecter."
        });
    }

    next();
}

// ======================================
// 3. LOGIN RATE LIMIT
// ======================================

const loginAttempts = new Map();

function checkLoginLimit(ip) {
    const now = Date.now();
    const record = loginAttempts.get(ip);

    if (!record || now - record.start > 15 * 60 * 1000) {
        loginAttempts.set(ip, {
            count: 0,
            start: now
        });
    }

    return loginAttempts.get(ip);
}

// ======================================
// 4. LOGIN PAGE
// ======================================

const loginPage = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Login | Maison Royale</title>

<style>
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #10100e;
    font-family: Arial, sans-serif;
    color: #fff;
    padding: 20px;
}

.login-box {
    width: 100%;
    max-width: 420px;
    padding: 45px 35px;
    background: #1b1a17;
    border: 1px solid #9b8050;
    border-radius: 12px;
    text-align: center;
}

.logo {
    color: #d2b477;
    font-size: 27px;
    letter-spacing: 3px;
    margin-bottom: 12px;
}

.subtitle {
    color: #aaa;
    margin-bottom: 35px;
    font-size: 13px;
}

input {
    width: 100%;
    padding: 15px;
    margin-bottom: 18px;
    background: #292823;
    border: 1px solid #514a3b;
    border-radius: 6px;
    color: white;
    outline: none;
}

input:focus {
    border-color: #d2b477;
}

button {
    width: 100%;
    padding: 15px;
    background: #c5a568;
    color: #171511;
    border: none;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
}

button:hover {
    background: #dfc38d;
}

#error {
    color: #ff8585;
    margin-top: 18px;
    font-size: 13px;
    min-height: 18px;
}
</style>
</head>

<body>

<div class="login-box">
    <h1 class="logo">MAISON ROYALE</h1>
    <p class="subtitle">ADMINISTRATION SECURE ACCESS</p>

    <form id="loginForm">
        <input
            type="password"
            id="password"
            placeholder="Mot de passe administrateur"
            autocomplete="current-password"
            required
        >

        <button type="submit" id="loginButton">
            SE CONNECTER
        </button>
    </form>

    <p id="error"></p>
</div>

<script>
document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const password = document.getElementById("password").value;
    const button = document.getElementById("loginButton");
    const error = document.getElementById("error");

    button.disabled = true;
    button.textContent = "Connexion...";
    error.textContent = "";

    try {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ password })
        });

        const result = await response.json();

        if (result.success) {
            window.location.href = "/admin.html";
            return;
        }

        error.textContent = result.message || "Mot de passe incorrect.";

    } catch {
        error.textContent = "Erreur de connexion au serveur.";
    }

    button.disabled = false;
    button.textContent = "SE CONNECTER";
});
</script>

</body>
</html>`;

// ======================================
// 5. PUBLIC WEBSITE FILES
// ======================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
    res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/script.js", (req, res) => {
    res.sendFile(path.join(__dirname, "script.js"));
});

// ======================================
// 6. ADMIN LOGIN AND LOGOUT
// ======================================

app.get("/admin-login", (req, res) => {
    const token = getCookie(req, COOKIE_NAME);

    if (verifySession(token)) {
        return res.redirect("/admin.html");
    }

    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(loginPage);
});

app.post("/api/admin/login", (req, res) => {
    const ip = req.ip;
    const attempts = checkLoginLimit(ip);

    if (attempts.count >= 5) {
        return res.status(429).json({
            success: false,
            message: "Trop de tentatives. Réessayez dans 15 minutes."
        });
    }

    const password = req.body?.password;

    if (typeof password !== "string" || password.length > 200) {
        attempts.count++;

        return res.status(401).json({
            success: false,
            message: "Mot de passe incorrect."
        });
    }

    const receivedHash = crypto
        .createHash("sha256")
        .update(password)
        .digest();

    const expectedHash = crypto
        .createHash("sha256")
        .update(ADMIN_PASSWORD)
        .digest();

    const passwordIsCorrect = crypto.timingSafeEqual(
        receivedHash,
        expectedHash
    );

    if (!passwordIsCorrect) {
        attempts.count++;

        return res.status(401).json({
            success: false,
            message: "Mot de passe incorrect."
        });
    }

    loginAttempts.delete(ip);

    const token = createSession();

    setSessionCookie(res, token);

    res.json({
        success: true,
        message: "Connexion réussie."
    });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
    clearSessionCookie(res);

    res.json({
        success: true,
        message: "Déconnexion réussie."
    });
});

// ======================================
// 7. PROTECTED ADMIN DASHBOARD
// ======================================

app.get("/admin.html", (req, res) => {
    const token = getCookie(req, COOKIE_NAME);

    if (!verifySession(token)) {
        return res.redirect("/admin-login");
    }

    res.setHeader("Cache-Control", "no-store");

    const adminFileCandidates = [
        path.join(__dirname, "admin.html"),
        path.resolve(__dirname, "../../admin.html"),
        path.resolve(process.cwd(), "admin.html")
    ];

    const adminFilePath = adminFileCandidates.find(file =>
        fs.existsSync(file)
    );

    if (!adminFilePath) {
        console.error("Admin dashboard not found. Checked:", adminFileCandidates);
        return res.status(500).send("Admin dashboard file not found.");
    }

    res.sendFile(adminFilePath);
});



// ======================================
// 8. TEST API
// ======================================

app.get("/api/test", (req, res) => {
    res.json({
        success: true,
        message: "Maison Royale API is running!"
    });
});

// ======================================
// 9. CREATE RESERVATION - PUBLIC
// ======================================

app.post("/api/reservations", async (req, res) => {
    const { name, email, phone, date, time, guests } = req.body || {};

    if (!name || !email || !phone || !date || !time || !guests) {
        return res.status(400).json({
            success: false,
            message: "Veuillez remplir tous les champs."
        });
    }

    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof phone !== "string" ||
        typeof date !== "string" ||
        typeof time !== "string"
    ) {
        return res.status(400).json({
            success: false,
            message: "Données invalides."
        });
    }

    if (
        name.length > 100 ||
        email.length > 150 ||
        phone.length > 30 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return res.status(400).json({
            success: false,
            message: "Veuillez vérifier vos informations."
        });
    }

    const numberOfGuests = Number(guests);

    if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1 || numberOfGuests > 50) {
        return res.status(400).json({
            success: false,
            message: "Nombre de personnes invalide."
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO reservations
            (name, email, phone, date, time, guests)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id`,
            [
                name.trim(),
                email.trim(),
                phone.trim(),
                date,
                time,
                numberOfGuests
            ]
        );

        res.status(201).json({
            success: true,
            message: "Réservation enregistrée avec succès !",
            reservationId: Number(result.rows[0].id)
        });

    } catch (error) {
        console.error("Database error:", error);

        res.status(500).json({
            success: false,
            message: "Erreur lors de l'enregistrement."
        });
    }
});

// ======================================
// 10. GET RESERVATIONS - ADMIN ONLY
// ======================================

app.get("/api/reservations", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM reservations ORDER BY id DESC"
        );

        res.setHeader("Cache-Control", "no-store");

        res.json({
            success: true,
            reservations: result.rows
        });

    } catch (error) {
        console.error("Error fetching reservations:", error);

        res.status(500).json({
            success: false,
            message: "Erreur lors du chargement des réservations."
        });
    }
});

// ======================================
// 11. DELETE RESERVATION - ADMIN ONLY
// ======================================

app.delete("/api/reservations/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: "ID de réservation invalide."
        });
    }

    try {
        const result = await pool.query(
            "DELETE FROM reservations WHERE id = $1",
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Réservation introuvable."
            });
        }

        res.json({
            success: true,
            message: "Réservation supprimée avec succès !"
        });

    } catch (error) {
        console.error("Error deleting reservation:", error);

        res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression."
        });
    }
});

// ======================================
// 12. UPDATE STATUS + SEND EMAIL
// ======================================

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

app.put("/api/reservations/:id/status", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;

    const allowedStatuses = ["Pending", "Confirmed", "Cancelled"];

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: "ID invalide."
        });
    }

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: "Statut invalide."
        });
    }

    try {
        const found = await pool.query(
            "SELECT * FROM reservations WHERE id = $1",
            [id]
        );

        if (found.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Réservation introuvable."
            });
        }

        const reservation = found.rows[0];
        const previousStatus = reservation.status;

        await pool.query(
            "UPDATE reservations SET status = $1 WHERE id = $2",
            [status, id]
        );

        const shouldSendEmail =
            (status === "Confirmed" && previousStatus !== "Confirmed") ||
            (status === "Cancelled" && previousStatus !== "Cancelled");

        if (shouldSendEmail && transporter) {
            try {
                const isConfirmed = status === "Confirmed";

                await transporter.sendMail({
                    from: `"Maison Royale" <${process.env.GMAIL_USER}>`,
                    to: reservation.email,

                    subject: isConfirmed
                        ? "Confirmation de votre réservation - Maison Royale"
                        : "Annulation de votre réservation - Maison Royale",

                    html: `
                        <h2>Maison Royale</h2>

                        <h3>
                            ${isConfirmed
                                ? "Votre réservation est confirmée !"
                                : "Votre réservation a été annulée."}
                        </h3>

                        <p>Bonjour ${escapeHtml(reservation.name)},</p>

                        <p>
                            ${isConfirmed
                                ? "Nous avons le plaisir de confirmer votre réservation."
                                : "Nous vous informons que votre réservation a été annulée."}
                        </p>

                        <p><strong>Date :</strong> ${escapeHtml(reservation.date)}</p>
                        <p><strong>Heure :</strong> ${escapeHtml(reservation.time)}</p>
                        <p><strong>Nombre de personnes :</strong> ${escapeHtml(reservation.guests)}</p>

                        <p>Nous vous remercions pour votre confiance.</p>
                        <p>L'équipe Maison Royale</p>
                    `
                });

                console.log("Email sent to:", reservation.email);

            } catch (emailError) {
                console.error("Email error:", emailError);

                return res.status(200).json({
                    success: true,
                    emailSent: false,
                    message: "Statut mis à jour, mais l'email n'a pas pu être envoyé."
                });
            }
        } else if (shouldSendEmail && !transporter) {
            console.log("Email skipped: Gmail is not configured.");
        }

        res.json({
            success: true,
            emailSent: shouldSendEmail && !!transporter,
            message: "Statut mis à jour !"
        });

    } catch (error) {
        console.error("Status update error:", error);

        res.status(500).json({
            success: false,
            message: "Erreur de mise à jour."
        });
    }
});

// ======================================
// 13. EXPORT APP / LOCAL SERVER
// ======================================

if (require.main === module) {
    initDatabase()
        .then(() => {
            app.listen(PORT, () => {
                console.log("Maison Royale PostgreSQL connected!");
                console.log(`Server running at http://localhost:${PORT}`);
            });
        })
        .catch((error) => {
            console.error("Failed to initialize PostgreSQL:", error);
            process.exit(1);
        });
}

module.exports = app;