import { quickMiss } from "./files.service";

describe("quickMiss", () => {
  it("rules out a file without the needle, in any case, and keeps one with it", () => {
    const miss = quickMiss("usestate");
    expect(miss).not.toBeNull();
    expect(miss?.(Buffer.from("const [a] = useState(0);"))).toBe(false);
    expect(miss?.(Buffer.from("USESTATE"))).toBe(false);
    expect(miss?.(Buffer.from("nothing here, but ţară and ün"))).toBe(true);
  });

  it("takes the needle's characters literally", () => {
    expect(quickMiss("a.b")?.(Buffer.from("axb"))).toBe(true);
    expect(quickMiss("a.b")?.(Buffer.from("A.B"))).toBe(false);
    expect(quickMiss("(x)*")?.(Buffer.from("f(x)*2"))).toBe(false);
  });

  it("leaves a needle with characters past ASCII to the exact test", () => {
    expect(quickMiss("ştefan")).toBeNull();
  });
});
