package crypto_test

import (
	"encoding/base64"
	"testing"

	"github.com/stagely-dev/stagely/internal/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	// Given
	key, err := crypto.GenerateKey()
	require.NoError(t, err)
	plaintext := "my-secret-database-password"

	// When
	ciphertext, err := crypto.Encrypt(plaintext, key)
	require.NoError(t, err)

	decrypted, err := crypto.Decrypt(ciphertext, key)
	require.NoError(t, err)

	// Then
	assert.Equal(t, plaintext, decrypted)
	assert.NotEqual(t, plaintext, ciphertext, "Ciphertext should not equal plaintext")
}

func TestEncrypt_DifferentCiphertexts(t *testing.T) {
	// Given
	key, _ := crypto.GenerateKey()
	plaintext := "same-plaintext"

	// When - Encrypt twice
	ciphertext1, _ := crypto.Encrypt(plaintext, key)
	ciphertext2, _ := crypto.Encrypt(plaintext, key)

	// Then - Should be different due to random nonce
	assert.NotEqual(t, ciphertext1, ciphertext2, "Each encryption should use a unique nonce")
}

func TestDecrypt_WrongKey(t *testing.T) {
	// Given
	key1, _ := crypto.GenerateKey()
	key2, _ := crypto.GenerateKey()
	plaintext := "secret-data"

	ciphertext, err := crypto.Encrypt(plaintext, key1)
	require.NoError(t, err)

	// When - Decrypt with wrong key
	_, err = crypto.Decrypt(ciphertext, key2)

	// Then
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "authentication failed")
}

func TestDecrypt_TamperedData(t *testing.T) {
	// Given
	key, _ := crypto.GenerateKey()
	plaintext := "important-data"

	ciphertext, err := crypto.Encrypt(plaintext, key)
	require.NoError(t, err)

	// When - Tamper with ciphertext (flip a bit in the decoded data)
	decoded, _ := base64.StdEncoding.DecodeString(ciphertext)
	if len(decoded) > 10 {
		decoded[10] ^= 0xFF // Flip bits
	}
	tampered := base64.StdEncoding.EncodeToString(decoded)

	_, err = crypto.Decrypt(tampered, key)

	// Then
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "authentication failed")
}

func TestEncrypt_EmptyString(t *testing.T) {
	// Given
	key, _ := crypto.GenerateKey()

	// When
	ciphertext, err := crypto.Encrypt("", key)
	require.NoError(t, err)

	decrypted, err := crypto.Decrypt(ciphertext, key)
	require.NoError(t, err)

	// Then
	assert.Equal(t, "", decrypted)
}

func TestEncrypt_LongText(t *testing.T) {
	// Given
	key, _ := crypto.GenerateKey()
	// Create 1KB of text
	plaintext := string(make([]byte, 1024))
	for i := range plaintext {
		plaintext = plaintext[:i] + "a"
	}

	// When
	ciphertext, err := crypto.Encrypt(plaintext, key)
	require.NoError(t, err)

	decrypted, err := crypto.Decrypt(ciphertext, key)
	require.NoError(t, err)

	// Then
	assert.Len(t, decrypted, len(plaintext))
}

func TestGenerateKey(t *testing.T) {
	// When
	key1, err1 := crypto.GenerateKey()
	key2, err2 := crypto.GenerateKey()

	// Then
	require.NoError(t, err1)
	require.NoError(t, err2)
	assert.Len(t, key1, 32, "Key should be 32 bytes (256 bits)")
	assert.Len(t, key2, 32)
	assert.NotEqual(t, key1, key2, "Keys should be unique")
}
