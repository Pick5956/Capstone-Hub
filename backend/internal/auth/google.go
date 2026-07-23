package auth

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

const (
	googleJWKSFallbackTTL = 5 * time.Minute
	googleJWKSMaximumTTL  = 24 * time.Hour
	googleJWKSMaxBodySize = 1 << 20
)

var defaultGoogleJWKSCache = newGoogleJWKSCache(
	googleJWKSURL,
	&http.Client{Timeout: 5 * time.Second},
	time.Now,
)

type GoogleIDTokenClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Picture       string `json:"picture"`
	jwt.RegisteredClaims
}

type googleJWKS struct {
	Keys []googleJWK `json:"keys"`
}

type googleJWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func VerifyGoogleIDToken(idToken string, clientID string) (*GoogleIDTokenClaims, error) {
	if clientID == "" {
		return nil, errors.New("google client id is not configured")
	}

	claims := &GoogleIDTokenClaims{}
	token, err := jwt.ParseWithClaims(idToken, claims, googleKeyFunc)
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid google id token")
	}
	if claims.Issuer != "https://accounts.google.com" && claims.Issuer != "accounts.google.com" {
		return nil, errors.New("invalid google token issuer")
	}
	if !hasAudience(claims.Audience, clientID) {
		return nil, errors.New("invalid google token audience")
	}
	if claims.ExpiresAt == nil || claims.ExpiresAt.Time.Before(time.Now()) {
		return nil, errors.New("google token expired")
	}
	if claims.Email == "" || !claims.EmailVerified {
		return nil, errors.New("google email is not verified")
	}

	return claims, nil
}

func hasAudience(audiences jwt.ClaimStrings, clientID string) bool {
	for _, audience := range audiences {
		if audience == clientID {
			return true
		}
	}
	return false
}

func googleKeyFunc(token *jwt.Token) (interface{}, error) {
	if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
		return nil, errors.New("unexpected google token signing method")
	}

	kid, ok := token.Header["kid"].(string)
	if !ok || kid == "" {
		return nil, errors.New("google token missing key id")
	}

	return defaultGoogleJWKSCache.publicKey(kid)
}

type googleJWKSCache struct {
	mu          sync.Mutex
	url         string
	client      *http.Client
	now         func() time.Time
	keys        *googleJWKS
	expiresAt   time.Time
	missingKids map[string]time.Time
}

func newGoogleJWKSCache(url string, client *http.Client, now func() time.Time) *googleJWKSCache {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	if now == nil {
		now = time.Now
	}
	return &googleJWKSCache{
		url:         url,
		client:      client,
		now:         now,
		missingKids: make(map[string]time.Time),
	}
}

func (c *googleJWKSCache) publicKey(kid string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	hadFreshCache := c.keys != nil && now.Before(c.expiresAt)
	if !hadFreshCache {
		if err := c.refreshLocked(now); err != nil {
			return nil, err
		}
	}

	if key := findGoogleJWK(c.keys, kid); key != nil {
		return key.publicKey()
	}

	if missingUntil, ok := c.missingKids[kid]; ok && now.Before(missingUntil) {
		return nil, errors.New("google signing key not found")
	}

	// A kid absent from a still-valid cache may be a normal Google key
	// rotation. Refresh once immediately, then negative-cache a true miss for
	// the refreshed response's lifetime to avoid attacker-triggered fetches.
	if hadFreshCache {
		if err := c.refreshLocked(now); err != nil {
			return nil, err
		}
		if key := findGoogleJWK(c.keys, kid); key != nil {
			return key.publicKey()
		}
	}

	c.missingKids[kid] = c.expiresAt
	return nil, errors.New("google signing key not found")
}

func (c *googleJWKSCache) refreshLocked(now time.Time) error {
	resp, err := c.client.Get(c.url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return errors.New("failed to fetch google signing keys")
	}

	payload, err := io.ReadAll(io.LimitReader(resp.Body, googleJWKSMaxBodySize+1))
	if err != nil {
		return err
	}
	if len(payload) > googleJWKSMaxBodySize {
		return errors.New("google signing key response is too large")
	}

	var keys googleJWKS
	if err := json.Unmarshal(payload, &keys); err != nil {
		return err
	}
	if len(keys.Keys) == 0 {
		return errors.New("google signing key set is empty")
	}

	c.keys = &keys
	c.expiresAt = now.Add(googleJWKSCacheTTL(resp.Header.Get("Cache-Control")))
	c.missingKids = make(map[string]time.Time)
	return nil
}

func googleJWKSCacheTTL(cacheControl string) time.Duration {
	for _, rawDirective := range strings.Split(cacheControl, ",") {
		directive := strings.TrimSpace(strings.ToLower(rawDirective))
		if directive == "no-store" || directive == "no-cache" {
			return 0
		}
		name, value, ok := strings.Cut(directive, "=")
		if !ok || strings.TrimSpace(name) != "max-age" {
			continue
		}
		seconds, err := strconv.ParseInt(strings.Trim(strings.TrimSpace(value), `"`), 10, 64)
		if err != nil || seconds < 0 {
			break
		}
		ttl := time.Duration(seconds) * time.Second
		if ttl > googleJWKSMaximumTTL {
			return googleJWKSMaximumTTL
		}
		return ttl
	}
	return googleJWKSFallbackTTL
}

func findGoogleJWK(keys *googleJWKS, kid string) *googleJWK {
	if keys == nil {
		return nil
	}
	for index := range keys.Keys {
		if keys.Keys[index].Kid == kid {
			return &keys.Keys[index]
		}
	}
	return nil
}

func (k googleJWK) publicKey() (*rsa.PublicKey, error) {
	if k.Kty != "RSA" {
		return nil, errors.New("google signing key is not rsa")
	}
	if k.Alg != "" && k.Alg != jwt.SigningMethodRS256.Alg() {
		return nil, errors.New("google signing key uses an unexpected algorithm")
	}
	if k.Use != "" && k.Use != "sig" {
		return nil, errors.New("google signing key is not for signatures")
	}

	modulus, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, err
	}
	exponentBytes, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, err
	}

	exponent := big.NewInt(0).SetBytes(exponentBytes).Int64()
	if exponent == 0 {
		return nil, errors.New("invalid google signing key exponent")
	}

	return &rsa.PublicKey{
		N: big.NewInt(0).SetBytes(modulus),
		E: int(exponent),
	}, nil
}
