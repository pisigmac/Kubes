package api

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/kubes/provider-credentials/internal/auth"
	cryptobox "github.com/kubes/provider-credentials/internal/crypto"
	"github.com/kubes/provider-credentials/internal/store"
)

type Provider struct {
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	TestModel string `json:"test_model"`
}
type Server struct {
	Repo        store.Repository
	Protector   cryptobox.SecretProtector
	Verifier    *auth.Verifier
	ClientToken string
	Providers   map[string]Provider
	HTTP        *http.Client
	Logger      *slog.Logger
	AllowHTTP   bool
	rateMu      sync.Mutex
	lastTests   map[string]time.Time
}
type identityKey struct{}

func New(repo store.Repository, protector cryptobox.SecretProtector, verifier *auth.Verifier, clientToken string, providers map[string]Provider, allowHTTP bool, logger *slog.Logger) *Server {
	return &Server{Repo: repo, Protector: protector, Verifier: verifier, ClientToken: clientToken, Providers: providers, AllowHTTP: allowHTTP, Logger: logger, lastTests: make(map[string]time.Time), HTTP: &http.Client{Timeout: 0, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, map[string]any{"status": "ok"}) })
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if err := s.Repo.Ping(r.Context()); err != nil {
			writeError(w, 503, "not_ready")
			return
		}
		writeJSON(w, 200, map[string]any{"status": "ready"})
	})
	mux.Handle("/v1/", s.auth(http.HandlerFunc(s.route)))
	return securityHeaders(mux)
}
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		client := strings.TrimPrefix(r.Header.Get("X-Service-Client-Token"), "Bearer ")
		if client == "" || subtle.ConstantTimeCompare([]byte(client), []byte(s.ClientToken)) != 1 {
			writeError(w, 401, "unauthorized")
			return
		}
		user := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if user == r.Header.Get("Authorization") || user == "" {
			writeError(w, 401, "unauthorized")
			return
		}
		identity, err := s.Verifier.Verify(r.Context(), user)
		if err != nil {
			writeError(w, 401, "unauthorized")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey{}, identity)))
	})
}

func (s *Server) route(w http.ResponseWriter, r *http.Request) {
	id := r.Context().Value(identityKey{}).(auth.Identity)
	path := strings.TrimPrefix(r.URL.Path, "/v1/")
	if path == "me/providers" && r.Method == http.MethodGet {
		s.list(w, r, id)
		return
	}
	if path == "me/provider-selection" && r.Method == http.MethodPut {
		s.selectProvider(w, r, id)
		return
	}
	if strings.HasPrefix(path, "me/providers/") {
		parts := strings.Split(strings.TrimPrefix(path, "me/providers/"), "/")
		if len(parts) != 2 {
			writeError(w, 404, "not_found")
			return
		}
		provider := parts[0]
		if _, ok := s.Providers[provider]; !ok {
			writeError(w, 404, "unknown_provider")
			return
		}
		switch {
		case parts[1] == "credential" && r.Method == http.MethodPut:
			s.save(w, r, id, provider)
			return
		case parts[1] == "credential" && r.Method == http.MethodDelete:
			s.delete(w, r, id, provider)
			return
		case parts[1] == "test" && r.Method == http.MethodPost:
			s.test(w, r, id, provider)
			return
		}
	}
	if strings.HasPrefix(path, "proxy/") && r.Method == http.MethodPost {
		provider := strings.TrimSuffix(strings.TrimPrefix(path, "proxy/"), "/chat/completions")
		if provider == path || !strings.HasSuffix(path, "/chat/completions") {
			writeError(w, 404, "not_found")
			return
		}
		s.proxy(w, r, id, provider)
		return
	}
	writeError(w, 404, "not_found")
}
func (s *Server) list(w http.ResponseWriter, r *http.Request, id auth.Identity) {
	selected, model, err := s.Repo.GetSelection(r.Context(), id.TenantID, id.PrincipalID)
	if errors.Is(err, store.ErrNotFound) {
		selected, model, err = "", "", nil
	}
	if err != nil {
		writeError(w, 500, "storage_error")
		return
	}
	items := make([]map[string]any, 0, len(s.Providers))
	for key, p := range s.Providers {
		item := map[string]any{"id": key, "name": p.Name, "configured": false, "verified": false, "selected": selected == key}
		if c, e := s.Repo.Get(r.Context(), id.TenantID, id.PrincipalID, key); e == nil {
			item["configured"] = true
			item["verified"] = c.Status == "verified"
			item["status"] = c.Status
		} else if !errors.Is(e, store.ErrNotFound) {
			writeError(w, 500, "storage_error")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, 200, map[string]any{"providers": items, "selection": map[string]string{"provider_id": selected, "model_id": model}})
}
func (s *Server) save(w http.ResponseWriter, r *http.Request, id auth.Identity, provider string) {
	var body struct {
		APIKey string `json:"api_key"`
	}
	if decodeBody(w, r, &body) != nil {
		return
	}
	if strings.TrimSpace(body.APIKey) == "" || len(body.APIKey) > 8192 {
		writeError(w, 400, "invalid_credential")
		return
	}
	clear := []byte(body.APIKey)
	defer zero(clear)
	credentialID, err := newCredentialID()
	if err != nil {
		writeError(w, 500, "encryption_error")
		return
	}
	ciphertext, err := s.Protector.Protect(clear, associatedData(id, provider, credentialID))
	if err != nil {
		writeError(w, 500, "encryption_error")
		return
	}
	c, err := s.Repo.Upsert(r.Context(), id.TenantID, id.PrincipalID, provider, credentialID, ciphertext, 1)
	if err != nil {
		writeError(w, 500, "storage_error")
		return
	}
	writeJSON(w, 200, map[string]any{"provider_id": provider, "configured": true, "verified": false, "status": c.Status})
}
func (s *Server) delete(w http.ResponseWriter, r *http.Request, id auth.Identity, provider string) {
	if err := s.Repo.Delete(r.Context(), id.TenantID, id.PrincipalID, provider); err != nil {
		writeError(w, 500, "storage_error")
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true})
}
func (s *Server) selectProvider(w http.ResponseWriter, r *http.Request, id auth.Identity) {
	var body struct {
		ProviderID string `json:"provider_id"`
		ModelID    string `json:"model_id"`
	}
	if decodeBody(w, r, &body) != nil {
		return
	}
	_, ok := s.Providers[body.ProviderID]
	if !ok || body.ModelID == "" || len(body.ModelID) > 200 {
		writeError(w, 400, "invalid_selection")
		return
	}
	c, err := s.Repo.Get(r.Context(), id.TenantID, id.PrincipalID, body.ProviderID)
	if err != nil || c.Status != "verified" {
		writeError(w, 409, "credential_not_verified")
		return
	}
	if err := s.Repo.SetSelection(r.Context(), id.TenantID, id.PrincipalID, body.ProviderID, body.ModelID); err != nil {
		writeError(w, 500, "storage_error")
		return
	}
	writeJSON(w, 200, map[string]any{"provider_id": body.ProviderID, "model_id": body.ModelID})
}
func (s *Server) test(w http.ResponseWriter, r *http.Request, id auth.Identity, provider string) {
	if !s.allowTest(id, provider) {
		writeError(w, 429, "rate_limited")
		return
	}
	c, err := s.Repo.Get(r.Context(), id.TenantID, id.PrincipalID, provider)
	if err != nil {
		writeError(w, 404, "credential_not_found")
		return
	}
	secret, err := s.unprotect(id, provider, c)
	if err != nil {
		writeError(w, 500, "credential_unavailable")
		return
	}
	defer zero(secret)
	p := s.Providers[provider]
	if provider == "gemini" {
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()
		start := time.Now()
		models, status, err := s.discoverModels(ctx, p, secret)
		latency := time.Since(start).Milliseconds()
		if err != nil {
			category := "provider_unavailable"
			if errors.Is(err, context.DeadlineExceeded) {
				category = "timeout"
			}
			s.logProviderTestFailure(provider, category, 0, latency)
			writeJSON(w, 200, map[string]any{"ok": false, "category": category, "latency_ms": latency})
			return
		}
		if status >= 200 && status < 300 {
			if err := s.Repo.Verify(r.Context(), id.TenantID, id.PrincipalID, provider); err != nil {
				writeError(w, 500, "storage_error")
				return
			}
			writeJSON(w, 200, map[string]any{"ok": true, "category": "key_accepted", "latency_ms": latency, "models": models})
			return
		}
		category := providerTestCategory(status)
		if category == "invalid_credential" {
			if err := s.Repo.Unverify(r.Context(), id.TenantID, id.PrincipalID, provider); err != nil {
				writeError(w, 500, "storage_error")
				return
			}
		}
		s.logProviderTestFailure(provider, category, status, latency)
		writeJSON(w, 200, map[string]any{"ok": false, "category": category, "latency_ms": latency})
		return
	}
	payload, _ := json.Marshal(map[string]any{"model": p.TestModel, "messages": []map[string]string{{"role": "user", "content": "Reply with OK."}}, "max_tokens": 8, "stream": false})
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	start := time.Now()
	resp, err := s.upstream(ctx, p, secret, payload)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		category := "provider_unavailable"
		if errors.Is(err, context.DeadlineExceeded) {
			category = "timeout"
		}
		s.logProviderTestFailure(provider, category, 0, latency)
		writeJSON(w, 200, map[string]any{"ok": false, "category": category, "latency_ms": latency})
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if err := s.Repo.Verify(r.Context(), id.TenantID, id.PrincipalID, provider); err != nil {
			writeError(w, 500, "storage_error")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "category": "verified", "latency_ms": latency})
		return
	}
	category := "provider_unavailable"
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		category = "invalid_credential"
		if err := s.Repo.Unverify(r.Context(), id.TenantID, id.PrincipalID, provider); err != nil {
			writeError(w, 500, "storage_error")
			return
		}
	} else if resp.StatusCode == 402 || resp.StatusCode == 429 {
		category = "quota_or_billing"
	} else if resp.StatusCode == 400 || resp.StatusCode == 404 {
		category = "unsupported_model"
	}
	s.logProviderTestFailure(provider, category, resp.StatusCode, latency)
	writeJSON(w, 200, map[string]any{"ok": false, "category": category, "latency_ms": latency})
}

func (s *Server) discoverModels(ctx context.Context, p Provider, key []byte) ([]string, int, error) {
	base, err := url.Parse(strings.TrimRight(p.BaseURL, "/"))
	if err != nil || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return nil, 0, errors.New("provider unavailable")
	}
	if base.Scheme != "https" || !safeHost(base.Hostname()) {
		return nil, 0, errors.New("provider unavailable")
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/models"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base.String(), nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+string(key))
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
		return nil, resp.StatusCode, nil
	}
	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil {
		return nil, resp.StatusCode, err
	}
	models := make([]string, 0, len(result.Data))
	seen := make(map[string]struct{}, len(result.Data))
	for _, item := range result.Data {
		model := strings.TrimSpace(item.ID)
		if len(model) == 0 || len(model) > 200 || !safeModelID(model) {
			continue
		}
		if _, exists := seen[model]; exists {
			continue
		}
		seen[model] = struct{}{}
		models = append(models, model)
	}
	return models, resp.StatusCode, nil
}

func safeModelID(model string) bool {
	for _, char := range model {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || strings.ContainsRune("._:/-", char) {
			continue
		}
		return false
	}
	return true
}

func providerTestCategory(status int) string {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "invalid_credential"
	case http.StatusPaymentRequired, http.StatusTooManyRequests:
		return "quota_or_billing"
	case http.StatusBadRequest, http.StatusNotFound:
		return "unsupported_model"
	default:
		return "provider_unavailable"
	}
}

func (s *Server) logProviderTestFailure(provider, category string, statusCode int, latency int64) {
	if s.Logger == nil {
		return
	}
	s.Logger.Warn("provider test failed",
		slog.String("provider", provider),
		slog.String("category", category),
		slog.Int("http_status", statusCode),
		slog.Int64("latency_ms", latency),
	)
}

func (s *Server) allowTest(id auth.Identity, provider string) bool {
	key := id.TenantID + "\x00" + id.PrincipalID + "\x00" + provider
	now := time.Now()
	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	if len(s.lastTests) > 10_000 {
		for entry, checkedAt := range s.lastTests {
			if now.Sub(checkedAt) >= 30*time.Second {
				delete(s.lastTests, entry)
			}
		}
	}
	if previous, ok := s.lastTests[key]; ok && now.Sub(previous) < 30*time.Second {
		return false
	}
	s.lastTests[key] = now
	return true
}
func (s *Server) proxy(w http.ResponseWriter, r *http.Request, id auth.Identity, provider string) {
	started := time.Now()
	p, ok := s.Providers[provider]
	if !ok {
		writeError(w, 404, "unknown_provider")
		return
	}
	c, err := s.Repo.Get(r.Context(), id.TenantID, id.PrincipalID, provider)
	if err != nil || c.Status != "verified" {
		writeError(w, 409, "credential_not_verified")
		return
	}
	secret, err := s.unprotect(id, provider, c)
	if err != nil {
		writeError(w, 500, "credential_unavailable")
		return
	}
	defer zero(secret)
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
	if err != nil {
		writeError(w, 413, "request_too_large")
		return
	}
	defer zero(body)
	resp, err := s.upstream(r.Context(), p, secret, body)
	if err != nil {
		s.logProxyFailure(provider, "upstream_request", proxyErrorCategory(r.Context(), err), 0, time.Since(started))
		writeError(w, 502, "provider_unavailable")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
		s.logProxyFailure(provider, "upstream_response", providerTestCategory(resp.StatusCode), resp.StatusCode, time.Since(started))
		code := "provider_unavailable"
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			code = "invalid_credential"
			if err := s.Repo.Unverify(r.Context(), id.TenantID, id.PrincipalID, provider); err != nil {
				writeError(w, 500, "storage_error")
				return
			}
		}
		if resp.StatusCode == 402 || resp.StatusCode == 429 {
			code = "quota_or_billing"
		}
		if resp.StatusCode == 400 || resp.StatusCode == 404 {
			code = "unsupported_model"
		}
		writeError(w, 502, code)
		return
	}
	for _, name := range []string{"Content-Type", "Cache-Control", "X-Request-Id"} {
		if v := resp.Header.Get(name); v != "" && name != "Cache-Control" {
			w.Header().Set(name, v)
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, io.LimitReader(resp.Body, 16<<20)); err != nil {
		s.logProxyFailure(provider, "response_stream", streamErrorCategory(r.Context(), err), resp.StatusCode, time.Since(started))
	}
}

func proxyErrorCategory(ctx context.Context, err error) string {
	if errors.Is(ctx.Err(), context.Canceled) || errors.Is(err, context.Canceled) {
		return "request_cancelled"
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
		return "request_timeout"
	}
	var networkError net.Error
	if errors.As(err, &networkError) && networkError.Timeout() {
		return "upstream_timeout"
	}
	return "upstream_connection_error"
}

func streamErrorCategory(ctx context.Context, err error) string {
	if errors.Is(ctx.Err(), context.Canceled) || errors.Is(err, context.Canceled) {
		return "stream_cancelled"
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
		return "stream_timeout"
	}
	return "stream_read_error"
}

func (s *Server) logProxyFailure(provider, phase, category string, status int, elapsed time.Duration) {
	if s.Logger == nil {
		return
	}
	s.Logger.Warn("provider proxy failed",
		slog.String("provider", provider),
		slog.String("phase", phase),
		slog.String("category", category),
		slog.Int("upstream_http_status", status),
		slog.Int64("latency_ms", elapsed.Milliseconds()),
	)
}

func (s *Server) unprotect(id auth.Identity, provider string, c store.Credential) ([]byte, error) {
	if c.KeyVersion != 1 {
		return nil, errors.New("unsupported credential key version")
	}
	return s.Protector.Unprotect(c.Ciphertext, associatedData(id, provider, c.ID))
}

func associatedData(id auth.Identity, provider, credentialID string) []byte {
	return []byte(id.TenantID + "\x00" + id.PrincipalID + "\x00" + provider + "\x00" + credentialID)
}

func newCredentialID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
func (s *Server) upstream(ctx context.Context, p Provider, key, body []byte) (*http.Response, error) {
	base, err := url.Parse(strings.TrimRight(p.BaseURL, "/"))
	if err != nil || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return nil, errors.New("provider unavailable")
	}
	if base.Scheme != "https" && !(s.AllowHTTP && base.Scheme == "http") {
		return nil, errors.New("provider unavailable")
	}
	if !safeHost(base.Hostname()) {
		return nil, errors.New("provider unavailable")
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base.String(), strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+string(key))
	return s.HTTP.Do(req)
}
func safeHost(host string) bool {
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsGlobalUnicast() && !ip.IsPrivate() && !ip.IsLoopback()
	}
	return true
}
func decodeBody(w http.ResponseWriter, r *http.Request, out any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(out); err != nil {
		writeError(w, 400, "invalid_request")
		return err
	}
	return nil
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, code string) {
	message := map[string]string{"unauthorized": "Unauthorized", "not_found": "Not found", "unknown_provider": "Unknown provider", "invalid_credential": "Invalid credential", "invalid_selection": "Invalid selection", "credential_not_verified": "Verify the provider credential before selecting it", "credential_not_found": "Credential not found", "provider_unavailable": "Provider temporarily unavailable", "quota_or_billing": "Provider quota or billing limit reached", "unsupported_model": "Provider does not support the configured test model", "rate_limited": "Wait briefly before testing this provider again", "request_too_large": "Request too large", "encryption_error": "Credential encryption failed", "credential_unavailable": "Credential unavailable", "storage_error": "Storage operation failed", "not_ready": "Service is not ready"}[code]
	writeJSON(w, status, map[string]string{"error": message, "code": code})
}
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}
func zero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
