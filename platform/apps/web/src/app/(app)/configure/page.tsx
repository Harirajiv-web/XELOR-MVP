import { notFound } from "next/navigation";
import { PRODUCT_PROFILE } from "@spine/product/profile";
import { ErpConfigure } from "@spine/erp/configure";
export default function ConfigurePage(): React.JSX.Element { if (PRODUCT_PROFILE.phase !== "1") notFound(); return <ErpConfigure />; }
