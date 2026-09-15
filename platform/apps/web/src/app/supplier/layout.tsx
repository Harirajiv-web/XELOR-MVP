import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PRODUCT_PROFILE } from "@spine/product/profile";

export default function SupplierLayout({ children }: { children: ReactNode }): React.JSX.Element {
  if (PRODUCT_PROFILE.phase === "1") notFound();
  return <>{children}</>;
}
