package crypto

import (
	"bytes"
	"testing"
)

func TestAESGCMProtectBindsAssociatedData(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	p, err := NewAESGCM(key)
	if err != nil {
		t.Fatal(err)
	}
	ciphertext, err := p.Protect([]byte("secret"), []byte("tenant/user/provider"))
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := p.Unprotect(ciphertext, []byte("tenant/user/provider"))
	if err != nil || string(plaintext) != "secret" {
		t.Fatalf("decrypt failed: %q, %v", plaintext, err)
	}
	if _, err := p.Unprotect(ciphertext, []byte("other-tenant/user/provider")); err == nil {
		t.Fatal("expected associated-data mismatch to fail")
	}
	ciphertext[len(ciphertext)-1] ^= 1
	if _, err := p.Unprotect(ciphertext, []byte("tenant/user/provider")); err == nil {
		t.Fatal("expected ciphertext tampering to fail")
	}
}
