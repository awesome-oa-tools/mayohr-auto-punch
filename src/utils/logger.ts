import Logger from 'node-color-log';

// 配置 logger
Logger.setDate(() => new Date().toLocaleString());

export const logger = {
    info: (message: string) => {
        Logger.color('green').log(`[INFO] ${message}`);
    },
    
    warn: (message: string) => {
        Logger.color('yellow').log(`[WARN] ${message}`);
    },
    
    error: (message: string, error?: any) => {
        Logger.color('red').log(`[ERROR] ${message}`);
        if (error) {
            Logger.color('red').log(error);
        }
    },
    
    debug: (message: string, data?: any) => {
        Logger.color('blue').log(`[DEBUG] ${message}`);
        if (data) {
            Logger.color('blue').log(JSON.stringify(data, null, 2));
        }
    },

    success: (message: string) => {
        Logger.color('green').bold().log(`[SUCCESS] ${message}`);
    }
};