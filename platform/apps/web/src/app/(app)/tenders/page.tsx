import { notFound, redirect } from "next/navigation";
import { PRODUCT_PROFILE } from "@spine/product/profile";
export default function TendersAlias(): never { if (PRODUCT_PROFILE.phase === "1") notFound(); redirect("/network/tenders"); }
