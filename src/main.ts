import { loadConfig } from "./config.js";

function main() {
    const config = loadConfig()

    console.log(`Log service configured for port ${config.port}`);
}

try {
    main();
} catch (error: unknown) {
    const message =
        error instanceof Error ? error.message : "Unknown startup error"
    console.error(`Application startup failed: ${message}`);
    process.exitCode = 1;
}
