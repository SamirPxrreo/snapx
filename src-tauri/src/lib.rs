mod commands;

use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;

/// Atajo global efectivamente registrado (el primero libre de la lista).
struct HotkeyState(Mutex<Option<String>>);

/// Devuelve el atajo global registrado, para mostrarlo en la interfaz.
#[tauri::command]
fn get_hotkey(state: tauri::State<'_, HotkeyState>) -> Option<String> {
    state.0.lock().ok().and_then(|s| s.clone())
}

/// Arranca la aplicacion Tauri de SnapX.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit("snapx-global-capture", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Atajo global para capturar un area. Se prueban candidatos en orden
            // y se queda el primero que el sistema deje libre (asi nunca choca
            // con Recortes ni otras apps). El elegido se guarda para mostrarlo.
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let handle = app.handle().clone();
                let mut chosen: Option<String> = None;
                for name in ["Ctrl+Shift+X", "Ctrl+Alt+S", "Shift+Alt+S"] {
                    match handle.global_shortcut().register(name) {
                        Ok(()) => {
                            eprintln!("snapx: atajo global registrado: {name}");
                            chosen = Some(name.to_string());
                            break;
                        }
                        Err(e) => eprintln!("snapx: atajo {name} no disponible: {e}"),
                    }
                }
                app.manage(HotkeyState(Mutex::new(chosen)));
            }

            // Arranque en segundo plano (desde "iniciar con Windows").
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }

            // Icono de la bandeja del sistema con menu.
            let open = MenuItemBuilder::with_id("open", "Abrir SnapX").build(app)?;
            let capture =
                MenuItemBuilder::with_id("capture", "Capturar área").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Salir").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&open, &capture, &quit])
                .build()?;
            let icon = match app.default_window_icon() {
                Some(i) => i.clone(),
                None => tauri::image::Image::from_app_icon_resource(32)?,
            };
            TrayIconBuilder::with_id("snapx-tray")
                .icon(icon)
                .tooltip("SnapX — captura y anota tu pantalla")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "capture" => {
                        let _ = app.emit("snapx-global-capture", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::TrayIconEvent;
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        }
                    ) {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|win, event| {
            // Cerrar la ventana la esconde en la bandeja (la app sigue viva
            // para el atajo global), salvo que el ajuste diga lo contrario.
            if win.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    if commands::read_settings(&win.app_handle()).close_to_tray {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_hotkey,
            commands::get_settings,
            commands::set_settings,
            commands::get_monitors,
            commands::capture_virtual_desktop,
            commands::crop_capture,
            commands::save_png,
            commands::copy_image_to_clipboard,
            commands::set_resizable,
            commands::enter_overlay,
            commands::leave_overlay,
        ])
        .run(tauri::generate_context!())
        .expect("error mientras corria SnapX");
}

/// Muestra la ventana principal (desde la bandeja).
fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
