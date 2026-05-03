package auth

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

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

	keys, err := fetchGoogleJWKS()
	if err != nil {
		return nil, err
	}

	for _, key := range keys.Keys {
		if key.Kid == kid {
			return key.publicKey()
		}
	}

	return nil, errors.New("google signing key not found")
}

func fetchGoogleJWKS() (*googleJWKS, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(googleJWKSURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("failed to fetch google signing keys")
	}

	var keys googleJWKS
	if err := json.NewDecoder(resp.Body).Decode(&keys); err != nil {
		return nil, err
	}

	return &keys, nil
}

func (k googleJWK) publicKey() (*rsa.PublicKey, error) {
	if k.Kty != "RSA" {
		return nil, errors.New("google signing key is not rsa")
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
