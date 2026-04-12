---
name: security-audit
description: >
  Run a security audit on an OpenShift namespace or cluster. Use when the user
  asks about security posture, RBAC, SCCs, network policies, or compliance.
metadata:
  author: kcns008
  version: "0.1.0"
---

# Security Audit

## Steps

1. **Check RBAC**
   ```bash
   oc get clusterrolebindings -o wide
   oc get rolebindings -n <namespace>
   oc auth can-i --list --as=system:serviceaccount:<ns>:<sa>
   ```

2. **Check Security Context Constraints**
   ```bash
   oc get scc
   oc describe scc restricted
   ```

3. **Check pod security**
   ```bash
   oc get pods -n <namespace> -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.securityContext}{"\n"}{end}'
   ```

4. **Check network policies**
   ```bash
   oc get networkpolicies -n <namespace>
   ```

5. **Check image vulnerabilities** (if Security Operator installed)
   ```bash
   oc get vulnerabilities -n <namespace>
   oc get imagevulnerabilities -n <namespace>
   ```

6. **Summarize findings**
   - Overly permissive RBAC
   - Pods running as root
   - Missing network policies
   - Known vulnerabilities
