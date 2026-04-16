"""Money bags endpoints for coins and bills bag tracking."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastAPIRequest, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_rcq_db
from ..roles import ROLES_COMPTEUR_AND_ABOVE, check_role
from ..schemas.money_bags import (
    BagTroncsResponse,
    MoneyBagDetail,
    MoneyBagItem,
    MoneyBagSummary,
    MoneyBagsResponse,
    TroncQueteurItem,
)
from .auth import get_authenticated_user

router = APIRouter(prefix="/api/money-bags", tags=["money-bags"])

LIST_BAGS_QUERY = """
SELECT DISTINCT coins_money_bag_id AS bag_id, 'coins' AS bag_type,
  COUNT(*) AS tronc_count,
  ROUND(SUM(
    COALESCE(euro2, 0) * 8.5 + COALESCE(euro1, 0) * 7.5 +
    COALESCE(cents50, 0) * 7.8 + COALESCE(cents20, 0) * 5.74 +
    COALESCE(cents10, 0) * 4.1 + COALESCE(cents5, 0) * 3.92 +
    COALESCE(cents2, 0) * 3.06 + COALESCE(cent1, 0) * 2.3
  ), 2) AS weight_grams,
  ROUND(SUM(
    COALESCE(euro2, 0) * 2 + COALESCE(euro1, 0) * 1 +
    COALESCE(cents50, 0) * 0.5 + COALESCE(cents20, 0) * 0.2 +
    COALESCE(cents10, 0) * 0.1 + COALESCE(cents5, 0) * 0.05 +
    COALESCE(cents2, 0) * 0.02 + COALESCE(cent1, 0) * 0.01
  ), 2) AS total_amount
FROM tronc_queteur
WHERE deleted = 0 AND comptage IS NOT NULL
  AND ul_id = :ul_id AND YEAR(comptage) = :year
  AND coins_money_bag_id IS NOT NULL AND coins_money_bag_id != ''
GROUP BY coins_money_bag_id

UNION ALL

SELECT DISTINCT bills_money_bag_id AS bag_id, 'bills' AS bag_type,
  COUNT(*) AS tronc_count,
  ROUND(SUM(
    COALESCE(euro500, 0) * 1.1 + COALESCE(euro200, 0) * 1.1 +
    COALESCE(euro100, 0) * 1 + COALESCE(euro50, 0) * 0.9 +
    COALESCE(euro20, 0) * 0.8 + COALESCE(euro10, 0) * 0.7 +
    COALESCE(euro5, 0) * 0.6
  ), 2) AS weight_grams,
  ROUND(SUM(
    COALESCE(euro500, 0) * 500 + COALESCE(euro200, 0) * 200 +
    COALESCE(euro100, 0) * 100 + COALESCE(euro50, 0) * 50 +
    COALESCE(euro20, 0) * 20 + COALESCE(euro10, 0) * 10 +
    COALESCE(euro5, 0) * 5
  ), 2) AS total_amount
FROM tronc_queteur
WHERE deleted = 0 AND comptage IS NOT NULL
  AND ul_id = :ul_id AND YEAR(comptage) = :year
  AND bills_money_bag_id IS NOT NULL AND bills_money_bag_id != ''
GROUP BY bills_money_bag_id
ORDER BY bag_type, bag_id
"""

COINS_DETAIL_QUERY = """
SELECT
  SUM(COALESCE(euro2, 0)) AS euro2, SUM(COALESCE(euro1, 0)) AS euro1,
  SUM(COALESCE(cents50, 0)) AS cents50, SUM(COALESCE(cents20, 0)) AS cents20,
  SUM(COALESCE(cents10, 0)) AS cents10, SUM(COALESCE(cents5, 0)) AS cents5,
  SUM(COALESCE(cents2, 0)) AS cents2, SUM(COALESCE(cent1, 0)) AS cent1,
  COUNT(*) AS tronc_count
FROM tronc_queteur
WHERE deleted = 0 AND comptage IS NOT NULL
  AND ul_id = :ul_id AND YEAR(comptage) = :year
  AND coins_money_bag_id = :bag_id
"""

BILLS_DETAIL_QUERY = """
SELECT
  SUM(COALESCE(euro500, 0)) AS euro500, SUM(COALESCE(euro200, 0)) AS euro200,
  SUM(COALESCE(euro100, 0)) AS euro100, SUM(COALESCE(euro50, 0)) AS euro50,
  SUM(COALESCE(euro20, 0)) AS euro20, SUM(COALESCE(euro10, 0)) AS euro10,
  SUM(COALESCE(euro5, 0)) AS euro5,
  COUNT(*) AS tronc_count
FROM tronc_queteur
WHERE deleted = 0 AND comptage IS NOT NULL
  AND ul_id = :ul_id AND YEAR(comptage) = :year
  AND bills_money_bag_id = :bag_id
"""



COINS_TRONCS_QUERY = """
SELECT tq.id AS tronc_queteur_id, q.first_name, q.last_name,
  pq.name AS point_quete_name, tq.tronc_id
FROM tronc_queteur tq
JOIN queteur q ON tq.queteur_id = q.id
JOIN point_quete pq ON tq.point_quete_id = pq.id
WHERE tq.deleted = 0 AND tq.comptage IS NOT NULL
  AND tq.ul_id = :ul_id AND YEAR(tq.comptage) = :year
  AND tq.coins_money_bag_id = :bag_id
ORDER BY tq.id
"""

BILLS_TRONCS_QUERY = """
SELECT tq.id AS tronc_queteur_id, q.first_name, q.last_name,
  pq.name AS point_quete_name, tq.tronc_id
FROM tronc_queteur tq
JOIN queteur q ON tq.queteur_id = q.id
JOIN point_quete pq ON tq.point_quete_id = pq.id
WHERE tq.deleted = 0 AND tq.comptage IS NOT NULL
  AND tq.ul_id = :ul_id AND YEAR(tq.comptage) = :year
  AND tq.bills_money_bag_id = :bag_id
ORDER BY tq.id
"""

COIN_DENOMINATIONS = [
    ("2€", "euro2", 2.0, 8.5),
    ("1€", "euro1", 1.0, 7.5),
    ("50c", "cents50", 0.5, 7.8),
    ("20c", "cents20", 0.2, 5.74),
    ("10c", "cents10", 0.1, 4.1),
    ("5c", "cents5", 0.05, 3.92),
    ("2c", "cents2", 0.02, 3.06),
    ("1c", "cent1", 0.01, 2.3),
]

BILL_DENOMINATIONS = [
    ("500€", "euro500", 500.0, 1.1),
    ("200€", "euro200", 200.0, 1.1),
    ("100€", "euro100", 100.0, 1.0),
    ("50€", "euro50", 50.0, 0.9),
    ("20€", "euro20", 20.0, 0.8),
    ("10€", "euro10", 10.0, 0.7),
    ("5€", "euro5", 5.0, 0.6),
]


@router.get("", response_model=MoneyBagsResponse)
async def list_money_bags(
    request: FastAPIRequest,
    year: int = Query(default=None, description="Année (défaut: année courante)"),
    db: Session = Depends(get_rcq_db),
) -> MoneyBagsResponse:
    """List all money bags (coins and bills) for the user's UL and given year."""
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_COMPTEUR_AND_ABOVE)

    if year is None:
        year = datetime.now().year

    ul_id = user["ul_id"]
    rows = db.execute(
        text(LIST_BAGS_QUERY), {"ul_id": ul_id, "year": year}
    ).mappings().all()

    bags = [MoneyBagSummary(**row) for row in rows]
    return MoneyBagsResponse(bags=bags)


@router.get("/{bag_id}/detail", response_model=MoneyBagDetail)
async def get_money_bag_detail(
    bag_id: str,
    request: FastAPIRequest,
    type: str = Query(..., description="Type de sac: 'coins' ou 'bills'"),
    year: int = Query(default=None, description="Année (défaut: année courante)"),
    db: Session = Depends(get_rcq_db),
) -> MoneyBagDetail:
    """Return detailed denomination breakdown for a specific money bag."""
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_COMPTEUR_AND_ABOVE)

    if type not in ("coins", "bills"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le paramètre 'type' doit être 'coins' ou 'bills'",
        )

    if year is None:
        year = datetime.now().year

    ul_id = user["ul_id"]
    params = {"ul_id": ul_id, "year": year, "bag_id": bag_id}

    if type == "coins":
        query = COINS_DETAIL_QUERY
        denominations = COIN_DENOMINATIONS
    else:
        query = BILLS_DETAIL_QUERY
        denominations = BILL_DENOMINATIONS

    row = db.execute(text(query), params).mappings().first()

    if row is None or row["tronc_count"] == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sac '{bag_id}' non trouvé",
        )

    items = []
    total_amount = 0.0
    weight_grams = 0.0

    for label, col, value, weight in denominations:
        count = int(row[col] or 0)
        if count > 0:
            amount = round(count * value, 2)
            total_amount += amount
            weight_grams += count * weight
            items.append(MoneyBagItem(type=label, count=count, amount=amount))

    return MoneyBagDetail(
        bag_id=bag_id,
        bag_type=type,
        weight_grams=round(weight_grams, 2),
        total_amount=round(total_amount, 2),
        tronc_count=int(row["tronc_count"]),
        items=items,
    )


@router.get("/{bag_id}/troncs", response_model=BagTroncsResponse)
async def get_money_bag_troncs(
    bag_id: str,
    request: FastAPIRequest,
    type: str = Query(..., description="Type de sac: 'coins' ou 'bills'"),
    year: int = Query(default=None, description="Année (défaut: année courante)"),
    db: Session = Depends(get_rcq_db),
) -> BagTroncsResponse:
    """Return the list of tronc_queteurs contributing to a specific money bag."""
    user = get_authenticated_user(request, db)
    check_role(user, ROLES_COMPTEUR_AND_ABOVE)

    if type not in ("coins", "bills"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le paramètre 'type' doit être 'coins' ou 'bills'",
        )

    if year is None:
        year = datetime.now().year

    ul_id = user["ul_id"]
    params = {"ul_id": ul_id, "year": year, "bag_id": bag_id}

    query = COINS_TRONCS_QUERY if type == "coins" else BILLS_TRONCS_QUERY
    rows = db.execute(text(query), params).mappings().all()

    troncs = [TroncQueteurItem(**row) for row in rows]
    return BagTroncsResponse(troncs=troncs)