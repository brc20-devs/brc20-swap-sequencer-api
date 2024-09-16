## Verify Data

The database needs to have a complete snapshot at a specific point

```
ts-node step-1-print-expect-result.ts
ts-node step-2-print-real-result
ts-node step-3-verify.ts
```

## Generate JS Code

```
npm run build:contract
npm run build:validator
```
