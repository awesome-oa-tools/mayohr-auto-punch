import { TelegramService } from '../services/TelegramService';

export class Notifier {
  constructor(private readonly telegramService?: TelegramService) {}

  async info(message: string): Promise<void> {
    await this.telegramService?.sendMessage(message);
  }

  async success(message: string): Promise<void> {
    await this.telegramService?.sendMessage(message);
  }

  async error(message: string, error?: any): Promise<void> {
    await this.telegramService?.sendMessage(`${message}${error ? `\nError: ${error}` : ''}`);
  }

  async warn(message: string): Promise<void> {
    await this.telegramService?.sendMessage(message);
  }
}