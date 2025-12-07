package db_test

import (
	"context"
	"testing"
	"time"

	"github.com/stagely-dev/stagely/internal/config"
	"github.com/stagely-dev/stagely/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestConnect_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// Given - Start PostgreSQL container
	ctx := context.Background()
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:14-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "test",
				"POSTGRES_PASSWORD": "test",
				"POSTGRES_DB":       "test",
			},
			WaitingFor: wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2). // Wait for second occurrence (after recovery)
				WithStartupTimeout(60 * time.Second),
		},
		Started: true,
	})
	require.NoError(t, err)
	defer func() {
		require.NoError(t, container.Terminate(ctx))
	}()

	// Get connection string
	host, err := container.Host(ctx)
	require.NoError(t, err)
	port, err := container.MappedPort(ctx, "5432")
	require.NoError(t, err)

	cfg := config.DatabaseConfig{
		URL: "postgres://test:test@" + host + ":" + port.Port() + "/test?sslmode=disable",
	}

	// When
	gormDB, err := db.Connect(cfg)

	// Then
	require.NoError(t, err)
	assert.NotNil(t, gormDB)

	// Verify connection works
	sqlDB, err := gormDB.DB()
	require.NoError(t, err)
	err = sqlDB.Ping()
	assert.NoError(t, err)
}

func TestHealthCheck_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// Given - Start PostgreSQL container
	ctx := context.Background()
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:14-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "test",
				"POSTGRES_PASSWORD": "test",
				"POSTGRES_DB":       "test",
			},
			WaitingFor: wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2). // Wait for second occurrence (after recovery)
				WithStartupTimeout(60 * time.Second),
		},
		Started: true,
	})
	require.NoError(t, err)
	defer func() {
		require.NoError(t, container.Terminate(ctx))
	}()

	host, err := container.Host(ctx)
	require.NoError(t, err)
	port, err := container.MappedPort(ctx, "5432")
	require.NoError(t, err)

	cfg := config.DatabaseConfig{
		URL: "postgres://test:test@" + host + ":" + port.Port() + "/test?sslmode=disable",
	}

	gormDB, err := db.Connect(cfg)
	require.NoError(t, err)

	// When
	err = db.HealthCheck(gormDB)

	// Then
	assert.NoError(t, err)
}

func TestConnect_InvalidURL(t *testing.T) {
	// Given
	cfg := config.DatabaseConfig{
		URL: "invalid-url",
	}

	// When
	gormDB, err := db.Connect(cfg)

	// Then
	assert.Error(t, err)
	assert.Nil(t, gormDB)
}
