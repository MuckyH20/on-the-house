// Every instruction module exposes a `handler`; lib.rs calls them by full path, so the
// ambiguous glob re-export of that one name is intentional (the Accounts structs are what matter).
#![allow(ambiguous_glob_reexports)]

pub mod cancel_campaign;
pub mod close_claims;
pub mod create_campaign;
pub mod initialize_config;
pub mod payout;
pub mod purchase;
pub mod record_hedge;
pub mod set_paused;
pub mod settle;
pub mod update_config;

pub use cancel_campaign::*;
pub use close_claims::*;
pub use create_campaign::*;
pub use initialize_config::*;
pub use payout::*;
pub use purchase::*;
pub use record_hedge::*;
pub use set_paused::*;
pub use settle::*;
pub use update_config::*;

use anchor_lang::prelude::*;

use crate::{constants::BPS_DENOMINATOR, errors::OthError};

/// floor(amount × bps / 10_000) without intermediate overflow.
pub(crate) fn bps_of(amount: u64, bps: u16) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(OthError::MathOverflow)?
        / BPS_DENOMINATOR as u128;
    u64::try_from(v).map_err(|_| error!(OthError::MathOverflow))
}
