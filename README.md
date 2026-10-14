# SnapX — captura y anota tu pantalla en Windows

SnapX es una app de escritorio para Windows con el flujo de trabajo que hizo
famoso a CleanShot X en macOS: capturas rápidas por área, anotación con
flechas, líneas, números, texto, resaltador y pixelado, y acciones de
copiar/guardar. Vive en segundo plano con icono en la bandeja y atajo global.

> Implementación propia desde cero (Tauri 2 + React + Rust). No contiene
> código, arte ni recursos de CleanShot X, que es marca de su propietario.

## Descarga e instalación

1. Ve a [**Releases**](../../releases) y descarga `SnapX_0.1.0_x64-setup.exe`.
2. Ejecútalo y sigue el instalador (no requiere permisos de administrador).
3. Abre SnapX desde el menú inicio.

Requisitos: Windows 10/11 de 64 bits con WebView2 (viene preinstalado).

## Uso

| Acción | Cómo |
|---|---|
| Capturar un área | Botón **Capturar área**, o atajo global **`Ctrl+Shift+X`** (funciona aunque la ventana esté minimizada; si está ocupado se usa `Ctrl+Alt+S` o `Shift+Alt+S` y la app te muestra cuál quedó) |
| Pantalla completa | Botón **Pantalla completa** (monitor principal) |
| Todos los monitores | Botón **Todos los monitores** |
| Seleccionar | Arrastra sobre el overlay oscuro · **doble clic** captura ese monitor · **Enter** confirma · **Esc** cancela |
| Anotar | `A` flecha · `L` línea · `R` rectángulo · `E` elipse · `T` texto · `N` número automático · `H` resaltador · `B` pixelar · `Ctrl+Z` deshacer |
| Terminar | **Listo** (copia y cierra, `Enter`) · **Copiar** (`Ctrl+C`) · **Guardar…** (`Ctrl+S`) · **Descartar** (`Esc`) |

La ventana principal puede moverse (arrástrala), minimizarse y cerrarse a la
bandeja: clic en el icono junto al reloj para abrirla, capturarla o salir.
En **ajustes** (ventana principal) puedes activar **iniciar con Windows**
(arranca minimizada en segundo plano) y **cerrar a la bandeja**.

## Desarrollo

Requisitos: Node.js 22+, Rust estable (toolchain MSVC) y las
*VS Build Tools* con el workload de C++.

```powershell
npm install
npm run tauri dev      # modo desarrollo
npm run tauri build    # instalador en src-tauri/target/release/bundle/nsis/
```

### Cómo funciona por dentro

- **Captura** (`src-tauri/src/commands.rs`): la crate `screenshots`
  captura cada monitor por DXGI y se cosen en una sola imagen del escritorio
  virtual; el DPI real se lee con `GetDpiForSystem` y el manifiesto incrusta
  `PerMonitorV2` para que el overlay cuadre en pantallas al 125/150 %.
- **Overlay**: ventana transparente a pantalla completa sobre el escritorio en
  vivo (estilo Win+Shift+S); la ventana propia se estaciona fuera de pantalla
  para no salir en la foto.
- **Recorte**: lo hace Rust sobre el PNG (`crop_capture`) y devuelve un data
  URL — así el canvas nunca se contamina por origen cruzado.
- **Editor**: canvas con lista de formas (deshacer limpio), pixelado por
  muestreo de la imagen original, copiar al portapapeles y guardar PNG.
- **Segundo plano**: icono de bandeja con menú, atajo global
  (`tauri-plugin-global-shortcut`) e inicio con Windows
  (`tauri-plugin-autostart`, arranca con `--minimized`).

## Estructura

```
snapx/
├── src/                    # React + TypeScript
│   ├── App.tsx             # vistas: home / captura / editor
│   ├── components/         # HomeView, CaptureView, AnnotateView, Toolbar
│   └── lib/                # tipos y llamadas a comandos Tauri
├── src-tauri/              # Rust
│   ├── src/commands.rs     # captura, recorte, overlay, ajustes
│   ├── src/lib.rs          # bandeja, atajo global, autostart
│   ├── app.manifest        # PerMonitorV2 + controles comunes v6
│   └── capabilities/       # permisos del frontend
├── scripts/                # icono, captura de pantalla (utilidades)
└── assets/                 # icono fuente
```

## Licencia

MIT — ver [LICENSE](LICENSE).
