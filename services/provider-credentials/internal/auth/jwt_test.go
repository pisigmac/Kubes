package auth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"testing"
	"time"
)

func TestHasAudience(t *testing.T) {
	if !hasAudience("service", "service") {
		t.Fatal("string audience did not match")
	}
	if !hasAudience([]any{"other", "service"}, "service") {
		t.Fatal("audience array did not match")
	}
	if hasAudience([]any{"other"}, "service") {
		t.Fatal("unexpected audience match")
	}
}

func TestVerifierAcceptsDeskIDSigningAlgorithms(t *testing.T) {
	for _, algorithm := range []string{"RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"} {
		t.Run(algorithm, func(t *testing.T) {
			var public crypto.PublicKey
			var signer func([]byte) ([]byte, error)
			keyID := "test-key"
			switch algorithm {
			case "RS256", "RS384", "RS512":
				key, err := rsa.GenerateKey(rand.Reader, 2048)
				if err != nil {
					t.Fatal(err)
				}
				public = &key.PublicKey
				signer = func(input []byte) ([]byte, error) {
					digest := digestFor(algorithm, input)
					hash := hashFor(algorithm)
					return rsa.SignPKCS1v15(rand.Reader, key, hash, digest)
				}
			case "ES256", "ES384", "ES512":
				curve := map[string]elliptic.Curve{"ES256": elliptic.P256(), "ES384": elliptic.P384(), "ES512": elliptic.P521()}[algorithm]
				key, err := ecdsa.GenerateKey(curve, rand.Reader)
				if err != nil {
					t.Fatal(err)
				}
				public = &key.PublicKey
				signer = func(input []byte) ([]byte, error) {
					digest := digestFor(algorithm, input)
					r, s, err := ecdsa.Sign(rand.Reader, key, digest)
					if err != nil {
						return nil, err
					}
					size := (curve.Params().BitSize + 7) / 8
					sig := make([]byte, size*2)
					r.FillBytes(sig[:size])
					s.FillBytes(sig[size:])
					return sig, nil
				}
			default:
				pub, key, err := ed25519.GenerateKey(rand.Reader)
				if err != nil {
					t.Fatal(err)
				}
				public = pub
				signer = func(input []byte) ([]byte, error) { return ed25519.Sign(key, input), nil }
			}
			jwksBytes, _ := json.Marshal(map[string]any{"keys": []any{testJWK(keyID, public)}})
			var set jwks
			if err := json.Unmarshal(jwksBytes, &set); err != nil {
				t.Fatal(err)
			}
			verifier := NewVerifier("unused", "issuer", "audience", "sub", "org_id")
			verifier.keys = parseKeySet(set)
			verifier.loadedAt = time.Now()
			header, _ := json.Marshal(map[string]string{"alg": algorithm, "kid": keyID, "typ": "JWT"})
			claims, _ := json.Marshal(map[string]any{"iss": "issuer", "aud": []string{"other", "audience"}, "sub": "user-1", "org_id": "org-1", "exp": time.Now().Add(time.Minute).Unix()})
			unsigned := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(claims)
			signature, err := signer([]byte(unsigned))
			if err != nil {
				t.Fatal(err)
			}
			identity, err := verifier.Verify(context.Background(), unsigned+"."+base64.RawURLEncoding.EncodeToString(signature))
			if err != nil {
				t.Fatal(err)
			}
			if identity.PrincipalID != "user-1" || identity.TenantID != "org-1" {
				t.Fatalf("unexpected identity: %#v", identity)
			}
		})
	}
}

func testJWK(kid string, key crypto.PublicKey) map[string]string {
	switch k := key.(type) {
	case *rsa.PublicKey:
		return map[string]string{"kty": "RSA", "kid": kid, "alg": "RS256", "use": "sig", "n": base64.RawURLEncoding.EncodeToString(k.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(k.E)).Bytes())}
	case *ecdsa.PublicKey:
		curveName := map[int]string{256: "P-256", 384: "P-384", 521: "P-521"}[k.Curve.Params().BitSize]
		size := (k.Curve.Params().BitSize + 7) / 8
		x := make([]byte, size)
		y := make([]byte, size)
		k.X.FillBytes(x)
		k.Y.FillBytes(y)
		return map[string]string{"kty": "EC", "kid": kid, "use": "sig", "crv": curveName, "x": base64.RawURLEncoding.EncodeToString(x), "y": base64.RawURLEncoding.EncodeToString(y)}
	case ed25519.PublicKey:
		return map[string]string{"kty": "OKP", "kid": kid, "use": "sig", "crv": "Ed25519", "x": base64.RawURLEncoding.EncodeToString(k)}
	default:
		panic("unsupported test key")
	}
}

func hashFor(algorithm string) crypto.Hash {
	if algorithm == "RS384" || algorithm == "ES384" {
		return crypto.SHA384
	}
	if algorithm == "RS512" || algorithm == "ES512" {
		return crypto.SHA512
	}
	return crypto.SHA256
}
func digestFor(algorithm string, input []byte) []byte {
	switch hashFor(algorithm) {
	case crypto.SHA384:
		d := sha512.Sum384(input)
		return d[:]
	case crypto.SHA512:
		d := sha512.Sum512(input)
		return d[:]
	default:
		d := sha256.Sum256(input)
		return d[:]
	}
}
