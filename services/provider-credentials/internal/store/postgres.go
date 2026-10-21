package store

import (
	"context"
	"embed"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = pgx.ErrNoRows

//go:embed migrations/*.sql
var migrations embed.FS

type Credential struct {
	ID, ProviderID, Status string
	Ciphertext             []byte
	KeyVersion             int
	CreatedAt, UpdatedAt   time.Time
}
type Repository interface {
	Ping(context.Context) error
	Upsert(context.Context, string, string, string, string, []byte, int) (Credential, error)
	Get(context.Context, string, string, string) (Credential, error)
	Delete(context.Context, string, string, string) error
	Verify(context.Context, string, string, string) error
	Unverify(context.Context, string, string, string) error
	GetSelection(context.Context, string, string) (string, string, error)
	SetSelection(context.Context, string, string, string, string) error
}
type Postgres struct{ pool *pgxpool.Pool }

func Open(ctx context.Context, url string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	files, err := migrations.ReadDir("migrations")
	if err != nil {
		pool.Close()
		return nil, err
	}
	for _, file := range files {
		body, err := migrations.ReadFile("migrations/" + file.Name())
		if err != nil {
			pool.Close()
			return nil, err
		}
		if _, err := pool.Exec(ctx, string(body)); err != nil {
			pool.Close()
			return nil, err
		}
	}
	return &Postgres{pool: pool}, nil
}
func (p *Postgres) Close()                         { p.pool.Close() }
func (p *Postgres) Ping(ctx context.Context) error { return p.pool.Ping(ctx) }
func (p *Postgres) Upsert(ctx context.Context, tenant, principal, provider, id string, ciphertext []byte, version int) (Credential, error) {
	var c Credential
	err := p.pool.QueryRow(ctx, `INSERT INTO credentials (id,tenant_id,principal_id,provider_id,ciphertext,key_version,status) VALUES ($1::uuid,$2,$3,$4,$5,$6,'unverified') ON CONFLICT (tenant_id,principal_id,provider_id) DO UPDATE SET id=EXCLUDED.id,ciphertext=EXCLUDED.ciphertext,key_version=EXCLUDED.key_version,status='unverified',updated_at=now() RETURNING id::text,provider_id,status,ciphertext,key_version,created_at,updated_at`, id, tenant, principal, provider, ciphertext, version).Scan(&c.ID, &c.ProviderID, &c.Status, &c.Ciphertext, &c.KeyVersion, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}
func (p *Postgres) Get(ctx context.Context, tenant, principal, provider string) (Credential, error) {
	var c Credential
	err := p.pool.QueryRow(ctx, `SELECT id::text,provider_id,status,ciphertext,key_version,created_at,updated_at FROM credentials WHERE tenant_id=$1 AND principal_id=$2 AND provider_id=$3`, tenant, principal, provider).Scan(&c.ID, &c.ProviderID, &c.Status, &c.Ciphertext, &c.KeyVersion, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}
func (p *Postgres) Delete(ctx context.Context, tenant, principal, provider string) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM credentials WHERE tenant_id=$1 AND principal_id=$2 AND provider_id=$3`, tenant, principal, provider); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM provider_preferences WHERE tenant_id=$1 AND principal_id=$2 AND provider_id=$3`, tenant, principal, provider); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (p *Postgres) Verify(ctx context.Context, tenant, principal, provider string) error {
	cmd, err := p.pool.Exec(ctx, `UPDATE credentials SET status='verified',verified_at=now(),updated_at=now() WHERE tenant_id=$1 AND principal_id=$2 AND provider_id=$3`, tenant, principal, provider)
	if err == nil && cmd.RowsAffected() == 0 {
		return errors.New("credential_not_found")
	}
	return err
}
func (p *Postgres) Unverify(ctx context.Context, tenant, principal, provider string) error {
	_, err := p.pool.Exec(ctx, `UPDATE credentials SET status='unverified',verified_at=NULL,updated_at=now() WHERE tenant_id=$1 AND principal_id=$2 AND provider_id=$3`, tenant, principal, provider)
	return err
}
func (p *Postgres) GetSelection(ctx context.Context, tenant, principal string) (string, string, error) {
	var provider, model string
	err := p.pool.QueryRow(ctx, `SELECT provider_id,model_id FROM provider_preferences WHERE tenant_id=$1 AND principal_id=$2`, tenant, principal).Scan(&provider, &model)
	return provider, model, err
}
func (p *Postgres) SetSelection(ctx context.Context, tenant, principal, provider, model string) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO provider_preferences (tenant_id,principal_id,provider_id,model_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,principal_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,model_id=EXCLUDED.model_id,updated_at=now()`, tenant, principal, provider, model)
	return err
}
