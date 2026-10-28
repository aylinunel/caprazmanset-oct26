"""Every tunable of the analysis pipeline in one place (ADR-0002).

Values marked "4.0" reproduce the documented rules of the 4.0 public version; changing one is a
methodology change and must be reflected on the Yöntem page (the export carries this dict).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Istanbul")
REPO = Path(__file__).resolve().parents[2]
SCORER = REPO / "shared" / "analysis" / "rules.cjs"


@dataclass(frozen=True)
class Params:
    # Blocs (4.0, owner-confirmed 2026-10-28): lean < 45 left, > 55 right, otherwise middle.
    bloc_left_below: float = 45
    bloc_right_above: float = 55
    # Active outlet: has articles on at least this share of the window's days (4.0: 20 of 40).
    active_day_share: float = 0.5
    # Event clustering (4.0, validated pair F1 0.848 at 0.33).
    cluster_threshold: float = 0.33
    cluster_window_hours: int = 48
    cluster_merge_link_share: float = 0.40
    cluster_max_size: int = 120
    event_min_outlets: int = 5
    # Near-duplicate headlines inside an event are mapped to one representative.
    duplicate_cosine: float = 0.90
    # Blind spot (4.0): normalised Ground News rule + binomial test.
    bs_max_side_outlets: int = 10
    bs_min_other_share: float = 0.33
    bs_binom_p: float = 0.10
    # Agenda lead–lag: an outlet "follows" when it publishes within this many hours of the first.
    leadlag_horizon_hours: int = 48
    # Similarity map: outlets need this many event appearances to be placed.
    similarity_min_events: int = 30
    # Classifiers
    cv_folds: int = 5
    random_state: int = 20261028


PARAMS = Params()


def params_dict() -> dict:
    return asdict(PARAMS)
