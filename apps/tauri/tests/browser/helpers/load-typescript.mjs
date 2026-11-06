import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

// Small CommonJS bundle for isolated browser fixtures. Follow local TS imports
// so renderer helpers execute as real modules without adding a build dependency.
export async function loadTypeScript(page, path, symbol) {
  const modules = new Map()
  const collect = (file) => {
    file = resolve(file)
    if (modules.has(file)) return file
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText
    modules.set(file, '')
    const bundled = code.replace(
      /require\("(\.[^"]+)"\)/g,
      (_, name) => `require(${JSON.stringify(collect(resolve(dirname(file), `${name}.ts`)))})`
    )
    modules.set(file, bundled)
    return file
  }
  const entry = collect(path)
  await page.addScriptTag({
    content: `(() => {
    const modules = {${[...modules].map(([file, code]) => `${JSON.stringify(file)}: (exports, require) => {${code}\n}`).join(',')}};
    const cache = {};
    const require = (name) => {
      if (!cache[name]) { cache[name] = {}; modules[name](cache[name], require); }
      return cache[name];
    };
    window[${JSON.stringify(symbol)}] = require(${JSON.stringify(entry)})[${JSON.stringify(symbol)}];
  })()`
  })
}
