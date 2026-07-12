# 🔐 CryptKeeper

> **CryptKeeper** is a secure, client-side encrypted markdown notes desktop application. Built with security and user experience in mind, it provides a beautiful, native environment to store private journals, credentials, code snippets, and thoughts with absolute zero-knowledge privacy.

---

## ✨ Key Features

* **🛡️ Zero-Knowledge Security**: All notes, tags, and attachments are encrypted and decrypted locally on your device. Your data never leaves your computer.
* **🎨 Rich Interactive Themes**: Choose from 7 curated premium themes to match your aesthetic:
  * *Premium Dark* (Original sleek violet)
  * *Cyberpunk* (Neon pink & cyan)
  * *Matrix* (Green digital rain code)
  * *Classic Terminal* (Amber phosphor console)
  * *Futuristic Aurora* (Slate & glowing teal)
  * *Dracula* (Classic dark developer theme)
  * *Sakura Rose* (Cozy dark pastel rose)
* **📝 Markdown**: 
  * Interactive task checklists (`- [ ] task`)
  * Grouped bullet and numbered lists
  * Blockquotes and horizontal dividers
  * Beautiful alert **Callouts** (`> [!NOTE]`, `> [!WARNING]`, etc.)
* **🖼️ Clean Image Attachments**: Paste screenshots (`Ctrl+V`) or drag-and-drop images directly into your notes. Images are saved as secure encrypted attachments, leaving your markdown editor clean with short references (e.g. `![image](attachment:img_id)`).
* **📐 Interactive Image Resizing**: Drag the bottom-right handle on any pasted image in the preview panel to resize it. Changes sync back to your markdown automatically!
* **📂 Flexible Storage Options**:
  * Save to browser local storage for quick access.
  * Connect to a local `.vault` file (perfect for syncing across devices using Dropbox, OneDrive, Google Drive, or iCloud).

---

## 🔒 Cryptographic Architecture

CryptKeeper uses modern, standard Web Crypto APIs to ensure industrial-grade security:
1. **Key Derivation**: Your Master Password is run through **PBKDF2** with **100,000 iterations** using **SHA-256** and a unique cryptographic salt.
2. **Encryption**: All note contents, tags, and attachments are serialized and encrypted using **AES-256-GCM** (Galois/Counter Mode), generating a unique Initialization Vector (IV) and authentication tag for each save.
3. **No Password Recovery**: Because of this zero-knowledge structure, there is no reset button. **If you lose your Master Password, your data cannot be recovered.**
