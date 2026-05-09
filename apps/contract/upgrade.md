# Upgrade runbook

How to ship a new version of the deployed contract without losing on-chain state, without changing the program ID, and without touching the admin / oracle / quote signers stored inside it.

The program ID never changes. The Config PDA, all Market PDAs, all UserPosition PDAs, the Treasury vault and its USDC balance, all UsedNonce PDAs — every account derived from or owned by the program survives an upgrade untouched. Only the executable bytecode in the ProgramData account is replaced.

---

## 1. Keys and roles

| File                                                | Role                                                                                          | Touched during upgrade?        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| `~/.config/solana/id.json`                          | Deployer = **upgrade authority**                                                              | Yes — signs the upgrade tx     |
| `apps/contract/target/deploy/contract-keypair.json` | Program keypair (its pubkey is the program ID `2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P`) | No — only used at first deploy |
| `~/.config/solana/solmarket-admin.json`             | `Config.admin` — gates `create_market`, `admin_pause_market`, `close_used_nonce`              | No                             |
| `~/.config/solana/solmarket-oracle.json`            | `Config.oracle_signer` — signs `resolve_market`                                               | No                             |
| `~/.config/solana/solmarket-quote.json`             | `Config.quote_signer` — signs ed25519 quotes for `place_order`                                | No                             |

The admin / oracle / quote keys are program **state**, not program **infrastructure**. They are unaffected by upgrades. Keep them safe but don't touch them during this procedure.

Back up `id.json` and `contract-keypair.json` offline. Losing `id.json` means you can never upgrade again. Losing `contract-keypair.json` means you can't redeploy at the same program ID if the program account is ever closed.

---

## 2. Current devnet state

Reference output from `solana program show`:

```
Program Id:           2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P
Owner:                BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address:  JDXjtPiKcFoS6K4Z7NW7xsHgcvYKmd7w9dWdVgScf8WK
Authority:            FnrBZ9UVbxXBStmygpRzTwc67Au6VzhNdWYKLUJv8fLh
Last Deployed In Slot: 459652730
Data Length:          386608 (0x5e630) bytes
Balance:              2.69199576 SOL
```

What each line means:

- **Owner** is the BPF Upgradeable Loader. As long as this is `BPFLoaderUpgradeab1e...` (not the non-upgradeable loader), the program can be upgraded.
- **ProgramData Address** is the account that actually holds the bytecode. This is what gets overwritten on upgrade.
- **Authority** is the only key allowed to upgrade. Verify it matches `id.json`:
  ```sh
  solana-keygen pubkey ~/.config/solana/id.json
  # must output: FnrBZ9UVbxXBStmygpRzTwc67Au6VzhNdWYKLUJv8fLh
  ```
- **Data Length** is the currently deployed bytecode size. The ProgramData account was originally allocated to roughly 2× the first-deploy size, so anything under ~780 KB will fit in subsequent upgrades.

---

## 3. Pre-flight checklist

Run these before every upgrade. All four must pass.

```sh
# a. Confirm CLI is pointed at the right cluster
solana config get
# RPC URL should be devnet for devnet upgrades, mainnet-beta for mainnet

# b. Confirm id.json is the upgrade authority
solana program show 2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P --url devnet
solana-keygen pubkey ~/.config/solana/id.json
# Authority line in the first command must equal the second command's output

# c. Confirm wallet has enough SOL (upgrades need ~0.001 SOL plus any ProgramData rent delta)
solana balance

# d. Confirm working tree is clean and you're on the commit you want to ship
cd /Users/anjan/utility/Projects/solmarket
git status
git log -1 --oneline
```

---

## 4. Build the new bytecode

From the contract directory:

```sh
cd /Users/anjan/utility/Projects/solmarket/apps/contract

# Force a clean rebuild so the release profile flags definitely apply
cargo clean

# Build with no-idl to keep the binary small.
# This produces target/deploy/contract.so AND target/idl/contract.json.
anchor build -- --features no-idl

# Sync the freshly generated IDL into the TS package so clients pick up
# any new instruction signatures or account layout changes
bun sync

# Sanity check: verify both outputs exist and the .so shrunk
ls -lh target/deploy/contract.so
ls -lh target/idl/contract.json
ls -lh ../../packages/contract/src/idl.ts
```

If you ever need a build _with_ embedded IDL (e.g. for a one-off explorer compatibility deploy), drop the `-- --features no-idl` flag.

---

## 5. (Optional, first-time only) Close the stale on-chain IDL PDA

Your current devnet deployment was made _with_ the embedded IDL, so an `IdlAccount` PDA was created beside the program. After you upgrade to a `no-idl` build, that PDA can no longer be updated or closed via `anchor idl ...` because the handlers are stripped from the new bytecode.

**Do this once, before the first `no-idl` upgrade.** Skip in all subsequent upgrades.

```sh
# Close the existing IDL account using the current (still IDL-aware) on-chain bytecode.
# The account's authority is the deployer who originally ran `anchor deploy`.
anchor idl close 2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P \
  --provider.cluster devnet \
  --provider.wallet ~/.config/solana/id.json
```

If this step is skipped, nothing breaks — the stale IDL PDA just sits there forever holding a few cents of devnet rent. Devnet SOL is free, so it doesn't matter on devnet. On mainnet you'd want to close it.

---

## 6. Upgrade the program

```sh
cd /Users/anjan/utility/Projects/solmarket/apps/contract

anchor upgrade target/deploy/contract.so \
  --program-id 2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P \
  --provider.cluster devnet \
  --provider.wallet ~/.config/solana/id.json
```

What happens under the hood:

1. `anchor upgrade` writes the `.so` to a temporary "buffer" account it creates and owns.
2. It invokes the BPF Upgradeable Loader's `Upgrade` instruction, which atomically copies bytes from the buffer into the ProgramData account.
3. The loader closes the buffer and refunds its rent.
4. `Last Deployed In Slot` advances. Everything else stays the same.

The `--program-id` flag is a safety belt: it makes accidentally creating a new program impossible. Always pass it.

---

## 7. Post-upgrade verification

```sh
# 1. Confirm the on-chain bytecode size changed and slot advanced
solana program show 2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P --url devnet
# Data Length should match the size of your new contract.so
# Last Deployed In Slot should be higher than before
# Authority should be unchanged

# 2. Confirm pre-existing state is intact by reading the Config PDA
solana account $(solana address-lookup-table show \
  --program-id 2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P 2>/dev/null; \
  echo) --url devnet 2>/dev/null

# Easier: hit it through the TS client
cd /Users/anjan/utility/Projects/solmarket
# Run any small script or test that calls SolmarketClient.fetchConfig()
# It should return the same admin / oracle_signer / quote_signer / treasury_vault
# / usdc_mint values as before

# 3. Run the test suite against devnet (or local validator with devnet fork) to
# confirm the new bytecode behaves correctly
cd apps/contract
bun test
```

If the Config PDA reads back the same admin / oracle / quote / treasury / usdc_mint as before, and your tests pass, the upgrade succeeded with state intact.

---

## 8. Common failures and recovery

### "Buffer account not found" or upgrade tx fails partway through

Anchor's upgrade buffer occasionally gets stranded. Reclaim its rent and retry:

```sh
# List orphaned buffers your wallet owns
solana program show --buffers --url devnet

# Close all of them and refund rent to your wallet
solana program close --buffers --url devnet

# Then retry the upgrade from step 6
```

Safe operation — `--buffers` only ever closes buffer accounts, never programs.

### "Insufficient funds" during upgrade

Upgrades briefly require enough SOL to fund the buffer (size of the new `.so` × rent rate). On devnet:

```sh
solana airdrop 2 --url devnet
```

On mainnet, top up `id.json` with real SOL.

### "Program account is not upgradeable"

This means the upgrade authority was finalized (set to `null`). Cannot be undone. The program is permanently immutable. Verify by checking that the `Authority` line in `solana program show` shows an actual pubkey, not `(none)` or empty.

### New `.so` is bigger than the original ProgramData allocation

Your initial deploy allocated roughly 2× the first-deploy size as the cap. Solmarket was first deployed at ~391 KB, so the cap is around 780 KB. If a future build ever exceeds this:

```sh
# Extend the ProgramData allocation by N bytes before retrying upgrade
solana program extend 2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P <additional_bytes> --url devnet
```

### Wrong cluster

If `solana config get` points at devnet but you wanted mainnet (or vice versa), commands like `anchor upgrade` will hit the wrong network. Either change the global config:

```sh
solana config set --url mainnet-beta
```

Or override per-command with `--provider.cluster mainnet` (anchor) / `--url mainnet-beta` (solana).

---

## 9. Switching to mainnet later

When you're ready to ship to mainnet, the procedure is the same as devnet but with three changes:

1. **First-time mainnet deploy** uses `anchor deploy` (not `anchor upgrade`) and writes a fresh program at the same program ID `2LEm66V2Ys8...` (because `contract-keypair.json` is the same). Skip step 5 — there is no pre-existing IDL PDA to close on mainnet.
2. Use `--provider.cluster mainnet` everywhere (or set it globally with `solana config set --url mainnet-beta`).
3. Make sure `id.json` actually has real SOL on mainnet — initial deploy of a ~352 KB program requires ~2.5 SOL of rent for the ProgramData account.

After the first mainnet deploy, every subsequent mainnet upgrade follows steps 3–7 exactly as written here.

---

## 10. One-line summary

```
Edit code  →  cargo clean && anchor build -- --features no-idl && bun sync
           →  anchor upgrade target/deploy/contract.so
                --program-id 2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P
                --provider.cluster devnet
                --provider.wallet ~/.config/solana/id.json
           →  solana program show <programId> to confirm slot advanced
```

Same program ID. Same on-chain state. New bytecode.
