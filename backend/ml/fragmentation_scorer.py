"""Score orphan gap severity using GradientBoosting trained on synthetic labels."""
import datetime
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import GradientBoostingClassifier
from typing import List
from models import OrphanGap, RoomCategory

SEVERITY_CLASSES = ["Low", "Medium", "High", "Critical"]

CATEGORY_RANK = {
    RoomCategory.standard: 0,
    RoomCategory.deluxe: 1,
    RoomCategory.suite: 2,
    RoomCategory.executive: 3,
}


def _features(gap: OrphanGap) -> np.ndarray:
    days_out = max(0, (gap.start_date - datetime.date.today()).days)
    return np.array([
        gap.gap_length_nights,
        gap.estimated_lost_revenue,
        CATEGORY_RANK.get(gap.room_category, 0),
        gap.start_date.weekday(),
        days_out,
        len(gap.surrounding_booking_ids),
    ])


def _synthetic_label(gap: OrphanGap) -> int:
    days_out = max(0, (gap.start_date - datetime.date.today()).days)
    rev = gap.estimated_lost_revenue
    length = gap.gap_length_nights
    is_weekend = gap.start_date.weekday() >= 4

    if rev > 400 and length == 1 and days_out < 14:
        return 3  # Critical
    if rev > 250 or (length == 1 and is_weekend and days_out < 30):
        return 2  # High
    if rev > 120 or length <= 2:
        return 1  # Medium
    return 0  # Low


def score_gaps(gaps: List[OrphanGap]) -> List[OrphanGap]:
    """Fit GradientBoosting on synthetic labels and assign severity scores."""
    if not gaps:
        return gaps

    X = np.array([_features(g) for g in gaps])
    y = [_synthetic_label(g) for g in gaps]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Need at least 2 classes to train; fall back to rule-based if not enough variety
    unique_classes = list(set(y))
    if len(unique_classes) < 2:
        for i, gap in enumerate(gaps):
            gap.severity_score = 0.5
            gap.severity_label = SEVERITY_CLASSES[y[i]]
        return gaps

    clf = GradientBoostingClassifier(
        n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42
    )
    clf.fit(X_scaled, y)

    proba = clf.predict_proba(X_scaled)
    predictions = clf.predict(X_scaled)

    for i, gap in enumerate(gaps):
        gap.severity_score = float(np.max(proba[i]))
        gap.severity_label = SEVERITY_CLASSES[predictions[i]]

    return gaps
