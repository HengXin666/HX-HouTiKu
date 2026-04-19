package com.hxhoutiku.app.crypto

import org.bouncycastle.asn1.x9.X9ECParameters
import org.bouncycastle.crypto.ec.CustomNamedCurves
import org.bouncycastle.crypto.params.ECDomainParameters
import org.bouncycastle.crypto.params.ECPrivateKeyParameters
import org.bouncycastle.crypto.params.ECPublicKeyParameters
import org.bouncycastle.jcajce.provider.asymmetric.ec.BCECPrivateKey
import org.bouncycastle.jce.ECNamedCurveTable
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.jce.spec.ECPrivateKeySpec
import org.bouncycastle.math.ec.ECPoint
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.Security
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * ECIES encryption/decryption compatible with eciesjs (npm) and eciespy (python).
 *
 * Format (eciesjs default):
 *   ephemeral_pubkey (65 bytes, uncompressed) || iv (16 bytes) || tag (16 bytes) || ciphertext
 *
 * Internally uses:
 *   - secp256k1 curve
 *   - ECDH key agreement
 *   - HKDF-SHA256 for key derivation
 *   - AES-256-GCM for symmetric encryption
 */
object EciesManager {

    private const val CURVE_NAME = "secp256k1"
    private const val GCM_TAG_BITS = 128
    private const val GCM_IV_LENGTH = 16
    private const val AES_KEY_LENGTH = 32

    private val ecParams: X9ECParameters = CustomNamedCurves.getByName(CURVE_NAME)
    private val domainParams = ECDomainParameters(
        ecParams.curve, ecParams.g, ecParams.n, ecParams.h
    )

    init {
        // BouncyCastle is installed in HxApp.onCreate(), but double-check
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.insertProviderAt(BouncyCastleProvider(), 1)
        }
    }

    data class KeyPair(
        val privateKeyHex: String,
        val publicKeyHex: String
    )

    /** Generate a new secp256k1 key pair. */
    fun generateKeyPair(): KeyPair {
        val kpg = KeyPairGenerator.getInstance("EC", "BC")
        kpg.initialize(ECGenParameterSpec(CURVE_NAME))
        val kp = kpg.generateKeyPair()

        val privKey = kp.private as BCECPrivateKey
        val privHex = privKey.d.toString(16).padStart(64, '0')

        val pubPoint = ecParams.g.multiply(privKey.d).normalize()
        val pubHex = pubPoint.getEncoded(false).toHex()

        return KeyPair(privateKeyHex = privHex, publicKeyHex = pubHex)
    }

    /** Derive public key hex from private key hex. */
    fun publicKeyFromPrivate(privateKeyHex: String): String {
        val d = BigInteger(privateKeyHex, 16)
        val pubPoint = ecParams.g.multiply(d).normalize()
        return pubPoint.getEncoded(false).toHex()
    }

    /**
     * Decrypt an ECIES-encrypted message.
     *
     * @param privateKeyHex The recipient's private key (32 bytes hex)
     * @param ciphertext The full ECIES ciphertext (ephemeral_pk || iv || tag || encrypted)
     * @return Decrypted plaintext bytes
     */
    fun decrypt(privateKeyHex: String, ciphertext: ByteArray): ByteArray {
        // Parse components: 65 bytes pubkey + 16 bytes IV + ciphertext+tag
        val ephemeralPubBytes = ciphertext.sliceArray(0 until 65)
        val iv = ciphertext.sliceArray(65 until 65 + GCM_IV_LENGTH)
        val tagAndCipher = ciphertext.sliceArray(65 + GCM_IV_LENGTH until ciphertext.size)

        // In eciesjs format: tag (16 bytes) || ciphertext
        val tag = tagAndCipher.sliceArray(0 until 16)
        val encrypted = tagAndCipher.sliceArray(16 until tagAndCipher.size)

        // Reconstruct ephemeral public key point
        val ephemeralPoint = ecParams.curve.decodePoint(ephemeralPubBytes)

        // ECDH: shared secret = ephemeral_pub * private_key
        val d = BigInteger(privateKeyHex, 16)
        val sharedPoint = ephemeralPoint.multiply(d).normalize()
        val sharedX = sharedPoint.affineXCoord.encoded

        // HKDF-SHA256 to derive AES key
        val aesKey = hkdfSha256(sharedX, AES_KEY_LENGTH)

        // AES-256-GCM decrypt
        // GCM expects ciphertext || tag concatenated
        val gcmInput = encrypted + tag
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(GCM_TAG_BITS, iv)
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(aesKey, "AES"), spec)
        return cipher.doFinal(gcmInput)
    }

    /**
     * Simplified HKDF-SHA256 (extract + expand) without info/salt,
     * matching eciesjs default behavior.
     */
    private fun hkdfSha256(ikm: ByteArray, length: Int): ByteArray {
        // Extract: PRK = HMAC-SHA256(salt="", IKM)
        val hmac = Mac.getInstance("HmacSHA256")
        val emptySalt = ByteArray(32) // eciesjs uses empty 32-byte salt
        hmac.init(SecretKeySpec(emptySalt, "HmacSHA256"))
        val prk = hmac.doFinal(ikm)

        // Expand: OKM = HMAC-SHA256(PRK, 0x01)
        hmac.init(SecretKeySpec(prk, "HmacSHA256"))
        hmac.update(byteArrayOf(0x01))
        val okm = hmac.doFinal()

        return okm.sliceArray(0 until length)
    }
}

// --- Hex utilities ---

fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

fun String.hexToBytes(): ByteArray {
    check(length % 2 == 0) { "Hex string must have even length" }
    return chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}
