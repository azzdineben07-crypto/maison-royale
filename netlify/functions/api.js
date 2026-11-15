
const serverless = require("serverless-http");
const app = require("../../server");
const { initDatabase } = require("../../database-pg");

let databaseReady;

const expressHandler = serverless(app);

exports.handler = async (event, context) => {
    try {
        if (!databaseReady) {
            databaseReady = initDatabase().catch(error => {
                databaseReady = null;
                throw error;
            });
        }

        await databaseReady;

        return await expressHandler(event, context);

    } catch (error) {
        console.error("Maison Royale function error:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: false,
                message: "Erreur interne du serveur."
            })
        };
    }
};
