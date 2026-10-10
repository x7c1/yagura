// Layering rules for the workspace. Packages live at packages/<layer>/<name>.
const layer = (name) => `^packages/${name}/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-import-apps",
      comment:
        "Applications are entry points; nothing else may depend on them.",
      severity: "error",
      from: { pathNot: layer("apps") },
      to: { path: layer("apps") },
    },
    {
      name: "ui-only-libs",
      comment: "ui may import only libs from the workspace.",
      severity: "error",
      from: { path: layer("ui") },
      to: { path: "^packages/", pathNot: [layer("ui"), layer("libs")] },
    },
    {
      name: "gateway-only-domain-libs",
      comment: "gateway may import only domain and libs from the workspace.",
      severity: "error",
      from: { path: layer("gateway") },
      to: {
        path: "^packages/",
        pathNot: [layer("gateway"), layer("domain"), layer("libs")],
      },
    },
    {
      name: "domain-self-contained",
      comment: "domain imports nothing else from the workspace.",
      severity: "error",
      from: { path: layer("domain") },
      to: { path: "^packages/", pathNot: layer("domain") },
    },
    {
      name: "testing-only-domain-gateway-libs",
      comment: "testing may import only domain, gateway, and libs.",
      severity: "error",
      from: { path: layer("testing") },
      to: {
        path: "^packages/",
        pathNot: [
          layer("testing"),
          layer("domain"),
          layer("gateway"),
          layer("libs"),
        ],
      },
    },
    {
      name: "libs-self-contained",
      comment: "libs imports nothing else from the workspace.",
      severity: "error",
      from: { path: layer("libs") },
      to: { path: "^packages/", pathNot: layer("libs") },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: ["/dist/", "/node_modules/"] },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    preserveSymlinks: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".d.ts"],
    },
  },
};
