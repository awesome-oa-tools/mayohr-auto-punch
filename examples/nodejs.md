# NodeJS 使用範例

## 安裝套件

```bash
npm install mayohr-auto-punch -S
```

## 使用套件

```javascript
import { MayohrService } from 'mayohr-auto-punch';

async function main() {
  // 建立 MayohrService 實例
  const mayohrService = new MayohrService(
    true, // headless 模式
    'your-domain.com',
    'your-username@your-domain.com',
    'your-password',
    'your-totp-secret'
  );

  try {
    // 初始化瀏覽器
    await mayohrService.init();

    // 登入
    const isLoggedIn = await mayohrService.login();
    if (!isLoggedIn) {
      throw new Error('登入失敗');
    }

    // 打卡
    const isPunched = await mayohrService.punch();
    if (!isPunched) {
      throw new Error('打卡失敗');
    } else {
      console.log('打卡成功');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // 關閉瀏覽器
    await mayohrService.close();
  }
}

main();
```
