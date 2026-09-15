import { notFound } from "next/navigation";
import { PRODUCT_PROFILE } from "@spine/product/profile";
import { ErpWorkflows } from "@spine/erp/workflows";
export default function WorkflowsPage(): React.JSX.Element { if (PRODUCT_PROFILE.phase !== "1") notFound(); return <ErpWorkflows />; }
