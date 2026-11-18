import type { PluginObj, types } from '@babel/core';
export function installedLucideBindings(): Map<string, string>;
export default function exactLucideImports(api: { types: typeof types }): PluginObj;
