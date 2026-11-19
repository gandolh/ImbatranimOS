/// <reference types="node" />
import { readFileSync } from "fs";
import { join } from "path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const indexCss = readFileSync(join(__dirname, "index.css"), "utf8");

/** Counts the class, attribute and :root parts of a selector; :where() adds none. */
function classCount(selector: string): number {
  const withoutWhere = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "");
  return (withoutWhere.match(/\.[\w\\:-]+|:root|\[[^\]]+\]/g) ?? []).length;
}

describe("the apricot: variant", () => {
  it("outranks a same-property kit utility that loads later", async () => {
    const variant = indexCss.match(/@custom-variant apricot \{[\s\S]*?\n\}/)?.[0];
    expect(variant).toBeDefined();
    const compiler = await compile(`@theme { --spacing: 4px; }\n@tailwind utilities;\n${variant}`);
    const css = compiler.build(["apricot:p-4", "p-2"]);
    const rule = (name: string) => css.split("}").find((block) => block.includes(name) && block.includes("padding"));
    const apricotRule = rule("apricot\\:p-4") ?? "";
    expect(apricotRule).toContain(":root");
    const apricotSelector = apricotRule.slice(0, apricotRule.indexOf("{")).trim();
    expect(classCount(apricotSelector)).toBeGreaterThan(classCount(".p-2"));
  });
});
