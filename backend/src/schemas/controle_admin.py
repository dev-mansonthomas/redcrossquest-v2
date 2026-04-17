"""Contrôle admin schemas — règles d'anomalie sur les troncs et ULs."""
from datetime import datetime
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel


T = TypeVar("T")


class ControleAdminSettings(BaseModel):
    """Seuils de détection des anomalies (stockés dans Valkey)."""

    seuil_temps_minutes: int = 20
    seuil_montant_max: int = 1000
    seuil_saisie_suspecte: int = 50


class ControleAdminCounts(BaseModel):
    """Nombre d'anomalies par règle (badges d'onglets)."""

    R1_temps_court: int = 0
    R2_sans_retour: int = 0
    R3_montant_eleve: int = 0
    R4_cb_mismatch: int = 0
    R5_saisie_suspecte: int = 0
    R11_depart_apres_retour: int = 0
    R12_dates_futures: int = 0
    R6_sans_objectif: int = 0
    R7_peu_queteurs: int = 0
    R8_peu_users: int = 0
    R9_peu_points: int = 0
    R10_peu_troncs: int = 0
    R10b_non_validee: int = 0
    R13_doublons: int = 0
    R14_dormante: int = 0


class PaginatedResponse(BaseModel, Generic[T]):
    """Générique : enveloppe paginée identique pour toutes les règles."""

    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class _AnomalieBase(BaseModel):
    """Champs communs à toutes les anomalies troncs."""

    id: int
    ul_id: int
    ul_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    depart: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AnomalieTroncTempsCourt(_AnomalieBase):
    retour: Optional[datetime] = None
    montant: float
    duration_minutes: Optional[int] = None
    taux_horaire: float


class AnomalieTroncSansRetour(_AnomalieBase):
    retour: Optional[datetime] = None
    comptage: Optional[datetime] = None
    montant: Optional[float] = None


class AnomalieTroncMontantEleve(_AnomalieBase):
    montant: float
    duration_minutes: Optional[int] = None


class AnomalieTroncCbMismatch(_AnomalieBase):
    don_creditcard: Optional[float] = None
    cb_detail: float
    ecart: float


class AnomalieTroncSaisieSuspecte(_AnomalieBase):
    montant: float
    nb_types_remplis: int
    nb_lignes_cb: int


class AnomalieTroncDepartApresRetour(_AnomalieBase):
    retour: Optional[datetime] = None
    montant: Optional[float] = None


class AnomalieTroncDatesFutures(_AnomalieBase):
    montant: Optional[float] = None



# ---------------------------------------------------------------------------
# UL rules — 8 règles d'anomalie sur les ULs
# ---------------------------------------------------------------------------


class _UlBase(BaseModel):
    """Champs communs aux règles UL."""

    id: int
    name: str
    city: Optional[str] = None
    postal_code: Optional[str] = None

    model_config = {"from_attributes": True}


class UlSansObjectif(_UlBase):
    """R6 — UL sans yearly_goal pour l'année en cours."""


class UlPeuQueteurs(_UlBase):
    """R7 — UL avec trop peu de quêteurs actifs."""

    nb_queteurs: int = 0


class UlPeuUsers(_UlBase):
    """R8 — UL avec trop peu d'utilisateurs actifs."""

    nb_users: int = 0


class UlPeuPoints(_UlBase):
    """R9 — UL avec trop peu de points de quête."""

    nb_points: int = 0


class UlPeuTroncs(_UlBase):
    """R10 — UL avec trop peu de troncs actifs."""

    nb_troncs: int = 0


class UlNonValidee(_UlBase):
    """R10b — UL dont l'inscription n'est pas approuvée."""

    registration_id: Optional[int] = None
    registration_date: Optional[datetime] = None
    registration_approved: Optional[int] = None


class UlDoublons(BaseModel):
    """R13 — Quêteurs en doublon (même prénom+nom dans la même UL)."""

    ul_id: int
    ul_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nb_doublons: int

    model_config = {"from_attributes": True}


class UlDormante(_UlBase):
    """R14 — UL sans tronc_queteur depuis > 2 ans."""

    derniere_activite: Optional[datetime] = None
    jours_inactivite: Optional[int] = None


# ---------------------------------------------------------------------------
# UL detail
# ---------------------------------------------------------------------------


class UlDetailInfo(BaseModel):
    id: int
    name: str
    city: Optional[str] = None
    postal_code: Optional[str] = None


class UlDetailAdmin(BaseModel):
    man: Optional[bool] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None


class UlDetailRegistration(BaseModel):
    id: Optional[int] = None
    created: Optional[datetime] = None
    registration_approved: Optional[bool] = None


class UlDetailResponse(BaseModel):
    ul: UlDetailInfo
    admin: UlDetailAdmin
    registration: UlDetailRegistration
