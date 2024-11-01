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
  return (
    <div className="flex flex-row gap-4">
      <Code>{rank}</Code>
      <Code>{value}</Code>
    </div>
  );
};
