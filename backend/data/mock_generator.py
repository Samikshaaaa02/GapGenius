"""Generate realistic hotel availability data with deliberately seeded orphan gaps."""
import pandas as pd
import numpy as np
from faker import Faker
from datetime import date, timedelta
from models import Room, Booking, RoomCategory, Channel

fake = Faker()

CATEGORY_LIST = (
    [RoomCategory.standard] * 25
    + [RoomCategory.deluxe] * 15
    + [RoomCategory.suite] * 7
    + [RoomCategory.executive] * 3
)

BASE_RATES = {
    RoomCategory.standard: 120.0,
    RoomCategory.deluxe: 180.0,
    RoomCategory.suite: 280.0,
    RoomCategory.executive: 350.0,
}

CHANNELS = [Channel.direct, Channel.booking_com, Channel.expedia, Channel.gds]
CHANNEL_WEIGHTS = [0.30, 0.35, 0.20, 0.15]


def generate_hotel_data(
    total_rooms: int = 50,
    date_range_days: int = 90,
    min_stay_rule: int = 2,
    seed: int = 42,
) -> dict:
    np.random.seed(seed)
    Faker.seed(seed)

    start_date = date.today()
    end_date = start_date + timedelta(days=date_range_days)

    rooms = []
    for i, category in enumerate(CATEGORY_LIST[:total_rooms]):
        floor = (i // 10) + 1
        rooms.append(
            Room(
                room_id=f"R{floor}{i % 10 + 1:02d}",
                number=f"{floor}{i % 10 + 1:02d}",
                category=category,
                floor=floor,
                base_rate=BASE_RATES[category],
            )
        )

    gap_indices = np.random.choice(len(rooms), size=int(len(rooms) * 0.2), replace=False)
    gap_room_ids = {rooms[i].room_id for i in gap_indices}

    bookings: list[Booking] = []
    for room in rooms:
        if room.room_id in gap_room_ids:
            _inject_orphan_gap_pattern(room, start_date, date_range_days, min_stay_rule, bookings)
        else:
            _generate_normal_bookings(room, start_date, date_range_days, bookings)

    return {
        "rooms": rooms,
        "bookings": bookings,
        "start_date": start_date,
        "end_date": end_date,
        "gap_room_ids": list(gap_room_ids),
    }


def _inject_orphan_gap_pattern(room, start_date, range_days, min_stay, bookings):
    current_day = 5
    gap_count = np.random.randint(2, 5)

    for _ in range(gap_count):
        if current_day >= range_days - 10:
            break

        b1_length = np.random.randint(2, 5)
        b1_start = start_date + timedelta(days=current_day)
        b1_end = b1_start + timedelta(days=b1_length)

        bookings.append(
            Booking(
                booking_id=f"BK{fake.unique.random_number(digits=6)}",
                room_id=room.room_id,
                check_in=b1_start,
                check_out=b1_end,
                channel=np.random.choice(CHANNELS, p=CHANNEL_WEIGHTS),
                rate=room.base_rate * np.random.uniform(0.85, 1.15),
                guest_name=fake.name(),
            )
        )

        current_day += b1_length + 1  # the orphan gap night

        b2_length = np.random.randint(2, 5)
        b2_start = start_date + timedelta(days=current_day)
        b2_end = b2_start + timedelta(days=b2_length)

        if current_day + b2_length < range_days:
            bookings.append(
                Booking(
                    booking_id=f"BK{fake.unique.random_number(digits=6)}",
                    room_id=room.room_id,
                    check_in=b2_start,
                    check_out=b2_end,
                    channel=np.random.choice(CHANNELS, p=CHANNEL_WEIGHTS),
                    rate=room.base_rate * np.random.uniform(0.85, 1.15),
                    guest_name=fake.name(),
                )
            )

        current_day += b2_length + np.random.randint(3, 8)


def _generate_normal_bookings(room, start_date, range_days, bookings):
    current_day = np.random.randint(0, 5)
    while current_day < range_days - 3:
        is_leisure = np.random.random() < 0.3
        length = np.random.randint(3, 8) if is_leisure else np.random.randint(1, 4)

        check_in = start_date + timedelta(days=current_day)
        check_out = check_in + timedelta(days=length)

        if current_day + length < range_days:
            bookings.append(
                Booking(
                    booking_id=f"BK{fake.unique.random_number(digits=6)}",
                    room_id=room.room_id,
                    check_in=check_in,
                    check_out=check_out,
                    channel=np.random.choice(CHANNELS, p=CHANNEL_WEIGHTS),
                    rate=room.base_rate * np.random.uniform(0.80, 1.25),
                    guest_name=fake.name(),
                )
            )

        gap = np.random.geometric(p=0.45)
        current_day += length + gap
