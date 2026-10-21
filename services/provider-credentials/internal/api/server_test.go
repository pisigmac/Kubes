package api

import (
	"testing"
	"time"

	"github.com/kubes/provider-credentials/internal/auth"
)

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
