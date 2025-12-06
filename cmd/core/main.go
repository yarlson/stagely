package main

import (
	"fmt"
	"log"

	"github.com/stagely-dev/stagely/internal/config"
	"github.com/stagely-dev/stagely/internal/db"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Printf("Starting Stagely Core API (environment: %s)", cfg.Server.Environment)

	// Connect to database
	database, err := db.Connect(cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Database connection established")

	// Health check
	if err := db.HealthCheck(database); err != nil {
		log.Fatalf("Database health check failed: %v", err)
	}
	log.Println("Database health check passed")

	// Phase 0 complete - server starts in Phase 2
	fmt.Printf(`
╔═══════════════════════════════════════════╗
║   Stagely Core - Phase 0 Foundation      ║
║                                           ║
║   Status: ✅ Database Connected           ║
║   Status: ✅ Configuration Loaded         ║
║   Next: Phase 1 (Cloud Provider Interface)║
╚═══════════════════════════════════════════╝

Phase 0 Complete!

- Database: %s
- Environment: %s
- Log Level: %s

Press Ctrl+C to exit.
`, cfg.Database.URL, cfg.Server.Environment, cfg.Server.LogLevel)

	// Block forever (HTTP server will be added in Phase 2)
	select {}
}
