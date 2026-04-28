"""Find rebundle opportunities using greedy strategies and scipy linprog conflict resolution."""
from datetime import timedelta
from typing import List
from scipy.optimize import linprog
from models import OrphanGap, RebundleOpportunity


def find_rebundle_opportunities(
    gaps: List[OrphanGap],
    min_stay_rule: int = 2,
) -> List[RebundleOpportunity]:
    """
    Strategy 1: single 1-night gap → recommend min-LOS reduction.
    Strategy 2: two adjacent 1-night gaps → package deal.
    Uses linprog to select a non-conflicting max-revenue subset.
    """
    opportunities: List[RebundleOpportunity] = []
    opp_counter = 0

    gaps_by_room: dict[str, List[OrphanGap]] = {}
    for gap in gaps:
        gaps_by_room.setdefault(gap.room_id, []).append(gap)

    for room_id, room_gaps in gaps_by_room.items():
        room_gaps.sort(key=lambda g: g.start_date)

        for i, gap in enumerate(room_gaps):
            if gap.gap_length_nights == 1:
                opp_counter += 1
                opportunities.append(
                    RebundleOpportunity(
                        opportunity_id=f"OPP{opp_counter:04d}",
                        gap_ids=[gap.gap_id],
                        room_ids=[room_id],
                        proposed_start=gap.start_date,
                        proposed_end=gap.end_date,
                        total_nights=1,
                        proposed_action=(
                            f"Reduce min-LOS to 1 night for {room_id} on "
                            f"{gap.start_date.strftime('%b %d')} and offer 15% last-minute "
                            f"discount on direct channel"
                        ),
                        estimated_revenue_recovery=round(gap.estimated_lost_revenue * 0.85, 2),
                        confidence=0.82,
                    )
                )

            if i < len(room_gaps) - 1:
                next_gap = room_gaps[i + 1]
                nights_between = (next_gap.start_date - gap.end_date).days
                combined = gap.gap_length_nights + next_gap.gap_length_nights
                if nights_between <= 1 and combined >= min_stay_rule:
                    opp_counter += 1
                    opportunities.append(
                        RebundleOpportunity(
                            opportunity_id=f"OPP{opp_counter:04d}",
                            gap_ids=[gap.gap_id, next_gap.gap_id],
                            room_ids=[room_id],
                            proposed_start=gap.start_date,
                            proposed_end=next_gap.end_date,
                            total_nights=combined,
                            proposed_action=(
                                f"Combine adjacent gaps in {room_id} into a {combined}-night "
                                f"package ({gap.start_date.strftime('%b %d')} – "
                                f"{next_gap.end_date.strftime('%b %d')}). "
                                f"List on direct and Booking.com with 10% early-bird rate."
                            ),
                            estimated_revenue_recovery=round(
                                (gap.estimated_lost_revenue + next_gap.estimated_lost_revenue) * 0.90,
                                2,
                            ),
                            confidence=0.74,
                        )
                    )

    return _resolve_conflicts_with_linprog(opportunities)


def _resolve_conflicts_with_linprog(
    opportunities: List[RebundleOpportunity],
) -> List[RebundleOpportunity]:
    """Binary LP relaxation: maximise revenue subject to no room-date double-booking."""
    if len(opportunities) <= 1:
        return opportunities

    n = len(opportunities)
    c = [-o.estimated_revenue_recovery for o in opportunities]

    room_date_pairs: dict[tuple, List[int]] = {}
    for i, opp in enumerate(opportunities):
        current = opp.proposed_start
        while current <= opp.proposed_end:
            key = (opp.room_ids[0], current)
            room_date_pairs.setdefault(key, []).append(i)
            current += timedelta(days=1)

    A_ub, b_ub = [], []
    for indices in room_date_pairs.values():
        if len(indices) > 1:
            row = [0.0] * n
            for idx in indices:
                row[idx] = 1.0
            A_ub.append(row)
            b_ub.append(1.0)

    if not A_ub:
        return opportunities

    result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=[(0, 1)] * n, method="highs")

    if result.success:
        selected = [opportunities[i] for i in range(n) if result.x[i] > 0.5]
        return selected if selected else opportunities

    return opportunities
