use solana_program::hash::hash;

/// Computes the 8-byte Anchor-style instruction discriminator: `sha256("global:<name>")[0..8]`.
pub fn ix_disc(snake_name: &str) -> [u8; 8] {
    sha256_8(&format!("global:{snake_name}"))
}

/// Computes the 8-byte Anchor-style account discriminator: `sha256("account:<Name>")[0..8]`.
pub fn account_disc(pascal_name: &str) -> [u8; 8] {
    sha256_8(&format!("account:{pascal_name}"))
}

/// Computes the 8-byte Anchor-style event discriminator: `sha256("event:<Name>")[0..8]`.
pub fn event_disc(pascal_name: &str) -> [u8; 8] {
    sha256_8(&format!("event:{pascal_name}"))
}

fn sha256_8(preimage: &str) -> [u8; 8] {
    let mut out = [0u8; 8];
    out.copy_from_slice(&hash(preimage.as_bytes()).to_bytes()[..8]);
    out
}
