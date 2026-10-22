package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/kubes/provider-credentials/internal/auth"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestGeminiModelDiscoveryUsesOpenAIModelsEndpointAndFiltersIDs(t *testing.T) {
	server := &Server{
		HTTP: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			if request.Method != http.MethodGet {
				t.Errorf("method = %q, want GET", request.Method)
			}
			if request.URL.String() != "https://generativelanguage.googleapis.com/v1beta/openai/models" {
				t.Errorf("URL = %q", request.URL.String())
			}
			if got := request.Header.Get("Authorization"); got != "Bearer test-secret" {
				t.Errorf("authorization header was not set correctly")
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"data":[{"id":"gemini-3.8-flash"},{"id":"gemini-3.8-flash"},{"id":"bad model"},{"id":"gemini-2.0-pro"}]}`)),
				Header:     make(http.Header),
			}, nil
		})},
	}
	models, status, err := server.discoverModels(context.Background(), Provider{BaseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"}, []byte("test-secret"))
	if err != nil {
		t.Fatalf("discoverModels() error = %v", err)
	}
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	if got := strings.Join(models, ","); got != "gemini-3.8-flash,gemini-2.0-pro" {
		t.Fatalf("models = %q", got)
	}
}

func TestProviderTestRateLimitIsPrincipalScoped(t *testing.T) {
	server := &Server{lastTests: make(map[string]time.Time)}
	first := auth.Identity{TenantID: "org-a", PrincipalID: "user-a"}
	other := auth.Identity{TenantID: "org-a", PrincipalID: "user-b"}
	if !server.allowTest(first, "openai") {
		t.Fatal("first test should be allowed")
	}
	if server.allowTest(first, "openai") {
		t.Fatal("immediate repeat should be limited")
	}
	if !server.allowTest(other, "openai") {
		t.Fatal("another principal should have a separate limit")
	}
	if !server.allowTest(first, "groq") {
		t.Fatal("another provider should have a separate limit")
	}
}

func TestProxyFailureLoggingIncludesSafeDiagnosticsOnly(t *testing.T) {
	var output bytes.Buffer
	server := &Server{Logger: slog.New(slog.NewJSONHandler(&output, nil))}
	server.logProxyFailure("gemini", "upstream_response", "quota_or_billing", http.StatusTooManyRequests, 1250*time.Millisecond)
	logged := output.String()
	for _, expected := range []string{`"provider":"gemini"`, `"phase":"upstream_response"`, `"category":"quota_or_billing"`, `"upstream_http_status":429`, `"latency_ms":1250`} {
		if !strings.Contains(logged, expected) {
			t.Errorf("log missing %s: %s", expected, logged)
		}
	}
	for _, forbidden := range []string{"test-secret", "prompt contents", "tool arguments", "response body"} {
		if strings.Contains(logged, forbidden) {
			t.Errorf("log unexpectedly contains sensitive data %q: %s", forbidden, logged)
		}
	}
}

func TestProxyFailureCategoriesDistinguishCancellationAndTransport(t *testing.T) {
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if got := proxyErrorCategory(cancelled, errors.New("opaque transport error")); got != "request_cancelled" {
		t.Fatalf("proxyErrorCategory(cancelled) = %q", got)
	}
	if got := proxyErrorCategory(context.Background(), context.DeadlineExceeded); got != "request_timeout" {
		t.Fatalf("proxyErrorCategory(timeout) = %q", got)
	}
	if got := proxyErrorCategory(context.Background(), errors.New("opaque transport error")); got != "upstream_connection_error" {
		t.Fatalf("proxyErrorCategory(connection) = %q", got)
	}
	if got := streamErrorCategory(cancelled, io.ErrClosedPipe); got != "stream_cancelled" {
		t.Fatalf("streamErrorCategory(cancelled) = %q", got)
	}
	if got := streamErrorCategory(context.Background(), io.ErrUnexpectedEOF); got != "stream_read_error" {
		t.Fatalf("streamErrorCategory(read error) = %q", got)
	}
}
