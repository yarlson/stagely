// Package nanoid provides URL-safe unique identifier generation
package nanoid

import (
	gonanoid "github.com/matoous/go-nanoid/v2"
)

const (
	// DefaultLength is the default length for generated IDs
	DefaultLength = 12

	// Alphabet defines the character set for IDs
	// Using only lowercase alphanumeric for URL safety and simplicity
	Alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
)

// Generate creates a new NanoID with the default length (12 characters)
// Uses crypto/rand for cryptographically secure random generation
func Generate() string {
	id, err := gonanoid.Generate(Alphabet, DefaultLength)
	if err != nil {
		// In practice, this should never happen with valid alphabet
		// But we handle it defensively
		panic("nanoid generation failed: " + err.Error())
	}
	return id
}

// GenerateWithLength creates a new NanoID with the specified length
// Returns empty string if length is 0
func GenerateWithLength(length int) string {
	if length == 0 {
		return ""
	}

	id, err := gonanoid.Generate(Alphabet, length)
	if err != nil {
		panic("nanoid generation failed: " + err.Error())
	}
	return id
}
