import { describe, expect, it } from "vitest";
import { findPhysicalDirectionClass } from "./physical-direction.mjs";

describe("findPhysicalDirectionClass", () => {
  it.each([
    "ml-2",
    "mr-auto",
    "pl-4",
    "pr-0.5",
    "-ml-1",
    "left-0",
    "right-[3px]",
    "text-left",
    "text-right",
    "border-l",
    "border-r-2",
    "rounded-l-md",
    "rounded-tr-lg",
    "float-right",
    "scroll-ml-4",
    "flex hover:ml-2",
    "md:pr-6 gap-2",
  ])("flags %s", (cls) => {
    expect(findPhysicalDirectionClass(cls)).not.toBeNull();
  });

  it.each([
    "ms-2",
    "me-auto",
    "ps-4",
    "pe-0.5",
    "start-0",
    "end-0",
    "text-start",
    "border-s",
    "rounded-e-md",
    "rtl:-scale-x-100",
    "px-3 py-2",
    "inset-x-0",
    "html-escape",
    "Copyright notice",
    "מעבר ימינה",
  ])("allows %s", (cls) => {
    expect(findPhysicalDirectionClass(cls)).toBeNull();
  });
});
