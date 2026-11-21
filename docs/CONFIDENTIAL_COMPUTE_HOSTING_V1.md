# Confidential compute target/hosting constraints v1

**Target only; hardware support NOT EXECUTED.** `profiles/server.json` and
`profiles/carrier-linux.json` describe ordinary host resource upper bounds.
Neither can silently grant or report hardware-TEE protection.

The separate `confidential-compute/v1.json` records the opt-in deployment
requirements and the lack of verified providers. It must not be converted
into a guest-visible capability or allow untrusted actors to upgrade
themselves. Supported CPU model alone is insufficient; deployment must
verify actual AMD SEV-SNP / Intel TDX endorsements, complete report
signature and measurement binding, TCB and debug policy, fresh challenge,
encrypted attested channel for secret release and exact artifact identity.

Protecting the entire host OS process with a confidential VM does **not**
separate mutually untrusted TenantVMs *inside* that process. Tenant memory
and code-producer validation, sockets, capabilities, quotas and termination
remain mandatory independent controls.

Verification scope: this contract and tests are SOURCE_FREE_REFERENCE, not
hardware execution. Backend-specific proposals are
[Java #218](https://github.com/atto-lang/atto-source.java/pull/218) and
[LLVM #294](https://github.com/atto-lang/atto-source.llvm/pull/294).
Normative hosting policy is in
[atto-spec](https://github.com/atto-lang/atto-spec/blob/main/language/confidential-computing-v1.md)
(proposed draft), with negative vectors in atto-platform-conformance.
