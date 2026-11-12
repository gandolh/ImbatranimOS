import { useState } from "react";
import { Tab, Tabs, TabsList, TabsPanel, cn } from "@imbatranim/ui";
import { BasicPad } from "./BasicPad";
import { ProgrammerPad } from "./ProgrammerPad";
import { ScientificPad } from "./ScientificPad";
import { ConverterPad } from "./ConverterPad";
import { useCalcSession } from "./hooks/useCalcSession";

type Mode = "basic" | "scientific" | "programmer" | "converter";

const MODES: { id: Mode; label: string }[] = [
  { id: "basic", label: "Basic" },
  { id: "scientific", label: "Sci" },
  { id: "programmer", label: "Prog" },
  { id: "converter", label: "Conv" },
];

/**
 * Window contract: ComponentType<{ windowId: string }>. Single-instance app.
 *
 * The memory register and the tape live here so they survive a tab switch between Basic and
 * Scientific — the two modes that share one evaluator and one number type. **Programmer mode
 * takes neither**: it works in BigInt at a fixed 64-bit width, and handing it a double from
 * the memory register would produce a number that is right in one tab and wrong in another.
 *
 * The tab labels shortened to Basic / Sci / Prog when the third arrived: three full words do
 * not fit the 300px minimum width, and a tab strip that wraps to two rows costs the keypad
 * exactly the vertical space the calculator work exists to protect.
 */
export function Calculator({ windowId }: { windowId: string }) {
  const [mode, setMode] = useState<Mode>("basic");
  const session = useCalcSession();

  return (
    <Tabs
      value={mode}
      onValueChange={(next) => setMode(next as Mode)}
      className="bg-surface-container-lowest flex h-full flex-col select-none"
    >
      <TabsList className="border-outline-variant bg-surface-container-low flex flex-none border-b">
        {MODES.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            className={({ active }) =>
              cn(
                "focus-visible:ring-primary font-ui flex-1 border-b-2 px-2 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-colors focus-visible:ring-2 focus-visible:ring-inset",
                active
                  ? "border-primary text-on-surface"
                  : "text-on-surface-variant hover:text-on-surface border-transparent",
              )
            }
          >
            {tab.label}
          </Tab>
        ))}
      </TabsList>

      <TabsPanel value="basic" className="min-h-0 flex-1">
        <BasicPad windowId={windowId} session={session} />
      </TabsPanel>
      <TabsPanel value="scientific" className="min-h-0 flex-1">
        <ScientificPad windowId={windowId} session={session} />
      </TabsPanel>
      <TabsPanel value="programmer" className="min-h-0 flex-1">
        <ProgrammerPad windowId={windowId} />
      </TabsPanel>
      {/* Like Programmer, the converter takes neither the memory register nor
          the tape: a conversion is a pair of numbers with units attached, and
          half of it on the tape would record something never computed. */}
      <TabsPanel value="converter" className="min-h-0 flex-1">
        <ConverterPad windowId={windowId} />
      </TabsPanel>
    </Tabs>
  );
}
