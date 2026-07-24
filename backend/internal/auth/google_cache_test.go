package auth

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestGoogleJWKSCacheHonorsMaxAge(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.Header().Set("Cache-Control", "public, max-age=60")
		writeTestJWKS(w, "current")
	}))
	defer server.Close()

	now := time.Unix(1_700_000_000, 0)
	cache := newGoogleJWKSCache(server.URL, server.Client(), func() time.Time { return now })

	if _, err := cache.publicKey("current"); err != nil {
		t.Fatalf("first key lookup: %v", err)
	}
	now = now.Add(59 * time.Second)
	if _, err := cache.publicKey("current"); err != nil {
		t.Fatalf("cached key lookup: %v", err)
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("JWKS requests = %d, want 1 before max-age expires", got)
	}

	now = now.Add(2 * time.Second)
	if _, err := cache.publicKey("current"); err != nil {
		t.Fatalf("refreshed key lookup: %v", err)
	}
	if got := requests.Load(); got != 2 {
		t.Fatalf("JWKS requests = %d, want 2 after max-age expires", got)
	}
}

func TestGoogleJWKSCacheUsesBoundedFallbackTTL(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		writeTestJWKS(w, "fallback")
	}))
	defer server.Close()

	now := time.Unix(1_700_000_000, 0)
	cache := newGoogleJWKSCache(server.URL, server.Client(), func() time.Time { return now })

	if _, err := cache.publicKey("fallback"); err != nil {
		t.Fatalf("first key lookup: %v", err)
	}
	now = now.Add(googleJWKSFallbackTTL - time.Second)
	if _, err := cache.publicKey("fallback"); err != nil {
		t.Fatalf("fallback cached key lookup: %v", err)
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("JWKS requests = %d, want 1 within fallback TTL", got)
	}

	now = now.Add(2 * time.Second)
	if _, err := cache.publicKey("fallback"); err != nil {
		t.Fatalf("fallback refreshed key lookup: %v", err)
	}
	if got := requests.Load(); got != 2 {
		t.Fatalf("JWKS requests = %d, want 2 after fallback TTL", got)
	}
}

func TestGoogleJWKSCacheRefreshesOnceForUnknownKeyID(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requestNumber := requests.Add(1)
		w.Header().Set("Cache-Control", "max-age=300")
		if requestNumber == 1 {
			writeTestJWKS(w, "old")
			return
		}
		writeTestJWKS(w, "new")
	}))
	defer server.Close()

	cache := newGoogleJWKSCache(server.URL, server.Client(), time.Now)
	if _, err := cache.publicKey("old"); err != nil {
		t.Fatalf("prime old key: %v", err)
	}
	if _, err := cache.publicKey("new"); err != nil {
		t.Fatalf("refresh rotated key: %v", err)
	}
	if got := requests.Load(); got != 2 {
		t.Fatalf("JWKS requests = %d, want 2 for rotation refresh", got)
	}

	if _, err := cache.publicKey("missing"); err == nil {
		t.Fatal("missing key lookup unexpectedly succeeded")
	}
	requestsAfterMiss := requests.Load()
	if _, err := cache.publicKey("missing"); err == nil {
		t.Fatal("negative-cached missing key lookup unexpectedly succeeded")
	}
	if got := requests.Load(); got != requestsAfterMiss {
		t.Fatalf("repeated missing kid caused another fetch: before=%d after=%d", requestsAfterMiss, got)
	}
}

func TestGoogleJWKSCacheCoalescesConcurrentFetches(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		time.Sleep(20 * time.Millisecond)
		w.Header().Set("Cache-Control", "max-age=300")
		writeTestJWKS(w, "shared")
	}))
	defer server.Close()

	cache := newGoogleJWKSCache(server.URL, server.Client(), time.Now)
	const callers = 16
	var waitGroup sync.WaitGroup
	errors := make(chan error, callers)
	for range callers {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			_, err := cache.publicKey("shared")
			errors <- err
		}()
	}
	waitGroup.Wait()
	close(errors)

	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent key lookup: %v", err)
		}
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("concurrent JWKS requests = %d, want 1", got)
	}
}

func writeTestJWKS(w http.ResponseWriter, kids ...string) {
	w.Header().Set("Content-Type", "application/json")
	modulus := base64.RawURLEncoding.EncodeToString([]byte{1, 2, 3, 4})
	exponent := base64.RawURLEncoding.EncodeToString([]byte{1, 0, 1})
	_, _ = fmt.Fprint(w, `{"keys":[`)
	for index, kid := range kids {
		if index > 0 {
			_, _ = fmt.Fprint(w, ",")
		}
		_, _ = fmt.Fprintf(
			w,
			`{"kid":%q,"kty":"RSA","alg":"RS256","use":"sig","n":%q,"e":%q}`,
			kid,
			modulus,
			exponent,
		)
	}
	_, _ = fmt.Fprint(w, `]}`)
}
