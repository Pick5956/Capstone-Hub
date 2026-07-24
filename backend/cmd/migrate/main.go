package main

import (
	"fmt"
	"log"

	"Project-M/config"
)

func run() (resultErr error) {
	if err := config.LoadRuntimeEnvironment(); err != nil {
		return err
	}
	if err := config.ValidateDatabaseEnvironment(); err != nil {
		return err
	}
	if err := config.ConnectionDB(); err != nil {
		return err
	}
	defer func() {
		if err := config.CloseDatabase(); resultErr == nil && err != nil {
			resultErr = err
		}
	}()
	if err := config.RunMigrations(config.DB()); err != nil {
		return err
	}
	if err := config.EnsureSchemaCurrent(config.DB()); err != nil {
		return err
	}
	log.Printf("database migrations complete schema_version=%d", config.CurrentSchemaVersion)
	return nil
}

func main() {
	if err := run(); err != nil {
		log.Fatal(fmt.Errorf("migrate database: %w", err))
	}
}
