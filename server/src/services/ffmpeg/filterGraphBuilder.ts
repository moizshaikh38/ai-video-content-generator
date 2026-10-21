import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { logger } from '../../utils/logger.js';

export interface FilterNode {
  inputs: string[];
  filter: string;
  args?: string | Record<string, string | number | boolean>;
  outputs: string[];
}

export interface ScriptExecutionResult {
  args: string[];
  scriptPath: string | null;
  cleanup: () => Promise<void>;
}

/**
 * Robust, typed FFmpeg Filter Graph Builder.
 * Supports chain validation, automatic escaping, and script-file execution
 * (-filter_complex_script) to prevent CLI argument overflow (E2BIG) on complex multi-track projects.
 */
export class FilterGraphBuilder {
  private filters: string[] = [];

  constructor(initialFilters?: string[]) {
    if (initialFilters && Array.isArray(initialFilters)) {
      this.filters = [...initialFilters];
    }
  }

  /**
   * Adds a raw filter chain string (e.g. "[0:v]scale=1080:1920[v0]").
   */
  public addRawFilter(filterString: string): this {
    const trimmed = String(filterString || '').trim();
    if (trimmed) {
      this.filters.push(trimmed);
    }
    return this;
  }

  /**
   * Adds a structured filter node.
   */
  public addFilter(
    inputs: string[],
    filterName: string,
    args?: string | Record<string, string | number | boolean>,
    outputs: string[] = []
  ): this {
    const inTags = inputs.map((i) => (i.startsWith('[') && i.endsWith(']') ? i : `[${i}]`)).join('');
    const outTags = outputs.map((o) => (o.startsWith('[') && o.endsWith(']') ? o : `[${o}]`)).join('');

    let argString = '';
    if (typeof args === 'string') {
      argString = args ? `=${args}` : '';
    } else if (args && typeof args === 'object') {
      const parts = Object.entries(args).map(([k, v]) => `${k}=${v}`);
      argString = parts.length > 0 ? `=${parts.join(':')}` : '';
    }

    const compiled = `${inTags}${filterName}${argString}${outTags}`;
    this.filters.push(compiled);
    return this;
  }

  /**
   * Appends multiple filter chains.
   */
  public addFilters(filterStrings: string[]): this {
    for (const f of filterStrings) {
      this.addRawFilter(f);
    }
    return this;
  }

  /**
   * Returns all compiled filter statements.
   */
  public getFilters(): string[] {
    return [...this.filters];
  }

  /**
   * Compiles the filter graph into a single semicolon-delimited string.
   */
  public compile(): string {
    return this.filters.join(';');
  }

  /**
   * Determines whether the filter graph should be executed via a temporary script file
   * (-filter_complex_script) or passed inline (-filter_complex).
   *
   * By default, graphs longer than 2,048 characters or with >15 filter links are written to script files
   * to ensure 100% immunity to shell argument length limits (E2BIG).
   */
  public async compileForExecution(
    tempDir?: string,
    forceScript = false,
    scriptThresholdChars = 2048
  ): Promise<ScriptExecutionResult> {
    const fullGraph = this.compile();
    const targetDir = tempDir || os.tmpdir();

    const shouldUseScript = forceScript || fullGraph.length > scriptThresholdChars || this.filters.length > 15;

    if (!shouldUseScript) {
      return {
        args: ['-filter_complex', fullGraph],
        scriptPath: null,
        cleanup: async () => {},
      };
    }

    // Write to a dedicated unique temporary script file
    const uniqueId = crypto.randomBytes(6).toString('hex');
    const scriptPath = path.join(targetDir, `vireo_filter_${Date.now()}_${uniqueId}.txt`);

    try {
      await fs.writeFile(scriptPath, fullGraph, 'utf8');
      logger.info(`[FilterGraphBuilder] Filter graph written to script file (${fullGraph.length} chars): ${scriptPath}`);

      const cleanup = async () => {
        try {
          await fs.unlink(scriptPath);
        } catch (e: any) {
          if (e?.code !== 'ENOENT') {
            logger.warn(`[FilterGraphBuilder] Failed to unlink temp filter script: ${scriptPath}`, { error: e?.message });
          }
        }
      };

      return {
        args: ['-filter_complex_script', scriptPath],
        scriptPath,
        cleanup,
      };
    } catch (err: any) {
      logger.error(`[FilterGraphBuilder] Failed to write filter script, falling back to inline: ${err?.message}`);
      return {
        args: ['-filter_complex', fullGraph],
        scriptPath: null,
        cleanup: async () => {},
      };
    }
  }
}
