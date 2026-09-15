import { notFound } from "next/navigation";
import { PRODUCT_PROFILE } from "@spine/product/profile";
import { ErpRecords } from "@spine/erp/records";
export default function WorkspacePage(): React.JSX.Element { if (PRODUCT_PROFILE.phase !== "1") notFound(); return <ErpRecords />; }
