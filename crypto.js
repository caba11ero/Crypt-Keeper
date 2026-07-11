/**
 * CryptKeeper Cryptography Module
 * Uses standard Web Crypto API for secure client-side encryption.
 */

// Helper: Convert string to Uint8Array (UTF-8)
function stringToUint8Array(str) {
    return new TextEncoder().encode(str);
}

// Helper: Convert Uint8Array to string
function uint8ArrayToString(arr) {
    return new TextDecoder().decode(arr);
}

// Helper: Convert ArrayBuffer to Base64 String
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Helper: Convert Base64 String to Uint8Array
function base64ToUint8Array(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Generate a cryptographically secure random salt (16 bytes)
 * @returns {Uint8Array} salt
 */
function generateSalt() {
    return window.crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Derive a CryptoKey from a master password using PBKDF2
 * @param {string} password - Master password
 * @param {Uint8Array} salt - Salt for key derivation
 * @returns {Promise<CryptoKey>} - Derived encryption key
 */
async function deriveKey(password, salt) {
    const passwordBytes = stringToUint8Array(password);
    
    // Import raw password as key material
    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        passwordBytes,
        'PBKDF2',
        false,
        ['deriveKey']
    );

    // Derive a 256-bit AES-GCM key
    return await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        baseKey,
        {
            name: 'AES-GCM',
            length: 256
        },
        false, // Key is not extractable (highly secure)
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt plaintext string using derived key (AES-256-GCM)
 * @param {string} plaintext - The raw string data to encrypt
 * @param {CryptoKey} key - The derived AES CryptoKey
 * @returns {Promise<{ ciphertext: string, iv: string }>} - Base64 encoded ciphertext and initialization vector
 */
async function encryptData(plaintext, key) {
    const plaintextBytes = stringToUint8Array(plaintext);
    
    // Generate a unique 12-byte IV for every encryption call
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        plaintextBytes
    );

    return {
        ciphertext: arrayBufferToBase64(ciphertextBuffer),
        iv: arrayBufferToBase64(iv)
    };
}

/**
 * Decrypt ciphertext using derived key (AES-256-GCM)
 * @param {string} ciphertextBase64 - Base64 encoded ciphertext
 * @param {CryptoKey} key - The derived AES CryptoKey
 * @param {string} ivBase64 - Base64 encoded initialization vector
 * @returns {Promise<string>} - Decrypted plaintext string
 */
async function decryptData(ciphertextBase64, key, ivBase64) {
    const ciphertextBytes = base64ToUint8Array(ciphertextBase64);
    const ivBytes = base64ToUint8Array(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: ivBytes
        },
        key,
        ciphertextBytes
    );

    return uint8ArrayToString(new Uint8Array(decryptedBuffer));
}

// Export functions to global scope (since we are creating standard client-side JS files)
window.CryptKeeper = {
    generateSalt,
    deriveKey,
    encryptData,
    decryptData,
    arrayBufferToBase64,
    base64ToUint8Array
};
