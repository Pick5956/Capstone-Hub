package config

import (
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

var allowedDatabaseSSLModes = map[string]struct{}{
	"disable":     {},
	"allow":       {},
	"prefer":      {},
	"require":     {},
	"verify-ca":   {},
	"verify-full": {},
}

func LoadRuntimeEnvironment() error {
	if os.Getenv("GIN_MODE") == ginReleaseMode {
		return nil
	}
	if err := godotenv.Load(); err != nil {
		return errors.New("load backend environment file")
	}
	return nil
}

func ValidateRuntimeEnvironment() error {
	if _, err := databaseSettingsFromEnvironment(); err != nil {
		return err
	}

	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if jwtSecret == "" {
		return errors.New("JWT_SECRET is required")
	}
	if len(jwtSecret) < 32 {
		return errors.New("JWT_SECRET must be at least 32 characters")
	}

	port := strings.TrimSpace(os.Getenv("SERVER_PORT"))
	if port != "" {
		parsed, err := strconv.Atoi(port)
		if err != nil || parsed < 1 || parsed > 65535 {
			return errors.New("SERVER_PORT must be an integer between 1 and 65535")
		}
	}
	return nil
}

func ValidateDatabaseEnvironment() error {
	_, err := databaseSettingsFromEnvironment()
	return err
}

func databaseSettingsFromEnvironment() (databaseSettings, error) {
	settings := databaseSettings{
		Host:        strings.TrimSpace(os.Getenv("DB_HOST")),
		User:        strings.TrimSpace(os.Getenv("DB_USER")),
		Password:    os.Getenv("DB_PASSWORD"),
		Name:        strings.TrimSpace(os.Getenv("DB_NAME")),
		SSLMode:     strings.ToLower(strings.TrimSpace(os.Getenv("DB_SSLMODE"))),
		SSLRootCert: strings.TrimSpace(os.Getenv("DB_SSLROOTCERT")),
	}

	for name, value := range map[string]string{
		"DB_HOST":     settings.Host,
		"DB_USER":     settings.User,
		"DB_PASSWORD": settings.Password,
		"DB_NAME":     settings.Name,
	} {
		if strings.TrimSpace(value) == "" {
			return databaseSettings{}, fmt.Errorf("%s is required", name)
		}
	}

	port, err := envInteger("DB_PORT", 5432, 1, 65535)
	if err != nil {
		return databaseSettings{}, err
	}
	settings.Port = port

	if settings.SSLMode == "" {
		settings.SSLMode = "disable"
	}
	if _, ok := allowedDatabaseSSLModes[settings.SSLMode]; !ok {
		return databaseSettings{}, errors.New("DB_SSLMODE must be one of disable, allow, prefer, require, verify-ca, or verify-full")
	}

	settings.MaxOpenConns, err = envInteger("DB_MAX_OPEN_CONNS", 100, 1, 10000)
	if err != nil {
		return databaseSettings{}, err
	}
	settings.MaxIdleConns, err = envInteger("DB_MAX_IDLE_CONNS", 25, 0, 10000)
	if err != nil {
		return databaseSettings{}, err
	}
	if settings.MaxIdleConns > settings.MaxOpenConns {
		return databaseSettings{}, errors.New("DB_MAX_IDLE_CONNS must not exceed DB_MAX_OPEN_CONNS")
	}
	settings.ConnMaxLifetimeMin, err = envInteger("DB_CONN_MAX_LIFETIME_MIN", 30, 0, 10080)
	if err != nil {
		return databaseSettings{}, err
	}
	settings.ConnMaxIdleTimeMin, err = envInteger("DB_CONN_MAX_IDLE_TIME_MIN", 5, 0, 10080)
	if err != nil {
		return databaseSettings{}, err
	}

	if net.ParseIP(settings.Host) == nil && strings.ContainsAny(settings.Host, " /\\") {
		return databaseSettings{}, errors.New("DB_HOST contains invalid characters")
	}
	return settings, nil
}

func envInteger(name string, fallback, minimum, maximum int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be an integer between %d and %d", name, minimum, maximum)
	}
	return value, nil
}
