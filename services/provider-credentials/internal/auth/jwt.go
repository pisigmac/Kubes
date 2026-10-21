package auth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Identity struct{ PrincipalID, TenantID string }
type Verifier struct {
	URL, Issuer, Audience, SubjectClaim, TenantClaim string
	client                                           *http.Client
	mu                                               sync.Mutex
	keys                                             map[string]crypto.PublicKey
	loadedAt                                         time.Time
}
type jwks struct {
	Keys []struct{ Kty, Kid, Alg, Use, N, E, Crv, X, Y string }
}

func NewVerifier(url, issuer, audience, subjectClaim, tenantClaim string) *Verifier {
	return &Verifier{URL: url, Issuer: issuer, Audience: audience, SubjectClaim: subjectClaim, TenantClaim: tenantClaim, client: &http.Client{Timeout: 5 * time.Second}, keys: map[string]crypto.PublicKey{}}
}

func (v *Verifier) key(ctx context.Context, kid string) (crypto.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if time.Since(v.loadedAt) > 10*time.Minute || v.keys[kid] == nil {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.URL, nil)
		if err != nil {
			return nil, err
		}
		resp, err := v.client.Do(req)
		if err != nil {
			return nil, errors.New("identity key service unavailable")
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, errors.New("identity key service unavailable")
		}
		var set jwks
		if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&set); err != nil {
			return nil, errors.New("invalid identity key set")
		}
		keys := parseKeySet(set)
		if len(keys) == 0 {
			return nil, errors.New("identity key set has no supported keys")
		}
		v.keys, v.loadedAt = keys, time.Now()
	}
	key := v.keys[kid]
	if key == nil {
		return nil, errors.New("unknown signing key")
	}
	return key, nil
}

func parseKeySet(set jwks) map[string]crypto.PublicKey {
	keys := make(map[string]crypto.PublicKey)
	for _, k := range set.Keys {
		if k.Kid == "" || (k.Use != "" && k.Use != "sig") {
			continue
		}
		var parsed crypto.PublicKey
		switch k.Kty {
		case "RSA":
			n, e1 := base64.RawURLEncoding.DecodeString(k.N)
			e, e2 := base64.RawURLEncoding.DecodeString(k.E)
			if e1 != nil || e2 != nil || len(e) > 4 {
				continue
			}
			exponent := 0
			for _, b := range e {
				exponent = exponent<<8 | int(b)
			}
			if exponent < 3 {
				continue
			}
			number := new(big.Int).SetBytes(n)
			if exponent < 3 || number.BitLen() < 2048 {
				continue
			}
			parsed = &rsa.PublicKey{N: number, E: exponent}
		case "EC":
			curve := map[string]elliptic.Curve{"P-256": elliptic.P256(), "P-384": elliptic.P384(), "P-521": elliptic.P521()}[k.Crv]
			x, e1 := base64.RawURLEncoding.DecodeString(k.X)
			y, e2 := base64.RawURLEncoding.DecodeString(k.Y)
			if curve == nil || e1 != nil || e2 != nil {
				continue
			}
			point := append([]byte{4}, x...)
			point = append(point, y...)
			px, py := elliptic.Unmarshal(curve, point)
			if px == nil || py == nil {
				continue
			}
			parsed = &ecdsa.PublicKey{Curve: curve, X: px, Y: py}
		case "OKP":
			x, err := base64.RawURLEncoding.DecodeString(k.X)
			if err != nil || k.Crv != "Ed25519" || len(x) != ed25519.PublicKeySize {
				continue
			}
			parsed = ed25519.PublicKey(x)
		}
		if parsed != nil {
			keys[k.Kid] = parsed
		}
	}
	return keys
}

func (v *Verifier) Verify(ctx context.Context, token string) (Identity, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Identity{}, errors.New("invalid bearer token")
	}
	var header struct{ Alg, Kid string }
	if err := decode(parts[0], &header); err != nil || header.Kid == "" {
		return Identity{}, errors.New("unsupported bearer token")
	}
	key, err := v.key(ctx, header.Kid)
	if err != nil {
		return Identity{}, err
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return Identity{}, errors.New("invalid bearer token")
	}
	if err := verifySignature(header.Alg, key, []byte(parts[0]+"."+parts[1]), sig); err != nil {
		return Identity{}, errors.New("invalid bearer token signature")
	}
	claims := map[string]any{}
	if err := decode(parts[1], &claims); err != nil {
		return Identity{}, errors.New("invalid bearer token claims")
	}
	if claims["iss"] != v.Issuer {
		return Identity{}, errors.New("invalid token issuer")
	}
	if !hasAudience(claims["aud"], v.Audience) {
		return Identity{}, errors.New("invalid token audience")
	}
	now := float64(time.Now().Unix())
	if exp, ok := claims["exp"].(float64); !ok || now >= exp {
		return Identity{}, errors.New("expired bearer token")
	}
	if nbf, ok := claims["nbf"].(float64); ok && now < nbf {
		return Identity{}, errors.New("bearer token not active")
	}
	principal, _ := claims[v.SubjectClaim].(string)
	tenant, _ := claims[v.TenantClaim].(string)
	if strings.TrimSpace(principal) == "" || strings.TrimSpace(tenant) == "" {
		return Identity{}, fmt.Errorf("missing required identity claims")
	}
	return Identity{PrincipalID: principal, TenantID: tenant}, nil
}

func verifySignature(algorithm string, key crypto.PublicKey, input, signature []byte) error {
	var hash crypto.Hash
	switch algorithm {
	case "RS256", "ES256":
		hash = crypto.SHA256
	case "RS384", "ES384":
		hash = crypto.SHA384
	case "RS512", "ES512":
		hash = crypto.SHA512
	case "EdDSA":
		edKey, ok := key.(ed25519.PublicKey)
		if !ok || !ed25519.Verify(edKey, input, signature) {
			return errors.New("invalid EdDSA signature")
		}
		return nil
	default:
		return errors.New("unsupported JWT signing algorithm")
	}
	sum := digestInput(hash, input)
	switch {
	case strings.HasPrefix(algorithm, "RS"):
		rsaKey, ok := key.(*rsa.PublicKey)
		if !ok {
			return errors.New("JWT key type does not match algorithm")
		}
		return rsa.VerifyPKCS1v15(rsaKey, hash, sum, signature)
	case strings.HasPrefix(algorithm, "ES"):
		ecKey, ok := key.(*ecdsa.PublicKey)
		if !ok {
			return errors.New("JWT key type does not match algorithm")
		}
		if (algorithm == "ES256" && ecKey.Curve != elliptic.P256()) || (algorithm == "ES384" && ecKey.Curve != elliptic.P384()) || (algorithm == "ES512" && ecKey.Curve != elliptic.P521()) {
			return errors.New("JWT curve does not match algorithm")
		}
		size := (ecKey.Curve.Params().BitSize + 7) / 8
		if len(signature) != size*2 || !ecdsa.Verify(ecKey, sum, new(big.Int).SetBytes(signature[:size]), new(big.Int).SetBytes(signature[size:])) {
			return errors.New("invalid ECDSA signature")
		}
		return nil
	default:
		return errors.New("unsupported JWT signing algorithm")
	}
}

func digestInput(hash crypto.Hash, input []byte) []byte {
	switch hash {
	case crypto.SHA384:
		digest := sha512.Sum384(input)
		return digest[:]
	case crypto.SHA512:
		digest := sha512.Sum512(input)
		return digest[:]
	default:
		digest := sha256.Sum256(input)
		return digest[:]
	}
}

func decode(s string, out any) error {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}
func hasAudience(value any, expected string) bool {
	switch aud := value.(type) {
	case string:
		return aud == expected
	case []any:
		for _, item := range aud {
			if item == expected {
				return true
			}
		}
	}
	return false
}
