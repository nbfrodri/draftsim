// Tint the native Windows 11 title bar (caption bar + buttons strip + border)
// to the app's dark-gold theme via DWM, so the OS chrome reads as part of the
// app instead of a bright system bar. Windows 11 (build 22000+) only; older
// Windows ignores these attributes harmlessly. No-op on macOS/Linux.
//
// COLORREF is 0x00BBGGRR. Theme colors (lib/.. rift palette):
//   caption  #010a13 (rift.bg)        -> 0x00130A01
//   text     #f0e6d2 (rift.goldbright)-> 0x00D2E6F0
//   border   #1e2328 (rift.line)      -> 0x0028231E
#[cfg(windows)]
fn integrate_titlebar(window: &tauri::WebviewWindow) {
  use windows_sys::Win32::Foundation::HWND;
  use windows_sys::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    DWMWA_USE_IMMERSIVE_DARK_MODE,
  };
  let Ok(handle) = window.hwnd() else {
    return;
  };
  let hwnd = handle.0 as *mut core::ffi::c_void as HWND;
  // DwmSetWindowAttribute wants the attribute id as u32; the DWMWA_* constants
  // are typed i32, so cast at each call.
  let set = |attr: i32, value: u32| unsafe {
    DwmSetWindowAttribute(
      hwnd,
      attr as u32,
      (&value as *const u32).cast(),
      core::mem::size_of::<u32>() as u32,
    );
  };
  // Dark caption so the native min/maximize/close glyphs render light.
  set(DWMWA_USE_IMMERSIVE_DARK_MODE, 1);
  set(DWMWA_CAPTION_COLOR, 0x0013_0A01);
  set(DWMWA_TEXT_COLOR, 0x00D2_E6F0);
  set(DWMWA_BORDER_COLOR, 0x0028_231E);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      #[cfg(windows)]
      {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
          integrate_titlebar(&window);
        }
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
