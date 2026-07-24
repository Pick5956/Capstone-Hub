package auth

import (
	"errors"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const Issuer = "AuthService"

type JwtWrapper struct {
	SecretKey string
	Issuer    string
}

type JwtClaims struct {
	UserID       uint   `json:"user_id"`
	Role         string `json:"role"`
	TokenVersion uint   `json:"token_version"`
	jwt.RegisteredClaims
}

func (j *JwtWrapper) ValidateToken(tokenString string) (*JwtClaims, error) {
	if strings.TrimSpace(j.SecretKey) == "" {
		return nil, errors.New("jwt secret is not configured")
	}

	token, err := jwt.ParseWithClaims(
		tokenString,
		&JwtClaims{},
		func(token *jwt.Token) (interface{}, error) {
			return []byte(j.SecretKey), nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(j.Issuer),
		jwt.WithExpirationRequired(),
	)

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*JwtClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	if claims.ExpiresAt == nil || claims.ExpiresAt.Time.Before(time.Now()) {
		return nil, errors.New("token expired")
	}
	if claims.UserID == 0 {
		return nil, errors.New("invalid token subject")
	}

	return claims, nil
}

func (j *JwtWrapper) GenerateToken(userID uint, role string, tokenVersion uint) (string, error) {
	if strings.TrimSpace(j.SecretKey) == "" {
		return "", errors.New("jwt secret is not configured")
	}
	if tokenVersion == 0 {
		return "", errors.New("invalid token version")
	}
	now := time.Now()
	claims := &JwtClaims{
		UserID:       userID,
		Role:         role,
		TokenVersion: tokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			Issuer:    j.Issuer,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(j.SecretKey))
}
