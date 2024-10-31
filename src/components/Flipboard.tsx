import { useMemo } from "react";
import { Code } from "./Code";

export const Flipboard = ({
  rank,
  value,
  points,
  length,
  style,
  obfuscate = false,
  randomize = false,
}: {
  rank?: number;
  length?: number;
  value: string;
  points?: number;
  style?: "XL" | "L" | "M" | "S";
  obfuscate: boolean;
  randomize?: boolean;
}) => {
  const valueToDisplay = useMemo(() => {
    if (!randomize) return value;
    return value
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }, [value, randomize]);

  return (
    <div className="flex flex-row gap-4">
      <Code>{rank}</Code>
      <Code>{valueToDisplay}</Code>
    </div>
  );
};
