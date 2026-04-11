---
name: deploy-app
description: >
  Guide deploying an application to OpenShift. Use when the user wants to deploy
  a new app, create a deployment, set up services and routes. Covers S2I, Docker,
  Helm, and raw YAML approaches.
metadata:
  author: kcns008
  version: "0.1.0"
---

# Deploy Application

## Steps

1. **Ask about the app**
   - What's the source? (Git repo, container image, local code)
   - What's the runtime? (Java, Node.js, Python, Go, etc.)
   - Which namespace/project?

2. **Choose deployment method**

   | Method | Best For |
   |--------|----------|
   | `oc new-app` | Quick deploy from source or image |
   | `oc new-build` + deploy | Custom build pipeline |
   | Helm chart | Complex apps with config |
   | Raw YAML/Kustomize | Full control |

3. **Deploy**
   ```bash
   # From Git (S2I)
   oc new-app https://github.com/user/repo.git --name=myapp -n myns

   # From image
   oc new-app myimage:tag --name=myapp -n myns

   # Expose
   oc expose svc/myapp
   ```

4. **Verify**
   ```
   oc_get: resource=pods -n <namespace>
   oc_get: resource=svc -n <namespace>
   oc_get: resource=route -n <namespace>
   ```

5. **Set up health checks** (if not auto-detected)
   ```bash
   oc set probe dc/myapp --readiness --get-url=http://:8080/health
   oc set probe dc/myapp --liveness --get-url=http://:8080/health
   ```

6. **Configure resources**
   ```bash
   oc set resources dc/myapp --requests=cpu=100m,memory=256Mi --limits=cpu=500m,memory=512Mi
   ```
