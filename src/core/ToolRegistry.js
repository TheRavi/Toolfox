const toolMetaModules = import.meta.glob('../tools/*/toolMeta.js');
const toolComponentModules = import.meta.glob('../tools/*/*.jsx');

let toolCachePromise;

function toPascalCase(toolDirectoryName) {
  return toolDirectoryName
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

function findComponentLoader(metaPath) {
  const directory = metaPath.slice(0, metaPath.lastIndexOf('/'));
  const toolDirectoryName = directory.split('/').pop() ?? '';
  const expectedComponentPath = `${directory}/${toPascalCase(toolDirectoryName)}.jsx`;

  if (toolComponentModules[expectedComponentPath]) {
    return toolComponentModules[expectedComponentPath];
  }

  const indexComponentPath = `${directory}/index.jsx`;

  if (toolComponentModules[indexComponentPath]) {
    return toolComponentModules[indexComponentPath];
  }

  const componentEntry = Object.entries(toolComponentModules).find(([path]) =>
    path.startsWith(`${directory}/`),
  );

  if (!componentEntry) {
    return null;
  }

  return componentEntry[1];
}

async function loadToolDefinitions() {
  // Registry entries are assembled from tool folders so new tools can be added
  // by dropping a `toolMeta.js` + component file in `src/tools/<tool-name>/`.
  const entries = await Promise.all(
    Object.entries(toolMetaModules).map(async ([metaPath, loadMeta]) => {
      const metaModule = await loadMeta();
      const componentLoader = findComponentLoader(metaPath);

      if (!metaModule?.toolMeta || !componentLoader) {
        return null;
      }

      return {
        ...metaModule.toolMeta,
        loadComponent: async () => {
          const componentModule = await componentLoader();
          return componentModule.default;
        },
      };
    }),
  );

  return entries.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export function getRegisteredTools() {
  if (!toolCachePromise) {
    toolCachePromise = loadToolDefinitions();
  }

  return toolCachePromise;
}

export async function getToolById(toolId) {
  const tools = await getRegisteredTools();
  return tools.find((tool) => tool.id === toolId) ?? null;
}
