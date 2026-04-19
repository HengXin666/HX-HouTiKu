package com.hxhoutiku.app.crypto

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages the user's ECIES key pair securely.
 *
 * Private key is protected by:
 *   1. Master password → PBKDF2 (600k iterations) → wrapping key
 *   2. AES-256-GCM(wrapping_key, private_key) → encrypted_private_key
 *   3. Stored in EncryptedSharedPreferences (Android Keystore backed)
 *
 * This is compatible with the PWA frontend's crypto.ts implementation.
 */
@Singleton
class KeyManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "KeyManager"
        private const val PBKDF2_ITERATIONS = 600_000
        private const val SALT_LENGTH = 16
        private const val IV_LENGTH = 12
        private const val GCM_TAG_BITS = 128

        private const val KEY_ENCRYPTED_PRIVATE = "encrypted_private_key"
        private const val KEY_SALT = "key_salt"
        private const val KEY_IV = "key_iv"
        private const val KEY_PUBLIC = "public_key"
        private const val KEY_RECIPIENT_TOKEN = "recipient_token"
        private const val KEY_RECIPIENT_NAME = "recipient_name"
    }

    /**
     * Lazy initialization of EncryptedSharedPreferences.
     * This avoids crashing in the constructor if Android Keystore has issues.
     */
    private val prefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                "hx_keystore",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(TAG, "EncryptedSharedPreferences failed, falling back to plain prefs", e)
            // Fallback: if Keystore is corrupted, use plain SharedPreferences
            // This is a last resort to prevent crash — data won't be Keystore-encrypted
            context.getSharedPreferences("hx_keystore_fallback", Context.MODE_PRIVATE)
        }
    }

    /** Check if keys have been set up. */
    fun hasKeys(): Boolean {
        return try {
            prefs.contains(KEY_ENCRYPTED_PRIVATE)
        } catch (e: Exception) {
            Log.e(TAG, "hasKeys() failed", e)
            false
        }
    }

    /** Get stored public key (hex), or null if not set up. */
    fun getPublicKey(): String? {
        return try {
            prefs.getString(KEY_PUBLIC, null)
        } catch (e: Exception) {
            Log.e(TAG, "getPublicKey() failed", e)
            null
        }
    }

    /** Get stored recipient token. */
    fun getRecipientToken(): String? {
        return try {
            prefs.getString(KEY_RECIPIENT_TOKEN, null)
        } catch (e: Exception) {
            Log.e(TAG, "getRecipientToken() failed", e)
            null
        }
    }

    /** Get stored recipient name. */
    fun getRecipientName(): String? {
        return try {
            prefs.getString(KEY_RECIPIENT_NAME, null)
        } catch (e: Exception) {
            Log.e(TAG, "getRecipientName() failed", e)
            null
        }
    }

    /** Store recipient token (user pastes this from admin API response). */
    fun saveRecipientToken(token: String) {
        prefs.edit()
            .putString(KEY_RECIPIENT_TOKEN, token)
            .apply()
    }

    /** Store device name. */
    fun saveDeviceName(name: String) {
        prefs.edit()
            .putString(KEY_RECIPIENT_NAME, name)
            .apply()
    }

    /** Store recipient info (token + name). */
    fun saveRecipientInfo(token: String, name: String) {
        prefs.edit()
            .putString(KEY_RECIPIENT_TOKEN, token)
            .putString(KEY_RECIPIENT_NAME, name)
            .apply()
    }

    /**
     * Generate a new key pair and wrap the private key with the master password.
     *
     * WARNING: This method involves PBKDF2 (600k iterations) and must NOT be called
     * on the main thread.
     *
     * @return The public key hex string
     */
    fun generateAndStore(password: String): String {
        val keyPair = EciesManager.generateKeyPair()
        wrapAndStore(keyPair.privateKeyHex, keyPair.publicKeyHex, password)
        return keyPair.publicKeyHex
    }

    /**
     * Import an existing private key (e.g., from PWA export).
     */
    fun importAndStore(privateKeyHex: String, password: String): String {
        val publicKeyHex = EciesManager.publicKeyFromPrivate(privateKeyHex)
        wrapAndStore(privateKeyHex, publicKeyHex, password)
        return publicKeyHex
    }

    /**
     * Unlock the private key using the master password.
     *
     * WARNING: This method involves PBKDF2 (600k iterations) and must NOT be called
     * on the main thread.
     *
     * @return The decrypted private key hex, or null if password is wrong.
     */
    fun unlock(password: String): String? {
        val saltHex = prefs.getString(KEY_SALT, null) ?: return null
        val ivHex = prefs.getString(KEY_IV, null) ?: return null
        val encryptedHex = prefs.getString(KEY_ENCRYPTED_PRIVATE, null) ?: return null

        return try {
            val salt = saltHex.hexToBytes()
            val iv = ivHex.hexToBytes()
            val ciphertext = encryptedHex.hexToBytes()

            val wrappingKey = deriveKey(password, salt)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, wrappingKey, GCMParameterSpec(GCM_TAG_BITS, iv))
            val plaintext = cipher.doFinal(ciphertext)
            String(plaintext, Charsets.UTF_8)
        } catch (e: Exception) {
            Log.w(TAG, "unlock() failed — wrong password or corrupted data", e)
            null
        }
    }

    /** Wipe all stored keys (factory reset). */
    fun clear() {
        try {
            prefs.edit().clear().apply()
        } catch (e: Exception) {
            Log.e(TAG, "clear() failed", e)
        }
    }

    // --- Internal ---

    private fun wrapAndStore(privateKeyHex: String, publicKeyHex: String, password: String) {
        val salt = ByteArray(SALT_LENGTH).also { java.security.SecureRandom().nextBytes(it) }
        val iv = ByteArray(IV_LENGTH).also { java.security.SecureRandom().nextBytes(it) }

        val wrappingKey = deriveKey(password, salt)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, wrappingKey, GCMParameterSpec(GCM_TAG_BITS, iv))
        val ciphertext = cipher.doFinal(privateKeyHex.toByteArray(Charsets.UTF_8))

        prefs.edit()
            .putString(KEY_SALT, salt.toHex())
            .putString(KEY_IV, iv.toHex())
            .putString(KEY_ENCRYPTED_PRIVATE, ciphertext.toHex())
            .putString(KEY_PUBLIC, publicKeyHex)
            .apply()
    }

    private fun deriveKey(password: String, salt: ByteArray): SecretKeySpec {
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val spec = PBEKeySpec(password.toCharArray(), salt, PBKDF2_ITERATIONS, 256)
        val secretKey = factory.generateSecret(spec)
        return SecretKeySpec(secretKey.encoded, "AES")
    }
}
