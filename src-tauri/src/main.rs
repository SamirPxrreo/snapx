// oculta la consola en builds release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    snapx_lib::run()
}
