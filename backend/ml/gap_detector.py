"""Build availability matrix and detect orphan gaps."""
import pandas as pd
from datetime import date, timedelta
from typing import List
from models import OrphanGap, Room, Booking, RoomCategory, Channel


def build_availability_matrix(
    rooms: List[Room],
    bookings: List[Booking],
    start_date: date,
    end_date: date,
) -> tuple[pd.DataFrame, dict]:
    """
    Returns (matrix, booking_map).
    matrix: (room_ids × dates) bool — True = available.
    booking_map: (room_id, date) → booking_id
    """
    dates = pd.date_range(start_date, end_date - timedelta(days=1))
    room_ids = [r.room_id for r in rooms]

    matrix = pd.DataFrame(True, index=room_ids, columns=dates)
    booking_map: dict = {}

    for booking in bookings:
        booking_dates = pd.date_range(booking.check_in, booking.check_out - timedelta(days=1))
        for d in booking_dates:
            if d in matrix.columns:
                matrix.loc[booking.room_id, d] = False
                booking_map[(booking.room_id, d)] = booking.booking_id

    return matrix, booking_map


def detect_orphan_gaps(
    rooms: List[Room],
    bookings: List[Booking],
    matrix: pd.DataFrame,
    booking_map: dict,
    min_stay_rule: int = 2,
) -> List[OrphanGap]:
    """
    Orphan gap = available run shorter than min_stay AND trapped between bookings on both sides.
    Uses run-length encoding per room row.
    """
    room_lookup = {r.room_id: r for r in rooms}
    orphan_gaps: List[OrphanGap] = []
    gap_counter = 0

    for room_id in matrix.index:
        if room_id not in room_lookup:
            continue
        room = room_lookup[room_id]
        avail_series = matrix.loc[room_id]

        # Run-length encoding
        runs: list[tuple[bool, int, int, int]] = []
        current_val = avail_series.iloc[0]
        run_start = 0
        run_length = 1

        for i in range(1, len(avail_series)):
            if avail_series.iloc[i] == current_val:
                run_length += 1
            else:
                runs.append((current_val, run_start, run_start + run_length - 1, run_length))
                current_val = avail_series.iloc[i]
                run_start = i
                run_length = 1
        runs.append((current_val, run_start, run_start + run_length - 1, run_length))

        for idx, (is_available, start_idx, end_idx, length) in enumerate(runs):
            if not is_available:
                continue
            if length >= min_stay_rule:
                continue
            has_left = idx > 0 and not runs[idx - 1][0]
            has_right = idx < len(runs) - 1 and not runs[idx + 1][0]
            if not (has_left and has_right):
                continue

            gap_start = avail_series.index[start_idx].date()
            gap_end = avail_series.index[end_idx].date()
            estimated_lost = length * room.base_rate

            surrounding: list[str] = []
            for offset in [-1, 1]:
                neighbor_idx = start_idx + offset if offset == -1 else end_idx + offset
                if 0 <= neighbor_idx < len(avail_series):
                    d = avail_series.index[neighbor_idx]
                    bk = booking_map.get((room_id, d))
                    if bk and bk not in surrounding:
                        surrounding.append(bk)

            gap_counter += 1
            orphan_gaps.append(
                OrphanGap(
                    gap_id=f"GAP{gap_counter:04d}",
                    room_id=room_id,
                    room_category=room.category,
                    start_date=gap_start,
                    end_date=gap_end,
                    gap_length_nights=length,
                    surrounding_booking_ids=surrounding,
                    channels_available=[],
                    estimated_lost_revenue=round(estimated_lost, 2),
                    severity_score=0.0,
                    severity_label="Unknown",
                )
            )

    return orphan_gaps
