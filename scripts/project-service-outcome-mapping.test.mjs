import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the real ProjectService.mapRow / parseSelectionOutcomeStatus / cacheProject
// logic extracted via TypeScript transpile with a mocked backendRequest.
const serviceSrc = fs.readFileSync('src/services/projectService.ts', 'utf8');
const ast = ts.createSourceFile('projectService.ts', serviceSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

let parseFn = '';
let classSrc = '';
ts.forEachChild(ast, (node) => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'parseSelectionOutcomeStatus') {
    parseFn += '\n' + node.getText(ast).replace(/^export\s+/, '');
  }
  if (ts.isVariableStatement(node)) {
    const txt = node.getText(ast);
    if (txt.includes('VALID_SELECTION_OUTCOME_STATES')) parseFn = txt + '\n' + parseFn;
  }
  if (ts.isClassDeclaration(node) && node.name?.text === 'ProjectService') {
    classSrc = node.getText(ast);
  }
});

const wrapped = ts.transpileModule(
  `export function createService(deps: any) {
     const { backendRequest, getCurrentAuthOwner, window, CustomEvent } = deps;
     const INITIAL_PROFILE = {};
     ${parseFn}
     ${classSrc}
     return new ProjectService();
   }`,
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
).outputText;

const { createService } = await import('data:text/javascript;base64,' + Buffer.from(wrapped).toString('base64'));

test('ProjectService.fetchProject preserves valid selection_outcome_status through mapRow and cacheProject', async () => {
  const svc = createService({
    getCurrentAuthOwner: () => 'user-1',
    window: { dispatchEvent: () => {} },
    CustomEvent: class {},
    backendRequest: async () => ({
      project: {
        id: 'proj-1',
        user_id: 'user-1',
        title: 'Test',
        video_status: 'transcribed',
        selection_outcome_status: { state: 'completed_empty', savedCount: 0 },
      },
    }),
  });

  const fetched = await svc.fetchProject('proj-1');
  assert.deepEqual(fetched?.selection_outcome_status, { state: 'completed_empty', savedCount: 0 });
  const cached = svc.getProject('proj-1');
  assert.deepEqual(cached?.selection_outcome_status, { state: 'completed_empty', savedCount: 0 });
});

test('ProjectService.fetchProject drops malformed or invalid selection_outcome_status states', async () => {
  const svc = createService({
    getCurrentAuthOwner: () => 'user-1',
    window: { dispatchEvent: () => {} },
    CustomEvent: class {},
    backendRequest: async () => ({
      project: {
        id: 'proj-2',
        user_id: 'user-1',
        title: 'Test 2',
        video_status: 'transcribed',
        selection_outcome_status: { state: 'bogus_state', savedCount: -5 },
      },
    }),
  });

  const fetched = await svc.fetchProject('proj-2');
  assert.equal(fetched?.selection_outcome_status, undefined);
});
