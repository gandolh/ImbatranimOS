//! The VP8 encoder's C side (csrc/vp8.c), linked against the system's libvpx
//! (Alpine's libvpx-dev to build, libvpx to run).
fn main() {
    println!("cargo:rerun-if-changed=csrc/vp8.c");
    cc::Build::new().file("csrc/vp8.c").compile("imbatranim_vp8");
    println!("cargo:rustc-link-lib=vpx");
}
