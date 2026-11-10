//! LiteSVM tests for the on_the_house program. Run `anchor build` first (it produces
//! target/deploy/on_the_house.so), then `cargo test -p on_the_house`.

use std::str::FromStr;

use anchor_lang::{
    error::ERROR_CODE_OFFSET,
    prelude::{Clock, Pubkey},
    solana_program::{instruction::Instruction, system_instruction, system_program},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::{
    associated_token::{get_associated_token_address_with_program_id, spl_associated_token_account},
    token::spl_token,
    token_2022::spl_token_2022,
};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use on_the_house::{
    errors::OthError,
    instructions::CreateCampaignParams,
    state::{Campaign, CampaignStatus, Config, Outcome},
};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

const USD: u64 = 1_000_000;
const SOL: u64 = 1_000_000_000;
const CONFIG_SEED: &[u8] = b"config";
const CAMPAIGN_SEED: &[u8] = b"campaign";
const CLAIM_MINT_SEED: &[u8] = b"claim_mint";
const REFUND_VAULT_SEED: &[u8] = b"refund_vault";

type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

// ----------------------------------------------------------------------------------------------
// harness
// ----------------------------------------------------------------------------------------------

struct Env {
    svm: LiteSVM,
    program_id: Pubkey,
    admin: Keypair,
    operator: Keypair,
    usdc_auth: Keypair,
    usdc_mint: Pubkey,
    treasury: Pubkey,
    config: Pubkey,
}

struct CampaignAccts {
    merchant: Keypair,
    campaign: Pubkey,
    claim_mint: Pubkey,
    refund_vault: Pubkey,
    merchant_usdc: Pubkey,
}

fn program_bytes() -> Vec<u8> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/on_the_house.so");
    std::fs::read(path).unwrap_or_else(|_| panic!("{path} not found: run `anchor build` first"))
}

fn bpf_loader_upgradeable() -> Pubkey {
    Pubkey::from_str("BPFLoaderUpgradeab1e11111111111111111111111").unwrap()
}

fn programdata_address(program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[program_id.as_ref()], &bpf_loader_upgradeable()).0
}

/// LiteSVM deploys with the upgradeable loader but no upgrade authority. Patch the ProgramData
/// metadata (bincode: u32 tag=3 | u64 slot | Option<Pubkey>) so `admin` is the upgrade authority,
/// exactly like a real `solana program deploy`.
fn set_upgrade_authority(svm: &mut LiteSVM, program_id: &Pubkey, authority: &Pubkey) {
    let addr = programdata_address(program_id);
    let mut acct = svm.get_account(&addr).expect("programdata account");
    assert_eq!(&acct.data[0..4], &[3, 0, 0, 0], "not a ProgramData account");
    acct.data[12] = 1;
    acct.data[13..45].copy_from_slice(authority.as_ref());
    svm.set_account(addr, acct).unwrap();
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, extra_signers: &[&Keypair]) -> TxResult {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let mut signers: Vec<&Keypair> = vec![payer];
    for s in extra_signers {
        if s.pubkey() != payer.pubkey() {
            signers.push(s);
        }
    }
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).expect("sign");
    let res = svm.send_transaction(tx);
    svm.expire_blockhash();
    res
}

fn ok(res: TxResult) -> TransactionMetadata {
    match res {
        Ok(meta) => meta,
        Err(e) => panic!("transaction failed: {:?}\nlogs:\n{}", e.err, e.meta.logs.join("\n")),
    }
}

/// Assert the transaction failed with our custom program error.
fn expect_err(res: TxResult, expected: OthError) {
    let code = ERROR_CODE_OFFSET + expected as u32;
    match res {
        Ok(_) => panic!("expected {expected:?} ({code}) but the transaction succeeded"),
        Err(e) => {
            let msg = format!("{:?}", e.err);
            assert!(
                msg.contains(&format!("Custom({code})")),
                "expected {expected:?} (Custom({code})), got {msg}\nlogs:\n{}",
                e.meta.logs.join("\n")
            );
        }
    }
}

fn token_balance(svm: &LiteSVM, account: &Pubkey) -> u64 {
    match svm.get_account(account) {
        Some(a) if a.data.len() >= 72 => u64::from_le_bytes(a.data[64..72].try_into().unwrap()),
        _ => 0,
    }
}

fn mint_supply(svm: &LiteSVM, mint: &Pubkey) -> u64 {
    let a = svm.get_account(mint).expect("mint");
    u64::from_le_bytes(a.data[36..44].try_into().unwrap())
}

fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<Clock>().unix_timestamp
}

fn warp_time(svm: &mut LiteSVM, seconds: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp += seconds;
    clock.slot += 1;
    svm.set_sysvar::<Clock>(&clock);
}

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, mint: &Keypair, authority: &Pubkey, decimals: u8) {
    let space = 82; // spl_token::state::Mint::LEN
    let lamports = svm.minimum_balance_for_rent_exemption(space);
    let ixs = [
        system_instruction::create_account(&payer.pubkey(), &mint.pubkey(), lamports, space as u64, &spl_token::ID),
        spl_token::instruction::initialize_mint2(&spl_token::ID, &mint.pubkey(), authority, None, decimals).unwrap(),
    ];
    ok(send(svm, &ixs, payer, &[mint]));
}

fn create_ata(svm: &mut LiteSVM, payer: &Keypair, owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    let ix = spl_associated_token_account::instruction::create_associated_token_account(
        &payer.pubkey(),
        owner,
        mint,
        token_program,
    );
    ok(send(svm, &[ix], payer, &[]));
    get_associated_token_address_with_program_id(owner, mint, token_program)
}

impl Env {
    /// Program deployed, admin = upgrade authority; dUSDC mint + treasury created; config NOT initialized.
    fn bare() -> Self {
        let program_id = on_the_house::ID;
        let mut svm = LiteSVM::new();
        svm.add_program(program_id, &program_bytes()).unwrap();
        let admin = Keypair::new();
        let operator = Keypair::new();
        let usdc_auth = Keypair::new();
        svm.airdrop(&admin.pubkey(), 100 * SOL).unwrap();
        svm.airdrop(&operator.pubkey(), 100 * SOL).unwrap();
        set_upgrade_authority(&mut svm, &program_id, &admin.pubkey());

        let usdc_mint = Keypair::new();
        create_mint(&mut svm, &operator, &usdc_mint, &usdc_auth.pubkey(), 6);
        let usdc_mint = usdc_mint.pubkey();
        let treasury = create_ata(&mut svm, &operator, &operator.pubkey(), &usdc_mint, &spl_token::ID);
        let config = Pubkey::find_program_address(&[CONFIG_SEED], &program_id).0;
        Env { svm, program_id, admin, operator, usdc_auth, usdc_mint, treasury, config }
    }

    fn new() -> Self {
        let mut env = Self::bare();
        let ix = env.initialize_config_ix(&env.admin.pubkey(), &env.operator.pubkey());
        let admin = env.admin.insecure_clone();
        ok(send(&mut env.svm, &[ix], &admin, &[]));
        env
    }

    fn initialize_config_ix(&self, admin: &Pubkey, operator: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::InitializeConfig { operator: *operator }.data(),
            on_the_house::accounts::InitializeConfig {
                admin: *admin,
                config: self.config,
                usdc_mint: self.usdc_mint,
                treasury: self.treasury,
                program: self.program_id,
                program_data: programdata_address(&self.program_id),
                usdc_token_program: spl_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn mint_usdc(&mut self, to: &Pubkey, amount: u64) {
        let ix = spl_token::instruction::mint_to(&spl_token::ID, &self.usdc_mint, to, &self.usdc_auth.pubkey(), &[], amount)
            .unwrap();
        let (op, auth) = (self.operator.insecure_clone(), self.usdc_auth.insecure_clone());
        ok(send(&mut self.svm, &[ix], &op, &[&auth]));
    }

    /// A customer with `usdc` dollars and ZERO SOL (the operator pays all fees and rent).
    fn customer(&mut self, usdc: u64) -> (Keypair, Pubkey) {
        let customer = Keypair::new();
        let op = self.operator.insecure_clone();
        let ata = create_ata(&mut self.svm, &op, &customer.pubkey(), &self.usdc_mint, &spl_token::ID);
        self.mint_usdc(&ata, usdc);
        (customer, ata)
    }

    fn campaign_params(&self, id: u64, refund_bps: u16, max_premium_bps: u16, cap: u64, max_unhedged: u64) -> CreateCampaignParams {
        CreateCampaignParams {
            campaign_id: id,
            market_symbol: "GEMI-BTC100K-YES".to_string(),
            refund_bps,
            max_premium_bps,
            liability_cap: cap,
            max_unhedged,
            sales_deadline: now(&self.svm) + 3_600,
        }
    }

    fn create_campaign_ix(&self, merchant: &Pubkey, merchant_usdc: &Pubkey, params: CreateCampaignParams) -> (Instruction, Pubkey, Pubkey, Pubkey) {
        let (campaign, _) = Pubkey::find_program_address(
            &[CAMPAIGN_SEED, merchant.as_ref(), &params.campaign_id.to_le_bytes()],
            &self.program_id,
        );
        let claim_mint = Pubkey::find_program_address(&[CLAIM_MINT_SEED, campaign.as_ref()], &self.program_id).0;
        let refund_vault = Pubkey::find_program_address(&[REFUND_VAULT_SEED, campaign.as_ref()], &self.program_id).0;
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::CreateCampaign { params }.data(),
            on_the_house::accounts::CreateCampaign {
                payer: self.operator.pubkey(),
                merchant: *merchant,
                config: self.config,
                campaign,
                usdc_mint: self.usdc_mint,
                merchant_usdc: *merchant_usdc,
                claim_mint,
                refund_vault,
                usdc_token_program: spl_token::ID,
                claim_token_program: spl_token_2022::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        (ix, campaign, claim_mint, refund_vault)
    }

    fn campaign(&mut self, id: u64, refund_bps: u16, max_premium_bps: u16, cap: u64, max_unhedged: u64) -> CampaignAccts {
        let merchant = Keypair::new();
        let op = self.operator.insecure_clone();
        let merchant_usdc = create_ata(&mut self.svm, &op, &merchant.pubkey(), &self.usdc_mint, &spl_token::ID);
        let params = self.campaign_params(id, refund_bps, max_premium_bps, cap, max_unhedged);
        let (ix, campaign, claim_mint, refund_vault) = self.create_campaign_ix(&merchant.pubkey(), &merchant_usdc, params);
        ok(send(&mut self.svm, &[ix], &op, &[&merchant]));
        CampaignAccts { merchant, campaign, claim_mint, refund_vault, merchant_usdc }
    }

    fn claim_ata(&self, c: &CampaignAccts, owner: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(owner, &c.claim_mint, &spl_token_2022::ID)
    }

    fn purchase_ix(&self, c: &CampaignAccts, customer: &Pubkey, customer_usdc: &Pubkey, amount: u64, premium: u64) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::Purchase { amount, premium }.data(),
            on_the_house::accounts::Purchase {
                operator: self.operator.pubkey(),
                customer: *customer,
                config: self.config,
                campaign: c.campaign,
                usdc_mint: self.usdc_mint,
                customer_usdc: *customer_usdc,
                merchant_usdc: c.merchant_usdc,
                treasury: self.treasury,
                claim_mint: c.claim_mint,
                customer_claim: self.claim_ata(c, customer),
                usdc_token_program: spl_token::ID,
                claim_token_program: spl_token_2022::ID,
                associated_token_program: spl_associated_token_account::program::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn purchase(&mut self, c: &CampaignAccts, customer: &Keypair, customer_usdc: &Pubkey, amount: u64, premium: u64) -> TxResult {
        let ix = self.purchase_ix(c, &customer.pubkey(), customer_usdc, amount, premium);
        let op = self.operator.insecure_clone();
        send(&mut self.svm, &[ix], &op, &[customer])
    }

    fn record_hedge(&mut self, c: &CampaignAccts, signer: &Keypair, contracts: u64) -> TxResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::RecordHedge {
                contracts_added: contracts,
                avg_price_micros: 270_000,
                order_ref_hash: [7u8; 32],
            }
            .data(),
            on_the_house::accounts::RecordHedge { operator: signer.pubkey(), config: self.config, campaign: c.campaign }
                .to_account_metas(None),
        );
        send(&mut self.svm, &[ix], signer, &[])
    }

    fn set_paused(&mut self, c: &CampaignAccts, signer: &Keypair, paused: bool) -> TxResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::SetPaused { paused }.data(),
            on_the_house::accounts::SetPaused { authority: signer.pubkey(), config: self.config, campaign: c.campaign }
                .to_account_metas(None),
        );
        send(&mut self.svm, &[ix], signer, &[])
    }

    fn settle(&mut self, c: &CampaignAccts, signer: &Keypair, outcome: Outcome) -> TxResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::Settle { outcome }.data(),
            on_the_house::accounts::Settle { operator: signer.pubkey(), config: self.config, campaign: c.campaign }
                .to_account_metas(None),
        );
        send(&mut self.svm, &[ix], signer, &[])
    }

    fn payout(&mut self, c: &CampaignAccts, customer: &Pubkey, cranker: &Keypair) -> TxResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::Payout {}.data(),
            on_the_house::accounts::Payout {
                payer: cranker.pubkey(),
                customer: *customer,
                config: self.config,
                campaign: c.campaign,
                usdc_mint: self.usdc_mint,
                claim_mint: c.claim_mint,
                customer_claim: self.claim_ata(c, customer),
                refund_vault: c.refund_vault,
                customer_usdc: get_associated_token_address_with_program_id(customer, &self.usdc_mint, &spl_token::ID),
                usdc_token_program: spl_token::ID,
                claim_token_program: spl_token_2022::ID,
                associated_token_program: spl_associated_token_account::program::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, &[ix], cranker, &[])
    }

    fn close_claims(&mut self, c: &CampaignAccts, customer: &Pubkey, cranker: &Keypair) -> TxResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::CloseClaims {}.data(),
            on_the_house::accounts::CloseClaims {
                customer: *customer,
                campaign: c.campaign,
                claim_mint: c.claim_mint,
                customer_claim: self.claim_ata(c, customer),
                claim_token_program: spl_token_2022::ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, &[ix], cranker, &[])
    }

    fn cancel(&mut self, c: &CampaignAccts, signer: &Keypair) -> TxResult {
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &on_the_house::instruction::CancelCampaign {}.data(),
            on_the_house::accounts::CancelCampaign { authority: signer.pubkey(), config: self.config, campaign: c.campaign }
                .to_account_metas(None),
        );
        send(&mut self.svm, &[ix], signer, &[])
    }

    fn campaign_state(&self, c: &CampaignAccts) -> Campaign {
        let a = self.svm.get_account(&c.campaign).expect("campaign");
        Campaign::try_deserialize(&mut a.data.as_slice()).unwrap()
    }

    /// The operator funds the refund vault with a plain token transfer (here: the mock mint authority mints).
    fn fund_vault(&mut self, c: &CampaignAccts, amount: u64) {
        self.mint_usdc(&c.refund_vault, amount);
    }

    fn funded_cranker(&mut self) -> Keypair {
        let k = Keypair::new();
        self.svm.airdrop(&k.pubkey(), SOL).unwrap();
        k
    }
}

// ----------------------------------------------------------------------------------------------
// tests
// ----------------------------------------------------------------------------------------------

#[test]
fn initialize_config_is_admin_only() {
    let mut env = Env::bare();
    let impostor = Keypair::new();
    env.svm.airdrop(&impostor.pubkey(), SOL).unwrap();
    let ix = env.initialize_config_ix(&impostor.pubkey(), &impostor.pubkey());
    expect_err(send(&mut env.svm, &[ix], &impostor, &[]), OthError::Unauthorized);

    let ix = env.initialize_config_ix(&env.admin.pubkey(), &env.operator.pubkey());
    let admin = env.admin.insecure_clone();
    ok(send(&mut env.svm, &[ix], &admin, &[]));
    let a = env.svm.get_account(&env.config).unwrap();
    let cfg = Config::try_deserialize(&mut a.data.as_slice()).unwrap();
    assert_eq!(cfg.admin, env.admin.pubkey());
    assert_eq!(cfg.operator, env.operator.pubkey());
    assert_eq!(cfg.treasury, env.treasury);
    assert_eq!(cfg.usdc_mint, env.usdc_mint);
}

#[test]
fn create_campaign_builds_claim_mint_with_extensions() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let s = env.campaign_state(&c);
    assert_eq!(s.status, CampaignStatus::Open);
    assert_eq!(s.outcome, Outcome::None);
    assert_eq!(s.merchant, c.merchant.pubkey());
    assert_eq!(s.claim_mint, c.claim_mint);
    assert_eq!(s.refund_vault, c.refund_vault);

    use spl_token_2022::{
        extension::{
            non_transferable::NonTransferable, permanent_delegate::PermanentDelegate, BaseStateWithExtensions,
            StateWithExtensions,
        },
        state::Mint,
    };
    let mint_acct = env.svm.get_account(&c.claim_mint).unwrap();
    assert_eq!(mint_acct.owner, spl_token_2022::ID);
    let mint = StateWithExtensions::<Mint>::unpack(&mint_acct.data).unwrap();
    assert_eq!(mint.base.decimals, 6);
    assert_eq!(Option::<Pubkey>::from(mint.base.mint_authority), Some(c.campaign));
    assert!(mint.get_extension::<NonTransferable>().is_ok(), "NonTransferable missing");
    let delegate = mint.get_extension::<PermanentDelegate>().unwrap().delegate;
    assert_eq!(Option::<Pubkey>::from(delegate), Some(c.campaign));

    // Vault is a USDC token account owned by the campaign PDA.
    let vault = env.svm.get_account(&c.refund_vault).unwrap();
    assert_eq!(vault.owner, spl_token::ID);
    assert_eq!(Pubkey::try_from(&vault.data[32..64]).unwrap(), c.campaign);
}

#[test]
fn create_campaign_validates_params() {
    let mut env = Env::new();
    let merchant = Keypair::new();
    let op = env.operator.insecure_clone();
    let merchant_usdc = create_ata(&mut env.svm, &op, &merchant.pubkey(), &env.usdc_mint, &spl_token::ID);
    let cases: Vec<(Box<dyn Fn(&mut CreateCampaignParams)>, OthError)> = vec![
        (Box::new(|p| p.refund_bps = 0), OthError::InvalidRefundBps),
        (Box::new(|p| p.refund_bps = 10_001), OthError::InvalidRefundBps),
        (Box::new(|p| p.max_premium_bps = 10_001), OthError::InvalidMaxPremiumBps),
        (Box::new(|p| p.market_symbol = String::new()), OthError::InvalidMarketSymbol),
        (Box::new(|p| p.market_symbol = "X".repeat(65)), OthError::InvalidMarketSymbol),
        (Box::new(|p| p.sales_deadline = 0), OthError::InvalidDeadline),
        (Box::new(|p| p.liability_cap = 0), OthError::InvalidLiabilityCap),
        (Box::new(|p| p.max_unhedged = p.liability_cap + 1), OthError::InvalidMaxUnhedged),
    ];
    for (i, (mutate, err)) in cases.into_iter().enumerate() {
        let mut params = env.campaign_params(100 + i as u64, 10_000, 3_000, 100 * USD, 10 * USD);
        mutate(&mut params);
        let (ix, ..) = env.create_campaign_ix(&merchant.pubkey(), &merchant_usdc, params);
        expect_err(send(&mut env.svm, &[ix], &op, &[&merchant]), err);
    }
}

#[test]
fn purchase_splits_payment_and_mints_claims() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let (alice, alice_usdc) = env.customer(20 * USD);

    // $4.00 sale, 27.5% premium ($1.10): merchant gets $2.90, treasury $1.10, Alice owed $4.00.
    let meta = ok(env.purchase(&c, &alice, &alice_usdc, 4 * USD, 1_100_000));
    assert!(meta.logs.iter().any(|l| l.starts_with("Program data: ")), "PurchaseEvent not emitted");
    assert_eq!(token_balance(&env.svm, &alice_usdc), 16 * USD);
    assert_eq!(token_balance(&env.svm, &c.merchant_usdc), 2_900_000);
    assert_eq!(token_balance(&env.svm, &env.treasury), 1_100_000);
    assert_eq!(token_balance(&env.svm, &env.claim_ata(&c, &alice.pubkey())), 4 * USD);
    assert_eq!(mint_supply(&env.svm, &c.claim_mint), 4 * USD);

    let s = env.campaign_state(&c);
    assert_eq!(s.liability, 4 * USD);
    assert_eq!(s.total_sales, 4 * USD);
    assert_eq!(s.total_premium, 1_100_000);
    assert_eq!(s.purchase_count, 1);

    // The customer never needed SOL: the operator paid the fee and the claim account's rent.
    assert_eq!(env.svm.get_account(&alice.pubkey()).map(|a| a.lamports).unwrap_or(0), 0);

    // 50% refund campaign: $3.45 -> refund $1.725 (floor of amount × bps / 10_000).
    let half = env.campaign(2, 5_000, 2_000, 100 * USD, 10 * USD);
    ok(env.purchase(&half, &alice, &alice_usdc, 3_450_000, 0));
    assert_eq!(token_balance(&env.svm, &env.claim_ata(&half, &alice.pubkey())), 1_725_000);
    assert_eq!(token_balance(&env.svm, &half.merchant_usdc), 3_450_000);
}

#[test]
fn premium_cap_is_enforced() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 50 * USD);
    let (bob, bob_usdc) = env.customer(10 * USD);
    // cap = $1.00 × 30% = $0.30
    expect_err(env.purchase(&c, &bob, &bob_usdc, USD, 300_001), OthError::PremiumTooHigh);
    ok(env.purchase(&c, &bob, &bob_usdc, USD, 300_000));
    expect_err(env.purchase(&c, &bob, &bob_usdc, 0, 0), OthError::InvalidAmount);
}

#[test]
fn liability_cap_is_enforced() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 5 * USD, 5 * USD);
    let (carol, carol_usdc) = env.customer(20 * USD);
    ok(env.purchase(&c, &carol, &carol_usdc, 4 * USD, 0));
    expect_err(env.purchase(&c, &carol, &carol_usdc, 1_500_000, 0), OthError::LiabilityCapExceeded);
    ok(env.purchase(&c, &carol, &carol_usdc, USD, 0)); // exactly at the cap
    assert_eq!(env.campaign_state(&c).liability, 5 * USD);
}

#[test]
fn max_unhedged_blocks_sales_until_hedge_is_recorded() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 2 * USD);
    let (dan, dan_usdc) = env.customer(20 * USD);

    ok(env.purchase(&c, &dan, &dan_usdc, 2 * USD, 0)); // unhedged = $2.00 (at the limit)
    expect_err(env.purchase(&c, &dan, &dan_usdc, 500_000, 0), OthError::UnhedgedLimitExceeded);

    let operator = env.operator.insecure_clone();
    let meta = ok(env.record_hedge(&c, &operator, 3));
    assert!(meta.logs.iter().any(|l| l.starts_with("Program data: ")), "HedgeRecorded not emitted");
    assert_eq!(env.campaign_state(&c).hedged_contracts, 3);

    ok(env.purchase(&c, &dan, &dan_usdc, 500_000, 0)); // liability 2.5, covered 3.0 -> unhedged 0
    ok(env.purchase(&c, &dan, &dan_usdc, 2_400_000, 0)); // liability 4.9, covered 3.0 -> unhedged 1.9
    expect_err(env.purchase(&c, &dan, &dan_usdc, 200_000, 0), OthError::UnhedgedLimitExceeded); // -> 2.1
}

#[test]
fn claim_tokens_cannot_be_transferred() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let (erin, erin_usdc) = env.customer(10 * USD);
    ok(env.purchase(&c, &erin, &erin_usdc, 3 * USD, 0));

    let frank = Keypair::new();
    let op = env.operator.insecure_clone();
    let frank_claim = create_ata(&mut env.svm, &op, &frank.pubkey(), &c.claim_mint, &spl_token_2022::ID);
    let erin_claim = env.claim_ata(&c, &erin.pubkey());
    let ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::ID,
        &erin_claim,
        &c.claim_mint,
        &frank_claim,
        &erin.pubkey(),
        &[],
        USD,
        6,
    )
    .unwrap();
    let res = send(&mut env.svm, &[ix], &op, &[&erin]);
    assert!(res.is_err(), "claim transfer must fail");
    assert_eq!(token_balance(&env.svm, &erin_claim), 3 * USD);
    assert_eq!(token_balance(&env.svm, &frank_claim), 0);
}

#[test]
fn only_operator_can_record_hedges_or_settle() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let impostor = env.funded_cranker();
    expect_err(env.record_hedge(&c, &impostor, 1), OthError::Unauthorized);
    expect_err(env.settle(&c, &impostor, Outcome::Yes), OthError::Unauthorized);
    let merchant = c.merchant.insecure_clone();
    env.svm.airdrop(&merchant.pubkey(), SOL).unwrap();
    expect_err(env.settle(&c, &merchant, Outcome::Yes), OthError::Unauthorized);
    expect_err(env.record_hedge(&c, &merchant, 1), OthError::Unauthorized);

    let operator = env.operator.insecure_clone();
    expect_err(env.settle(&c, &operator, Outcome::None), OthError::InvalidOutcome);
    ok(env.settle(&c, &operator, Outcome::Yes));
}

#[test]
fn payout_pays_exactly_the_claim_and_burns_it() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let (gina, gina_usdc) = env.customer(10 * USD);
    let (hank, hank_usdc) = env.customer(10 * USD);
    ok(env.purchase(&c, &gina, &gina_usdc, 4 * USD, 1_000_000));
    ok(env.purchase(&c, &hank, &hank_usdc, 2_500_000, 500_000));
    let operator = env.operator.insecure_clone();
    ok(env.record_hedge(&c, &operator, 7));
    ok(env.settle(&c, &operator, Outcome::Yes));
    assert_eq!(env.campaign_state(&c).status, CampaignStatus::Settled);

    // Sales are over once settled.
    expect_err(env.purchase(&c, &gina, &gina_usdc, USD, 0), OthError::CampaignNotOpen);
    expect_err(env.record_hedge(&c, &operator, 1), OthError::CampaignClosed);
    expect_err(env.settle(&c, &operator, Outcome::No), OthError::CampaignClosed);

    env.fund_vault(&c, 6_500_000);
    let cranker = env.funded_cranker(); // permissionless

    let before = token_balance(&env.svm, &gina_usdc);
    let meta = ok(env.payout(&c, &gina.pubkey(), &cranker));
    assert!(meta.logs.iter().any(|l| l.starts_with("Program data: ")), "PayoutEvent not emitted");
    assert_eq!(token_balance(&env.svm, &gina_usdc), before + 4 * USD);
    assert_eq!(token_balance(&env.svm, &env.claim_ata(&c, &gina.pubkey())), 0);
    assert_eq!(mint_supply(&env.svm, &c.claim_mint), 2_500_000);
    expect_err(env.payout(&c, &gina.pubkey(), &cranker), OthError::NothingToPay);

    let before = token_balance(&env.svm, &hank_usdc);
    ok(env.payout(&c, &hank.pubkey(), &cranker));
    assert_eq!(token_balance(&env.svm, &hank_usdc), before + 2_500_000);
    assert_eq!(mint_supply(&env.svm, &c.claim_mint), 0);
    assert_eq!(token_balance(&env.svm, &c.refund_vault), 0);
    assert_eq!(env.campaign_state(&c).total_paid_out, 6_500_000);
}

#[test]
fn payout_recreates_a_closed_usdc_account() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let (ivy, ivy_usdc) = env.customer(USD);
    ok(env.purchase(&c, &ivy, &ivy_usdc, USD, 0)); // spends everything
    let close = spl_token::instruction::close_account(&spl_token::ID, &ivy_usdc, &env.operator.pubkey(), &ivy.pubkey(), &[])
        .unwrap();
    let op = env.operator.insecure_clone();
    ok(send(&mut env.svm, &[close], &op, &[&ivy]));
    assert!(env.svm.get_account(&ivy_usdc).map(|a| a.lamports == 0).unwrap_or(true));

    ok(env.settle(&c, &op, Outcome::Yes));
    env.fund_vault(&c, USD);
    let cranker = env.funded_cranker();
    ok(env.payout(&c, &ivy.pubkey(), &cranker));
    assert_eq!(token_balance(&env.svm, &ivy_usdc), USD);
}

#[test]
fn payout_fails_before_settlement_and_after_no() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let (jo, jo_usdc) = env.customer(10 * USD);
    ok(env.purchase(&c, &jo, &jo_usdc, 3 * USD, 0));
    env.fund_vault(&c, 3 * USD);
    let cranker = env.funded_cranker();

    expect_err(env.payout(&c, &jo.pubkey(), &cranker), OthError::NotSettled);
    expect_err(env.close_claims(&c, &jo.pubkey(), &cranker), OthError::ClaimsNotClosable);

    let operator = env.operator.insecure_clone();
    ok(env.settle(&c, &operator, Outcome::No));
    let before = token_balance(&env.svm, &jo_usdc);
    expect_err(env.payout(&c, &jo.pubkey(), &cranker), OthError::OutcomeNotYes);
    assert_eq!(token_balance(&env.svm, &jo_usdc), before);

    // After NO, claims are worthless and can be burned by anyone.
    ok(env.close_claims(&c, &jo.pubkey(), &cranker));
    assert_eq!(token_balance(&env.svm, &env.claim_ata(&c, &jo.pubkey())), 0);
    assert_eq!(mint_supply(&env.svm, &c.claim_mint), 0);
    assert_eq!(token_balance(&env.svm, &jo_usdc), before);
    assert_eq!(token_balance(&env.svm, &c.refund_vault), 3 * USD);
}

#[test]
fn pause_and_deadline_stop_sales() {
    let mut env = Env::new();
    let c = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let (kim, kim_usdc) = env.customer(10 * USD);
    let merchant = c.merchant.insecure_clone();
    env.svm.airdrop(&merchant.pubkey(), SOL).unwrap();
    let operator = env.operator.insecure_clone();
    let impostor = env.funded_cranker();

    expect_err(env.set_paused(&c, &impostor, true), OthError::Unauthorized);
    ok(env.set_paused(&c, &merchant, true));
    assert_eq!(env.campaign_state(&c).status, CampaignStatus::Paused);
    expect_err(env.purchase(&c, &kim, &kim_usdc, USD, 0), OthError::CampaignNotOpen);
    ok(env.record_hedge(&c, &operator, 1)); // hedging may continue while paused
    ok(env.set_paused(&c, &operator, false));
    ok(env.purchase(&c, &kim, &kim_usdc, USD, 0));

    warp_time(&mut env.svm, 3_601);
    expect_err(env.purchase(&c, &kim, &kim_usdc, USD, 0), OthError::SalesClosed);
}

#[test]
fn cancel_only_without_sales() {
    let mut env = Env::new();
    let empty = env.campaign(1, 10_000, 3_000, 100 * USD, 10 * USD);
    let merchant = empty.merchant.insecure_clone();
    env.svm.airdrop(&merchant.pubkey(), SOL).unwrap();
    ok(env.cancel(&empty, &merchant));
    assert_eq!(env.campaign_state(&empty).status, CampaignStatus::Cancelled);

    let sold = env.campaign(2, 10_000, 3_000, 100 * USD, 10 * USD);
    let (lee, lee_usdc) = env.customer(10 * USD);
    ok(env.purchase(&sold, &lee, &lee_usdc, USD, 0));
    let operator = env.operator.insecure_clone();
    expect_err(env.cancel(&sold, &operator), OthError::CampaignHasSales);
}
