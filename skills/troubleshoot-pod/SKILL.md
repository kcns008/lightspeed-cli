---
name: troubleshoot-pod
description: >
  Troubleshoot a problematic pod in OpenShift. Use when a pod is CrashLooping,
  not ready, failing health checks, or showing errors. Walks through events,
  logs, describe, and common failure patterns.
metadata:
  author: kcns008
  version: "0.1.0"
---

# Troubleshoot Pod

## Steps

1. **Get pod status**
   ```
   oc_get: resource=pods -n <namespace>
   ```
   Identify the problematic pod. Note its status (CrashLoopBackOff, ImagePullBackOff, Pending, etc.)

2. **Describe the pod**
   ```
   oc_describe: resource=pod/<pod-name> -n <namespace>
   ```
   Look for: Events (bottom), State, Last State, Reason, Message

3. **Check events**
   ```
   bash: oc get events -n <namespace> --sort-by='.lastTimestamp' --field-selector involvedObject.name=<pod-name>
   ```

4. **Fetch logs**
   ```
   oc_logs: pod=<pod-name> -n <namespace> --tail=100
   ```
   If crashed previously, add `--previous` flag

5. **Diagnose based on patterns**

   | Status | Common Cause | Fix |
   |--------|-------------|-----|
   | CrashLoopBackOff | App crash on startup | Check logs for exception/exit code |
   | ImagePullBackOff | Wrong image/tag or no pull secret | Verify image name, check secrets |
   | Pending | No resources (CPU/memory) or PVC issues | Check node capacity, PVC status |
   | OOMKilled | Memory limit too low | Increase memory limit |
   | Error | Config/secrets missing | Check env vars, mounted configmaps |
   | Completed | Job/one-shot finished | Normal for Jobs |

6. **Summarize findings and suggest fix**
