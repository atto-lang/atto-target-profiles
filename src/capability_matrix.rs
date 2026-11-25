//! Rust-only structural capability registry validator: NOT guest certification.
use std::collections::BTreeSet;
use std::{env, fs, process};

const BACKENDS: [&str; 11] = ["llvm","wasm","rs","java","net","js","forge","cranelift","atto","hdl","realtime"];
const FEATURES: [&str; 10] = ["native_aot","wasm_codegen","wasm_host","jit","soft_real_time","hard_real_time",
    "tenant_vm","actor_runtime","zero_guest_gc","ownership_borrowing"];
const HEADER: &str = "backend\tfeature\tintent\toutcome\tsource_sha\tcompiler_sha\tartifact_sha256\tevidence_sha256\texecuted_cases\tguest_executed";
const INTENTS: [&str; 6] = ["PRIMARY","SECONDARY","HOST_DELEGATED","CONSTRAINED",
    "SECURITY_PROOF_REQUIRED","NOT_APPLICABLE"];
const OUTCOMES: [&str; 4] = ["PASSED","FAILED","UNSUPPORTED","NOT_EXECUTED"];
#[derive(Debug, PartialEq, Eq)]
struct Summary { count: usize, passed: usize, failed: usize, unsupported: usize, not_executed: usize }

fn sha(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn validate(input: &str) -> Result<Summary, String> {
    if input.len() > 262_144 || input.contains('\0') || input.contains('\r') {
        return Err("E_CAPABILITY: illegal file encoding or size".into());
    }
    let mut lines = input.lines();
    if lines.next() != Some(HEADER) { return Err("E_CAPABILITY: unsupported schema".into()); }
    let mut seen = BTreeSet::new();
    let mut result = Summary { count: 0, passed: 0, failed: 0, unsupported: 0, not_executed: 0 };
    for (index, line) in lines.enumerate() {
        let row: Vec<&str> = line.split('\t').collect();
        if row.len() != 10 || !BACKENDS.contains(&row[0]) ||
           !FEATURES.contains(&row[1]) || !INTENTS.contains(&row[2]) ||
           !OUTCOMES.contains(&row[3]) {
            return Err(format!("E_CAPABILITY: bad schema field at row {}", index + 2));
        }
        if !seen.insert((row[0],row[1])) {
            return Err(format!("E_CAPABILITY: duplicate backend/feature at row {}", index + 2));
        }
        let executions: u32 = row[8].parse().map_err(|_| "E_CAPABILITY: bad count")?;
        if executions > 100_000 || (row[9] != "true" && row[9] != "false") {
            return Err("E_CAPABILITY: out-of-range count or invalid guest flag".into());
        }
        match row[3] {
            "PASSED" | "FAILED" => {
                // Only the independent receipt verifier can certify real execution.
                if !sha(row[4],40) || !sha(row[5],40) ||
                   !sha(row[6],64) || !sha(row[7],64) ||
                   executions == 0 || row[9] != "true" {
                    return Err("E_CAPABILITY: execution claim without full metadata".into());
                }
                if row[3] == "PASSED" { result.passed += 1; }
                else { result.failed += 1; }
            }
            "UNSUPPORTED" | "NOT_EXECUTED" => {
                if row[4..8].iter().any(|x| *x != "-") || executions != 0 || row[9] != "false" {
                    return Err("E_CAPABILITY: baseline carries fake execution evidence".into());
                }
                if row[3] == "UNSUPPORTED" { result.unsupported += 1; }
                else { result.not_executed += 1; }
            }
            _ => unreachable!()
        }
        result.count += 1;
    }
    for b in BACKENDS { for f in FEATURES {
        if !seen.contains(&(b,f)) { return Err(format!("E_CAPABILITY: missing {b}/{f}")); }
    }}
    if result.count != BACKENDS.len() * FEATURES.len() {
        return Err("E_CAPABILITY: unexpected inventory length".into());
    }
    Ok(result)
}
fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.len() != 2 || !(args[0] == "--check" || args[0] == "--summary") {
        eprintln!("usage: capability_matrix --check|--summary inventory.tsv"); process::exit(2);
    }
    let data = fs::read_to_string(&args[1]).unwrap_or_else(|e| {
        eprintln!("E_CAPABILITY: cannot read inventory: {e}"); process::exit(1)
    });
    match validate(&data) {
        Ok(s) if args[0] == "--summary" =>
            println!("rows={} PASSED={} FAILED={} UNSUPPORTED={} NOT_EXECUTED={}",
                s.count,s.passed,s.failed,s.unsupported,s.not_executed),
        Ok(s) => println!("STRUCTURALLY_VALID_NOT_CERTIFIED: {} rows",s.count),
        Err(err) => { eprintln!("{err}"); process::exit(1); }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    const GOOD: &str = include_str!("../profiles/compiler-feature-capabilities-v1.tsv");
    fn mutate(before: &str, after: &str) -> String {
        assert!(GOOD.contains(before));
        GOOD.replacen(before,after,1)
    }
    #[test] fn complete_inventory_without_guest_claims() {
        assert_eq!(validate(GOOD).unwrap(),Summary{
            count:110,passed:0,failed:0,unsupported:0,not_executed:110});
    }
    #[test] fn duplicate_fails() {
        let row=GOOD.lines().nth(1).unwrap();
        assert!(validate(&format!("{GOOD}{row}\n")).is_err());
    }
    #[test] fn missing_row_fails() {
        let text=GOOD.lines().filter(|s|!s.starts_with("llvm\tnative_aot\t"))
            .collect::<Vec<_>>().join("\n");
        assert!(validate(&text).is_err());
    }
    #[test] fn unknown_backend_fails() {
        assert!(validate(&mutate("llvm\tnative_aot","unknown\tnative_aot")).is_err());
    }
    #[test] fn unknown_feature_fails() {
        assert!(validate(&mutate("llvm\tnative_aot","llvm\tunbounded")).is_err());
    }
    #[test] fn fake_pass_fails() {
        assert!(validate(&mutate("NOT_EXECUTED","PASSED")).is_err());
    }
    #[test] fn fake_count_fails() {
        assert!(validate(&mutate("\t0\tfalse","\t7\tfalse")).is_err());
    }
    #[test] fn fake_sha_fails() {
        assert!(validate(&mutate("\t-\t-\t-\t-\t0\tfalse",
            "\tabc\t-\t-\t-\t0\tfalse")).is_err());
    }
    #[test] fn wrong_columns_fail() {
        assert!(validate(&mutate("llvm\tnative_aot\tPRIMARY","llvm,native_aot,PRIMARY")).is_err());
    }
    #[test] fn wrong_status_casing_fails() {
        assert!(validate(&mutate("NOT_EXECUTED","not_executed")).is_err());
    }
    #[test] fn bad_boolean_fails() {
        assert!(validate(&mutate("\t0\tfalse","\t0\tTRUE")).is_err());
    }
    #[test] fn extra_header_fails() {
        assert!(validate(&format!("{HEADER}\n{GOOD}")).is_err());
    }
    #[test] fn extra_crlf_fails() {
        assert!(validate(&GOOD.replace("\n","\r\n")).is_err());
    }
    #[test] fn oversized_fails() {
        assert!(validate(&"x".repeat(262_145)).is_err());
    }
    #[test] fn synthetic_valid_claim_is_only_metadata_not_attestation() {
        let source=GOOD.lines().nth(1).unwrap();
        let mut f: Vec<String>=source.split('\t').map(|s|s.to_string()).collect();
        f[3]="PASSED".into(); f[4]="a".repeat(40); f[5]="b".repeat(40);
        f[6]="c".repeat(64); f[7]="d".repeat(64);
        f[8]="1".into(); f[9]="true".into();
        assert_eq!(validate(&GOOD.replacen(source,&f.join("\t"),1)).unwrap().passed,1);
    }
}