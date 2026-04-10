export const logger = {
    info: (message: string) => {
        console.info(`[INFO] ${message}`);
    },

    warn: (message: string) => {
        console.warn(`[WARN] ${message}`);
    },

    error: (message: string, error?: any) => {
        console.error(`[ERROR] ${message}`);
        if (error) {
            console.error(error);
        }
    },

    debug: (message: string, data?: any) => {
        console.debug(`[DEBUG] ${message}`);
        if (data) {
            console.debug(JSON.stringify(data, null, 2));
        }
    },

    success: (message: string) => {
        console.info(`[SUCCESS] ${message}`);
    }
};
