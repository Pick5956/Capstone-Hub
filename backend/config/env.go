package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

func ValidateRuntimeEnvironment() error {
	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if jwtSecret == "" {
		return errors.New("JWT_SECRET is required")
	}
	if len(jwtSecret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}
	return nil
}
