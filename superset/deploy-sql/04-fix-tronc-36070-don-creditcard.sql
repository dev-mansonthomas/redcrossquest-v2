-- Migration ponctuelle : resync tronc_queteur.don_creditcard pour tronc 36070
-- Contexte : tronc avait des doublons credit_card, dédup'és par V1,
-- mais cache don_creditcard non recalculé. Cache obsolète = 443,50, détail = 431,50.
-- Note : déjà appliqué manuellement en prod le 2026-05-25. Cette migration
-- est idempotente (résultat = SUM(credit_card) actuel) et trace la correction.

UPDATE tronc_queteur
SET don_creditcard = (
  SELECT COALESCE(SUM(quantity * amount), 0)
  FROM credit_card
  WHERE tronc_queteur_id = tronc_queteur.id
)
WHERE id = 36070;
