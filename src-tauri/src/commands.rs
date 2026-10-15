use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{Rgba, RgbaImage};
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{LogicalPosition, LogicalSize, Manager};

/// Bitacora temporal de diagnostico: cada comando deja rastro en
/// %TEMP%\snapx-debug.log (los eprintln no se ven en release).
pub fn dbg_log(step: &str) {
    use std::io::Write;
    let mut path = std::env::temp_dir();
    path.push("snapx-debug.log");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(f, "{step}");
    }
}

/// Ajustes persistidos de la aplicacion.
#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub autostart: bool,
    pub close_to_tray: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            autostart: false,
            close_to_tray: true,
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = std::fs::create_dir_all(&dir);
    dir.join("snapx-settings.json")
}

pub fn read_settings(app: &tauri::AppHandle) -> AppSettings {
    std::fs::read_to_string(settings_path(app))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Lee los ajustes (inicio con Windows, cerrar a bandeja).
#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(read_settings(&app))
}

/// Guarda los ajustes y aplica el autostart en el sistema.
#[tauri::command]
pub async fn set_settings(
    app: tauri::AppHandle,
    autostart: bool,
    close_to_tray: bool,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app.autolaunch();
        let enabled = manager.is_enabled().unwrap_or(false);
        if autostart && !enabled {
            manager
                .enable()
                .map_err(|e| format!("no se pudo activar inicio con Windows: {e}"))?;
        } else if !autostart && enabled {
            manager
                .disable()
                .map_err(|e| format!("no se pudo desactivar inicio con Windows: {e}"))?;
        }
    }
    let json = serde_json::to_string_pretty(&AppSettings {
        autostart,
        close_to_tray,
    })
    .map_err(|e| e.to_string())?;
    std::fs::write(settings_path(&app), json)
        .map_err(|e| format!("no se pudo guardar ajustes: {e}"))?;
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct MonitorInfo {
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f32,
    pub is_primary: bool,
}

#[derive(Serialize)]
pub struct VirtualDesktop {
    /// ruta local del PNG cosido (todos los monitores)
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub min_x: i32,
    pub min_y: i32,
    /// escala (pixeles fisicos por pixel logico) del monitor primario
    pub scale: f32,
    pub monitors: Vec<MonitorInfo>,
}

fn gather_screens() -> anyhow::Result<(Vec<MonitorInfo>, Vec<Screen>, f32)> {
    let screens = Screen::all()?;
    if screens.is_empty() {
        anyhow::bail!("no se detectaron pantallas");
    }
    // El DPI real del sistema (la libreria de captura suele reportar 1.0 en Windows
    // aunque la pantalla este al 125/150 %, y eso descuadra el overlay).
    let system_scale = system_scale();
    let mut monitors = Vec::with_capacity(screens.len());
    for (i, s) in screens.iter().enumerate() {
        let d = &s.display_info;
        let scale = if d.is_primary { system_scale } else { d.scale_factor };
        monitors.push(MonitorInfo {
            name: format!("Monitor {}", i + 1),
            x: d.x,
            y: d.y,
            width: d.width,
            height: d.height,
            scale,
            is_primary: d.is_primary,
        });
    }
    Ok((monitors, screens, system_scale))
}

/// Escala del sistema (DPI/96) leida directamente de Win32.
fn system_scale() -> f32 {
    #[cfg(target_os = "windows")]
    {
        // SAFETY: GetDpiForSystem no toma parametros ni toca memoria ajena.
        let dpi = unsafe { windows::Win32::UI::HiDpi::GetDpiForSystem() };
        if dpi == 0 {
            1.0
        } else {
            dpi as f32 / 96.0
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        1.0
    }
}

/// Lista de monitores con su geometria fisica.
#[tauri::command]
pub async fn get_monitors() -> Result<Vec<MonitorInfo>, String> {
    dbg_log("get_monitors");
    let (monitors, _, _) = gather_screens().map_err(|e| e.to_string())?;
    Ok(monitors)
}

/// Captura todos los monitores y los cose en una unica imagen del escritorio virtual.
#[tauri::command]
pub async fn capture_virtual_desktop() -> Result<VirtualDesktop, String> {
    dbg_log("capture_virtual_desktop: inicio");
    let (monitors, screens, primary_scale) = gather_screens().map_err(|e| e.to_string())?;

    let min_x = screens.iter().map(|s| s.display_info.x).min().unwrap_or(0);
    let min_y = screens.iter().map(|s| s.display_info.y).min().unwrap_or(0);
    let max_x = screens
        .iter()
        .map(|s| s.display_info.x + s.display_info.width as i32)
        .max()
        .unwrap_or(0);
    let max_y = screens
        .iter()
        .map(|s| s.display_info.y + s.display_info.height as i32)
        .max()
        .unwrap_or(0);
    let total_w = (max_x - min_x).max(1) as u32;
    let total_h = (max_y - min_y).max(1) as u32;

    let mut canvas: RgbaImage =
        RgbaImage::from_pixel(total_w, total_h, Rgba([12, 15, 25, 255]));

    for screen in &screens {
        let d = &screen.display_info;
        match screen.capture() {
            Ok(img) => {
                let ox = (d.x - min_x) as i64;
                let oy = (d.y - min_y) as i64;
                image::imageops::replace(&mut canvas, &img, ox, oy);
            }
            Err(e) => {
                eprintln!("snapx: no se pudo capturar la pantalla id {}: {e}", d.id);
            }
        }
    }

    let mut path = PathBuf::from(std::env::temp_dir());
    path.push("snapx-capture.png");
    canvas.save(&path).map_err(|e| format!("no se pudo guardar la captura: {e}"))?;
    dbg_log(&format!(
        "capture_virtual_desktop: ok {}x{} min={} scale={}",
        total_w, total_h, min_x, primary_scale
    ));

    Ok(VirtualDesktop {
        path: path.to_string_lossy().to_string(),
        width: total_w,
        height: total_h,
        min_x,
        min_y,
        scale: primary_scale,
        monitors,
    })
}

/// Decodifica un data URL (`data:image/png;base64,....`) a bytes planos.
/// Acepta tambien base64 pelado por si el frontend lo manda asi.
fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let b64 = match data_url.split_once(',') {
        Some((_, b64)) => b64,
        None => data_url,
    };
    let b64 = b64.trim();
    STANDARD
        .decode(b64)
        .map_err(|e| format!("base64 invalido: {e}"))
}

/// Escribe un data URL PNG a una ruta del disco.
#[tauri::command]
pub async fn save_png(path: String, data_url: String) -> Result<(), String> {
    let bytes = decode_data_url(&data_url)?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&path, &bytes).map_err(|e| format!("no se pudo escribir {path}: {e}"))?;
    dbg_log(&format!("save_png: ok {path} ({} bytes)", bytes.len()));
    Ok(())
}

/// Pone la imagen editada en el portapapeles de Windows.
///
/// Va por la API nativa (`arboard` -> CF_DIB) en lugar del plugin de Tauri:
/// el plugin falla en silencio con capturas grandes y devuelve errores poco
/// descriptivos, aqui cada fallo baja al frontend con un mensaje util.
#[tauri::command]
pub async fn copy_image_to_clipboard(data_url: String) -> Result<(), String> {
    use arboard::{Clipboard, ImageData};

    dbg_log("copy_image_to_clipboard: inicio");
    let bytes = decode_data_url(&data_url)?;
    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("no se pudo decodificar el PNG: {e}"))?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    if w == 0 || h == 0 {
        return Err("la imagen a copiar esta vacia".to_string());
    }
    if w > i32::MAX as u32 || h > i32::MAX as u32 {
        return Err("la imagen a copiar es demasiado grande".to_string());
    }

    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("no se pudo abrir el portapapeles: {e}"))?;
    clipboard
        .set_image(ImageData {
            width: w as usize,
            height: h as usize,
            bytes: rgba.into_raw().into(),
        })
        .map_err(|e| format!("no se pudo escribir la imagen en el portapapeles: {e}"))?;

    dbg_log(&format!("copy_image_to_clipboard: ok {w}x{h}"));
    Ok(())
}

/// Recorta un rectangulo (coordenadas fisicas) del PNG cosido y devuelve un
/// data URL PNG. El recorte se hace en Rust para no depender del webview:
/// las imagenes servidas por el protocolo asset son cross-origin y
/// contaminarian (taint) el canvas impidiendo exportarlo.
#[tauri::command]
pub async fn crop_capture(path: String, x: u32, y: u32, w: u32, h: u32) -> Result<String, String> {
    use image::GenericImageView;
    use std::io::Cursor;

    dbg_log(&format!("crop_capture: inicio x={x} y={y} w={w} h={h}"));
    let img = image::open(&path).map_err(|e| format!("no se pudo abrir la captura: {e}"))?;
    let (bw, bh) = img.dimensions();
    if bw == 0 || bh == 0 {
        return Err("la captura esta vacia".to_string());
    }
    let x = x.min(bw - 1);
    let y = y.min(bh - 1);
    let w = w.clamp(1, bw - x);
    let h = h.clamp(1, bh - y);
    let cropped = image::imageops::crop_imm(&img, x, y, w, h).to_image();

    let mut buf = Cursor::new(Vec::new());
    cropped
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("no se pudo codificar el recorte: {e}"))?;
    dbg_log("crop_capture: ok");
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(buf.into_inner())
    ))
}

/// Activa o desactiva el redimensionado de la ventana.
///
/// El editor de capturas se beneficia mucho de poder agrandarse (sobre todo
/// en pantallas 4K), pero la ventana de inicio debe quedar fija, asi que el
/// flag se cambia desde el frontend al entrar y al salir del editor.
#[tauri::command]
pub async fn set_resizable(app: tauri::AppHandle, resizable: bool) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "ventana principal no encontrada".to_string())?;
    win.set_resizable(resizable).map_err(|e| e.to_string())
}

/// Pone la ventana principal en modo overlay transparente a pantalla completa.
#[tauri::command]
pub async fn enter_overlay(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "ventana principal no encontrada".to_string())?;
    dbg_log(&format!("enter_overlay: x={x} y={y} w={w} h={h}"));
    win.set_always_on_top(true).map_err(|e| e.to_string())?;
    dbg_log("enter_overlay: always_on_top ok");
    // Imprescindible: si la app estaba cerrada en la bandeja (ventana oculta),
    // el overlay se colocaria en pantalla pero no se veria nada.
    win.show().map_err(|e| e.to_string())?;
    win.set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    dbg_log("enter_overlay: position ok");
    win.set_size(LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    dbg_log("enter_overlay: size ok");
    win.unminimize().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    dbg_log("enter_overlay: ok");
    Ok(())
}

/// Devuelve la ventana a su tamano normal, centrada en el monitor principal.
/// Tambien le quita el "siempre encima", la muestra y la restaura por si
/// estaba minimizada: solo el overlay vive en primer plano.
#[tauri::command]
pub async fn leave_overlay(app: tauri::AppHandle, w: u32, h: u32) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "ventana principal no encontrada".to_string())?;
    win.set_always_on_top(false).map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    win.unminimize().map_err(|e| e.to_string())?;
    dbg_log(&format!("leave_overlay: w={w} h={h}"));
    if let Some(mon) = win.current_monitor().map_err(|e| e.to_string())? {
        let mw = mon.size().width as f64 / mon.scale_factor();
        let mh = mon.size().height as f64 / mon.scale_factor();
        win.set_size(LogicalSize::new(w, h))
            .map_err(|e| e.to_string())?;
        win.set_position(LogicalPosition::new(
            ((mw as u32).saturating_sub(w) / 2) as i32,
            ((mh as u32).saturating_sub(h) / 2) as i32,
        ))
        .map_err(|e| e.to_string())?;
    }
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn png_data_url(w: u32, h: u32) -> String {
        let mut img = RgbaImage::new(w, h);
        for (x, y, px) in img.enumerate_pixels_mut() {
            *px = Rgba([(x % 256) as u8, (y % 256) as u8, 128, 255]);
        }
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
        format!("data:image/png;base64,{}", STANDARD.encode(buf.into_inner()))
    }

    #[test]
    fn decodifica_data_urls_y_base64_pelado() {
        let url = png_data_url(4, 3);
        let bytes = decode_data_url(&url).unwrap();
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");

        let pelado = url.split_once(',').unwrap().1;
        assert_eq!(decode_data_url(pelado).unwrap(), bytes);
        assert!(decode_data_url("no-es-base64-!!!").is_err());
    }

    /// El fallo que reportaba la app: la imagen editada no llegaba al portapapeles.
    /// Esto ejercita el comando nativo real contra el portapapeles de Windows.
    #[test]
    fn copia_la_imagen_al_portapapeles() {
        use arboard::Clipboard;

        let (w, h) = (24u32, 16u32);
        tauri::async_runtime::block_on(copy_image_to_clipboard(png_data_url(w, h)))
            .expect("deberia escribir en el portapapeles");

        let mut cb = Clipboard::new().expect("abrir portapapeles");
        let leido = cb.get_image().expect("leer imagen del portapapeles");
        assert_eq!((leido.width, leido.height), (w as usize, h as usize));
        assert_eq!(leido.bytes.len(), (w * h * 4) as usize);
    }

    #[test]
    fn rechaza_imagenes_que_no_se_pueden_decodificar() {
        let r = tauri::async_runtime::block_on(copy_image_to_clipboard(
            "data:image/png;base64,QUJD".into(),
        ));
        assert!(r.is_err());
    }
}
