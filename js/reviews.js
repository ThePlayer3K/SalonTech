import { $, escapeHtml, buildStars, createId, showToast } from "./utils.js";
import { getStore, saveStore } from "./store.js";

let selectedRating = 0;

export function setupReviews() {
    if (!$("#reviewForm") && !$("#reviewsList")) return;

    renderRatingButtons();
    renderReviews();

    $("#reviewForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!selectedRating) {
            showToast("Selecione uma nota para enviar a avaliacao.", "error");
            return;
        }

        const store = getStore();
        const review = {
            id: createId("rev"),
            name: $("#reviewName").value.trim(),
            service: $("#reviewService").value,
            rating: selectedRating,
            comment: $("#reviewComment").value.trim(),
            createdAt: new Date().toISOString()
        };

        store.reviews.unshift(review);
        saveStore(store);
        event.target.reset();
        setRating(0);
        renderReviews();
        showToast("Avaliacao registrada. Obrigado!", "success");
    });
}

function renderRatingButtons() {
    const group = $("#ratingButtons");
    if (!group) return;

    group.innerHTML = [1, 2, 3, 4, 5].map((rating) => `
        <button class="star-btn" type="button" role="radio" aria-checked="false" aria-label="${rating} estrelas" data-rating="${rating}">*</button>
    `).join("");

    group.querySelectorAll("[data-rating]").forEach((button) => {
        button.addEventListener("click", () => setRating(Number(button.dataset.rating)));
    });
}

function setRating(value) {
    selectedRating = value;
    if ($("#reviewRating")) $("#reviewRating").value = value || "";
    if ($("#ratingMeaning")) $("#ratingMeaning").textContent = value ? `${value} de 5` : "Selecione uma nota";

    document.querySelectorAll("[data-rating]").forEach((button) => {
        const isActive = Number(button.dataset.rating) <= value;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-checked", String(Number(button.dataset.rating) === value));
    });
}

export function renderReviews() {
    const reviews = getStore().reviews;
    const list = $("#reviewsList");
    const averageScore = $("#avgOverallScore");
    const totalReviews = $("#totalReviewsCount");
    const averageStars = $("#avgStars");
    const total = reviews.length;
    const average = total ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / total : 0;

    if (averageScore) averageScore.textContent = average.toFixed(1);
    if (totalReviews) totalReviews.textContent = `${total} ${total === 1 ? "avaliacao" : "avaliacoes"}`;
    if (averageStars) averageStars.textContent = buildStars(Math.round(average));

    if (!list) return;

    if (!reviews.length) {
        list.innerHTML = `<p class="empty-state">Ainda nao ha avaliacoes cadastradas.</p>`;
        return;
    }

    list.innerHTML = reviews.slice(0, 5).map((review) => `
        <article class="review-card">
            <header>
                <span>
                    <strong>${escapeHtml(review.name)}</strong>
                    <small>${escapeHtml(review.service)}</small>
                </span>
                <span class="review-stars" aria-label="${review.rating} de 5 estrelas">${buildStars(review.rating)}</span>
            </header>
            <p>${escapeHtml(review.comment)}</p>
        </article>
    `).join("");
}
