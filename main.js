/**
 * CryptKeeper Electron Main Process
 * Manages the desktop application lifecycle and window settings.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    // Create the secure browser window.
    const mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 800,
        minHeight: 600,
        title: "CryptKeeper",
        show: false, // Don't show the window until it's loaded to avoid visual flickering
        webPreferences: {
            nodeIntegration: false,    // Disables Node.js access in client code (Critical for Security)
            contextIsolation: true,   // Protects Electron main process state (Critical for Security)
            sandbox: true,            // Sandboxes the renderer process (Critical for Security)
            preload: null
        }
    });

    // Load the web application skeleton
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Remove the default browser menu bar for a native app feel
    mainWindow.removeMenu();

    // Show window once it is ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}

// Electron Application Lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
