
const reservationForm = document.getElementById("reservation-form");

if (reservationForm) {
    reservationForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const submitButton = reservationForm.querySelector('button[type="submit"]');

        const data = {
            name: reservationForm.querySelector('input[type="text"]').value.trim(),
            email: reservationForm.querySelector('input[type="email"]').value.trim(),
            phone: reservationForm.querySelector('input[type="tel"]').value.trim(),
            date: reservationForm.querySelector('input[type="date"]').value,
            time: reservationForm.querySelector('input[type="time"]').value,
            guests: reservationForm.querySelector("select").value
        };

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Envoi en cours...";
        }

        try {
            const response = await fetch("/api/reservations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });

            const responseText = await response.text();

            let result;

            try {
                result = JSON.parse(responseText);
            } catch {
                throw new Error(
                    "Réponse serveur invalide (HTTP " + response.status + ")."
                );
            }

            if (!response.ok) {
                throw new Error(result.message || "Erreur HTTP " + response.status);
            }

            alert(result.message || "Réservation enregistrée avec succès !");
            reservationForm.reset();

        } catch (error) {
            console.error("Reservation error:", error);
            alert(error.message || "Impossible de contacter le serveur.");

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Réserver";
            }
        }
    });
}

