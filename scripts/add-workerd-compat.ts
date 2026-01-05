/* This file is a part of @mdn/browser-compat-data
 * See LICENSE file for more information. */

/**
 * This script adds workerd compatibility data to BCD from mdn-bcd-collector test results.
 *
 * Usage:
 *   npx tsx scripts/add-workerd-compat.ts [path-to-workerd.json]
 *
 * If no path is provided, it defaults to scripts/workerd.json
 *
 * The input file should be mdn-bcd-collector output with the structure:
 * {
 *   "results": {
 *     ".": [
 *       { "name": "api.AbortController", "result": true },
 *       { "name": "javascript.builtins.Object", "result": false },
 *       ...
 *     ]
 *   }
 * }
 */

import fs from 'node:fs/promises';
import path from 'node:path';

interface TestResult {
  name: string;
  result: boolean | null;
  info?: {
    code: string;
    exposure: string;
  };
  message?: string;
}

interface WorkerdData {
  __version: string;
  results: {
    '.': TestResult[];
  };
  userAgent: string;
}

interface SupportStatement {
  version_added: string | false;
  version_removed?: string;
  prefix?: string;
  alternative_name?: string;
  flags?: unknown[];
  partial_implementation?: true;
  notes?: string | string[];
}

type SupportBlock = Record<
  string,
  SupportStatement | SupportStatement[] | 'mirror'
>;

interface CompatStatement {
  description?: string;
  mdn_url?: string;
  spec_url?: string | string[];
  tags?: string[];
  support: SupportBlock;
  status?: {
    experimental: boolean;
    standard_track: boolean;
    deprecated: boolean;
  };
}

interface BcdNode {
  __compat?: CompatStatement;
  [key: string]: BcdNode | CompatStatement | undefined;
}

/**
 * Reorder support block keys alphabetically
 * @param support - The support block to reorder
 * @returns The reordered support block
 */
const orderSupportBlock = (support: SupportBlock): SupportBlock => {
  const ordered: SupportBlock = {};
  const keys = Object.keys(support).sort();
  for (const key of keys) {
    ordered[key] = support[key];
  }
  return ordered;
};

/**
 * Convert a feature path like "api.AbortController" to a file path and key path.
 * @param featurePath - The dot-separated feature path (e.g., "api.AbortController")
 * @returns Object with filePath and keyPath, or null if path can't be mapped
 */
const featurePathToFile = (
  featurePath: string,
): {
  filePath: string;
  keyPath: string[];
} | null => {
  const parts = featurePath.split('.');

  if (parts.length < 2) {
    return null;
  }

  const category = parts[0];

  // Handle different category structures
  if (category === 'api') {
    // api.AbortController -> api/AbortController.json
    // api.AbortController.abort -> api/AbortController.json with key path
    const mainFeature = parts[1];
    return {
      filePath: `api/${mainFeature}.json`,
      keyPath: parts,
    };
  } else if (category === 'javascript') {
    // javascript.builtins.Object -> javascript/builtins/Object.json
    if (parts[1] === 'builtins' && parts.length >= 3) {
      const mainFeature = parts[2];
      return {
        filePath: `javascript/builtins/${mainFeature}.json`,
        keyPath: parts,
      };
    } else if (parts[1] === 'operators' && parts.length >= 3) {
      const mainFeature = parts[2];
      return {
        filePath: `javascript/operators/${mainFeature}.json`,
        keyPath: parts,
      };
    } else if (parts[1] === 'statements' && parts.length >= 3) {
      const mainFeature = parts[2];
      return {
        filePath: `javascript/statements/${mainFeature}.json`,
        keyPath: parts,
      };
    } else if (parts[1] === 'classes' && parts.length >= 3) {
      const mainFeature = parts[2];
      return {
        filePath: `javascript/classes/${mainFeature}.json`,
        keyPath: parts,
      };
    } else if (parts[1] === 'functions' && parts.length >= 3) {
      const mainFeature = parts[2];
      return {
        filePath: `javascript/functions/${mainFeature}.json`,
        keyPath: parts,
      };
    } else if (parts[1] === 'regular_expressions' && parts.length >= 3) {
      const mainFeature = parts[2];
      return {
        filePath: `javascript/regular_expressions/${mainFeature}.json`,
        keyPath: parts,
      };
    }
    // Fallback for other javascript subcategories
    if (parts.length >= 3) {
      return {
        filePath: `javascript/${parts[1]}/${parts[2]}.json`,
        keyPath: parts,
      };
    }
  } else if (category === 'css') {
    // css.properties.color -> css/properties/color.json
    if (parts.length >= 3) {
      return {
        filePath: `css/${parts[1]}/${parts[2]}.json`,
        keyPath: parts,
      };
    }
  } else if (category === 'html') {
    // html.elements.div -> html/elements/div.json
    if (parts.length >= 3) {
      return {
        filePath: `html/${parts[1]}/${parts[2]}.json`,
        keyPath: parts,
      };
    }
  } else if (category === 'webassembly') {
    // webassembly.api.Module -> webassembly/api/Module.json
    if (parts.length >= 3) {
      return {
        filePath: `webassembly/${parts[1]}/${parts[2]}.json`,
        keyPath: parts,
      };
    }
  } else if (category === 'webextensions') {
    // Skip webextensions - workerd doesn't support them
    return null;
  }

  return null;
};

/**
 * Navigate to a nested object path, returning the target object and key
 * @param obj - The BCD node to navigate
 * @param keyPath - Array of keys representing the path to navigate
 * @returns Object with parent node and final key, or null if path doesn't exist
 */
const navigateToPath = (
  obj: BcdNode,
  keyPath: string[],
): { parent: BcdNode; key: string } | null => {
  let current: BcdNode = obj;

  // Navigate to parent of the target
  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i];
    if (current[key] === undefined) {
      return null;
    }
    current = current[key] as BcdNode;
  }

  return {
    parent: current,
    key: keyPath[keyPath.length - 1],
  };
};

/**
 * Add workerd support to a compat statement
 * @param compat - The compat statement to modify
 * @param supported - Whether the feature is supported in workerd
 */
const addWorkerdSupport = (
  compat: CompatStatement,
  supported: boolean,
): void => {
  const workerdSupport: SupportStatement = {
    version_added: supported ? '1.20221108.0' : false,
  };

  compat.support.workerd = workerdSupport;
  compat.support = orderSupportBlock(compat.support);
};

/**
 * Main function to process workerd compatibility data and update BCD files
 */
const main = async (): Promise<void> => {
  const inputPath = process.argv[2] || 'scripts/workerd.json';
  const rootDir = process.cwd();

  console.log(`Reading workerd data from: ${inputPath}`);

  // Read workerd test results
  const workerdDataRaw = await fs.readFile(
    path.join(rootDir, inputPath),
    'utf-8',
  );
  const workerdData: WorkerdData = JSON.parse(workerdDataRaw);

  console.log(`Found ${workerdData.results['.'].length} test results`);
  console.log(`User agent: ${workerdData.userAgent}`);

  // Track statistics
  const stats = {
    supported: 0,
    unsupported: 0,
    skippedNull: 0,
    skippedNoFile: 0,
    skippedNoFeature: 0,
    filesModified: new Set<string>(),
  };

  // Group results by file
  const fileUpdates = new Map<
    string,
    { keyPath: string[]; supported: boolean }[]
  >();

  for (const result of workerdData.results['.']) {
    // Skip null results (inconclusive tests)
    if (result.result === null) {
      stats.skippedNull++;
      continue;
    }

    const pathInfo = featurePathToFile(result.name);
    if (!pathInfo) {
      stats.skippedNoFile++;
      continue;
    }

    const { filePath, keyPath } = pathInfo;

    if (!fileUpdates.has(filePath)) {
      fileUpdates.set(filePath, []);
    }

    const updates = fileUpdates.get(filePath);
    if (updates) {
      updates.push({
        keyPath,
        supported: result.result,
      });
    }
  }

  console.log(`\nProcessing ${fileUpdates.size} files...`);

  // Process each file
  for (const [filePath, updates] of fileUpdates) {
    const fullPath = path.join(rootDir, filePath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      // File doesn't exist - skip all updates for this file
      for (const update of updates) {
        stats.skippedNoFile++;
        if (update.supported) {
          stats.supported--;
        } else {
          stats.unsupported--;
        }
      }
      continue;
    }

    // Read existing file
    const content = await fs.readFile(fullPath, 'utf-8');
    let data: BcdNode;
    try {
      data = JSON.parse(content);
    } catch {
      console.error(`Failed to parse JSON: ${filePath}`);
      continue;
    }

    let fileModified = false;

    for (const { keyPath, supported } of updates) {
      const nav = navigateToPath(data, keyPath);
      if (!nav) {
        stats.skippedNoFeature++;
        continue;
      }

      const { parent, key } = nav;
      const node = parent[key] as BcdNode | undefined;

      if (!node || !node.__compat) {
        stats.skippedNoFeature++;
        continue;
      }

      // Add workerd support
      addWorkerdSupport(node.__compat, supported);
      fileModified = true;

      if (supported) {
        stats.supported++;
      } else {
        stats.unsupported++;
      }
    }

    if (fileModified) {
      // Write back to file
      const output = JSON.stringify(data, null, 2) + '\n';
      await fs.writeFile(fullPath, output, 'utf-8');
      stats.filesModified.add(filePath);
    }
  }

  // Print summary
  console.log('\n=== Summary ===');
  console.log(`Features with version_added: "1.0": ${stats.supported}`);
  console.log(`Features with version_added: false: ${stats.unsupported}`);
  console.log(`Skipped (null result): ${stats.skippedNull}`);
  console.log(`Skipped (file not found): ${stats.skippedNoFile}`);
  console.log(`Skipped (feature not in BCD): ${stats.skippedNoFeature}`);
  console.log(`Files modified: ${stats.filesModified.size}`);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
