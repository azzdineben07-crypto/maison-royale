const reservationForm = document.getElementById("reservation-form");

reservationForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const data = {
        name: reservationForm.querySelector('input[type="text"]').value.trim(),
        email: reservationForm.querySelector('input[type="email"]').value.trim(),
        phone: reservationForm.querySelector('input[type="tel"]').value.trim(),
        date: reservationForm.querySelector('input[type="date"]').value,
        time: reservationForm.querySelector('input[type="time"]').value,
        guests: reservationForm.querySelector("select").value
    };

    try {
        const response = await fetch("/api/reservations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            alert(result.message);
            return;
        }

        alert(result.message);
        reservationForm.reset();

    } catch (error) {
        alert("Impossible de contacter le serveur.");
        console.error(error);
    }
});