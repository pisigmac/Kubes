package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/kubes/provider-credentials/internal/api"
	"github.com/kubes/provider-credentials/internal/auth"
	"github.com/kubes/provider-credentials/internal/config"
	cryptobox "github.com/kubes/provider-credentials/internal/crypto"
	"github.com/kubes/provider-credentials/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)
	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err.Error())
		os.Exit(1)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	repo, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database unavailable", "error", err.Error())
		os.Exit(1)
	}
	defer repo.Close()
	protector, err := cryptobox.NewAESGCM(cfg.MasterKey)
	if err != nil {
		logger.Error("encryption initialization failed", "error", err.Error())
		os.Exit(1)
	}
	providers, err := loadProviders()
	if err != nil {
		logger.Error("provider registry invalid", "error", err.Error())
		os.Exit(1)
	}
	verifier := auth.NewVerifier(cfg.JWKSURL, cfg.Issuer, cfg.Audience, cfg.SubjectClaim, cfg.TenantClaim)
	service := api.New(repo, protector, verifier, cfg.ClientToken, providers, cfg.AllowHTTP, logger)
	server := &http.Server{Addr: cfg.Addr, Handler: service.Handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	logger.Info("provider credentials service listening", "addr", cfg.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("http server failed", "error", err.Error())
		os.Exit(1)
	}
}

func loadProviders() (map[string]api.Provider, error) {
	if registryFile := strings.TrimSpace(os.Getenv("PROVIDER_REGISTRY_FILE")); registryFile != "" {
		contents, err := os.ReadFile(registryFile)
		if err != nil {
			return nil, err
		}
		var source struct {
			Providers []struct {
				ID      string `json:"id"`
				Name    string `json:"name"`
				BaseURL string `json:"default_base_url"`
				Model   string `json:"default_model"`
			} `json:"providers"`
		}
		if err := json.Unmarshal(contents, &source); err != nil {
			return nil, err
		}
		providers := make(map[string]api.Provider, len(source.Providers))
		for _, item := range source.Providers {
			parsed, err := url.Parse(item.BaseURL)
			if err != nil || item.ID == "cohere" || item.ID == "ollama" || item.ID == "keymint" || item.ID == "kubemind" || item.ID == "kuberoute" || item.ID == "" || item.Name == "" || item.Model == "" || parsed.Host == "" || parsed.Scheme != "https" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
				continue
			}
			providers[item.ID] = api.Provider{Name: item.Name, BaseURL: item.BaseURL, TestModel: item.Model}
		}
		if len(providers) == 0 {
			return nil, errors.New("provider registry file has no usable OpenAI-compatible providers")
		}
		return providers, nil
	}
	raw := strings.TrimSpace(os.Getenv("PROVIDER_REGISTRY_JSON"))
	if raw == "" {
		raw = `{"openai":{"name":"OpenAI","base_url":"https://api.openai.com/v1","test_model":"gpt-4o-mini"},"gemini":{"name":"Google Gemini","base_url":"https://generativelanguage.googleapis.com/v1beta/openai","test_model":"gemini-2.0-flash"},"groq":{"name":"Groq","base_url":"https://api.groq.com/openai/v1","test_model":"llama-3.1-8b-instant"},"openrouter":{"name":"OpenRouter","base_url":"https://openrouter.ai/api/v1","test_model":"openai/gpt-4o-mini"},"xai":{"name":"xAI","base_url":"https://api.x.ai/v1","test_model":"grok-3-mini"}}`
	}
	var providers map[string]api.Provider
	if err := json.Unmarshal([]byte(raw), &providers); err != nil {
		return nil, err
	}
	if len(providers) == 0 {
		return nil, errors.New("provider registry is empty")
	}
	for id, p := range providers {
		if id == "" || p.Name == "" || p.BaseURL == "" || p.TestModel == "" {
			return nil, errors.New("provider registry entries require name, base_url, and test_model")
		}
	}
	return providers, nil
}
