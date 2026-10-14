fn main() {
    // Manifiesto propio (ver app.manifest): controles comunes v6 + PerMonitorV2.
    // Sin PerMonitorV2, Windows virtualiza el DPI en pantallas al 125/150 % y
    // el overlay/editor se descuadran.
    let attrs = tauri_build::Attributes::new().windows_attributes(
        tauri_build::WindowsAttributes::new().app_manifest(include_str!("app.manifest")),
    );
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
