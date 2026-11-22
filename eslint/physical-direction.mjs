// Tailwind utilities that hard-code a physical side. RTL requires logical
// equivalents (ms-/me-/ps-/pe-/start-/end-/text-start/border-s/rounded-s…).
// MASTER.md §5. Variant prefixes (hover:, md:, rtl:) and negatives are covered.
const PHYSICAL =
  "-?(?:m[lr]|p[lr]|scroll-m[lr]|scroll-p[lr]|left|right|border-[lr]|rounded-[lr]|rounded-[tb][lr]|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right))";

export const physicalDirectionClass = new RegExp(
  `(?:^|[\\s:"'\`])${PHYSICAL}(?:-|$|[\\s"'\`])`,
);

export function findPhysicalDirectionClass(text) {
  const match = physicalDirectionClass.exec(text);
  return match ? match[0].trim() : null;
}
