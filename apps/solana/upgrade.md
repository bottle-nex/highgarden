# Upgrade runbook

How to ship a new version of the deployed native-rust program without losing on-chain state, without changing the program ID, and without touching the admin / oracle / quote signers stored inside it.

The program ID never changes after first deploy. The Config PDA, all Market PDAs, all UserPosition PDAs, the treasury vault and its USDC balance, all UsedNonce PDAs — every account derived from or owned by the program survives an upgrade untouched. Only the executable bytecode in the ProgramData account is replaced.

This program is plain Rust (no Anchor, no Pinocchio) so the entire flow uses `cargo build-sbf` and the `solana` CLI directly — no `anchor build`, no `anchor upgrade`, no on-chain IDL PDA to manage.

---

## 1. Keys and roles

| File | Role | Touched during upgrade? |
|---|---|---|
| `~/.config/solana/id.json` | Deployer = **upgrade authority** | Yes — signs the upgrade tx |
| Program keypair (pubkey IS the program ID) | Identity of the deployed program | No — only used at first deploy |
| Admin wallet (whichever wallet calls `initialize_config`) | `Config.admin` — gates `create_market`, `admin_pause_market`, `admin_unpause_market`, `close_used_nonce` | No |
| Oracle wallet | `Config.oracle_signer` — signs `resolve_market` | No |
| Quote signer | `Config.quote_signer` — signs ed25519 quotes for `place_order` | No |

The admin / oracle / quote keys are program **state**, not program **infrastructure**. They live inside the `Config` PDA and are unaffected by upgrades.

### Critical: protect the program keypair

`cargo build-sbf` writes the program keypair to `target/deploy/solmarket_contract-keypair.json`. **`cargo clean` deletes that file.** If the keypair is ever lost, the program can never be redeployed at the same address (existing upgrades via `id.json` still work, but recovery from program-account closure becomes impossible).

Before any `cargo clean`, copy it somewhere safe and keep working from there:

```sh
mkdir -p ~/.config/solana
cp apps/solana/target/deploy/solmarket_contract-keypair.json \
   ~/.config/solana/solmarket-program.json
```

Losing `id.json` means you can never upgrade again. Period.

Back up both `id.json` and the program keypair offline.

---

## 2. Costs

Numbers are for a 166 KB `solmarket_contract.so`. Recompute proportionally if the binary size changes meaningfully — query the live cluster with `solana rent <bytes>` before any real deploy in case the lamports-per-byte constants ever change.

### First-time deploy

| Account | Size | Rent | Recoverable? |
|---|---|---|---|
| ProgramData | 332,045 B (= 2 × 166000 + 45) | **~2.31 SOL** | Yes — refunded if you `solana program close` |
| Program | ~36 B | ~0.00114 SOL | Yes — refunded on `solana program close` |
| Buffer (transient) | 166,000 B | ~1.16 SOL | Yes — refunded automatically after the loader copies bytes into ProgramData |
| Tx fees (many small Write txs) | — | ~0.005–0.01 SOL | **No** — gone forever |

You need **~3.48 SOL available** in the wallet during the deploy window (buffer 1.16 + ProgramData 2.31 + program 0.001 + fees). The buffer's 1.16 SOL flows back when the loader closes it, so the wallet is **down ~2.32 SOL net** once deploy completes. That ~2.31 SOL is locked as rent-exempt on ProgramData — recoverable only by closing the program.

### Upgrade (program already deployed, new `.so` still fits in existing ProgramData allocation)

| What happens | Cost |
|---|---|
| Buffer created (166 KB) | ~1.16 SOL — **refunded automatically** when the upgrade succeeds |
| ProgramData overwritten in place | 0 — already paid for at first deploy |
| Tx fees | ~0.005 SOL — not refunded |

**Net upgrade cost: ~0.005 SOL.** You still need 1.16 SOL *available* during the upgrade window to fund the buffer, but it returns when the buffer closes. The buffer's bytes are streamed in via many small Write transactions, which is where the tx-fee total comes from.

### Refund on close

Closing the program is **one-way** — that program ID can never be redeployed. Generally only used for full retirement.

```sh
solana program close $PROGRAM_ID --recipient <wallet-pubkey>
```

Refunds ~2.31 SOL (ProgramData) + ~0.00114 SOL (program account). Past tx fees are not recoverable.

### Quick rent lookup

```sh
solana rent 332045   # ProgramData rent at current .so size
solana rent 166000   # buffer rent (transient)
```

---

## 3. Current on-chain state

Set a shell variable once per session — every command below uses it:

```sh
export PROGRAM_ID=$(solana-keygen pubkey ~/.config/solana/solmarket-program.json)
echo "$PROGRAM_ID"
```

Reference output from `solana program show "$PROGRAM_ID"`:

```
Program Id:           <PROGRAM_ID>
Owner:                BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address:  <some pubkey>
Authority:            <pubkey of id.json>
Last Deployed In Slot: <a slot number>
Data Length:          <bytes>
Balance:              <SOL>
```

What each line means:

- **Owner** is the BPF Upgradeable Loader. As long as this is `BPFLoaderUpgradeab1e...` (not the non-upgradeable loader), the program can be upgraded.
- **ProgramData Address** is the account that actually holds the bytecode. This is what gets overwritten on upgrade.
- **Authority** is the only key allowed to upgrade. Verify it matches `id.json`:
  ```sh
  solana-keygen pubkey ~/.config/solana/id.json
  # must equal the Authority line above
  ```
- **Data Length** is the currently deployed bytecode size. The ProgramData account is allocated to roughly 2× the first-deploy size as a soft cap; anything under that fits without an `extend`.

---

## 4. Pre-flight checklist

Run before every upgrade. All four must pass.

```sh
# a. Confirm CLI is pointed at the right cluster
solana config get
# RPC URL should be devnet for devnet upgrades, mainnet-beta for mainnet

# b. Confirm id.json is the upgrade authority
solana program show "$PROGRAM_ID"
solana-keygen pubkey ~/.config/solana/id.json
# Authority line in the first command must equal the second's output

# c. Confirm wallet has enough SOL.
# Upgrades briefly need (size_of_new_so + 128) * 6960 lamports to fund the buffer.
# For a ~166 KB program this is ~1.16 SOL extra during the upgrade window.
solana balance

# d. Confirm working tree is clean and you're on the commit you want to ship
cd /Users/anjan/utility/Projects/solmarket
git status
git log -1 --oneline
```

---

## 5. Build the new bytecode

```sh
cd /Users/anjan/utility/Projects/solmarket/apps/solana

# (Optional) Force a clean rebuild so release profile flags definitely apply.
# Skip if you don't need it — release builds are deterministic from Cargo.toml.
cargo clean

# Make sure the program keypair is present at the path cargo-build-sbf expects.
# (No-op if cargo clean wasn't run.)
mkdir -p target/deploy
cp ~/.config/solana/solmarket-program.json \
   target/deploy/solmarket_contract-keypair.json

# Build for SBF target. Output: target/deploy/solmarket_contract.so
cargo build-sbf

# Sanity check: the program keypair pubkey MUST equal the declare_id! constant
# embedded in the .so. If they diverge, every instruction fails with a program-id
# check error at runtime.
solana-keygen pubkey target/deploy/solmarket_contract-keypair.json
grep declare_id programs/contract/src/lib.rs
ls -lh target/deploy/solmarket_contract.so
```

If `declare_id!()` and the keypair pubkey don't match, edit [programs/contract/src/lib.rs](programs/contract/src/lib.rs) and rebuild before deploying.

---

## 6. Upgrade the program

Two equivalent paths. Pick one.

### 6a. Single-shot deploy (small programs, stable network)

```sh
solana program deploy \
  --program-id target/deploy/solmarket_contract-keypair.json \
  --upgrade-authority ~/.config/solana/id.json \
  target/deploy/solmarket_contract.so
```

This auto-detects that the program already exists, creates a buffer, copies bytes into it, invokes the loader's `Upgrade` instruction, and closes the buffer. Transactional from the user's perspective.

### 6b. Two-phase via buffer (larger programs, flaky network)

Preferred for any program above ~100 KB or when the single-shot keeps timing out.

```sh
# Step 1: write the new bytecode into a fresh buffer account.
# Save the printed buffer pubkey — you need it for the next step.
solana program write-buffer target/deploy/solmarket_contract.so

# Step 2: atomically swap the buffer in as the new program bytecode.
solana program upgrade <buffer-pubkey-from-step-1> "$PROGRAM_ID" \
  --upgrade-authority ~/.config/solana/id.json
```

If step 1 succeeds and step 2 fails, the buffer holds your bytes safely — re-run step 2. If step 1 itself fails midway (e.g. RPC drops), `solana program write-buffer --buffer-keypair <existing-buffer-keypair>` resumes into the same buffer.

### What happens under the hood

1. The loader allocates (or reuses) a buffer account funded by `id.json`.
2. The buffer is filled with your `.so` bytes via many small `Write` instructions.
3. The `Upgrade` instruction atomically copies bytes from the buffer into the ProgramData account.
4. The loader closes the buffer and refunds its rent to `id.json`.
5. `Last Deployed In Slot` advances. Program ID, ProgramData address, upgrade authority, all PDAs, and all program state are unchanged.

---

## 7. Post-upgrade verification

```sh
# 1. Confirm the on-chain bytecode size changed and slot advanced
solana program show "$PROGRAM_ID"
# Data Length should match the size of the new solmarket_contract.so
# Last Deployed In Slot should be higher than before
# Authority should be unchanged

# 2. Confirm pre-existing state is intact by reading the Config PDA.
# Derive Config PDA: seeds = [b"config"], program = $PROGRAM_ID
# Easiest: hit it through whatever client code or quick script you have.
# It should return the same admin / oracle_signer / quote_signer / treasury_vault
# / usdc_mint values as before the upgrade.

# 3. Optional: smoke-test against a local validator with the new bytecode
solana-test-validator --bpf-program "$PROGRAM_ID" target/deploy/solmarket_contract.so
```

If the Config PDA reads back the same admin / oracle / quote / treasury / usdc_mint as before, the upgrade succeeded with state intact.

---

## 8. Common failures and recovery

### Stranded buffer accounts

Failed buffer-mode upgrades leave a buffer holding your SOL. Reclaim:

```sh
solana program show --buffers
solana program close --buffers
```

`--buffers` only ever closes buffer accounts, never programs. Safe.

### "Insufficient funds" during upgrade

Upgrades briefly need enough SOL to fund the buffer (size of the new `.so` × rent rate). For a 166 KB program: ~1.16 SOL extra during the upgrade window.

```sh
solana airdrop 2 --url devnet
```

On mainnet, top up `id.json` with real SOL.

### "Program account is not upgradeable"

The upgrade authority was finalized (set to `null`). Cannot be undone. The program is permanently immutable. Verify by checking that the `Authority` line in `solana program show` shows an actual pubkey, not `(none)`.

### New `.so` is bigger than the original ProgramData allocation

Initial deploy allocated ~2× the first-deploy size as the cap. If a future build exceeds it:

```sh
solana program extend "$PROGRAM_ID" <additional_bytes>
```

### "Program ID mismatch" / "InvalidAccountData" / `IncorrectProgramId` after upgrade

Almost always means the `declare_id!()` constant in `lib.rs` doesn't match the actual deployment address. Re-check:

```sh
solana-keygen pubkey target/deploy/solmarket_contract-keypair.json
grep declare_id programs/contract/src/lib.rs
solana program show "$PROGRAM_ID"
```

All three pubkeys must agree. Fix `declare_id!`, `cargo build-sbf`, and re-upgrade.

### Wrong cluster

If `solana config get` points at devnet but you wanted mainnet (or vice versa):

```sh
solana config set --url mainnet-beta
```

Or override per-command with `--url mainnet-beta`.

### `cargo clean` deleted the program keypair

If you forgot to back up `target/deploy/solmarket_contract-keypair.json` before `cargo clean`, the next `cargo build-sbf` will silently generate a brand-new keypair — meaning the produced `.so` targets a different program ID than the one you've already deployed. Symptoms: deploy command tries to create a NEW program, or the loader rejects the upgrade because the buffer's embedded ID doesn't match.

Recovery: if you have the original keypair backed up anywhere (offline, password manager, another machine), restore it to `target/deploy/solmarket_contract-keypair.json` and rebuild. If the keypair is truly lost, the existing on-chain program can still be upgraded by the upgrade authority — you just need to manually re-derive a valid `.so` whose `declare_id!` matches the deployed address. Set `declare_id!` to the deployed `$PROGRAM_ID` value, rebuild, and pass the .so path to `solana program upgrade` directly.

---

## 9. First-time deploy

Only relevant once — for the first deploy on each cluster. Skip on every subsequent upgrade.

```sh
cd /Users/anjan/utility/Projects/solmarket/apps/solana

# 1. Generate the program keypair (or use an existing one).
solana-keygen new --no-bip39-passphrase \
  --outfile target/deploy/solmarket_contract-keypair.json

# Vanity address option (slow):
# solana-keygen grind --starts-with sol:1

# 2. Read the resulting pubkey and paste it into programs/contract/src/lib.rs:
#    solana_program::declare_id!("<that-pubkey>")
solana-keygen pubkey target/deploy/solmarket_contract-keypair.json

# 3. Rebuild so the embedded program-id check matches.
cargo build-sbf

# 4. Back up the program keypair NOW, before anything destructive.
cp target/deploy/solmarket_contract-keypair.json \
   ~/.config/solana/solmarket-program.json

# 5. Deploy fresh.
solana program deploy \
  --program-id target/deploy/solmarket_contract-keypair.json \
  --upgrade-authority ~/.config/solana/id.json \
  target/deploy/solmarket_contract.so

# 6. Initialize Config — writes admin / oracle_signer / quote_signer pubkeys
# into the Config PDA. Call from your TS client or a one-shot script. The
# wallet that signs initialize_config becomes Config.admin permanently —
# there is no admin-rotation instruction.
```

Mainnet vs devnet differs only in the cluster URL. Make sure `id.json` actually has real SOL on mainnet — initial deploy of a ~166 KB program plus its 2×-sized ProgramData allocation requires roughly 2.4 SOL.

---

## 10. One-line summary

```
Edit code  →  cargo build-sbf
           →  solana program deploy
                --program-id target/deploy/solmarket_contract-keypair.json
                --upgrade-authority ~/.config/solana/id.json
                target/deploy/solmarket_contract.so
           →  solana program show $PROGRAM_ID  to confirm slot advanced
```

Same program ID. Same on-chain state. New bytecode.
