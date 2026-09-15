import { notFound } from "next/navigation";
import { PRODUCT_PROFILE } from "@spine/product/profile";
import { DepartmentView } from "@spine/shell/department-view";

export default async function DepartmentRoute({ params }: { params: Promise<{ code: string }> }): Promise<React.JSX.Element> {
  if (PRODUCT_PROFILE.phase === "1") notFound();
  const { code } = await params;
  return <DepartmentView code={code} />;
}
