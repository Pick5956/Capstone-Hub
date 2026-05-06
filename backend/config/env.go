package config

import (
	"errors"
	"os"
	"strings"
)

func ValidateRuntimeEnvironment() error {
	if strings.TrimSpace(os.Getenv("JWT_SECRET")) == "" {
		return errors.New("JWT_SECRET is required")
	}
	return nil
}
