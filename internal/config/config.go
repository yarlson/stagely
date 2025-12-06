package config

import (
	"fmt"

	"github.com/spf13/viper"
)

// Config holds all configuration for the application
type Config struct {
	Database DatabaseConfig
	Redis    RedisConfig
	Server   ServerConfig
	Security SecurityConfig
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	URL string
}

// RedisConfig holds Redis connection settings
type RedisConfig struct {
	URL string
}

// ServerConfig holds HTTP server settings
type ServerConfig struct {
	Port        int
	Environment string
	LogLevel    string
}

// SecurityConfig holds security-related settings
type SecurityConfig struct {
	JWTSecret     string
	EncryptionKey string
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	v := viper.New()

	// Set defaults
	v.SetDefault("PORT", 8080)
	v.SetDefault("ENVIRONMENT", "development")
	v.SetDefault("LOG_LEVEL", "info")

	// Bind environment variables
	v.AutomaticEnv()

	// Create config struct
	cfg := &Config{
		Database: DatabaseConfig{
			URL: v.GetString("DATABASE_URL"),
		},
		Redis: RedisConfig{
			URL: v.GetString("REDIS_URL"),
		},
		Server: ServerConfig{
			Port:        v.GetInt("PORT"),
			Environment: v.GetString("ENVIRONMENT"),
			LogLevel:    v.GetString("LOG_LEVEL"),
		},
		Security: SecurityConfig{
			JWTSecret:     v.GetString("JWT_SECRET"),
			EncryptionKey: v.GetString("ENCRYPTION_KEY"),
		},
	}

	// Validate required fields
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Validate checks that required configuration values are present
func (c *Config) Validate() error {
	if c.Database.URL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if c.Redis.URL == "" {
		return fmt.Errorf("REDIS_URL is required")
	}
	return nil
}
