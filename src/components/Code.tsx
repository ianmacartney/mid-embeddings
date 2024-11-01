import { ReactNode } from "react";

export const Code = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  return (
    <code
      className={`relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm ${className}`}
    >
      {children}
    </code>
  );
};
