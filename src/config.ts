export type AppConfig = {
    port: number;
    databaseUrl: string;
};

function requireEnv(name: string): string {
    const value = process.env[name]

    if (value === undefined || value.trim() === "") {
        throw new Error(`Missing required enviroment variable: ${name}`)
    }
    return value;
}

function parsePort(value: string): number {
    const port = Number(value)

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid PORT: ${value}`)
    }

    return port
}

export function loadConfig(): AppConfig{
    return{
        port: parsePort(requireEnv("PORT")),
        databaseUrl: requireEnv("DATABASE_URL"),
    }
}