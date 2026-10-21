package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"
)

type SecretProtector interface {
	Protect(plaintext, associatedData []byte) ([]byte, error)
	Unprotect(ciphertext, associatedData []byte) ([]byte, error)
}

type AESGCM struct{ aead cipher.AEAD }

func NewAESGCM(key []byte) (*AESGCM, error) {
	if len(key) != 32 {
		return nil, errors.New("AES-256 key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &AESGCM{aead: aead}, nil
}

func (p *AESGCM) Protect(plaintext, aad []byte) ([]byte, error) {
	nonce := make([]byte, p.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return p.aead.Seal(nonce, nonce, plaintext, aad), nil
}

func (p *AESGCM) Unprotect(ciphertext, aad []byte) ([]byte, error) {
	if len(ciphertext) < p.aead.NonceSize() {
		return nil, errors.New("invalid encrypted secret")
	}
	nonce, body := ciphertext[:p.aead.NonceSize()], ciphertext[p.aead.NonceSize():]
	return p.aead.Open(nil, nonce, body, aad)
}
