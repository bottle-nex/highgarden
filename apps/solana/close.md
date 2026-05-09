# Close runbook

How to wind down the contract permanently — drain USDC out of the treasury vault to the admin wallet, reclaim SOL rent from every account the program controls, and finally close the program itself.

This is a **one-way operation**. Once `solana program close` runs, the program ID can never be redeployed and any account still requiring a CPI signature from a program-owned PDA becomes permanently un-rescuable. Read every section before starting.

---

## 1. Why this needs an upgrade first

The current bytecode has **no admin-drain instruction** for the treasury vault and **no close instructions** for Config, Market, or UserPosition PDAs. To recover:

- The USDC sitting in the treasury vault, you need an instruction that does `invoke_signed` `spl_token::transfer` with the `treasury_authority` PDA seeds.
- The SOL rent on every program-owned PDA, you need close instructions that drain lamports + `resize(0)` + reassign to system program.
- The SOL rent on the treasury vault token account itself, you need a `spl_token::CloseAccount` CPI signed by `treasury_authority`.

None of those exist yet. They must be written and shipped via [upgrade.md](upgrade.md) **before** the wind-down sweep can begin.

The program ID and all PDA addresses are unchanged across upgrades, so the new code can sign for the same `treasury_authority` PDA the original code created.

---

## 2. The critical ordering

You must close in this order:

```
treasury USDC drained
     ↓
treasury_vault token account closed         ← needs treasury_authority PDA signing
     ↓
every UserPosition / UsedNonce / Market closed   ← needs program to be alive
     ↓
Config PDA closed                            ← needs program to be alive
     ↓
solana program close                         ← irreversible; no more CPIs after this
```

After `solana program close`, the program account is gone, so no Solana program can ever again `invoke_signed` with seeds derived under your old program ID. Any USDC or SOL still held by program-owned accounts at that moment becomes permanently orphaned — not even Solana's runtime can rescue it.

---

## 3. New instructions to add in the exit upgrade

Specify these in `programs/contract/src/instructions/` and add them to the dispatcher in `lib.rs`. Each must be admin-gated and verify `Config.admin == admin.key`. All values reference the original program's seeds and bumps stored in `Config`.

| Instruction | Accounts | Behavior |
|---|---|---|
| `admin_drain_treasury` | `admin` (signer), `config`, `treasury_vault` (mut), `treasury_authority` (PDA), `admin_usdc_ata` (mut, owner=admin, mint=config.usdc_mint), `token_program` | `spl_token::transfer` full vault balance → admin's USDC ATA, signed by treasury_authority PDA |
| `close_treasury_vault` | `admin` (signer, writable), `config`, `treasury_vault` (mut), `treasury_authority` (PDA), `token_program` | `spl_token::close_account` on vault → SOL rent to admin, signed by treasury_authority PDA. Vault balance must be 0. |
| `close_config` | `admin` (signer, writable), `config` (mut) | `close_account(config, admin)` |
| `admin_close_market` | `admin` (signer, writable), `config`, `market` (mut) | `close_account(market, admin)` |
| `admin_close_position` | `admin` (signer, writable), `config`, `user_position` (mut) | `close_account(user_position, admin)` — admin-force variant that skips the user-signature requirement of the existing `close_position` |

Also keep `close_used_nonce` (already admin-only) and the existing `close_position` (so users can still self-close if they want their own rent back).

You can drop everything else from the dispatcher — `place_order`, `create_market`, `resolve_market`, `claim`, `admin_pause_market`, `admin_unpause_market`, `initialize_config` — to shrink the binary and make it obvious the contract is in wind-down mode.

---

## 4. Pre-close checklist

Run before starting. All must pass.

```sh
# a. Cluster + authority sanity
solana config get
export PROGRAM_ID=$(solana-keygen pubkey ~/.config/solana/solmarket-program.json)
solana program show "$PROGRAM_ID"
solana-keygen pubkey ~/.config/solana/id.json
# Authority line must equal id.json's pubkey

# b. Wallet has enough SOL for the upgrade buffer (~1.16 SOL refunded at end of upgrade)
solana balance

# c. Inventory of accounts you'll need to close.
# Get every Market PDA owned by the program:
solana program show "$PROGRAM_ID" --url devnet
# Then, via your TS client or RPC, enumerate program-owned accounts and bucket them by
# discriminator (Market / UserPosition / UsedNonce / Config). Save the list — you'll
# iterate over it during the sweep.

# d. Working tree is on the wind-down commit
cd /Users/anjan/utility/Projects/solmarket
git status
git log -1 --oneline
```

---

## 5. Step 1 — Pause every market

Stops new BUY/SELL orders flowing into the vault while you wind down. Use existing `admin_pause_market` on every Market PDA. Iterate via your TS client.

---

## 6. Step 2 — Resolve every open market

For every market still in `MarketStatus::Open`, the oracle signer calls `resolve_market(winning_outcome)`. After this, holders of winning shares can `claim` their payout from the treasury vault.

Skip this only if you're explicitly OK with cancelling open markets and keeping every BUY-side dollar that went into the vault. That's a rugpull — be honest about it.

---

## 7. Step 3 — Grace window for user claims

Announce the impending close, give users a reasonable window (a week or more is humane) to call `claim` and `close_position` on their resolved positions. They'll pull their winning USDC out of the vault and reclaim their own UserPosition rent.

What you choose to do here defines whether step 8 returns *only platform funds* or *platform funds plus user winnings nobody got around to claiming*.

---

## 8. Step 4 — Build and upgrade with the exit instructions

Follow [upgrade.md](upgrade.md) §3-§7 to ship the new bytecode containing the five new admin instructions from §3 above.

Verify post-upgrade that the new instructions dispatch correctly before doing any draining. A quick smoke test against devnet (or a local validator with the new `.so` loaded) catches dispatcher mistakes before they matter on mainnet.

---

## 9. Step 5 — The sweep

Each sub-step must succeed before moving to the next. If any fails, fix and retry — do not skip ahead.

### 9a. Drain the USDC

```sh
# Single-shot via your TS client / script:
#   admin_drain_treasury(admin_usdc_ata)
# Verify the vault balance is 0 afterwards:
spl-token balance --owner <treasury_authority_pda> --token <usdc_mint>
# should print 0
```

### 9b. Close every UserPosition

Iterate over the UserPosition list from §4.c. For each:
```
admin_close_position(user_position_pda)
```
Each call refunds ~0.00151 SOL to admin. Batch with multiple ixs per tx (one tx can hold several closes) to save tx fees over hundreds/thousands of positions.

### 9c. Close every UsedNonce

```
close_used_nonce(nonce_bytes)
```
Each refunds ~0.00106 SOL. Same batching applies.

### 9d. Close every Market

```
admin_close_market(market_pda)
```
Each refunds ~0.00436 SOL.

### 9e. Close the treasury vault token account

```
close_treasury_vault
```
Refunds ~0.00203 SOL. **Vault balance must be 0** at this point — `spl_token::close_account` errors otherwise.

### 9f. Close the Config PDA

```
close_config
```
Refunds ~0.00208 SOL.

### 9g. Confirm nothing program-owned remains

Re-enumerate program-owned accounts. The list should be empty (or contain only accounts you've explicitly chosen to leave behind for archival reasons — you'll lose their rent).

---

## 10. Step 6 — Close the program itself

```sh
solana program close "$PROGRAM_ID" --recipient $(solana-keygen pubkey ~/.config/solana/id.json)
```

Refunds:
- ~2.31 SOL (ProgramData rent)
- ~0.00114 SOL (program account rent)

After this command lands:
- The program ID is **permanently retired**. Re-deploying at the same address is impossible (the loader treats closed program accounts as un-reusable).
- Any program-owned account you forgot to close is now orphaned. Its SOL stays locked forever.

```sh
# Verify
solana program show "$PROGRAM_ID"
# should print "Program account is not found"
```

---

## 11. What you get back

| Asset | Amount | Source |
|---|---|---|
| USDC in treasury vault | full balance | step 9a |
| Per-UserPosition rent | ~0.00151 SOL × N positions | step 9b |
| Per-UsedNonce rent | ~0.00106 SOL × K nonces | step 9c |
| Per-Market rent | ~0.00436 SOL × M markets | step 9d |
| Treasury vault token account rent | ~0.00203 SOL | step 9e |
| Config PDA rent | ~0.00208 SOL | step 9f |
| ProgramData + program account rent | ~2.31 + ~0.00114 SOL | step 10 |

Order of magnitude on a contract with 10 markets / 1000 positions / 5000 nonces:

```
USDC drained                       — full vault balance
Markets:    10  × 0.00436   = 0.0436 SOL
Positions:  1000 × 0.00151  = 1.51   SOL
Nonces:     5000 × 0.00106  = 5.30   SOL
Vault + Config + program/ProgramData = ~2.32 SOL
                                     ─────────
                                       9.17 SOL recovered
```

Skipping the per-PDA cleanup loses everything in the middle three rows — easily 5–10 SOL on a contract that's been running for months.

---

## 12. What is permanently lost

- All transaction fees ever paid (every place_order, claim, deploy, upgrade, sweep ix). Burned at the validator level — not held as rent anywhere.
- USDC already paid out to user wallets via past `claim` / `close_position` / SELL — that's their money now.
- Anything still program-owned at the moment `solana program close` lands. Sweep first, close last.

---

## 13. Failure modes

### Drain ix fails because vault has 0 balance

Either nothing was ever deposited, or someone (you) already drained it. Skip 9a, continue.

### `close_treasury_vault` fails with `NonZeroBalance`

The vault still has USDC dust. Re-run `admin_drain_treasury` with the current balance, then retry close.

### `solana program close` fails with `account is not closeable`

The upgrade authority was finalized. Cannot be recovered. The program stays alive forever (other people can still call its existing instructions); the ProgramData rent is locked. The treasury vault and its USDC, however, were already drained in step 9a — so this only costs you the ProgramData rent (~2.31 SOL), not user funds.

### You closed the program before sweeping a PDA

The PDA is now orphaned. No path to recover. Pass-through to "permanently lost" above. This is exactly why the order in §2 is non-negotiable.

### Program keypair lost mid-procedure

Doesn't block the sweep — `solana program close` only needs the upgrade authority (`id.json`), not the program keypair. The program keypair is only needed to *deploy* at that program ID, which you'll never do again.

---

## 14. One-line summary

```
Pause   →  Resolve  →  Grace window  →  Upgrade in admin_drain_treasury / closers
        →  Drain USDC  →  Close every position / nonce / market
        →  Close treasury vault token account  →  Close Config PDA
        →  solana program close
```

Sweep first. Close program last. Nothing in between is reversible after the final command lands.
