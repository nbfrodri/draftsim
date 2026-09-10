fn main() {
  let mut attributes = tauri_build::Attributes::new();
  // Unit tests need the same v6 controls activation context as the app.
  // On MSVC the linker embeds it for both; do not also embed Tauri's resource
  // manifest, which would produce duplicate MANIFEST resources (CVT1100).
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
    && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
  {
    attributes = attributes.windows_attributes(
      tauri_build::WindowsAttributes::new_without_app_manifest(),
    );
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
  }
  tauri_build::try_build(attributes).expect("failed to run tauri-build")
}
