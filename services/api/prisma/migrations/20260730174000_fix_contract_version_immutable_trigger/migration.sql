CREATE OR REPLACE FUNCTION prevent_locked_contract_version_change()
RETURNS trigger AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL OR OLD."status" = 'SIGNED' THEN
    RAISE EXCEPTION 'Signed or locked contract versions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_immutable_contract_document_change()
RETURNS trigger AS $$
BEGIN
  IF OLD."isImmutable" THEN
    RAISE EXCEPTION 'Immutable contract documents cannot be changed or deleted';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
