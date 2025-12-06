package config_test

import (
	"os"
	"testing"

	"github.com/stagely-dev/stagely/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_Success(t *testing.T) {
	// Given
	require.NoError(t, os.Setenv("DATABASE_URL", "postgres://localhost/test"))
	require.NoError(t, os.Setenv("REDIS_URL", "redis://localhost:6379"))
	require.NoError(t, os.Setenv("PORT", "8080"))
	require.NoError(t, os.Setenv("ENVIRONMENT", "test"))
	require.NoError(t, os.Setenv("LOG_LEVEL", "debug"))
	defer os.Clearenv()

	// When
	cfg, err := config.Load()

	// Then
	require.NoError(t, err)
	assert.NotNil(t, cfg)
	assert.Equal(t, "postgres://localhost/test", cfg.Database.URL)
	assert.Equal(t, "redis://localhost:6379", cfg.Redis.URL)
	assert.Equal(t, 8080, cfg.Server.Port)
	assert.Equal(t, "test", cfg.Server.Environment)
	assert.Equal(t, "debug", cfg.Server.LogLevel)
}

func TestLoad_MissingDatabaseURL(t *testing.T) {
	// Given
	os.Clearenv()
	require.NoError(t, os.Setenv("REDIS_URL", "redis://localhost:6379"))

	// When
	cfg, err := config.Load()

	// Then
	assert.Error(t, err)
	assert.Nil(t, cfg)
	assert.Contains(t, err.Error(), "DATABASE_URL")
}

func TestLoad_DefaultValues(t *testing.T) {
	// Given
	os.Clearenv()
	require.NoError(t, os.Setenv("DATABASE_URL", "postgres://localhost/test"))
	require.NoError(t, os.Setenv("REDIS_URL", "redis://localhost:6379"))

	// When
	cfg, err := config.Load()

	// Then
	require.NoError(t, err)
	assert.Equal(t, 8080, cfg.Server.Port)           // default
	assert.Equal(t, "development", cfg.Server.Environment) // default
	assert.Equal(t, "info", cfg.Server.LogLevel)     // default
}
