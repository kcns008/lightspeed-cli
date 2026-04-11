---
name: cluster-health
description: >
  Check the overall health of an OpenShift cluster. Use when the user asks about
  cluster status, node health, capacity, or wants a quick health overview.
metadata:
  author: kcns008
  version: "0.1.0"
---

# Cluster Health Check

## Steps

1. **Node status**
   ```
   cluster_status: (no args for full cluster)
   ```

2. **Check for warnings**
   ```bash
   oc get events -A --field-selector type=Warning --sort-by='.lastTimestamp'
   ```

3. **Check cluster operators** (OpenShift only)
   ```bash
   oc get clusteroperators
   oc get co -o jsonpath='{range .items[?(@.status.conditions[?(@.type=="Available")].status!="True")]}{.metadata.name}{"\n"}{end}'
   ```

4. **Check alerts** (if monitoring stack available)
   ```bash
   oc get alerts -n openshift-monitoring
   ```

5. **Resource capacity**
   ```bash
   oc top nodes
   oc get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded
   ```

6. **Summarize health**
   - 🟢 Healthy — all nodes ready, no critical alerts
   - 🟡 Warning — degraded operators or resource pressure
   - 🔴 Critical — nodes down, pods failing, alerts firing
