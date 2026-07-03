#[cfg(windows)]
pub mod windows;

#[cfg(windows)]
pub use windows::*;

#[cfg(target_os = "linux")]
mod linux;

#[cfg(target_os = "linux")]
pub use linux::{Singleton, IMMAudioDevice, notifier};
