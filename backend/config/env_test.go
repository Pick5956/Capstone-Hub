package config

import (
	"os"
	"path/filepath"
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

// writeDotenvFixture writes the two shapes a line-splitting parser gets wrong,
// and that broke the public assistant: a value with an inline comment after it,
// and a quoted value spanning several lines. Reading either with "split the line
// on the first =" yields "model # note" and a lone opening quote.
func writeDotenvFixture(t *testing.T) {
	t.Helper()
	directory := t.TempDir()
	content := "DISHY_TEST_MODEL=some-model # 120b costs too much, 20b is enough\n" +
		"DISHY_TEST_KEYS=\"key-one,\nkey-two,\nkey-three\"\n"
	if err := os.WriteFile(filepath.Join(directory, ".env"), []byte(content), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	t.Chdir(directory)
	t.Cleanup(func() {
		_ = os.Unsetenv("DISHY_TEST_MODEL")
		_ = os.Unsetenv("DISHY_TEST_KEYS")
	})
}

// Release mode is what a container runs in, and there the orchestrator owns the
// environment; a .env baked into the image must not quietly outrank it.
func TestLoadRuntimeEnvironmentSkipsDotenvInReleaseByDefault(t *testing.T) {
	writeDotenvFixture(t)
	t.Setenv("GIN_MODE", "release")

	if err := LoadRuntimeEnvironment(); err != nil {
		t.Fatalf("LoadRuntimeEnvironment: %v", err)
	}
	if got := os.Getenv("DISHY_TEST_MODEL"); got != "" {
		t.Fatalf("release mode must not read .env on its own, got %q", got)
	}
}

// A public run from a developer machine wants release mode but still keeps its
// values in backend/.env, so it opts back in - and must get godotenv's parsing,
// not an approximation of it.
func TestLoadRuntimeEnvironmentReadsDotenvInReleaseWhenOptedIn(t *testing.T) {
	writeDotenvFixture(t)
	t.Setenv("GIN_MODE", "release")
	t.Setenv("LOAD_DOTENV", "1")

	if err := LoadRuntimeEnvironment(); err != nil {
		t.Fatalf("LoadRuntimeEnvironment: %v", err)
	}
	if got := os.Getenv("DISHY_TEST_MODEL"); got != "some-model" {
		t.Fatalf("the inline comment must not survive into the value, got %q", got)
	}
	keys := os.Getenv("DISHY_TEST_KEYS")
	for _, want := range []string{"key-one", "key-two", "key-three"} {
		if !strings.Contains(keys, want) {
			t.Fatalf("multi-line quoted value lost %q, got %q", want, keys)
		}
	}
}

// The caller sets GIN_MODE and PUBLIC_BACKEND_URL before starting the process;
// godotenv must not overwrite them with whatever the file happens to say.
func TestLoadRuntimeEnvironmentDoesNotOverwriteValuesAlreadySet(t *testing.T) {
	directory := t.TempDir()
	content := "DISHY_TEST_PRESET=from-file\n"
	if err := os.WriteFile(filepath.Join(directory, ".env"), []byte(content), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	t.Chdir(directory)
	t.Setenv("DISHY_TEST_PRESET", "from-caller")

	if err := LoadRuntimeEnvironment(); err != nil {
		t.Fatalf("LoadRuntimeEnvironment: %v", err)
	}
	if got := os.Getenv("DISHY_TEST_PRESET"); got != "from-caller" {
		t.Fatalf("the caller's value must win, got %q", got)
	}
}
