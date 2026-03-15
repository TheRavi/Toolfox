use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};

// ── helpers ──────────────────────────────────────────────────────────────────

fn home_dir() -> PathBuf {
  env::var("HOME")
    .or_else(|_| env::var("USERPROFILE"))
    .map(PathBuf::from)
    .unwrap_or_else(|_| env::temp_dir())
}

fn cfr_jar_path() -> PathBuf {
  home_dir().join(".toolfox").join("cfr.jar")
}

/// Allow only characters that are safe in a file name.
fn sanitize_filename(name: &str) -> String {
  name.chars()
    .filter(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | '$'))
    .collect()
}

// ── data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DecompileOutput {
  pub source: String,
  /// Which engine produced the output: "cfr", "javap", or "js".
  pub engine: String,
  /// True when the output is full reconstructed Java source (CFR/Procyon);
  /// false when it is a bytecode disassembly (javap).
  pub has_full_source: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DecompilerStatus {
  pub java_available: bool,
  pub javap_available: bool,
  pub cfr_available: bool,
  /// First line of `java -version` stderr (e.g. "openjdk version \"21.0.1\"").
  pub java_version: Option<String>,
}

// ── tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn check_decompiler_status() -> Result<DecompilerStatus, String> {
  // `java -version` writes to stderr on most JDKs; running at all means it's present.
  let java_result = Command::new("java").arg("-version").output();
  let java_available = java_result.is_ok();

  let javap_available = Command::new("javap")
    .arg("-version")
    .output()
    .is_ok();

  let cfr_available = cfr_jar_path().exists();

  let java_version = java_result.ok().and_then(|o| {
    // Version line is on stderr for most JDKs.
    let s = String::from_utf8_lossy(&o.stderr);
    let line = s.lines().next().unwrap_or("").trim().to_string();
    if line.is_empty() {
      let s2 = String::from_utf8_lossy(&o.stdout);
      let l2 = s2.lines().next().unwrap_or("").trim().to_string();
      if l2.is_empty() { None } else { Some(l2) }
    } else {
      Some(line)
    }
  });

  Ok(DecompilerStatus {
    java_available,
    javap_available,
    cfr_available,
    java_version,
  })
}

#[tauri::command]
async fn decompile_class(bytes: Vec<u8>, file_name: String) -> Result<DecompileOutput, String> {
  let safe_name = sanitize_filename(&file_name);
  if safe_name.is_empty() || !safe_name.ends_with(".class") {
    return Err("File name must be a valid .class file name.".to_string());
  }

  let temp_dir = env::temp_dir().join("toolfox-decompile");
  fs::create_dir_all(&temp_dir)
    .map_err(|e| format!("Cannot create temp directory: {e}"))?;

  let class_path = temp_dir.join(&safe_name);
  fs::write(&class_path, &bytes)
    .map_err(|e| format!("Cannot write temp file: {e}"))?;

  let class_path_str = class_path.to_string_lossy().to_string();

  // ── 1. Try CFR (full Java source) ────────────────────────────────────────
  let cfr = cfr_jar_path();
  if cfr.exists() {
    let cfr_str = cfr.to_string_lossy().to_string();
    let result = Command::new("java")
      .args(["-jar", &cfr_str, &class_path_str])
      .output();

    if let Ok(output) = result {
      let _ = fs::remove_file(&class_path);
      if output.status.success() {
        let source = String::from_utf8_lossy(&output.stdout).to_string();
        return Ok(DecompileOutput {
          source,
          engine: "CFR".to_string(),
          has_full_source: true,
        });
      }
      // CFR itself may print errors to stdout; surface them.
      let err_out = String::from_utf8_lossy(&output.stdout);
      let err_err = String::from_utf8_lossy(&output.stderr);
      if !err_out.is_empty() || !err_err.is_empty() {
        return Err(format!(
          "CFR failed.\nstdout: {err_out}\nstderr: {err_err}"
        ));
      }
    }
  }

  // ── 2. Fall back to javap (bytecode disassembly) ──────────────────────────
  let javap_result = Command::new("javap")
    .args(["-p", "-c", &class_path_str])
    .output();

  let _ = fs::remove_file(&class_path);

  match javap_result {
    Ok(output) if output.status.success() => Ok(DecompileOutput {
      source: String::from_utf8_lossy(&output.stdout).to_string(),
      engine: "javap".to_string(),
      has_full_source: false,
    }),
    Ok(output) => {
      let stderr = String::from_utf8_lossy(&output.stderr);
      Err(format!("javap failed: {stderr}"))
    }
    Err(e) => Err(format!(
      "No decompiler found ({e}). Install a JDK or download CFR."
    )),
  }
}

/// Download the CFR decompiler JAR (~2.5 MB) from its GitHub releases page
/// and cache it at `~/.toolfox/cfr.jar`.
#[tauri::command]
async fn download_cfr() -> Result<String, String> {
  let dir = home_dir().join(".toolfox");
  fs::create_dir_all(&dir)
    .map_err(|e| format!("Cannot create ~/.toolfox: {e}"))?;

  let jar_path = dir.join("cfr.jar");
  let url =
    "https://github.com/leibnitz27/cfr/releases/download/0.152/cfr-0.152.jar";

  let response = reqwest::get(url)
    .await
    .map_err(|e| format!("Download failed: {e}"))?;

  if !response.status().is_success() {
    return Err(format!("Download failed: HTTP {}", response.status()));
  }

  let jar_bytes = response
    .bytes()
    .await
    .map_err(|e| format!("Failed to read response: {e}"))?;

  fs::write(&jar_path, &jar_bytes)
    .map_err(|e| format!("Failed to save CFR JAR: {e}"))?;

  Ok(jar_path.to_string_lossy().to_string())
}

// ── entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      check_decompiler_status,
      decompile_class,
      download_cfr,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
