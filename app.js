/**
 * CryptKeeper Application Logic
 * Coordinates UI state, event listeners, localStorage operations, and CryptKeeper Crypto wrapper.
 */

// Register Service Worker for PWA (Progressive Web App) offline capabilities
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('Service Worker registered successfully.'))
            .catch(err => console.log('Service Worker registration failed: ', err));
    });
}

(function () {
    // Theme Management - Initialize immediately to prevent flash
    const savedTheme = localStorage.getItem('cryptkeeper_theme') || 'default';
    if (savedTheme !== 'default') {
        document.body.classList.add(`theme-${savedTheme}`);
    }

    // State management
    const state = {
        masterKey: null,         // Derived CryptoKey in memory
        masterPassword: "",      // In-memory master password
        notes: [],               // Decrypted notes array in memory
        activeNoteId: null,      // Active note UUID
        activeTagFilter: null,   // Tag string or null for "All Notes"
        searchQuery: "",         // Current search query
        editorMode: 'edit',      // 'edit', 'preview', or 'split'
        autoSaveTimer: null,
        confirmCallback: null,   // Callback for reusable modal
        fileHandle: null,        // [NEW] Active FileSystemFileHandle if in external file mode
        fileSetupPacket: null,   // [NEW] Cached setup block read from external file
        fileNotesPacket: null,   // [NEW] Cached notes block read from external file
        theme: savedTheme        // Active theme state
    };

    // IndexedDB helper for persisting file handles across browser reloads
    const idb = {
        dbName: 'cryptkeeper-fs',
        storeName: 'handles',
        
        getDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore(this.storeName);
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        async set(key, val) {
            const db = await this.getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).put(val, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        },
        async get(key) {
            const db = await this.getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const request = tx.objectStore(this.storeName).get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(tx.error);
            });
        },
        async remove(key) {
            const db = await this.getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
    };

    // DOM Elements
    const dom = {
        // Lock screen
        lockScreen: document.getElementById('lock-screen'),
        lockTitle: document.getElementById('lock-title'),
        lockSubtitle: document.getElementById('lock-subtitle'),
        lockForm: document.getElementById('lock-form'),
        masterPassword: document.getElementById('master-password'),
        toggleLockPassword: document.getElementById('toggle-lock-password'),
        setupConfirmGroup: document.getElementById('setup-confirm-group'),
        confirmMasterPassword: document.getElementById('confirm-master-password'),
        passwordStrengthContainer: document.getElementById('password-strength-container'),
        strengthText: document.getElementById('strength-text'),
        strengthBars: document.querySelectorAll('#password-strength-container .strength-bar'),
        btnUnlock: document.getElementById('btn-unlock'),
        unlockingLoader: document.getElementById('unlocking-loader'),
        loaderText: document.getElementById('loader-text'),

        // Lock screen file reconnect prompts
        externalAuthSection: document.getElementById('external-auth-section'),
        authFileName: document.getElementById('auth-file-name'),
        btnAuthFile: document.getElementById('btn-auth-file'),
        btnAuthFallback: document.getElementById('btn-auth-fallback'),

        // Workspace
        appWorkspace: document.getElementById('app-workspace'),
        notesContainer: document.getElementById('notes-container'),
        notesSearch: document.getElementById('notes-search'),
        btnNewNote: document.getElementById('btn-new-note'),
        btnFilterAll: document.getElementById('btn-filter-all'),
        tagList: document.getElementById('tag-list'),
        btnLockApp: document.getElementById('btn-lock-app'),
        menuAllNotes: document.getElementById('menu-all-notes'),

        // Editor
        editorActiveState: document.getElementById('editor-active-state'),
        editorEmptyState: document.getElementById('editor-empty-state'),
        noteTitle: document.getElementById('note-title'),
        btnExportNote: document.getElementById('btn-export-note'),
        btnDeleteNote: document.getElementById('btn-delete-note'),
        editorTagsContainer: document.getElementById('editor-tags-container'),
        editorTagInput: document.getElementById('editor-tag-input'),
        btnModeEdit: document.getElementById('btn-mode-edit'),
        btnModeSplit: document.getElementById('btn-mode-split'),
        btnModePreview: document.getElementById('btn-mode-preview'),
        editorWorkspace: document.getElementById('editor-workspace'),
        noteTextarea: document.getElementById('note-textarea'),
        notePreview: document.getElementById('note-preview'),
        editorWordCount: document.getElementById('editor-word-count'),
        editorSavedIndicator: document.getElementById('editor-saved-indicator'),

        // Settings Drawer
        btnDrawerSettings: document.getElementById('btn-drawer-settings'),
        settingsOverlay: document.getElementById('settings-overlay'),
        settingsDrawer: document.getElementById('settings-drawer'),
        btnCloseSettings: document.getElementById('btn-close-settings'),
        changePasswordForm: document.getElementById('change-password-form'),
        changeOldPassword: document.getElementById('change-old-password'),
        changeNewPassword: document.getElementById('change-new-password'),
        changePasswordStrength: document.getElementById('change-password-strength'),
        changeStrengthText: document.getElementById('change-strength-text'),
        changeStrengthBars: document.querySelectorAll('#change-password-strength .strength-bar'),
        btnExportDb: document.getElementById('btn-export-db'),
        importDropzone: document.getElementById('import-dropzone'),
        fileImportInput: document.getElementById('file-import-input'),
        btnNukeDb: document.getElementById('btn-nuke-db'),
        
        // Storage configuration UI
        storageTypeBadge: document.getElementById('storage-type-badge'),
        btnStorageLocal: document.getElementById('btn-storage-local'),
        btnStorageOpen: document.getElementById('btn-storage-open'),
        btnStorageCreate: document.getElementById('btn-storage-create'),
        externalFileName: document.getElementById('external-file-name'),

        // Confirm Modal
        confirmModalOverlay: document.getElementById('confirm-modal-overlay'),
        confirmModal: document.getElementById('confirm-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalMessage: document.getElementById('modal-message'),
        btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
        btnConfirmOk: document.getElementById('btn-confirm-ok'),

        // Toast
        toastContainer: document.getElementById('toast-container')
    };

    // Initialize Page
    document.addEventListener('DOMContentLoaded', async () => {
        await initApp();
        setupEventListeners();
    });

    // Native File I/O Helpers
    async function readExternalFile(fileHandle) {
        const file = await fileHandle.getFile();
        return await file.text();
    }

    async function writeExternalFile(fileHandle, text) {
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
    }

    /**
     * Check if workspace has already been set up in localStorage or external file handle in IndexedDB.
     */
    async function initApp() {
        // Check if external file handle is configured in IndexedDB
        let fileHandle = null;
        try {
            fileHandle = await idb.get('vault_file_handle');
        } catch (e) {
            console.error("IndexedDB error reading handle", e);
        }

        if (fileHandle) {
            state.fileHandle = fileHandle;
            dom.lockTitle.textContent = "Vault File Connected";
            dom.lockSubtitle.textContent = "Authorize file permissions to unlock notes.";
            dom.authFileName.textContent = fileHandle.name;
            dom.lockForm.style.display = "none";
            dom.externalAuthSection.style.display = "flex";
            return;
        }

        const isSetup = localStorage.getItem('cryptkeeper_setup');
        if (!isSetup) {
            // First time setup mode
            dom.lockTitle.textContent = "Welcome to CryptKeeper";
            dom.lockSubtitle.textContent = "Set up a Master Password to encrypt your notes.";
            dom.setupConfirmGroup.style.display = "flex";
            dom.passwordStrengthContainer.style.display = "flex";
            dom.btnUnlock.textContent = "Initialize Workspace";
            dom.confirmMasterPassword.setAttribute('required', 'true');
        } else {
            // Decryption mode
            dom.lockTitle.textContent = "Unlock Workspace";
            dom.lockSubtitle.textContent = "Enter your Master Password to decrypt your secure notes.";
            dom.setupConfirmGroup.style.display = "none";
            dom.passwordStrengthContainer.style.display = "none";
            dom.btnUnlock.textContent = "Unlock Notes";
            dom.confirmMasterPassword.removeAttribute('required');
        }
    }

    /**
     * Wire up UI interactions and keyboard listeners.
     */
    function setupEventListeners() {
        // Password toggles (Lock screen)
        dom.toggleLockPassword.addEventListener('click', () => {
            const type = dom.masterPassword.getAttribute('type') === 'password' ? 'text' : 'password';
            dom.masterPassword.setAttribute('type', type);
            // Toggle SVG look by checking type
            const eyePath = dom.toggleLockPassword.querySelector('svg');
            if (type === 'text') {
                eyePath.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
            } else {
                eyePath.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
            }
        });

        // Password strength trackers
        dom.masterPassword.addEventListener('input', () => {
            if (localStorage.getItem('cryptkeeper_setup') === null) {
                const strength = evaluatePasswordStrength(dom.masterPassword.value);
                updateStrengthUI(dom.strengthText, dom.strengthBars, strength);
            }
        });

        dom.changeNewPassword.addEventListener('input', () => {
            const strength = evaluatePasswordStrength(dom.changeNewPassword.value);
            updateStrengthUI(dom.changeStrengthText, dom.changeStrengthBars, strength);
        });

        // Lock screen submission (unlock or setup)
        dom.lockForm.addEventListener('submit', handleLockScreenSubmit);

        // Sidebar Actions
        dom.btnNewNote.addEventListener('click', handleCreateNote);
        dom.btnFilterAll.addEventListener('click', () => {
            state.activeTagFilter = null;
            updateSidebarActiveState();
            renderNotesList();
        });
        dom.btnLockApp.addEventListener('click', () => {
            showConfirmModal("Lock Workspace?", "This will immediately lock your vault, wiping keys from browser memory.", () => {
                lockWorkspace();
            });
        });

        // Search Input
        dom.notesSearch.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase().trim();
            renderNotesList();
        });

        // Note Editor inputs (Debounced autosave)
        dom.noteTitle.addEventListener('input', () => {
            triggerAutoSave();
        });
        dom.noteTextarea.addEventListener('input', () => {
            updateWordCount();
            triggerAutoSave();
            if (state.editorMode === 'preview' || state.editorMode === 'split') {
                updateMarkdownPreview();
            }
        });

        // Paste and Drop images into editor textarea
        dom.noteTextarea.addEventListener('paste', handleTextareaPaste);
        dom.noteTextarea.addEventListener('drop', handleTextareaDrop);
        dom.noteTextarea.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
            }
        });

        // Editor layout modes
        dom.btnModeEdit.addEventListener('click', () => setEditorMode('edit'));
        dom.btnModeSplit.addEventListener('click', () => setEditorMode('split'));
        dom.btnModePreview.addEventListener('click', () => setEditorMode('preview'));

        // Single Note action buttons
        dom.btnExportNote.addEventListener('click', handleExportSingleNote);
        dom.btnDeleteNote.addEventListener('click', handleDeleteActiveNote);

        // Tags editing inside toolbar
        dom.editorTagInput.addEventListener('keydown', handleAddTag);

        // Settings Drawer Buttons
        dom.btnDrawerSettings.addEventListener('click', openSettingsDrawer);
        dom.btnCloseSettings.addEventListener('click', closeSettingsDrawer);
        dom.settingsOverlay.addEventListener('click', closeSettingsDrawer);
        dom.changePasswordForm.addEventListener('submit', handleChangePassword);
        dom.btnExportDb.addEventListener('click', handleExportDatabaseBackup);

        // Drag and drop import zone
        dom.importDropzone.addEventListener('click', () => dom.fileImportInput.click());
        dom.fileImportInput.addEventListener('change', handleImportFileSelect);
        dom.importDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dom.importDropzone.classList.add('dragover');
        });
        dom.importDropzone.addEventListener('dragleave', () => {
            dom.importDropzone.classList.remove('dragover');
        });
        dom.importDropzone.addEventListener('drop', handleImportFileDrop);

        dom.btnNukeDb.addEventListener('click', () => {
            showConfirmModal(
                "Nuke Database?",
                "WARNING: This will permanently delete all notes and cryptographic tokens from this browser. This action is irreversible.",
                nukeDatabase
            );
        });

        // Lock screen external auth triggers
        dom.btnAuthFile.addEventListener('click', handleAuthorizeFile);
        dom.btnAuthFallback.addEventListener('click', handleAuthFallback);

        // Storage setup triggers inside settings drawer
        dom.btnStorageLocal.addEventListener('click', handleSwitchToLocalStorage);
        dom.btnStorageOpen.addEventListener('click', handleOpenExternalFile);
        dom.btnStorageCreate.addEventListener('click', handleCreateExternalFile);

        // Theme selection triggers
        const themeButtons = document.querySelectorAll('.theme-btn');
        themeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const chosenTheme = btn.dataset.theme;
                applyTheme(chosenTheme);
                showToast(`Theme changed to ${btn.querySelector('.theme-name').textContent}`, "success");
            });
        });

        // Drag-to-resize image listener
        document.addEventListener('mousedown', handleImageResizeStart);

        // Modal triggers
        dom.btnConfirmCancel.addEventListener('click', closeConfirmModal);
        dom.confirmModalOverlay.addEventListener('click', closeConfirmModal);
        dom.btnConfirmOk.addEventListener('click', () => {
            if (state.confirmCallback) {
                state.confirmCallback();
            }
            closeConfirmModal();
        });
    }

    /**
     * Evaluate Password Strength.
     * Returns: { score: 0-3, label: 'Weak'|'Medium'|'Strong' }
     */
    function evaluatePasswordStrength(password) {
        if (!password) return { score: 0, label: 'Weak' };
        
        let score = 0;
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        
        const hasUpper = /[A-Z]/.test(password);
        const hasLower = /[a-z]/.test(password);
        const hasDigit = /[0-9]/.test(password);
        const hasSpecial = /[^A-Za-z0-9]/.test(password);
        
        const categoryCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
        
        if (categoryCount >= 3 && password.length >= 10) score++;
        
        let label = 'Weak';
        if (score === 2) label = 'Medium';
        if (score >= 3) label = 'Strong';
        
        return { score, label };
    }

    function updateStrengthUI(textElem, barElems, strength) {
        textElem.textContent = `Password Strength: ${strength.label}`;
        
        // Clear classes
        const container = textElem.parentElement;
        container.classList.remove('weak', 'medium', 'strong');
        
        if (strength.label === 'Weak') {
            container.classList.add('weak');
        } else if (strength.label === 'Medium') {
            container.classList.add('medium');
        } else if (strength.label === 'Strong') {
            container.classList.add('strong');
        }
    }

    /**
     * Unlock existing workspace or setup new workspace.
     */
    async function handleLockScreenSubmit(e) {
        e.preventDefault();
        
        const password = dom.masterPassword.value;
        const isExternal = state.fileHandle !== null;
        
        // Retrieve setup payload depending on whether we are loading local or external file
        const setupPacket = isExternal ? state.fileSetupPacket : JSON.parse(localStorage.getItem('cryptkeeper_setup'));
        const setupExists = isExternal ? (setupPacket !== null && setupPacket !== undefined) : (localStorage.getItem('cryptkeeper_setup') !== null);

        // Form UX State
        dom.lockForm.style.display = "none";
        dom.unlockingLoader.style.display = "flex";

        try {
            if (!setupExists) {
                // Setup Flow
                const confirmPassword = dom.confirmMasterPassword.value;
                if (password !== confirmPassword) {
                    throw new Error("Passwords do not match.");
                }
                
                const strength = evaluatePasswordStrength(password);
                if (strength.label === 'Weak') {
                    throw new Error("Please choose a stronger password.");
                }

                dom.loaderText.textContent = "Creating secure container...";
                
                // 1. Derive key
                const salt = window.CryptKeeper.generateSalt();
                const key = await window.CryptKeeper.deriveKey(password, salt);

                // 2. Encrypt validation string
                const validationStr = "CryptKeeper-Session-Valid";
                const encryptedValidation = await window.CryptKeeper.encryptData(validationStr, key);

                // 3. Assemble setup packet
                const newSetup = {
                    salt: window.CryptKeeper.arrayBufferToBase64(salt),
                    verificationToken: encryptedValidation.ciphertext,
                    verificationIv: encryptedValidation.iv
                };

                // 4. Save seed notes
                state.masterKey = key;
                state.masterPassword = password;
                
                const welcomeNote = {
                    id: crypto.randomUUID(),
                    title: isExternal ? "Connected to External Vault File" : "Welcome to CryptKeeper!",
                    content: isExternal 
                        ? `# External Vault Ready!\n\nThis vault is stored directly in your file **${state.fileHandle.name}**.\n\nChanges are auto-saved directly to this file, which you can keep in synchronized folders (Dropbox, OneDrive) to sync between computers.`
                        : `# Welcome to CryptKeeper! \n\nThis is your offline, client-side encrypted notes workspace. Your privacy is guaranteed using industry-standard **AES-256-GCM** encryption.\n\n### Key Features:\n- 🔐 **End-to-End Local Encryption**: No unencrypted data is ever written to storage.\n- 📝 **Markdown Preview**: Toggle 'Split' or 'Preview' mode to write using standard markdown rules.\n- 🏷️ **Tag Manager**: Tag notes to categorize them in your library.\n- 📥 **Import & Export**: Backup and restore your vault anytime from the settings drawer.\n\n*Created on: ${new Date().toLocaleDateString()}*`,
                    tags: isExternal ? ["Vault", "Sync"] : ["Welcome", "Guide"],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                state.notes = [welcomeNote];

                if (isExternal) {
                    // Encrypt notes
                    const rawJSON = JSON.stringify(state.notes);
                    const encryptedNotes = await window.CryptKeeper.encryptData(rawJSON, key);
                    
                    const payload = {
                        version: 1,
                        setup: newSetup,
                        notes: {
                            ciphertext: encryptedNotes.ciphertext,
                            iv: encryptedNotes.iv
                        }
                    };
                    await writeExternalFile(state.fileHandle, JSON.stringify(payload, null, 2));
                } else {
                    localStorage.setItem('cryptkeeper_setup', JSON.stringify(newSetup));
                    await saveNotesDatabase();
                }

                showToast("Workspace initialized!", "success");
            } else {
                // Unlock Flow
                dom.loaderText.textContent = "Decrypting database...";
                
                const salt = window.CryptKeeper.base64ToUint8Array(setupPacket.salt);
                
                // 1. Derive key
                const key = await window.CryptKeeper.deriveKey(password, salt);

                // 2. Validate password
                try {
                    const decryptedVal = await window.CryptKeeper.decryptData(
                        setupPacket.verificationToken,
                        key,
                        setupPacket.verificationIv
                    );
                    
                    if (decryptedVal !== "CryptKeeper-Session-Valid") {
                        throw new Error("Validation mismatch.");
                    }
                } catch (err) {
                    throw new Error("Incorrect master password.");
                }

                // Password verified!
                state.masterKey = key;
                state.masterPassword = password;

                // Load notes
                if (isExternal) {
                    const decryptedJSON = await window.CryptKeeper.decryptData(
                        state.fileNotesPacket.ciphertext,
                        state.masterKey,
                        state.fileNotesPacket.iv
                    );
                    state.notes = JSON.parse(decryptedJSON);
                } else {
                    await loadNotesDatabase();
                }
                showToast("Vault unlocked successfully.", "success");
            }

            // Move to Workspace UI
            dom.lockScreen.classList.add('hidden');
            dom.appWorkspace.classList.add('active');
            
            // Render UI
            updateSidebarTags();
            renderNotesList();
            
            // Set first note active if exists
            if (state.notes.length > 0) {
                setActiveNote(state.notes[0].id);
            } else {
                showEmptyEditorState();
            }

        } catch (err) {
            showToast(err.message, "error");
            // Shake Lock Card
            const card = document.querySelector('.lock-card');
            card.classList.add('shake');
            setTimeout(() => card.classList.remove('shake'), 400);

            // Re-enable form UI
            dom.lockForm.style.display = "flex";
            dom.unlockingLoader.style.display = "none";
        }
    }

    /**
     * Lock app, clear keys in memory, return to lock screen.
     */
    function lockWorkspace() {
        state.masterKey = null;
        state.masterPassword = "";
        state.notes = [];
        state.activeNoteId = null;
        state.activeTagFilter = null;
        state.searchQuery = "";
        
        dom.masterPassword.value = "";
        dom.confirmMasterPassword.value = "";
        dom.lockForm.style.display = "flex";
        dom.unlockingLoader.style.display = "none";
        
        dom.lockScreen.classList.remove('hidden');
        dom.appWorkspace.classList.remove('active');
        
        initApp();
        showToast("Vault locked.", "info");
    }

    /**
     * Decrypt and load notes database from localStorage (or external file if active).
     */
    async function loadNotesDatabase() {
        if (state.fileHandle) {
            try {
                const fileText = await readExternalFile(state.fileHandle);
                const parsed = JSON.parse(fileText);
                const decryptedJSON = await window.CryptKeeper.decryptData(
                    parsed.notes.ciphertext,
                    state.masterKey,
                    parsed.notes.iv
                );
                state.notes = JSON.parse(decryptedJSON);
            } catch (err) {
                console.error("External database load failed", err);
                showToast("Failed to decrypt external notes.", "error");
                state.notes = [];
            }
            return;
        }

        const storedNotesPacket = localStorage.getItem('cryptkeeper_notes');
        if (!storedNotesPacket) {
            state.notes = [];
            return;
        }

        try {
            const notesPacket = JSON.parse(storedNotesPacket);
            const decryptedJSON = await window.CryptKeeper.decryptData(
                notesPacket.ciphertext,
                state.masterKey,
                notesPacket.iv
            );
            state.notes = JSON.parse(decryptedJSON);
        } catch (err) {
            console.error("Database decryption failed", err);
            showToast("Failed to decrypt library notes.", "error");
            state.notes = [];
        }
    }

    /**
     * Encrypt and save notes database to localStorage or external vault file.
     */
    async function saveNotesDatabase() {
        if (!state.masterKey) return;

        try {
            const rawJSON = JSON.stringify(state.notes);
            const encrypted = await window.CryptKeeper.encryptData(rawJSON, state.masterKey);
            
            if (state.fileHandle) {
                // If using external file, preserve its setup metadata
                const fileText = await readExternalFile(state.fileHandle);
                const parsed = JSON.parse(fileText);
                
                parsed.notes = {
                    ciphertext: encrypted.ciphertext,
                    iv: encrypted.iv
                };
                
                await writeExternalFile(state.fileHandle, JSON.stringify(parsed, null, 2));
            } else {
                const notesPacket = {
                    ciphertext: encrypted.ciphertext,
                    iv: encrypted.iv
                };
                localStorage.setItem('cryptkeeper_notes', JSON.stringify(notesPacket));
            }
        } catch (err) {
            console.error("Save database failed", err);
            showToast("Error securing notes database.", "error");
        }
    }

    /**
     * Render the list of notes in the Notes Panel based on filters and search.
     */
    function renderNotesList() {
        dom.notesContainer.innerHTML = '';
        
        // Apply filters
        let filteredNotes = state.notes;
        
        if (state.activeTagFilter) {
            filteredNotes = filteredNotes.filter(n => n.tags && n.tags.includes(state.activeTagFilter));
        }
        
        if (state.searchQuery) {
            filteredNotes = filteredNotes.filter(n => 
                n.title.toLowerCase().includes(state.searchQuery) || 
                n.content.toLowerCase().includes(state.searchQuery)
            );
        }

        // Sort by updatedAt descending
        filteredNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        if (filteredNotes.length === 0) {
            dom.notesContainer.innerHTML = `
                <div class="empty-notes-prompt">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <p>No notes match filter.</p>
                </div>
            `;
            return;
        }

        filteredNotes.forEach(note => {
            const card = document.createElement('div');
            card.className = `note-card ${note.id === state.activeNoteId ? 'active' : ''}`;
            card.dataset.id = note.id;
            
            // Format Date
            const dateObj = new Date(note.updatedAt);
            const dateStr = dateObj.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});

            // Excerpt
            const excerpt = note.content 
                ? note.content.replace(/[#*`>_\-]/g, '').trim().substring(0, 75) + '...'
                : "No additional content";

            // Title
            const titleText = note.title.trim() || "Untitled Note";

            // Tags
            let tagsHtml = '';
            if (note.tags && note.tags.length > 0) {
                tagsHtml = `<div class="note-card-tags">` + 
                    note.tags.slice(0, 3).map(t => `<span class="note-card-tag">${t}</span>`).join('') + 
                    `</div>`;
            }

            card.innerHTML = `
                <div class="note-card-header">
                    <span class="note-card-title">${titleText}</span>
                    <span class="note-card-date">${dateStr}</span>
                </div>
                <div class="note-card-excerpt">${excerpt}</div>
                ${tagsHtml}
            `;

            card.addEventListener('click', () => setActiveNote(note.id));
            dom.notesContainer.appendChild(card);
        });
    }

    /**
     * Compute and render tags under Sidebar with count badges.
     */
    function updateSidebarTags() {
        dom.tagList.innerHTML = '';
        
        // Compile tags
        const tagCounts = {};
        state.notes.forEach(note => {
            if (note.tags) {
                note.tags.forEach(t => {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                });
            }
        });

        const sortedTags = Object.keys(tagCounts).sort();

        if (sortedTags.length === 0) {
            dom.tagList.innerHTML = `
                <li style="font-size: 0.85rem; color: var(--text-muted); padding: 0.5rem 1rem;">No tags created yet.</li>
            `;
            return;
        }

        sortedTags.forEach(tag => {
            const li = document.createElement('li');
            li.className = `menu-item ${tag === state.activeTagFilter ? 'active' : ''}`;
            
            const btn = document.createElement('button');
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                    <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
                <span class="tag-name">${tag}</span>
                <span class="tag-badge">${tagCounts[tag]}</span>
            `;
            
            btn.addEventListener('click', () => {
                state.activeTagFilter = tag;
                updateSidebarActiveState();
                renderNotesList();
            });

            li.appendChild(btn);
            dom.tagList.appendChild(li);
        });
    }

    function updateSidebarActiveState() {
        // Toggle Active highlight on sidebar items
        if (state.activeTagFilter === null) {
            dom.menuAllNotes.classList.add('active');
        } else {
            dom.menuAllNotes.classList.remove('active');
        }
        
        // Tags items will highlight on compile call, so let's trigger:
        updateSidebarTags();
    }

    /**
     * Setup editing area for the active note.
     */
    function setActiveNote(id) {
        // Flush active timer if active note is changing
        if (state.autoSaveTimer) {
            clearTimeout(state.autoSaveTimer);
            saveNoteInstantly();
        }

        state.activeNoteId = id;
        const note = state.notes.find(n => n.id === id);

        if (!note) {
            showEmptyEditorState();
            return;
        }

        // Hide Empty Prompt, Show Editor Card
        dom.editorActiveState.style.display = "flex";
        dom.editorEmptyState.style.display = "none";

        // Setup values
        dom.noteTitle.value = note.title;
        dom.noteTextarea.value = note.content;

        // Visual highlights
        const cards = dom.notesContainer.querySelectorAll('.note-card');
        cards.forEach(c => {
            if (c.dataset.id === id) {
                c.classList.add('active');
            } else {
                c.classList.remove('active');
            }
        });

        // Mode and Preview update
        updateWordCount();
        renderActiveNoteTags(note);
        updateMarkdownPreview();
    }

    function showEmptyEditorState() {
        dom.editorActiveState.style.display = "none";
        dom.editorEmptyState.style.display = "flex";
    }

    /**
     * Creates a new blank note.
     */
    async function handleCreateNote() {
        const newNote = {
            id: crypto.randomUUID(),
            title: "",
            content: "",
            attachments: {},
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        state.notes.unshift(newNote); // Prepend to list
        await saveNotesDatabase();
        
        // Refresh sidebar lists
        state.activeTagFilter = null; // Clear tag filter to show new note
        updateSidebarActiveState();
        renderNotesList();
        
        // Open Editor on new note
        setActiveNote(newNote.id);
        dom.noteTitle.focus();
    }

    /**
     * Delete active note.
     */
    function handleDeleteActiveNote() {
        if (!state.activeNoteId) return;
        
        showConfirmModal(
            "Delete Note?",
            "Are you sure you want to delete this note? This cannot be undone.",
            async () => {
                state.notes = state.notes.filter(n => n.id !== state.activeNoteId);
                await saveNotesDatabase();
                
                state.activeNoteId = null;
                
                updateSidebarTags();
                renderNotesList();
                showEmptyEditorState();
                showToast("Note deleted.", "info");
            }
        );
    }

    /**
     * Export active note to Markdown file.
     */
    function handleExportSingleNote() {
        const note = state.notes.find(n => n.id === state.activeNoteId);
        if (!note) return;

        const filename = (note.title.trim() || "Untitled Note")
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase() + ".md";
        
        const blob = new Blob([note.content], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        
        URL.revokeObjectURL(url);
        showToast("Note exported as markdown file.", "success");
    }

    /**
     * Debounced Auto Save.
     */
    function triggerAutoSave() {
        if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
        
        dom.editorSavedIndicator.style.display = "none";
        state.autoSaveTimer = setTimeout(() => {
            saveNoteInstantly();
        }, 800);
    }

    async function saveNoteInstantly() {
        if (!state.activeNoteId) return;

        const noteIndex = state.notes.findIndex(n => n.id === state.activeNoteId);
        if (noteIndex === -1) return;

        const oldTitle = state.notes[noteIndex].title;
        const newTitle = dom.noteTitle.value;
        const newContent = dom.noteTextarea.value;

        // Skip save if no changes
        if (oldTitle === newTitle && state.notes[noteIndex].content === newContent) {
            return;
        }

        // Update in-memory state
        state.notes[noteIndex].title = newTitle;
        state.notes[noteIndex].content = newContent;
        state.notes[noteIndex].updatedAt = new Date().toISOString();

        // Save to secure LocalStorage DB
        await saveNotesDatabase();

        // Refresh card headers in sidebar lists (without completely rebuilding HTML if possible, but simple re-render works)
        renderNotesList();
        
        // Show auto-save success badge
        dom.editorSavedIndicator.textContent = "Auto-saved";
        dom.editorSavedIndicator.style.display = "inline";
        setTimeout(() => {
            dom.editorSavedIndicator.style.display = "none";
        }, 2000);
    }

    /**
     * Count words and update footer status.
     */
    function updateWordCount() {
        const text = dom.noteTextarea.value.trim();
        const wordCount = text ? text.split(/\s+/).length : 0;
        const charCount = text.length;
        dom.editorWordCount.textContent = `${wordCount} word${wordCount === 1 ? '' : 's'} | ${charCount} char${charCount === 1 ? '' : 's'}`;
    }

    /**
     * Add and remove tags.
     */
    function renderActiveNoteTags(note) {
        // Clear all except input
        const tags = dom.editorTagsContainer.querySelectorAll('.editor-note-tag');
        tags.forEach(t => t.remove());

        if (note.tags) {
            note.tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'editor-tag-badge editor-note-tag';
                tagSpan.innerHTML = `
                    ${tag}
                    <button class="editor-note-tag-remove" aria-label="Remove tag">&times;</button>
                `;
                
                tagSpan.querySelector('.editor-note-tag-remove').addEventListener('click', () => {
                    handleRemoveTag(tag);
                });

                // Insert before tag input box
                dom.editorTagsContainer.insertBefore(tagSpan, dom.editorTagInput.parentElement);
            });
        }
    }

    async function handleAddTag(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const tagValue = dom.editorTagInput.value.trim().replace(/,/g, '');
            
            if (!tagValue) return;

            const note = state.notes.find(n => n.id === state.activeNoteId);
            if (!note) return;

            if (!note.tags) note.tags = [];

            // Prevent duplicates
            if (!note.tags.includes(tagValue)) {
                note.tags.push(tagValue);
                await saveNotesDatabase();
                
                renderActiveNoteTags(note);
                updateSidebarTags();
                renderNotesList();
            }

            dom.editorTagInput.value = '';
        }
    }

    async function handleRemoveTag(tagToRemove) {
        const note = state.notes.find(n => n.id === state.activeNoteId);
        if (!note) return;

        note.tags = note.tags.filter(t => t !== tagToRemove);
        await saveNotesDatabase();

        renderActiveNoteTags(note);
        updateSidebarTags();
        renderNotesList();
    }

    /**
     * Switch Editor layout columns.
     */
    function setEditorMode(mode) {
        state.editorMode = mode;

        // Toggle active button style
        dom.btnModeEdit.classList.remove('active');
        dom.btnModeSplit.classList.remove('active');
        dom.btnModePreview.classList.remove('active');

        dom.editorWorkspace.classList.remove('edit-mode', 'split-mode', 'preview-mode');

        if (mode === 'edit') {
            dom.btnModeEdit.classList.add('active');
            dom.editorWorkspace.classList.add('edit-mode');
        } else if (mode === 'split') {
            dom.btnModeSplit.classList.add('active');
            dom.editorWorkspace.classList.add('split-mode');
            updateMarkdownPreview();
        } else if (mode === 'preview') {
            dom.btnModePreview.classList.add('active');
            dom.editorWorkspace.classList.add('preview-mode');
            updateMarkdownPreview();
        }
    }

    /**
     * Basic Robust Markdown Parser.
     */
    function updateMarkdownPreview() {
        const md = dom.noteTextarea.value;
        const html = parseMarkdown(md);
        dom.notePreview.innerHTML = html;
    }

    function handleTextareaPaste(e) {
        if (!state.activeNoteId) return;
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.type.indexOf('image') === 0) {
                e.preventDefault();
                const file = item.getAsFile();
                
                const reader = new FileReader();
                reader.onload = function (event) {
                    const dataUrl = event.target.result;
                    
                        const note = state.notes.find(n => n.id === state.activeNoteId);
                    if (note) {
                        note.attachments = note.attachments || {};
                        const imgId = `img${Date.now()}${Math.random().toString(36).substring(2, 7)}`;
                        note.attachments[imgId] = dataUrl;
                        
                        insertTextAtCursor(dom.noteTextarea, `\n![Screenshot](attachment:${imgId})\n`);
                        triggerAutoSave();
                        updateWordCount();
                        updateMarkdownPreview();
                    }
                };
                reader.readAsDataURL(file);
                showToast("Screenshot pasted and stored as attachment.", "success");
                break;
            }
        }
    }

    function handleTextareaDrop(e) {
        if (!state.activeNoteId) return;
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                e.preventDefault();
                
                const reader = new FileReader();
                reader.onload = function (event) {
                    const dataUrl = event.target.result;
                    
                    const note = state.notes.find(n => n.id === state.activeNoteId);
                    if (note) {
                        note.attachments = note.attachments || {};
                        const imgId = `img${Date.now()}${Math.random().toString(36).substring(2, 7)}`;
                        note.attachments[imgId] = dataUrl;
                        
                        insertTextAtCursor(dom.noteTextarea, `\n![${file.name}](attachment:${imgId})\n`);
                        triggerAutoSave();
                        updateWordCount();
                        updateMarkdownPreview();
                    }
                };
                reader.readAsDataURL(file);
                showToast("Image file dropped and stored as attachment.", "success");
            }
        }
    }

    function insertTextAtCursor(textarea, text) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + text + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
    }

    function handleImageResizeStart(e) {
        if (!e.target.classList.contains('image-resize-handle')) return;
        
        e.preventDefault();
        const handle = e.target;
        const imgId = handle.dataset.id;
        const wrapper = handle.parentElement;
        
        const startX = e.clientX;
        const startWidth = wrapper.offsetWidth;
        
        function onMouseMove(moveEvent) {
            const newWidth = Math.max(100, Math.min(wrapper.parentElement.offsetWidth, startWidth + (moveEvent.clientX - startX)));
            wrapper.style.width = `${newWidth}px`;
        }
        
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            const finalWidth = wrapper.offsetWidth;
            updateImageSizeInMarkdown(imgId, finalWidth);
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function updateImageSizeInMarkdown(imgId, newWidth) {
        const textarea = dom.noteTextarea;
        const text = textarea.value;
        
        const regex = new RegExp(`!\\\[([^\\\]]*)\\\]\\(attachment:${imgId}\\)`, 'g');
        const updatedText = text.replace(regex, (match, altAndSize) => {
            let alt = altAndSize;
            if (altAndSize.includes('|')) {
                alt = altAndSize.split('|')[0];
            }
            return `![${alt}|${newWidth}](attachment:${imgId})`;
        });
        
        if (text !== updatedText) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            
            textarea.value = updatedText;
            textarea.selectionStart = start;
            textarea.selectionEnd = end;
            
            triggerAutoSave();
            updateWordCount();
            updateMarkdownPreview();
        }
    }

    function parseMarkdown(md) {
        if (!md.trim()) {
            return `<p style="color: var(--text-muted); font-style: italic;">No markdown content to display.</p>`;
        }

        const activeNote = state.activeNoteId ? state.notes.find(n => n.id === state.activeNoteId) : null;
        const attachments = (activeNote && activeNote.attachments) ? activeNote.attachments : {};

        const lines = md.split('\n');
        let html = [];
        let inList = false;
        let inOrderedList = false;
        let inBlockquote = false;
        let inCallout = false;
        let inCode = false;
        let codeContent = [];

        for (let line of lines) {
            // Code Blocks: ```
            if (line.trim().startsWith('```')) {
                if (inCode) {
                    inCode = false;
                    html.push(`<pre><code>${codeContent.join('\n')}</code></pre>`);
                    codeContent = [];
                } else {
                    inCode = true;
                }
                continue;
            }

            if (inCode) {
                // Escape HTML inside code blocks
                const escaped = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                codeContent.push(escaped);
                continue;
            }

            let cleanLine = line;

            // HTML Sanitization
            cleanLine = cleanLine
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            // Images: ![Alt|Width](URL or DataURL or attachment:id)
            cleanLine = cleanLine.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, altAndSize, src) => {
                let alt = altAndSize;
                let width = '';
                let height = '';
                
                // Parse Obsidian-style resizing: ![alt|300] or ![alt|300x200]
                if (altAndSize.includes('|')) {
                    const parts = altAndSize.split('|');
                    alt = parts[0];
                    const size = parts[1];
                    if (size.includes('x')) {
                        const dims = size.split('x');
                        width = dims[0];
                        height = dims[1];
                    } else {
                        width = size;
                    }
                }
                
                let style = '';
                let wrapperStyle = '';
                if (width) {
                    const unit = /^[0-9]+$/.test(width) ? 'px' : '';
                    wrapperStyle += `width: ${width}${unit}; `;
                }
                if (height) {
                    const unit = /^[0-9]+$/.test(height) ? 'px' : '';
                    style += `height: ${height}${unit}; `;
                }
                
                const styleAttr = style ? `style="${style}"` : '';
                const wrapperStyleAttr = wrapperStyle ? `style="${wrapperStyle}"` : '';

                if (src.startsWith('attachment:')) {
                    const imgId = src.replace('attachment:', '');
                    const dataUrl = attachments[imgId] || '';
                    return `<div class="image-resize-wrapper" ${wrapperStyleAttr}><img class="note-image" src="${dataUrl}" alt="${alt}" ${styleAttr}><div class="image-resize-handle" data-id="${imgId}"></div></div>`;
                }
                return `<div class="image-resize-wrapper" ${wrapperStyleAttr}><img class="note-image" src="${src}" alt="${alt}" ${styleAttr}></div>`;
            });

            // Bold: **text**
            cleanLine = cleanLine.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            // Italic: *text* or _text_
            cleanLine = cleanLine.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            cleanLine = cleanLine.replace(/_([^_]+)_/g, '<em>$1</em>');

            // Inline Code: `code`
            cleanLine = cleanLine.replace(/`([^`]+)`/g, '<code>$1</code>');

            // Links: [Text](URL)
            cleanLine = cleanLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

            // --- Obsidian-Style Callout Blocks handling ---
            const isBlockquoteLine = cleanLine.startsWith('&gt; ') || cleanLine === '&gt;';
            
            if (!isBlockquoteLine) {
                if (inCallout) {
                    inCallout = false;
                    html.push('</div></div>');
                }
                if (inBlockquote) {
                    inBlockquote = false;
                    html.push('</blockquote>');
                }
            } else if (inCallout) {
                if (cleanLine.startsWith('&gt; ')) {
                    const content = cleanLine.substring(5);
                    html.push(`<p>${content}</p>`);
                    continue;
                } else if (cleanLine === '&gt;') {
                    html.push('<br>');
                    continue;
                }
            }

            // --- List Closing handling ---
            const orderedListMatch = cleanLine.match(/^[ \t]*([0-9]+)\.\s+(.*)/);
            const isListItem = cleanLine.trim().startsWith('- ') || cleanLine.trim().startsWith('* ') || orderedListMatch;
            
            if (!isListItem) {
                if (inList) {
                    inList = false;
                    html.push('</ul>');
                }
                if (inOrderedList) {
                    inOrderedList = false;
                    html.push('</ol>');
                }
            }

            // --- Element Parsing ---

            // Horizontal Rules: --- or ***
            if (/^([\s]*[-*_]){3,}[\s]*$/.test(cleanLine.trim())) {
                html.push('<hr>');
                continue;
            }

            // Callout Start: > [!NOTE] Title
            const calloutMatch = cleanLine.match(/^&gt;\s+\[!([A-Za-z]+)\](.*)/);
            if (calloutMatch) {
                if (inBlockquote) {
                    inBlockquote = false;
                    html.push('</blockquote>');
                }
                const type = calloutMatch[1].toLowerCase();
                const titleText = calloutMatch[2].trim() || type.toUpperCase();
                html.push(`<div class="callout callout-${type}">`);
                html.push(`<div class="callout-header"><span class="callout-icon"></span><span class="callout-title">${titleText}</span></div>`);
                html.push(`<div class="callout-content">`);
                inCallout = true;
                continue;
            }

            // Regular Blockquotes
            if (cleanLine.startsWith('&gt; ')) {
                if (!inBlockquote) {
                    inBlockquote = true;
                    html.push('<blockquote>');
                }
                html.push(`<p>${cleanLine.substring(5)}</p>`);
                continue;
            } else if (cleanLine === '&gt;') {
                if (!inBlockquote) {
                    inBlockquote = true;
                    html.push('<blockquote>');
                }
                html.push('<br>');
                continue;
            }

            // Checklist Task items: - [ ] or - [x]
            if (cleanLine.trim().startsWith('- [ ] ') || cleanLine.trim().startsWith('- [x] ') ||
                cleanLine.trim().startsWith('* [ ] ') || cleanLine.trim().startsWith('* [x] ')) {
                if (inOrderedList) {
                    inOrderedList = false;
                    html.push('</ol>');
                }
                if (!inList) {
                    inList = true;
                    html.push('<ul class="task-list">');
                }
                const isChecked = cleanLine.includes('[x]');
                const content = cleanLine.replace(/^[\s]*[-*]\s+\[[ x]\]\s+/, '');
                html.push(`<li class="task-list-item"><input type="checkbox" ${isChecked ? 'checked' : ''} disabled> <span>${content}</span></li>`);
                continue;
            }

            // Regular Bullet Lists
            if (cleanLine.trim().startsWith('- ') || cleanLine.trim().startsWith('* ')) {
                if (inOrderedList) {
                    inOrderedList = false;
                    html.push('</ol>');
                }
                if (!inList) {
                    inList = true;
                    html.push('<ul>');
                }
                const content = cleanLine.replace(/^[\s]*[-*]\s+/, '');
                html.push(`<li>${content}</li>`);
                continue;
            }

            // Ordered Lists
            if (orderedListMatch) {
                if (inList) {
                    inList = false;
                    html.push('</ul>');
                }
                if (!inOrderedList) {
                    inOrderedList = true;
                    html.push('<ol>');
                }
                html.push(`<li>${orderedListMatch[2]}</li>`);
                continue;
            }

            // Headers
            if (cleanLine.startsWith('# ')) {
                html.push(`<h1>${cleanLine.substring(2)}</h1>`);
            } else if (cleanLine.startsWith('## ')) {
                html.push(`<h2>${cleanLine.substring(3)}</h2>`);
            } else if (cleanLine.startsWith('### ')) {
                html.push(`<h3>${cleanLine.substring(4)}</h3>`);
            } else if (cleanLine.trim() === '') {
                html.push('<br>');
            } else {
                html.push(`<p>${cleanLine}</p>`);
            }
        }

        // Close dangling tags
        if (inCallout) html.push('</div></div>');
        if (inBlockquote) html.push('</blockquote>');
        if (inList) html.push('</ul>');
        if (inOrderedList) html.push('</ol>');
        if (inCode) html.push(`<pre><code>${codeContent.join('\n')}</code></pre>`);

        return html.join('\n');
    }

    /**
     * Settings Drawer actions.
     */
    function openSettingsDrawer() {
        dom.settingsOverlay.classList.add('active');
        dom.settingsDrawer.classList.add('active');
        
        // Reset strength UI
        updateStrengthUI(dom.changeStrengthText, dom.changeStrengthBars, { score: 0, label: 'New Password Strength' });
        dom.changeOldPassword.value = '';
        dom.changeNewPassword.value = '';

        // [NEW] Update storage location settings displays
        updateStorageUI();

        // Update active theme button highlight
        const themeButtons = document.querySelectorAll('.theme-btn');
        themeButtons.forEach(btn => {
            if (btn.dataset.theme === state.theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function closeSettingsDrawer() {
        dom.settingsOverlay.classList.remove('active');
        dom.settingsDrawer.classList.remove('active');
    }

    function applyTheme(themeName) {
        // Remove all theme classes
        document.body.classList.remove('theme-cyberpunk', 'theme-matrix', 'theme-terminal', 'theme-aurora', 'theme-dracula', 'theme-sakura');
        
        if (themeName !== 'default') {
            document.body.classList.add(`theme-${themeName}`);
        }
        
        state.theme = themeName;
        localStorage.setItem('cryptkeeper_theme', themeName);
        
        // Update active class on buttons
        const buttons = document.querySelectorAll('.theme-btn');
        buttons.forEach(btn => {
            if (btn.dataset.theme === themeName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // --- [NEW] External Vault Storage and Re-authorization Handlers ---

    async function handleAuthorizeFile() {
        if (!state.fileHandle) return;
        try {
            const opts = { mode: 'readwrite' };
            const permission = await state.fileHandle.requestPermission(opts);
            if (permission === 'granted') {
                const fileText = await readExternalFile(state.fileHandle);
                if (fileText.trim() === '') {
                    // Empty File -> Setup password for this file
                    dom.lockTitle.textContent = "Setup Vault File";
                    dom.lockSubtitle.textContent = `Configure password for ${state.fileHandle.name}`;
                    dom.setupConfirmGroup.style.display = "flex";
                    dom.passwordStrengthContainer.style.display = "flex";
                    dom.btnUnlock.textContent = "Initialize Vault File";
                    dom.confirmMasterPassword.setAttribute('required', 'true');
                    
                    state.fileSetupPacket = null;
                    state.fileNotesPacket = null;
                } else {
                    // Load and unlock existing file
                    const parsed = JSON.parse(fileText);
                    state.fileSetupPacket = parsed.setup;
                    state.fileNotesPacket = parsed.notes;

                    dom.lockTitle.textContent = "Unlock Vault File";
                    dom.lockSubtitle.textContent = `Enter password for ${state.fileHandle.name}`;
                    dom.setupConfirmGroup.style.display = "none";
                    dom.passwordStrengthContainer.style.display = "none";
                    dom.btnUnlock.textContent = "Unlock Vault File";
                    dom.confirmMasterPassword.removeAttribute('required');
                }
                
                dom.externalAuthSection.style.display = "none";
                dom.lockForm.style.display = "flex";
                dom.masterPassword.value = '';
                dom.masterPassword.focus();
                showToast("File permission granted.", "success");
            } else {
                showToast("File permission denied.", "error");
            }
        } catch (err) {
            showToast("Failed reading file: " + err.message, "error");
        }
    }

    async function handleAuthFallback() {
        showConfirmModal(
            "Disconnect Vault File?",
            "Your notes in the external file will not be deleted, but the browser will detach from it and switch back to Local Browser Storage.",
            async () => {
                await idb.remove('vault_file_handle');
                state.fileHandle = null;
                window.location.reload();
            }
        );
    }

    function updateStorageUI() {
        if (state.fileHandle) {
            dom.storageTypeBadge.textContent = "External File";
            dom.storageTypeBadge.style.background = "var(--primary)";
            dom.externalFileName.textContent = `Linked File: ${state.fileHandle.name}`;
            dom.externalFileName.style.display = "block";
            dom.btnStorageLocal.classList.remove('active');
            dom.btnStorageOpen.classList.add('active');
        } else {
            dom.storageTypeBadge.textContent = "Browser LocalStorage";
            dom.storageTypeBadge.style.background = "var(--bg-surface-active)";
            dom.externalFileName.style.display = "none";
            dom.btnStorageLocal.classList.add('active');
            dom.btnStorageOpen.classList.remove('active');
        }
    }

    async function handleSwitchToLocalStorage() {
        if (!state.fileHandle) {
            showToast("Already using Local Storage.", "info");
            return;
        }

        showConfirmModal(
            "Use Local Browser Storage?",
            "Your database will be saved directly inside your browser storage instead of the external file. Future changes will not sync to the file.",
            async () => {
                await idb.remove('vault_file_handle');
                state.fileHandle = null;
                updateStorageUI();
                
                const localSalt = window.CryptKeeper.generateSalt();
                const localKey = await window.CryptKeeper.deriveKey(state.masterPassword, localSalt);
                const localEncVal = await window.CryptKeeper.encryptData("CryptKeeper-Session-Valid", localKey);
                
                const localSetup = {
                    salt: window.CryptKeeper.arrayBufferToBase64(localSalt),
                    verificationToken: localEncVal.ciphertext,
                    verificationIv: localEncVal.iv
                };
                localStorage.setItem('cryptkeeper_setup', JSON.stringify(localSetup));
                
                // Re-save notes database under this new local setup
                state.masterKey = localKey;
                await saveNotesDatabase();
                
                showToast("Switched back to browser LocalStorage.", "success");
            }
        );
    }

    async function handleOpenExternalFile() {
        if (!window.showOpenFilePicker) {
            showToast("External storage is not supported in this browser. Please use Chrome, Edge, or Brave.", "error");
            return;
        }

        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'CryptKeeper Vault Files',
                    accept: { 'application/json': ['.vault', '.json'] }
                }],
                excludeAcceptAllOption: true,
                multiple: false
            });

            if (handle) {
                // Verify readwrite permission
                const opts = { mode: 'readwrite' };
                if (await handle.requestPermission(opts) === 'granted') {
                    // Check if file is empty
                    const fileText = await readExternalFile(handle);
                    if (fileText.trim() !== '') {
                        // File has data. Verify if we can decrypt it using our current password
                        const parsed = JSON.parse(fileText);
                        const fileSalt = window.CryptKeeper.base64ToUint8Array(parsed.setup.salt);
                        const derivedTestKey = await window.CryptKeeper.deriveKey(state.masterPassword, fileSalt);
                        
                        try {
                            const decryptedVal = await window.CryptKeeper.decryptData(
                                parsed.setup.verificationToken,
                                derivedTestKey,
                                parsed.setup.verificationIv
                            );
                            
                            if (decryptedVal !== "CryptKeeper-Session-Valid") {
                                throw new Error();
                            }
                        } catch {
                            throw new Error("This file was encrypted with a different password. Please update your master password to match this file's password before opening.");
                        }

                        // Success! Load the notes
                        const decNotes = await window.CryptKeeper.decryptData(
                            parsed.notes.ciphertext,
                            derivedTestKey,
                            parsed.notes.iv
                        );
                        
                        state.notes = JSON.parse(decNotes);
                        state.masterKey = derivedTestKey;
                    } else {
                        // Empty file. We will write our current database to it immediately!
                        const fileSalt = window.CryptKeeper.generateSalt();
                        const fileKey = await window.CryptKeeper.deriveKey(state.masterPassword, fileSalt);
                        const fileEncVal = await window.CryptKeeper.encryptData("CryptKeeper-Session-Valid", fileKey);

                        const rawNotes = JSON.stringify(state.notes);
                        const enc = await window.CryptKeeper.encryptData(rawNotes, fileKey);
                        
                        const initPayload = {
                            version: 1,
                            setup: {
                                salt: window.CryptKeeper.arrayBufferToBase64(fileSalt),
                                verificationToken: fileEncVal.ciphertext,
                                verificationIv: fileEncVal.iv
                            },
                            notes: {
                                ciphertext: enc.ciphertext,
                                iv: enc.iv
                            }
                        };
                        await writeExternalFile(handle, JSON.stringify(initPayload, null, 2));
                        state.masterKey = fileKey;
                    }

                    // Save the handle in IndexedDB
                    await idb.set('vault_file_handle', handle);
                    state.fileHandle = handle;
                    
                    updateStorageUI();
                    renderNotesList();
                    updateSidebarTags();
                    
                    if (state.notes.length > 0) {
                        setActiveNote(state.notes[0].id);
                    }
                    
                    showToast(`Linked to vault file: ${handle.name}`, "success");
                    closeSettingsDrawer();
                }
            }
        } catch (err) {
            showToast(err.message, "error");
        }
    }

    async function handleCreateExternalFile() {
        if (!window.showSaveFilePicker) {
            showToast("External storage is not supported in this browser. Please use Chrome, Edge, or Brave.", "error");
            return;
        }

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'notes.vault',
                types: [{
                    description: 'CryptKeeper Vault Files',
                    accept: { 'application/json': ['.vault', '.json'] }
                }]
            });

            if (handle) {
                // Derive file key
                const fileSalt = window.CryptKeeper.generateSalt();
                const fileKey = await window.CryptKeeper.deriveKey(state.masterPassword, fileSalt);
                const fileEncVal = await window.CryptKeeper.encryptData("CryptKeeper-Session-Valid", fileKey);

                // Encrypt current in-memory notes to this file using the new fileKey
                const rawNotes = JSON.stringify(state.notes);
                const enc = await window.CryptKeeper.encryptData(rawNotes, fileKey);
                
                const initPayload = {
                    version: 1,
                    setup: {
                        salt: window.CryptKeeper.arrayBufferToBase64(fileSalt),
                        verificationToken: fileEncVal.ciphertext,
                        verificationIv: fileEncVal.iv
                    },
                    notes: {
                        ciphertext: enc.ciphertext,
                        iv: enc.iv
                    }
                };

                await writeExternalFile(handle, JSON.stringify(initPayload, null, 2));
                
                // Save the handle in IndexedDB
                await idb.set('vault_file_handle', handle);
                state.fileHandle = handle;
                state.masterKey = fileKey;
                
                updateStorageUI();
                showToast(`Vault file created: ${handle.name}`, "success");
                closeSettingsDrawer();
            }
        } catch (err) {
            showToast(err.message, "error");
        }
    }

    /**
     * Re-encrypts all notes with a new Master Password.
     */
    async function handleChangePassword(e) {
        e.preventDefault();

        const oldPassword = dom.changeOldPassword.value;
        const newPassword = dom.changeNewPassword.value;
        const isExternal = state.fileHandle !== null;

        try {
            if (newPassword.length < 8) {
                throw new Error("Password must be at least 8 characters.");
            }

            // 1. Verify current master password
            const setupPacket = isExternal ? state.fileSetupPacket : JSON.parse(localStorage.getItem('cryptkeeper_setup'));
            const salt = window.CryptKeeper.base64ToUint8Array(setupPacket.salt);
            const verifiedOldKey = await window.CryptKeeper.deriveKey(oldPassword, salt);
            
            const decryptedVal = await window.CryptKeeper.decryptData(
                setupPacket.verificationToken,
                verifiedOldKey,
                setupPacket.verificationIv
            );
            
            if (decryptedVal !== "CryptKeeper-Session-Valid") {
                throw new Error("Current master password is incorrect.");
            }

            // Current key is valid. Create a new salt, derive new key, re-encrypt
            const newSalt = window.CryptKeeper.generateSalt();
            const newKey = await window.CryptKeeper.deriveKey(newPassword, newSalt);

            // Re-encrypt validation string
            const encryptedValidation = await window.CryptKeeper.encryptData("CryptKeeper-Session-Valid", newKey);

            // Re-write setup packet
            const newSetupPacket = {
                salt: window.CryptKeeper.arrayBufferToBase64(newSalt),
                verificationToken: encryptedValidation.ciphertext,
                verificationIv: encryptedValidation.iv
            };

            // Set new key states
            state.masterKey = newKey;
            state.masterPassword = newPassword;

            if (isExternal) {
                // Save new password configurations directly to the active file
                state.fileSetupPacket = newSetupPacket;
                const encrypted = await window.CryptKeeper.encryptData(JSON.stringify(state.notes), newKey);
                state.fileNotesPacket = {
                    ciphertext: encrypted.ciphertext,
                    iv: encrypted.iv
                };
                
                const filePayload = {
                    version: 1,
                    setup: newSetupPacket,
                    notes: state.fileNotesPacket
                };
                await writeExternalFile(state.fileHandle, JSON.stringify(filePayload, null, 2));
            } else {
                localStorage.setItem('cryptkeeper_setup', JSON.stringify(newSetupPacket));
                await saveNotesDatabase();
            }

            showToast("Master password updated successfully.", "success");
            closeSettingsDrawer();

        } catch (err) {
            showToast(err.message, "error");
        }
    }

    /**
     * Exports entire database (Notes + setup validation metadata) as JSON.
     */
    function handleExportDatabaseBackup() {
        const payload = {
            version: 1,
            setup: JSON.parse(localStorage.getItem('cryptkeeper_setup')),
            notes: JSON.parse(localStorage.getItem('cryptkeeper_notes'))
        };

        const jsonString = JSON.stringify(payload, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `cryptkeeper_backup_${dateStr}.json`;

        const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        
        URL.revokeObjectURL(url);
        showToast("Encrypted backup file exported.", "success");
    }

    /**
     * Backup Restoration Import
     */
    function handleImportFileSelect(e) {
        const file = e.target.files[0];
        if (file) processBackupFile(file);
    }

    function handleImportFileDrop(e) {
        e.preventDefault();
        dom.importDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) processBackupFile(file);
    }

    function processBackupFile(file) {
        if (file.type !== "application/json" && !file.name.endsWith('.json')) {
            showToast("Invalid file format. Please upload a JSON backup.", "error");
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                
                if (!parsed.setup || !parsed.notes) {
                    throw new Error("Invalid backup schema. Setup/notes packets are missing.");
                }

                // Verify decryption of the backup file using CURRENT master key
                const salt = window.CryptKeeper.base64ToUint8Array(parsed.setup.salt);
                
                // Let's derive key from current password and the backup's salt
                const testKey = await window.CryptKeeper.deriveKey(state.masterPassword, salt);
                
                // Decrypt verification token
                try {
                    const decryptedVal = await window.CryptKeeper.decryptData(
                        parsed.setup.verificationToken,
                        testKey,
                        parsed.setup.verificationIv
                    );
                    
                    if (decryptedVal !== "CryptKeeper-Session-Valid") {
                        throw new Error();
                    }
                } catch {
                    throw new Error("Backup was encrypted with a different password. Please update your master password to match the backup file's password before importing.");
                }

                // Now decrypt notes payload in backup using testKey
                const decryptedNotesJSON = await window.CryptKeeper.decryptData(
                    parsed.notes.ciphertext,
                    testKey,
                    parsed.notes.iv
                );

                const importedNotes = JSON.parse(decryptedNotesJSON);

                // Merge imported notes with existing notes by UUID
                const mergedMap = new Map();
                state.notes.forEach(n => mergedMap.set(n.id, n));
                importedNotes.forEach(n => {
                    const existing = mergedMap.get(n.id);
                    if (!existing || new Date(n.updatedAt) > new Date(existing.updatedAt)) {
                        mergedMap.set(n.id, n);
                    }
                });

                state.notes = Array.from(mergedMap.values());
                
                // Re-save database encrypted with the current master key
                await saveNotesDatabase();
                
                updateSidebarTags();
                renderNotesList();
                
                if (state.notes.length > 0) {
                    setActiveNote(state.notes[0].id);
                }

                showToast(`Successfully merged ${importedNotes.length} notes.`, "success");
                closeSettingsDrawer();

            } catch (err) {
                showToast(err.message, "error");
            }
        };
        reader.readAsText(file);
    }

    /**
     * Dangerous: Wipes LocalStorage and reloads window.
     */
    function nukeDatabase() {
        localStorage.removeItem('cryptkeeper_setup');
        localStorage.removeItem('cryptkeeper_notes');
        window.location.reload();
    }

    /**
     * UI Confirmation Modal.
     */
    function showConfirmModal(title, message, onConfirm) {
        dom.modalTitle.textContent = title;
        dom.modalMessage.textContent = message;
        state.confirmCallback = onConfirm;

        dom.confirmModalOverlay.classList.add('active');
        dom.confirmModal.classList.add('active');
    }

    function closeConfirmModal() {
        dom.confirmModalOverlay.classList.remove('active');
        dom.confirmModal.classList.remove('active');
        state.confirmCallback = null;
    }

    /**
     * UI Toast Notification.
     */
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = '';
        if (type === 'success') {
            icon = `
                <svg class="toast-success-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
        } else if (type === 'error') {
            icon = `
                <svg class="toast-error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
            `;
        } else {
            icon = `
                <svg class="toast-info-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
            `;
        }

        toast.innerHTML = `${icon}<span>${message}</span>`;
        dom.toastContainer.appendChild(toast);

        // Remove toast automatically
        setTimeout(() => {
            toast.style.animation = 'toast-in 0.3s reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

})();
