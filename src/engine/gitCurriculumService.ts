import * as vscode from 'vscode';
import { BUILTIN_CURRICULUM } from './curriculumServer';
import { CurriculumModule, CurriculumRepoManifest, ImportedCurriculumSource, SupportedLanguage } from './types';

const STORAGE_KEY = 'fermas.importedCurriculumSources';
const ACTIVE_SOURCE_KEY = 'fermas.activeCurriculumSourceId';

export class GitCurriculumService {
  private context?: vscode.ExtensionContext;
  private importedSources: Map<string, ImportedCurriculumSource> = new Map();
  private activeSourceId: string = 'builtin';

  constructor(context?: vscode.ExtensionContext) {
    this.context = context;
    this.loadFromStorage();
  }

  public setContext(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (!this.context) return;
    try {
      const stored = this.context.globalState.get<ImportedCurriculumSource[]>(STORAGE_KEY);
      if (Array.isArray(stored)) {
        stored.forEach(src => this.importedSources.set(src.id, src));
      }
      const active = this.context.globalState.get<string>(ACTIVE_SOURCE_KEY);
      if (active && (active === 'builtin' || this.importedSources.has(active))) {
        this.activeSourceId = active;
      }
    } catch (err) {
      console.warn('[Fermas] Failed to load imported curriculum storage:', err);
    }
  }

  private async saveToStorage() {
    if (!this.context) return;
    try {
      const list = Array.from(this.importedSources.values());
      await this.context.globalState.update(STORAGE_KEY, list);
      await this.context.globalState.update(ACTIVE_SOURCE_KEY, this.activeSourceId);
    } catch (err) {
      console.warn('[Fermas] Failed to save imported curriculum storage:', err);
    }
  }

  public getActiveSourceId(): string {
    return this.activeSourceId;
  }

  public getSources(): ImportedCurriculumSource[] {
    return Array.from(this.importedSources.values());
  }

  public async selectSource(sourceId: string): Promise<CurriculumModule[]> {
    if (sourceId === 'builtin' || this.importedSources.has(sourceId)) {
      this.activeSourceId = sourceId;
      await this.saveToStorage();
    }
    return this.getModules();
  }

  public async deleteSource(sourceId: string): Promise<CurriculumModule[]> {
    if (this.importedSources.has(sourceId)) {
      this.importedSources.delete(sourceId);
      if (this.activeSourceId === sourceId) {
        this.activeSourceId = 'builtin';
      }
      await this.saveToStorage();
    }
    return this.getModules();
  }

  public getModules(): CurriculumModule[] {
    if (this.activeSourceId !== 'builtin' && this.importedSources.has(this.activeSourceId)) {
      return this.importedSources.get(this.activeSourceId)!.modules;
    }
    return BUILTIN_CURRICULUM;
  }

  public getModuleById(id: string): CurriculumModule | undefined {
    const modules = this.getModules();
    return modules.find(m => m.id === id);
  }

  /**
   * Imports a curriculum / DSA tutorials repository using standard Git structure.
   * Supports:
   * 1. Manifest-based: fermas.json or curriculum.json in repo root (or specified path)
   * 2. Single problem entry: pointing to a specific solution file in repo
   */
  public async importFromGit(
    repoInput: string,
    branch: string = 'main',
    manifestPath: string = 'fermas.json'
  ): Promise<ImportedCurriculumSource> {
    const parsed = this.parseGitUrl(repoInput, branch, manifestPath);
    const { owner, repo, actualBranch, rawBaseUrl } = parsed;

    // Try fetching manifest: fermas.json or curriculum.json
    let manifest: CurriculumRepoManifest | null = null;
    let effectiveManifestPath = manifestPath || 'fermas.json';

    const manifestUrlsToTry = [
      `${rawBaseUrl}/${effectiveManifestPath}`,
      `${rawBaseUrl}/fermas.json`,
      `${rawBaseUrl}/curriculum.json`
    ];

    for (const url of manifestUrlsToTry) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          manifest = (await res.json()) as CurriculumRepoManifest;
          effectiveManifestPath = url.split(`${rawBaseUrl}/`)[1] || 'fermas.json';
          break;
        }
      } catch {
        // try next URL
      }
    }

    if (!manifest || !Array.isArray(manifest.modules) || manifest.modules.length === 0) {
      // Fallback: check if the path is a direct code file
      const directCode = await this.tryFetchDirectFile(rawBaseUrl, manifestPath);
      if (directCode) {
        const lang = this.detectLanguage(manifestPath);
        const fileName = manifestPath.split('/').pop() || 'problem';
        const fallbackModule: CurriculumModule = {
          id: fileName.replace(/\.[^/.]+$/, ''),
          title: this.toTitleCase(fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')),
          category: 'Imported Git Problems',
          difficulty: 'Intermediate',
          language: lang,
          description: `Imported from ${owner}/${repo} (${manifestPath})`,
          code: directCode,
          tags: ['Git Import', lang]
        };

        const sourceId = `${owner}/${repo}`;
        const source: ImportedCurriculumSource = {
          id: sourceId,
          name: `${owner}/${repo}`,
          repoUrl: `https://github.com/${owner}/${repo}`,
          branch: actualBranch,
          manifestPath,
          description: `Imported single problem from ${owner}/${repo}`,
          author: owner,
          modules: [fallbackModule],
          importedAt: new Date().toISOString()
        };

        this.importedSources.set(sourceId, source);
        this.activeSourceId = sourceId;
        await this.saveToStorage();
        return source;
      }

      throw new Error(
        `Could not find a valid 'fermas.json' or 'curriculum.json' manifest in https://github.com/${owner}/${repo} (branch: ${actualBranch}). ` +
        `Ensure your repo contains a fermas.json with a "modules" array.`
      );
    }

    // Resolve modules and fetch entry code files if needed
    const resolvedModules: CurriculumModule[] = [];

    for (const m of manifest.modules) {
      let code = m.code || '';
      const entry = m.entry;

      if (!code && entry) {
        try {
          const entryUrl = `${rawBaseUrl}/${entry}`;
          const res = await fetch(entryUrl);
          if (res.ok) {
            code = await res.text();
          } else {
            console.warn(`[Fermas] Failed to fetch entry code for module ${m.id} at ${entryUrl}`);
          }
        } catch (e) {
          console.warn(`[Fermas] Error fetching entry code for module ${m.id}:`, e);
        }
      }

      const lang: SupportedLanguage = m.language || this.detectLanguage(entry || m.id);

      resolvedModules.push({
        id: m.id,
        title: m.title || m.id,
        category: m.category || manifest.name || 'Imported DSA Tutorials',
        difficulty: (m.difficulty as any) || 'Intermediate',
        language: lang,
        description: m.description || `Module from ${manifest.name || repo}`,
        timeComplexity: m.timeComplexity || 'O(n)',
        spaceComplexity: m.spaceComplexity || 'O(1)',
        ticks: m.ticks || 20,
        tags: m.tags || ['Community', 'DSA', lang],
        code: code || `// Solution code for ${m.title}\nconsole.log("No code provided for ${m.id}");`,
        quiz: m.quiz,
        entry: m.entry,
        author: m.author || manifest.author || owner
      });
    }

    const sourceId = `${owner}/${repo}`;
    const source: ImportedCurriculumSource = {
      id: sourceId,
      name: manifest.name || `${owner}/${repo}`,
      repoUrl: manifest.repository || `https://github.com/${owner}/${repo}`,
      branch: actualBranch,
      manifestPath: effectiveManifestPath,
      description: manifest.description || `Imported curriculum with ${resolvedModules.length} tutorials`,
      author: manifest.author || owner,
      modules: resolvedModules,
      importedAt: new Date().toISOString()
    };

    this.importedSources.set(sourceId, source);
    this.activeSourceId = sourceId;
    await this.saveToStorage();

    return source;
  }

  private async tryFetchDirectFile(baseUrl: string, filePath: string): Promise<string | null> {
    if (!filePath || filePath === 'fermas.json' || filePath === 'curriculum.json') return null;
    try {
      const url = `${baseUrl}/${filePath}`;
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      // not a direct file
    }
    return null;
  }

  private parseGitUrl(input: string, branch: string, filePath: string) {
    let trimmed = input.trim().replace(/^https?:\/\//, '');

    if (trimmed.startsWith('github.com/')) {
      trimmed = trimmed.replace('github.com/', '');
    } else if (trimmed.startsWith('raw.githubusercontent.com/')) {
      trimmed = trimmed.replace('raw.githubusercontent.com/', '');
    }

    const parts = trimmed.split('/');
    if (parts.length < 2) {
      throw new Error(`Invalid repository format: "${input}". Please provide format 'owner/repo' or 'github.com/owner/repo'.`);
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    let actualBranch = branch || 'main';

    if (parts.length >= 4 && (parts[2] === 'tree' || parts[2] === 'blob')) {
      actualBranch = parts[3];
    }

    const rawBaseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${actualBranch}`;

    return { owner, repo, actualBranch, rawBaseUrl };
  }

  private detectLanguage(fileNameOrId: string): SupportedLanguage {
    if (fileNameOrId.endsWith('.py')) return 'python';
    if (fileNameOrId.endsWith('.rs')) return 'rust';
    if (fileNameOrId.endsWith('.ts')) return 'typescript';
    if (fileNameOrId.endsWith('.js')) return 'javascript';
    return 'typescript';
  }

  private toTitleCase(str: string): string {
    return str.replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Generates a starter curriculum repo template with sample DSA problems.
   * Anyone can save this into a repo and share tutorials!
   */
  public generateStarterTemplate(): {
    manifest: string;
    sampleProblemTs: string;
    sampleProblemPy: string;
    sampleProblemRs: string;
    readmeMd: string;
  } {
    const manifest: CurriculumRepoManifest = {
      name: 'Community DSA Patterns & Tutorials',
      version: '1.0.0',
      description: 'A curated collection of algorithm tutorials with live visual memory & call tree traces.',
      author: 'Your Name',
      modules: [
        {
          id: 'two-sum',
          title: 'Two Sum (Two Pointers)',
          category: 'Two Pointers',
          difficulty: 'EASY',
          language: 'typescript',
          description: 'Find two numbers that sum up to target in sorted array using bidirectional pointers.',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(1)',
          tags: ['Two Pointers', 'Arrays', 'Beginner'],
          entry: 'problems/two-sum/solution.ts'
        },
        {
          id: 'valid-palindrome',
          title: 'Valid Palindrome',
          category: 'Two Pointers',
          difficulty: 'EASY',
          language: 'python',
          description: 'Check if a string is a palindrome by skipping non-alphanumeric characters.',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(1)',
          tags: ['Strings', 'Two Pointers'],
          entry: 'problems/valid-palindrome/solution.py'
        },
        {
          id: 'three-sum',
          title: 'Three Sum Problem',
          category: 'Two Pointers',
          difficulty: 'MEDIUM',
          language: 'rust',
          description: 'Find all unique triplets [nums[i], nums[j], nums[k]] that sum to zero.',
          timeComplexity: 'O(n^2)',
          spaceComplexity: 'O(1)',
          tags: ['Arrays', 'Sorting', 'Two Pointers'],
          entry: 'problems/three-sum/solution.rs'
        }
      ]
    };

    const sampleProblemTs = `export function twoSum(nums: number[], target: number): number[] {
  let left = 0;
  let right = nums.length - 1;

  while (left < right) {
    const currentSum = nums[left] + nums[right];
    if (currentSum === target) {
      return [left, right];
    } else if (currentSum < target) {
      left++;
    } else {
      right--;
    }
  }
  return [-1, -1];
}

const numbers = [2, 7, 11, 15];
twoSum(numbers, 9);
`;

    const sampleProblemPy = `def is_palindrome(s: str) -> bool:
    cleaned = [c.lower() for c in s if c.isalnum()]
    left, right = 0, len(cleaned) - 1
    while left < right:
        if cleaned[left] != cleaned[right]:
            return False
        left += 1
        right -= 1
    return True

is_palindrome("A man, a plan, a canal: Panama")
`;

    const sampleProblemRs = `pub fn three_sum(mut nums: Vec<i32>) -> Vec<Vec<i32>> {
    nums.sort();
    let mut res = Vec::new();
    let len = nums.len();
    for i in 0..len {
        if i > 0 && nums[i] == nums[i - 1] {
            continue;
        }
        let (mut left, mut right) = (i + 1, len - 1);
        while left < right {
            let sum = nums[i] + nums[left] + nums[right];
            if sum == 0 {
                res.push(vec![nums[i], nums[left], nums[right]]);
                while left < right && nums[left] == nums[left + 1] {
                    left += 1;
                }
                while left < right && nums[right] == nums[right - 1] {
                    right -= 1;
                }
                left += 1;
                right -= 1;
            } else if sum < 0 {
                left += 1;
            } else {
                right -= 1;
            }
        }
    }
    res
}

three_sum(vec![-1, 0, 1, 2, -1, -4]);
`;

    const readmeMd = `# Fermas DSA Tutorial Repository Template

This repository contains interactive DSA problems and tutorials that can be directly imported into the **Fermas Visualizer** extension in VS Code.

## Repository Structure

\`\`\`
├── fermas.json                     # Course & tutorial manifest
├── problems/
│   ├── two-sum/
│   │   └── solution.ts             # TypeScript solution
│   ├── valid-palindrome/
│   │   └── solution.py             # Python solution
│   └── three-sum/
│       └── solution.rs             # Rust solution
└── README.md
\`\`\`

## How to Import into VS Code

1. In VS Code, open the **Fermas** extension tab.
2. Navigate to **Curriculum & Algorithm Hub**.
3. In **Import Git Repo**, enter your GitHub repo: \`github.com/your-username/your-repo\` and click **Import Git Repo**.
4. Fermas will parse \`fermas.json\`, download all problems, and let you step through live visual execution traces!
`;

    return {
      manifest: JSON.stringify(manifest, null, 2),
      sampleProblemTs,
      sampleProblemPy,
      sampleProblemRs,
      readmeMd
    };
  }
}
