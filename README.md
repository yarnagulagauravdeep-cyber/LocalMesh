# LocalMesh

A small prototype web app for the "personal dissatisfaction" branch of the Hyperloop
Inventory Exchange Network concept: a customer types a return review, an NLP
classifier decides whether it's a **hardware defect** or **personal dissatisfaction**,
and (for dissatisfaction) the app decides whether the returned item should go to the
**local warehouse** or the **central hub**, based on mock local demand and climate data.

Hardware defect handling (repair / service-center routing) is intentionally out of
scope for this version — it's classified and shown, but routing for it is a stub.

## How it works

1. Pick a product category (Cooler / Fan / Heater) and a return area, and type a
   review describing the issue.
2. A TF-IDF + logistic regression classifier (trained in-memory at startup on a small
   labeled dataset, see `backend/ml/training_data.py`) decides the return reason.
3. If it's a hardware defect, you get a "not implemented yet" stub.
4. If it's personal dissatisfaction:
   - Recent mock purchase history for that category/area is checked for demand
     (rising or above a threshold) and shown as a bar chart.
   - If there's demand → **local warehouse**.
   - If not, climate fit is checked (does the area's climate suit the category) →
     **local warehouse** if it fits, otherwise **central hub**.

All data (areas, categories, purchase history) is mock data in `backend/mock_data.py`.

## Running it

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Then open http://localhost:8000 in a browser.

## Try these examples

- **Hardware defect:** "The cooler's water pump is leaking and there's a crack in the tank."
- **Dissatisfaction → demand-driven local warehouse** (Cooler, Jaipur): "The cooler works fine but it's too noisy for my room, not what I expected."
- **Dissatisfaction → climate-fit local warehouse** (Heater, Bengaluru): "Heater is fine but I changed my mind, don't need it anymore."
- **Dissatisfaction → central hub** (Heater, Jaipur): "The heater works okay but I just don't like how it looks in my room."

## Tests

```bash
python -m pytest tests/
```
