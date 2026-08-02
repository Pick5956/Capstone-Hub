package config

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const ginReleaseMode = "release"

var (
	db   *gorm.DB
	dbMu sync.RWMutex
)

type databaseSettings struct {
	Host               string
	Port               int
	User               string
	Password           string
	Name               string
	SSLMode            string
	SSLRootCert        string
	MaxOpenConns       int
	MaxIdleConns       int
	ConnMaxLifetimeMin int
	ConnMaxIdleTimeMin int
}

func DB() *gorm.DB {
	dbMu.RLock()
	defer dbMu.RUnlock()
	return db
}

func ConnectionDB() error {
	settings, err := databaseSettingsFromEnvironment()
	if err != nil {
		return err
	}

	logLevel := logger.Warn
	if os.Getenv("GIN_MODE") != ginReleaseMode && strings.EqualFold(strings.TrimSpace(os.Getenv("DB_LOG_LEVEL")), "info") {
		logLevel = logger.Info
	}
	databaseLogger := logger.New(log.New(os.Stdout, "", log.LstdFlags), logger.Config{
		SlowThreshold:             500 * time.Millisecond,
		LogLevel:                  logLevel,
		IgnoreRecordNotFoundError: true,
		ParameterizedQueries:      true,
		Colorful:                  false,
	})
	gormConfig := &gorm.Config{
		PrepareStmt: false,
		Logger:      databaseLogger,
	}
	if os.Getenv("GIN_MODE") == ginReleaseMode {
		gormConfig.Logger = databaseLogger.LogMode(logger.Warn)
	}

	database, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  settings.dsn(),
		PreferSimpleProtocol: true,
	}), gormConfig)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}

	sqlDB, err := database.DB()
	if err != nil {
		return fmt.Errorf("access database connection pool: %w", err)
	}
	sqlDB.SetMaxOpenConns(settings.MaxOpenConns)
	sqlDB.SetMaxIdleConns(settings.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(settings.ConnMaxLifetimeMin) * time.Minute)
	sqlDB.SetConnMaxIdleTime(time.Duration(settings.ConnMaxIdleTimeMin) * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		_ = sqlDB.Close()
		return fmt.Errorf("ping database: %w", err)
	}

	dbMu.Lock()
	db = database
	dbMu.Unlock()
	return nil
}

func PingDatabase(ctx context.Context) error {
	database := DB()
	if database == nil {
		return errors.New("database is not connected")
	}
	sqlDB, err := database.DB()
	if err != nil {
		return fmt.Errorf("access database connection pool: %w", err)
	}
	if err := sqlDB.PingContext(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}
	return nil
}

func CloseDatabase() error {
	dbMu.Lock()
	database := db
	db = nil
	dbMu.Unlock()
	if database == nil {
		return nil
	}
	sqlDB, err := database.DB()
	if err != nil {
		return fmt.Errorf("access database connection pool: %w", err)
	}
	if err := sqlDB.Close(); err != nil {
		return fmt.Errorf("close database: %w", err)
	}
	return nil
}

func (settings databaseSettings) dsn() string {
	parts := []string{
		"host=" + quoteDSNValue(settings.Host),
		fmt.Sprintf("port=%d", settings.Port),
		"user=" + quoteDSNValue(settings.User),
		"password=" + quoteDSNValue(settings.Password),
		"dbname=" + quoteDSNValue(settings.Name),
		"sslmode=" + settings.SSLMode,
		"TimeZone=Asia/Bangkok",
	}
	if settings.SSLRootCert != "" {
		parts = append(parts, "sslrootcert="+quoteDSNValue(settings.SSLRootCert))
	}
	return strings.Join(parts, " ")
}

func quoteDSNValue(value string) string {
	escaped := strings.ReplaceAll(value, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `'`, `\'`)
	return "'" + escaped + "'"
}
