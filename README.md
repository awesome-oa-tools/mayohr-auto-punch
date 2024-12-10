# mayohr-auto-punch

Automatic punch in/out system for mayohr

## Usage

Create a .env file with your credentials:

```
HEADLESS=true
MAYOHR_URL=https://asiaauth.mayohr.com/HRM/Account/Login
MS_DOMAIN=your-domain
MS_USERNAME=your-username
MS_PASSWORD=your-password
MS_TOPT_SECRET=your-totp-secret
```

Then run the script:

```
npx mayohr-auto-punch
```

