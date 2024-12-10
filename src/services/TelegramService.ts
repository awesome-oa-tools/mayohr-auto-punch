export class TelegramService {
  private enabled: boolean;

  constructor(
    private readonly botToken?: string,
    private readonly chatId?: string
  ) {
    this.enabled = process.env.TELEGRAM_ENABLED === 'true'
      && !!this.botToken
      && !!this.chatId;
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!this.botToken || !this.chatId) {
      throw new Error('Telegram configuration is incomplete');
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
        })
      });

      if (!response.ok) {
        // console.debug(await response.json())
        throw new Error(`Telegram API error: ${response.statusText}`);
      }
    } catch (error) {
      // console.debug('Failed to send Telegram message:', error);
      // 不拋出錯誤，因為這是可選功能
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
