# Bank-account sync — integration path

The end-state for missed-rewards forensics is automatic: a user links their
bank, transactions stream in, the optimizer re-ranks them against the
current wallet, and the report updates without the user touching a CSV. We
shipped the **CSV statement import** path first because it doesn't need a
partner contract — but the long-term wedge is real bank sync.

This document captures the integration path so the next person to pick this
up doesn't have to re-research from zero.

## The two providers

| | Plaid | Flinks |
|---|---|---|
| Headquartered | US (San Francisco) | Canada (Montreal) |
| Canadian bank coverage | RBC, TD, Scotia, BMO, CIBC, Tangerine, Simplii, Desjardins via screen-scraping; some via OFX. Coverage **less stable** than US. | All Big Six + most Canadian fintechs (Wealthsimple, KOHO, Neo, etc.). Native Canadian bank relationships. **More reliable for Canadian use case.** |
| Pricing model | Per linked account / per month, volume tiered. Sandbox free. | Quote-based; "Connect" plan starts ~CA$0.30 per active connection per month at scale. Sandbox free. |
| Compliance | SOC 2 Type II, PIPEDA-compliant. | SOC 2 Type II, PIPEDA-compliant, hosted in Canada. |
| Auth flow | Plaid Link (white-label web/mobile widget). Returns a public_token → exchange for access_token server-side. | Flinks Connect (white-label widget). Returns a login_id + temporary `request_id` → exchange server-side for `account_id`s. |
| Transaction freshness | T+1 for most banks; intra-day for some Plaid-Direct partners. | T+1 for most; some real-time via push notifications. |
| Webhook support | Yes (DEFAULT_UPDATE, HISTORICAL_UPDATE). | Yes (Refresh, Account.Available). |

**Recommendation: Flinks first.** Better Canadian bank coverage, native
hosting, simpler enterprise contract for a Canadian SaaS. Plaid as a Phase 2
addition once US-Canadian dual-citizen users start asking for US bank sync.

## Steps to ship Flinks integration

### 1. Sign the contract
- Sales contact: <https://flinks.com/contact-sales/>
- Expect 2-4 weeks for legal + procurement.
- Non-negotiable asks: enterprise SLA, PIPEDA data residency in Canada, no
  re-sale of transaction data to third parties.

### 2. Provision sandbox + production credentials
- Flinks issues a `customer_id` and `instance_id` per environment.
- Store in env vars: `FLINKS_CUSTOMER_ID`, `FLINKS_INSTANCE_ID`,
  `FLINKS_API_KEY`, `FLINKS_ENV` (sandbox|production).

### 3. Wire the auth widget
- Frontend renders an iframe pointing at
  `https://{instance}.flinks.com/v2/?demo=false&customerId={cid}&...`
- On success, Flinks postMessages a `request_id` to the parent window.
- Send the `request_id` to our backend via a new `POST
  /api/v1/integrations/flinks/link` endpoint.

### 4. Server exchange + persist
- Backend calls Flinks `Authorize` endpoint with the `request_id` to receive
  a `login_id` + `account_id[]`.
- Persist into a new table:
  ```sql
  CREATE TABLE bank_links (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider     TEXT NOT NULL,            -- 'flinks'|'plaid'
      external_id  TEXT NOT NULL,            -- Flinks login_id
      institution  TEXT,                     -- 'RBC', 'TD', etc.
      linked_at    TIMESTAMPTZ DEFAULT NOW(),
      last_refresh TIMESTAMPTZ,
      last_error   TEXT
  );
  CREATE TABLE bank_accounts (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bank_link_id UUID REFERENCES bank_links(id) ON DELETE CASCADE,
      external_id  TEXT NOT NULL,            -- Flinks AccountId
      mask         TEXT,                     -- last 4
      type         TEXT,                     -- 'credit'|'chequing'|'savings'
      card_id      UUID REFERENCES cards(id) -- user maps account → catalog card
  );
  ```

### 5. Pull transactions
- Worker call: `GetAccountsDetail` with `RequestId` returns transactions
  for each account.
- For each transaction:
  - Skip if `Direction = "Credit"` (refunds/payments don't count as spend).
  - Map `Description` → category via existing `categorizer` heuristics.
  - Resolve to `card_id` via the `bank_accounts.card_id` mapping.
  - Insert into `spend_entries` reusing the existing `WalletService.LogSpend`
    code path (the CSV importer already proved this works).

### 6. Webhook for refresh
- Flinks pushes a `Refresh` event when new transactions land.
- New endpoint: `POST /api/v1/integrations/flinks/webhook` (HMAC-verified).
- On event, run the same transaction-pull logic for the affected `login_id`.

### 7. UI
- Replace the "Drag a CSV" panel in `/wallet` with a "Connect bank" button
  when the user is signed in. Keep the CSV path as a fallback for banks
  Flinks doesn't cover (Costco card, AmEx-issued credit cards).
- Add a "Linked accounts" section under `/settings` for management.

## Minimum-viable Go skeleton

Below is what a `internal/service/flinks.go` would look like. Not built
because we're holding for the contract. The CSV importer covers the feature
in the meantime.

```go
package service

import (
    "context"
    "errors"
    "maplerewards/internal/model"
)

type FlinksService struct {
    customerID string
    apiKey     string
    env        string // sandbox | production
}

type FlinksTransaction struct {
    ExternalID  string
    AccountID   string
    Date        string
    Description string
    Amount      float64 // positive = credit, negative = debit (Flinks convention)
}

// LinkAccount exchanges a Flinks request_id for a persisted login_id +
// account list. Returns an error if Flinks rejects the request.
func (s *FlinksService) LinkAccount(ctx context.Context, requestID string) (*model.BankLink, error) {
    return nil, errors.New("flinks integration pending contract — see docs/bank-sync-integration.md")
}

// PullTransactions fetches new transactions for a linked account since the
// last successful refresh. Hands them off to WalletService.LogSpend.
func (s *FlinksService) PullTransactions(ctx context.Context, accountID string) ([]FlinksTransaction, error) {
    return nil, errors.New("flinks integration pending contract — see docs/bank-sync-integration.md")
}
```

Plus the matching frontend stub:

```ts
// frontend/lib/integrations/flinks.ts
export async function openFlinksLink(): Promise<string> {
  throw new Error("Flinks integration is gated on a partner contract — see docs/bank-sync-integration.md");
}
```

When the contract clears: drop the `errors.New` stubs, wire the real
HTTP calls per the Flinks API docs at
<https://docs.flinks.com/reference>, expose the `bank_links` table as a
new repo, and replace the CSV-import UI on `/wallet` with the link
button. Estimated effort: 5-10 engineering days end-to-end after the
contract.

## What to do _now_ (no contract needed)

We've already shipped:

- **CSV bank-statement import** (`/wallet/{sid}/spend/import/preview` +
  `/commit`) — handles RBC/TD/Scotia/BMO/Amex/Tangerine exports, parses
  signed-amount + debit/credit-column conventions, drops credits, writes to
  `spend_entries` reusing `WalletService.LogSpend`. See
  [`internal/service/csv_import.go`](../internal/service/csv_import.go).
- **Loyalty-account aggregation** (`/wallet/{sid}/loyalty-accounts`) —
  manual but covers the cross-program tracking AwardWallet charges $50/yr
  for. See [`internal/service/loyalty_account.go`](../internal/service/loyalty_account.go).
- **Card-linked offer tracker** (`/wallet/{sid}/offers`) — manual log for
  Amex/RBC/Scene+ deals; once Plaid/Flinks lands we can match cleared
  transactions against tracked offers and auto-mark them used. See
  [`internal/service/card_offer.go`](../internal/service/card_offer.go).

These three together deliver ~70% of the Plaid endgame value with zero
partner risk.
