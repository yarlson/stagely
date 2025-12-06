// Package db provides database connection management
package db

import (
	"time"

	"github.com/stagely-dev/stagely/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connect establishes a connection to PostgreSQL using GORM
// Configures connection pooling for production use
func Connect(cfg config.DatabaseConfig) (*gorm.DB, error) {
	// Configure GORM
	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	}

	// Open connection
	db, err := gorm.Open(postgres.Open(cfg.URL), gormConfig)
	if err != nil {
		return nil, err
	}

	// Get underlying sql.DB for connection pool configuration
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	// Configure connection pool
	sqlDB.SetMaxOpenConns(25)                 // Maximum open connections
	sqlDB.SetMaxIdleConns(5)                  // Maximum idle connections
	sqlDB.SetConnMaxLifetime(5 * time.Minute) // Connection lifetime
	sqlDB.SetConnMaxIdleTime(10 * time.Minute) // Idle connection timeout

	// Verify connection
	if err := sqlDB.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}

// HealthCheck verifies the database connection is alive
func HealthCheck(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Ping()
}
