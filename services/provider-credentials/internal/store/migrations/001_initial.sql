CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  ciphertext BYTEA NOT NULL,
  key_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unverified','verified','disabled')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, principal_id, provider_id)
);
CREATE INDEX IF NOT EXISTS credentials_owner_idx ON credentials (tenant_id, principal_id);
CREATE TABLE IF NOT EXISTS provider_preferences (
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, principal_id),
  FOREIGN KEY (tenant_id, principal_id, provider_id)
    REFERENCES credentials (tenant_id, principal_id, provider_id) ON DELETE CASCADE
);
