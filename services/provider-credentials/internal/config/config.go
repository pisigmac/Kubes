package config

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
	"strings"
)

type Config struct {
	Addr, DatabaseURL, JWKSURL, Issuer, Audience string
	SubjectClaim, TenantClaim, ClientToken       string
	MasterKey                                    []byte
	AllowHTTP                                    bool
}

func Load() (Config, error) {
	c := Config{
		Addr:         env("LISTEN_ADDR", ":8081"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		JWKSURL:      os.Getenv("IDENTITY_JWKS_URL"),
		Issuer:       os.Getenv("IDENTITY_ISSUER"),
		Audience:     os.Getenv("IDENTITY_AUDIENCE"),
		SubjectClaim: env("IDENTITY_SUBJECT_CLAIM", "sub"),
		TenantClaim:  env("IDENTITY_TENANT_CLAIM", "tenant_id"),
		ClientToken:  os.Getenv("SERVICE_CLIENT_TOKEN"),
		AllowHTTP:    strings.EqualFold(os.Getenv("ALLOW_HTTP_PROVIDER_URLS"), "true"),
	}
	rawKey := os.Getenv("CREDENTIALS_MASTER_KEY")
	if rawKey != "" {
		key, err := base64.StdEncoding.DecodeString(rawKey)
		if err != nil || len(key) != 32 {
			return c, errors.New("CREDENTIALS_MASTER_KEY must be base64 for exactly 32 bytes")
		}
		c.MasterKey = key
	}
	if c.DatabaseURL == "" || c.JWKSURL == "" || c.Issuer == "" || c.Audience == "" || c.ClientToken == "" || len(c.MasterKey) != 32 {
		return c, errors.New("DATABASE_URL, identity issuer/audience/JWKS, SERVICE_CLIENT_TOKEN, and a 32-byte CREDENTIALS_MASTER_KEY are required")
	}
	return c, nil
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func KeyFingerprint(key []byte) [32]byte { return sha256.Sum256(key) }
