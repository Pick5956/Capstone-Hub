package config

import (
	"strings"
	"testing"
)

func setValidDatabaseEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("DB_HOST", "localhost")
	t.Setenv("DB_PORT", "5432")
	t.Setenv("DB_USER", "test_user")
	t.Setenv("DB_PASSWORD", "not-a-real-password")
	t.Setenv("DB_NAME", "test_database")
	t.Setenv("DB_SSLMODE", "disable")
	t.Setenv("DB_MAX_OPEN_CONNS", "20")
	t.Setenv("DB_MAX_IDLE_CONNS", "5")
	t.Setenv("DB_CONN_MAX_LIFETIME_MIN", "30")
	t.Setenv("DB_CONN_MAX_IDLE_TIME_MIN", "5")
}

func TestDatabaseSettingsFromEnvironment(t *testing.T) {
	setValidDatabaseEnvironment(t)

	settings, err := databaseSettingsFromEnvironment()
	if err != nil {
		t.Fatalf("databaseSettingsFromEnvironment() error = %v", err)
	}
	if settings.SSLMode != "disable" || settings.MaxOpenConns != 20 || settings.MaxIdleConns != 5 {
		t.Fatalf("unexpected settings: %+v", settings)
	}
}

func TestDatabaseSettingsRejectUnsafeOrInvalidValues(t *testing.T) {
	tests := []struct {
		name      string
		mutate    func(t *testing.T)
		wantError string
	}{
		{
			name: "missing host",
			mutate: func(t *testing.T) {
				t.Setenv("DB_HOST", "")
			},
			wantError: "DB_HOST",
		},
		{
			name: "invalid ssl mode",
			mutate: func(t *testing.T) {
				t.Setenv("DB_SSLMODE", "trust-everything")
			},
			wantError: "DB_SSLMODE",
		},
		{
			name: "invalid port",
			mutate: func(t *testing.T) {
				t.Setenv("DB_PORT", "70000")
			},
			wantError: "DB_PORT",
		},
		{
			name: "non-positive max open",
			mutate: func(t *testing.T) {
				t.Setenv("DB_MAX_OPEN_CONNS", "0")
			},
			wantError: "DB_MAX_OPEN_CONNS",
		},
		{
			name: "idle exceeds open",
			mutate: func(t *testing.T) {
				t.Setenv("DB_MAX_OPEN_CONNS", "5")
				t.Setenv("DB_MAX_IDLE_CONNS", "6")
			},
			wantError: "DB_MAX_IDLE_CONNS",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setValidDatabaseEnvironment(t)
			test.mutate(t)

			_, err := databaseSettingsFromEnvironment()
			if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("error = %v, want error containing %q", err, test.wantError)
			}
		})
	}
}
