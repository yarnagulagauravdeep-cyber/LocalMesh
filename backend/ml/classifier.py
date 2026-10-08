"""TF-IDF + Logistic Regression classifier for return-reason text.

Trained once, in-memory, at app startup on the small labeled dataset in
training_data.py. No persisted model file, no external API calls.
"""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

from backend.ml.training_data import TRAINING_DATA


class ReviewClassifier:
    def __init__(self):
        texts = [text for text, _ in TRAINING_DATA]
        labels = [label for _, label in TRAINING_DATA]

        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words="english", min_df=1)
        features = self.vectorizer.fit_transform(texts)

        self.model = LogisticRegression(max_iter=1000)
        self.model.fit(features, labels)

    def predict(self, review_text: str) -> tuple[str, float]:
        features = self.vectorizer.transform([review_text])
        label = self.model.predict(features)[0]
        probabilities = self.model.predict_proba(features)[0]
        confidence = max(probabilities)
        return label, round(float(confidence), 4)
